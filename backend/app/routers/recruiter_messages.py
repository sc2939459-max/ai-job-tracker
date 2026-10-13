import base64
import html
import os
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import GoogleMailbox, JobApplication, RecruiterMessage

router = APIRouter(prefix="/recruiter-messages", tags=["Recruiter Messages"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"
GOOGLE_SCOPES = "https://www.googleapis.com/auth/gmail.readonly"
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
ALGORITHM = "HS256"


def _google_config():
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/recruiter-messages/google/callback")
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    if not client_id or not client_secret:
        raise HTTPException(503, "Google Gmail integration is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env.")
    return client_id, client_secret, redirect_uri, frontend_url.rstrip("/")


def _oauth_state(user_id: int) -> str:
    from datetime import timedelta
    return jwt.encode({"sub": str(user_id), "purpose": "gmail-connect", "exp": datetime.now(timezone.utc) + timedelta(minutes=10)}, SECRET_KEY, algorithm=ALGORITHM)


def _decode_state(state: str) -> int:
    try:
        payload = jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "gmail-connect":
            raise ValueError
        return int(payload["sub"])
    except (JWTError, KeyError, TypeError, ValueError):
        raise HTTPException(400, "Invalid or expired Google connection request.")


def _header(headers, name):
    for item in headers or []:
        if item.get("name", "").lower() == name.lower():
            return item.get("value", "")
    return ""


def _decode_body(data: str) -> str:
    if not data:
        return ""
    try:
        raw = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
        return raw.decode("utf-8", errors="replace")
    except Exception:
        return ""


def _plain_text(value: str) -> str:
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"</p\s*>", "\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    return html.unescape(value).strip()


def _normalize_match_value(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _message_matches_tracked_application(item: dict, applications: list[JobApplication]) -> bool:
    if not applications:
        return False

    message_company = _normalize_match_value(item.get("company"))
    message_role = _normalize_match_value(item.get("role"))
    sender = _normalize_match_value(item.get("sender"))
    subject = _normalize_match_value(item.get("subject"))
    body = _normalize_match_value(item.get("message"))

    for app in applications:
        app_company = _normalize_match_value(app.company)
        app_role = _normalize_match_value(app.role)
        if not app_company:
            continue

        company_match = (
            app_company == message_company
            or app_company in message_company
            or message_company in app_company
            or (message_company and sender and app_company in sender)
        )

        if not company_match:
            continue

        if not message_role and not app_role:
            return True

        if not app_role or not message_role:
            return True

        role_match = (
            app_role == message_role
            or app_role in message_role
            or message_role in app_role
            or app_role in subject
            or app_role in body
            or message_role in (app_role or "")
        )
        if role_match:
            return True

    return False


def _extract_text(payload: dict) -> str:
    mime = payload.get("mimeType", "")
    body = payload.get("body") or {}
    if body.get("data"):
        text = _decode_body(body["data"])
        return _plain_text(text) if "html" in mime else text.strip()
    for part in payload.get("parts") or []:
        text = _extract_text(part)
        if text:
            return text
    return ""


def _is_recruiter_message(subject: str, sender: str, snippet: str) -> bool:
    text = f"{subject} {sender} {snippet}".lower()
    signals = [
        "interview", "recruiter", "recruitment", "hiring", "application", "candidate",
        "assessment", "technical round", "screening", "shortlisted", "shortlist",
        "offer", "job opportunity", "job opening", "career", "talent acquisition",
        "hr team", "human resources", "onboarding", "joining", "selection process",
    ]
    return any(signal in text for signal in signals)


def _company_from_sender(sender: str) -> str:
    match = re.search(r"@([A-Za-z0-9.-]+)", sender)
    if not match:
        return "Company"
    domain = match.group(1).split(".")[0].replace("-", " ")
    return domain.title()


def _parse_message(message: dict) -> dict:
    payload = message.get("payload") or {}
    headers = payload.get("headers") or []
    subject = _header(headers, "Subject") or "Recruiter update"
    sender = _header(headers, "From")
    date_value = _header(headers, "Date")
    try:
        received = parsedate_to_datetime(date_value).astimezone(timezone.utc).isoformat() if date_value else None
    except (TypeError, ValueError, OverflowError):
        received = None
    body = _extract_text(payload) or message.get("snippet", "")
    role = "Role not specified"
    role_match = re.search(r"(?:for|position|role|opening)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9 /&.-]{2,80})", f"{subject} {body}", re.I)
    if role_match:
        role = role_match.group(1).strip(" .,:;-\n")
    return {
        "id": message.get("id"),
        "company": _company_from_sender(sender),
        "role": role,
        "sender": sender,
        "subject": subject,
        "message": body[:4000],
        "receivedAt": received,
        "status": "New",
    }


def _refresh_access_token(mailbox: GoogleMailbox) -> str:
    client_id, client_secret, _, _ = _google_config()
    response = httpx.post(GOOGLE_TOKEN_URL, data={
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": mailbox.refresh_token,
        "grant_type": "refresh_token",
    }, timeout=20)
    if response.status_code >= 400:
        raise HTTPException(502, "Google authorization expired or was revoked. Reconnect Gmail.")
    return response.json()["access_token"]


def _fetch_messages(mailbox: GoogleMailbox, tracked_applications: list[JobApplication] | None = None) -> list[dict]:
    access_token = _refresh_access_token(mailbox)
    headers = {"Authorization": f"Bearer {access_token}"}
    params = {
        "maxResults": 30,
        "q": 'newer_than:180d (interview OR recruiter OR hiring OR application OR candidate OR assessment OR offer OR "job opportunity")',
    }
    response = httpx.get(f"{GMAIL_API}/messages", headers=headers, params=params, timeout=20)
    if response.status_code == 401:
        raise HTTPException(502, "Google authorization expired or was revoked. Reconnect Gmail.")
    response.raise_for_status()
    messages = []
    for ref in response.json().get("messages", []):
        detail = httpx.get(f"{GMAIL_API}/messages/{ref['id']}", headers=headers, params={"format": "full"}, timeout=20)
        if detail.status_code >= 400:
            continue
        item = _parse_message(detail.json())
        if not _is_recruiter_message(item["subject"], item["sender"], item["message"]):
            continue
        if tracked_applications is not None and not _message_matches_tracked_application(item, tracked_applications):
            continue
        messages.append(item)
    messages.sort(key=lambda x: x.get("receivedAt") or "", reverse=True)
    return messages


@router.get("/status")
def connection_status(db: Session = Depends(get_db), user=Depends(get_current_user)):
    mailbox = db.query(GoogleMailbox).filter(GoogleMailbox.user_id == user.id).first()
    return {"connected": bool(mailbox), "email": mailbox.email if mailbox else None}


@router.get("/connect")
def connect_google(user=Depends(get_current_user)):
    client_id, _, redirect_uri, _ = _google_config()
    from urllib.parse import urlencode
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
        "scope": GOOGLE_SCOPES,
        "state": _oauth_state(user.id),
    }
    return {"authorization_url": f"{GOOGLE_AUTH_URL}?{urlencode(params)}"}


@router.get("/google/callback")
def google_callback(code: str | None = None, state: str | None = None, error: str | None = None, db: Session = Depends(get_db)):
    if not state:
        raise HTTPException(400, "Missing Google connection state.")
    user_id = _decode_state(state)
    _, _, redirect_uri, frontend_url = _google_config()
    if error:
        return RedirectResponse(f"{frontend_url}/?gmail=cancelled&open=recruiter-messages")
    if not code:
        raise HTTPException(400, "Google did not return an authorization code.")

    client_id, client_secret, _, _ = _google_config()
    response = httpx.post(GOOGLE_TOKEN_URL, data={
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }, timeout=20)
    if response.status_code >= 400:
        raise HTTPException(502, "Google authorization failed. Check your OAuth redirect URI and credentials.")
    token_data = response.json()
    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        raise HTTPException(502, "Google did not return a refresh token. Reconnect with consent enabled.")

    access_token = token_data.get("access_token")
    email = "Connected Gmail"
    if access_token:
        profile = httpx.get(f"{GMAIL_API}/profile", headers={"Authorization": f"Bearer {access_token}"}, timeout=20)
        if profile.is_success:
            email = profile.json().get("emailAddress") or email

    mailbox = db.query(GoogleMailbox).filter(GoogleMailbox.user_id == user_id).first()
    if mailbox:
        mailbox.email = email
        mailbox.refresh_token = refresh_token
    else:
        db.add(GoogleMailbox(user_id=user_id, email=email, refresh_token=refresh_token))
    db.commit()
    return RedirectResponse(f"{frontend_url}/?gmail=connected&open=recruiter-messages")


@router.get("")
def list_messages(db: Session = Depends(get_db), user=Depends(get_current_user)):
    mailbox = db.query(GoogleMailbox).filter(GoogleMailbox.user_id == user.id).first()
    if not mailbox:
        return []
    tracked_applications = (
        db.query(JobApplication)
        .filter(JobApplication.user_id == user.id)
        .all()
    )
    return _fetch_messages(mailbox, tracked_applications)


@router.post("/sync")
def sync_messages(db: Session = Depends(get_db), user=Depends(get_current_user)):
    mailbox = db.query(GoogleMailbox).filter(GoogleMailbox.user_id == user.id).first()
    if not mailbox:
        raise HTTPException(409, "Gmail is not connected. Connect Gmail first.")
    tracked_applications = (
        db.query(JobApplication)
        .filter(JobApplication.user_id == user.id)
        .all()
    )
    return _fetch_messages(mailbox, tracked_applications)


@router.get("/portal")
def list_portal_messages(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return (
        db.query(RecruiterMessage)
        .filter(RecruiterMessage.user_id == user.id)
        .order_by(RecruiterMessage.received_at.desc(), RecruiterMessage.created_at.desc())
        .all()
    )


@router.post("/portal")
def create_portal_message(
    company: str,
    role: str | None = None,
    sender_name: str | None = None,
    sender_email: str | None = None,
    subject: str = "Recruiter update",
    body: str = "",
    category: str = "General Recruiter Message",
    application_status: str | None = None,
    source: str = "portal",
    job_id: int | None = None,
    external_url: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    message = RecruiterMessage(
        user_id=user.id,
        job_id=job_id,
        company=company,
        role=role,
        sender_name=sender_name,
        sender_email=sender_email,
        subject=subject,
        body=body,
        category=category,
        application_status=application_status,
        source=source,
        external_url=external_url,
        received_at=datetime.now(timezone.utc),
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


@router.post("/portal/{message_id}/read")
def mark_portal_message_read(
    message_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    message = (
        db.query(RecruiterMessage)
        .filter(RecruiterMessage.id == message_id, RecruiterMessage.user_id == user.id)
        .first()
    )
    if not message:
        raise HTTPException(404, "Message not found")
    message.is_read = True
    db.commit()
    return {"message": "Recruiter message marked as read"}

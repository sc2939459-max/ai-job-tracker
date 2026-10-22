import base64
import html
import hmac
import logging
import os
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime, parseaddr

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..database import get_db
from ..deps import get_current_user
from ..models import GoogleMailbox, JobApplication

router = APIRouter(prefix="/recruiter-messages", tags=["Recruiter Messages"])
logger = logging.getLogger(__name__)

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
    """Keep job-related mail, including rejection-only subject/body signals."""
    text = f"{subject} {sender} {snippet}".lower()
    signals = [
        "interview", "recruiter", "recruitment", "hiring", "application", "candidate",
        "assessment", "technical round", "screening", "shortlisted", "shortlist",
        "offer", "job opportunity", "job opening", "career", "talent acquisition",
        "hr team", "human resources", "onboarding", "joining", "selection process",
        "regret to inform", "not moving forward", "not selected", "not proceed",
        "unsuccessful application", "application was unsuccessful", "will not be proceeding",
        "chosen another candidate", "selected another candidate", "position has been filled",
        "we cannot offer", "unable to offer you", "application outcome",
    ]
    return any(signal in text for signal in signals)


def _normalize(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _classify_application_outcome(subject: str, body: str) -> str | None:
    """Conservative classifier: return Rejected only for strong rejection language."""
    text = re.sub(r"\s+", " ", f"{subject} {body}").lower()
    rejection_patterns = (
        r"\bwe regret to inform you\b",
        r"\bnot moving forward with (?:your )?(?:application|candidacy)\b",
        r"\bwill not be moving forward\b",
        r"\bwe have decided not to proceed with (?:your )?(?:application|candidacy)\b",
        r"\bhas decided not to proceed with (?:your )?(?:application|candidacy)\b",
        r"\bhas decided not to move forward with (?:your )?(?:application|candidacy)\b",
        r"\b(?:your )?application (?:was|has been) (?:not selected|unsuccessful|rejected)\b",
        r"\bwe (?:will|are) not proceeding with (?:your )?(?:application|candidacy)\b",
        r"\bwe have selected another candidate\b",
        r"\bwe have chosen another candidate\b",
        r"\bwe will not be proceeding with your application\b",
        r"\bwe are unable to move forward with your application\b",
        r"\bno longer under consideration\b",
        r"\bposition has been filled\b",
    )
    return "Rejected" if any(re.search(pattern, text, re.I) for pattern in rejection_patterns) else None


def _sender_domain(sender: str) -> str:
    address = parseaddr(sender or "")[1].lower()
    return address.rsplit("@", 1)[1] if "@" in address else ""


def _company_match_score(app: JobApplication, item: dict) -> int:
    company = _normalize(app.company)
    text = _normalize(f"{item.get('subject', '')} {item.get('message', '')}")
    domain = _normalize(_sender_domain(item.get("sender", "")).split(".")[0])
    score = 0
    # Domain match is useful for company-owned mail; generic mailbox providers are not evidence.
    generic_domains = {"gmail", "googlemail", "outlook", "hotmail", "live", "yahoo", "icloud", "protonmail"}
    if domain and domain not in generic_domains and company:
        company_words = set(company.split())
        domain_words = set(domain.split())
        if company == domain or company in domain or domain in company or (company_words & domain_words):
            score += 3
    if company and company in text:
        score += 3
    role = _normalize(app.role)
    if role and len(role) >= 4 and role in text:
        score += 4
    return score


def _has_company_evidence(app: JobApplication, item: dict) -> bool:
    company = _normalize(app.company)
    text = _normalize(f"{item.get('subject', '')} {item.get('message', '')}")
    domain = _normalize(_sender_domain(item.get("sender", "")).split(".")[0])
    generic_domains = {"gmail", "googlemail", "outlook", "hotmail", "live", "yahoo", "icloud", "protonmail"}
    domain_match = bool(domain and domain not in generic_domains and company and
                        (company == domain or company in domain or domain in company or
                         (set(company.split()) & set(domain.split()))))
    return domain_match or bool(company and company in text)


def _match_application(item: dict, applications: list[JobApplication]) -> JobApplication | None:
    """Only match a single high-confidence candidate; leave ambiguous mail untouched."""
    outcome = _classify_application_outcome(item.get("subject", ""), item.get("message", ""))
    if not outcome:
        return None
    ranked = sorted(
        (( _company_match_score(app, item), app) for app in applications),
        key=lambda pair: pair[0], reverse=True,
    )
    if not ranked or ranked[0][0] < 3 or not _has_company_evidence(ranked[0][1], item):
        return None
    if len(ranked) > 1 and ranked[0][0] == ranked[1][0]:
        return None
    best_score, best = ranked[0]
    # If the user has multiple applications at the same company, require an explicit role match.
    same_company = [app for app in applications if _company_match_score(app, item) >= 3]
    if len(same_company) > 1 and _normalize(best.role) not in _normalize(f"{item.get('subject', '')} {item.get('message', '')}"):
        return None
    return best if best_score >= 3 else None


def _apply_rejection_updates(db: Session, user_id: int, messages: list[dict]) -> list[dict]:
    applications = (
        db.query(JobApplication)
        .filter(JobApplication.user_id == user_id)
        .all()
    )
    updates = []
    changed = False
    for item in messages:
        if not item.get("id"):
            continue
        outcome = _classify_application_outcome(item.get("subject", ""), item.get("message", ""))
        if outcome != "Rejected":
            continue
        app = _match_application(item, applications)
        if app is None:
            item["matchReviewRequired"] = True
            continue
        item["applicationId"] = app.id
        item["matchedRole"] = app.role
        item["matchedCompany"] = app.company
        item["detectedStatus"] = "Rejected"
        item["statusUpdated"] = False
        current = (app.status or "Applied").strip()
        if current in {"Rejected", "Offer", "Withdrawn"}:
            item["statusUpdated"] = current == "Rejected"
            continue
        # Do not let an email received before the tracked application date change its status.
        received_at = item.get("receivedAt")
        if received_at and app.applied_date:
            try:
                received_date = datetime.fromisoformat(received_at.replace("Z", "+00:00")).date()
                if received_date < app.applied_date:
                    item["matchReviewRequired"] = True
                    continue
            except (TypeError, ValueError):
                pass
        app.status = "Rejected"
        item["statusUpdated"] = True
        item["statusSource"] = "gmail_rejection_email"
        updates.append({
            "messageId": item["id"],
            "applicationId": app.id,
            "company": app.company,
            "role": app.role,
            "status": "Rejected",
            "source": "gmail_rejection_email",
        })
        changed = True
    if changed:
        db.commit()
    return updates

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


def _fetch_messages(mailbox: GoogleMailbox) -> list[dict]:
    access_token = _refresh_access_token(mailbox)
    headers = {"Authorization": f"Bearer {access_token}"}
    # Explicit rejection language is included because many rejection emails do not contain
    # words such as recruiter, interview, or assessment.
    params = {
        "maxResults": 100,
        "q": 'newer_than:180d {interview recruiter hiring application candidate assessment offer "job opportunity" rejection rejected "not selected" "not moving forward" "regret to inform" unsuccessful "position has been filled"}',
    }
    messages = []
    page_token = None
    # Bound work per request; pagination ensures newer messages are not silently capped at 30.
    for _ in range(3):
        page_params = dict(params)
        if page_token:
            page_params["pageToken"] = page_token
        response = httpx.get(f"{GMAIL_API}/messages", headers=headers, params=page_params, timeout=20)
        if response.status_code == 401:
            raise HTTPException(502, "Google authorization expired or was revoked. Reconnect Gmail.")
        response.raise_for_status()
        page = response.json()
        for ref in page.get("messages", []):
            detail = httpx.get(f"{GMAIL_API}/messages/{ref['id']}", headers=headers, params={"format": "full"}, timeout=20)
            if detail.status_code >= 400:
                continue
            item = _parse_message(detail.json())
            if _is_recruiter_message(item["subject"], item["sender"], item["message"]):
                item["detectedStatus"] = _classify_application_outcome(item["subject"], item["message"])
                messages.append(item)
        page_token = page.get("nextPageToken")
        if not page_token:
            break
    messages.sort(key=lambda x: x.get("receivedAt") or "", reverse=True)
    return messages


def _sync_messages_for_user(db: Session, user_id: int, mailbox: GoogleMailbox) -> dict:
    messages = _fetch_messages(mailbox)
    updates = _apply_rejection_updates(db, user_id, messages)
    return {"messages": messages, "applicationUpdates": updates, "checkedAt": datetime.now(timezone.utc).isoformat()}


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
    """Sync on page load so confirmed rejection emails update the database immediately."""
    mailbox = db.query(GoogleMailbox).filter(GoogleMailbox.user_id == user.id).first()
    if not mailbox:
        return []
    result = _sync_messages_for_user(db, user.id, mailbox)
    return result["messages"]


@router.post("/sync")
def sync_messages(db: Session = Depends(get_db), user=Depends(get_current_user)):
    mailbox = db.query(GoogleMailbox).filter(GoogleMailbox.user_id == user.id).first()
    if not mailbox:
        raise HTTPException(409, "Gmail is not connected. Connect Gmail first.")
    result = _sync_messages_for_user(db, user.id, mailbox)
    return result["messages"]


@router.get("/cron-sync", include_in_schema=False)
def cron_sync_all_mailboxes(request: Request, db: Session = Depends(get_db)):
    """Secure endpoint for an external scheduler; configure CRON_SECRET before enabling it."""
    expected = os.getenv("CRON_SECRET", "")
    supplied = request.headers.get("authorization", "")
    if not expected or not hmac.compare_digest(supplied, f"Bearer {expected}"):
        raise HTTPException(401, "Unauthorized scheduled sync request.")

    mailboxes = db.query(GoogleMailbox).all()
    processed = 0
    updated = 0
    failed = 0
    for mailbox in mailboxes:
        try:
            result = _sync_messages_for_user(db, mailbox.user_id, mailbox)
            processed += len(result["messages"])
            updated += len(result["applicationUpdates"])
        except Exception as exc:
            # Do not log message bodies, tokens, or provider responses that might contain private data.
            failed += 1
            logger.warning("Scheduled Gmail sync failed for mailbox user_id=%s (%s)", mailbox.user_id, type(exc).__name__)
            db.rollback()
    return {"mailboxes": len(mailboxes), "messages_checked": processed, "applications_updated": updated, "mailboxes_failed": failed, "checked_at": datetime.now(timezone.utc).isoformat()}

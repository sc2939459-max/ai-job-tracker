import base64
import binascii
import html
import hmac
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr, parsedate_to_datetime
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import GoogleMailbox, JobApplication, RecruiterMessage

router = APIRouter(prefix="/recruiter-messages", tags=["Recruiter Messages"])
logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"
GOOGLE_SCOPES = "https://www.googleapis.com/auth/gmail.readonly"
ALGORITHM = "HS256"

# Set SECRET_KEY in backend/.env. Do not use a development fallback in production.
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    # Allows local development to start, but OAuth state is not production-safe.
    # Configure a strong random SECRET_KEY before deploying.
    SECRET_KEY = "dev-secret-change-me"
    logger.warning("SECRET_KEY is not configured; set a strong secret before deployment.")


def _google_config() -> tuple[str, str, str, str]:
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.getenv(
        "GOOGLE_REDIRECT_URI",
        "http://localhost:8000/api/recruiter-messages/google/callback",
    )
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=503,
            detail=(
                "Google Gmail integration is not configured. Add "
                "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env."
            ),
        )
    return client_id, client_secret, redirect_uri, frontend_url


def _oauth_state(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "purpose": "gmail-connect",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _decode_state(state: str) -> int:
    try:
        payload = jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "gmail-connect":
            raise ValueError("Unexpected OAuth state purpose")
        return int(payload["sub"])
    except (JWTError, KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired Google connection request.",
        )


def _header(headers: list[dict[str, Any]] | None, name: str) -> str:
    for item in headers or []:
        if item.get("name", "").lower() == name.lower():
            return item.get("value", "")
    return ""


def _decode_body(data: str | None) -> str:
    if not data:
        return ""
    try:
        padded = data + "=" * (-len(data) % 4)
        raw = base64.urlsafe_b64decode(padded)
        return raw.decode("utf-8", errors="replace")
    except (ValueError, binascii.Error):
        return ""


def _plain_text(value: str) -> str:
    value = re.sub(r"<(br|/p|/div|/li)\b[^>]*>", "\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def _collect_body_parts(payload: dict[str, Any]) -> tuple[str, str]:
    """Return the first available plain-text and HTML bodies from a MIME tree."""
    plain_parts: list[str] = []
    html_parts: list[str] = []

    def walk(part: dict[str, Any]) -> None:
        mime = (part.get("mimeType") or "").lower()
        data = ((part.get("body") or {}).get("data"))
        if data:
            decoded = _decode_body(data)
            if mime == "text/plain":
                plain_parts.append(decoded.strip())
            elif mime == "text/html":
                html_parts.append(decoded)
        for child in part.get("parts") or []:
            walk(child)

    walk(payload)
    return "\n\n".join(p for p in plain_parts if p), "\n\n".join(
        p for p in html_parts if p
    )


def _extract_text(payload: dict[str, Any]) -> str:
    plain, html_body = _collect_body_parts(payload)
    if plain:
        return plain
    if html_body:
        return _plain_text(html_body)
    body_data = ((payload.get("body") or {}).get("data"))
    return _decode_body(body_data).strip() if body_data else ""


def _is_recruiter_message(subject: str, sender: str, body: str) -> bool:
    """Keep likely job-related mail, including rejection-only messages."""
    text = f"{subject} {sender} {body}".lower()
    signals = (
        "interview", "recruiter", "recruitment", "hiring", "application",
        "candidate", "assessment", "technical round", "screening",
        "shortlisted", "shortlist", "offer", "job opportunity", "job opening",
        "career", "talent acquisition", "hr team", "human resources",
        "onboarding", "joining", "selection process", "regret to inform",
        "not moving forward", "not selected", "not proceed",
        "unsuccessful application", "application was unsuccessful",
        "will not be proceeding", "chosen another candidate",
        "selected another candidate", "position has been filled",
        "no longer under consideration",
    )
    return any(signal in text for signal in signals)


def _normalize(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _classify_application_outcome(subject: str, body: str) -> str | None:
    """Return Rejected only when strong rejection language is present."""
    text = re.sub(r"\s+", " ", f"{subject} {body}").lower()
    patterns = (
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
        r"\bwe are unable to offer you\b",
        r"\bwe cannot offer you\b",
    )
    return "Rejected" if any(re.search(pattern, text, re.I) for pattern in patterns) else None


def _sender_domain(sender: str) -> str:
    address = parseaddr(sender or "")[1].lower()
    return address.rsplit("@", 1)[1] if "@" in address else ""


GENERIC_EMAIL_DOMAINS = {
    "gmail", "googlemail", "outlook", "hotmail", "live", "yahoo",
    "icloud", "protonmail",
}


def _company_domain_matches(company: str, sender: str) -> bool:
    company_norm = _normalize(company)
    domain_root = _normalize(_sender_domain(sender).split(".")[0])
    if not company_norm or not domain_root or domain_root in GENERIC_EMAIL_DOMAINS:
        return False
    company_words = set(company_norm.split())
    domain_words = set(domain_root.split())
    return (
        company_norm == domain_root
        or company_norm in domain_root
        or domain_root in company_norm
        or bool(company_words & domain_words)
    )


def _company_match_score(app: JobApplication, item: dict[str, Any]) -> int:
    company = _normalize(app.company)
    text = _normalize(f"{item.get('subject', '')} {item.get('message', '')}")
    score = 0

    if _company_domain_matches(app.company or "", item.get("sender", "")):
        score += 3
    if company and re.search(rf"\b{re.escape(company)}\b", text):
        score += 3

    role = _normalize(app.role)
    if role and len(role) >= 4 and re.search(rf"\b{re.escape(role)}\b", text):
        score += 4
    return score


def _has_company_evidence(app: JobApplication, item: dict[str, Any]) -> bool:
    company = _normalize(app.company)
    text = _normalize(f"{item.get('subject', '')} {item.get('message', '')}")
    return _company_domain_matches(
        app.company or "", item.get("sender", "")
    ) or bool(company and re.search(rf"\b{re.escape(company)}\b", text))


def _match_application(
    item: dict[str, Any],
    applications: list[JobApplication],
) -> JobApplication | None:
    """Match only a single high-confidence application; leave ambiguous mail untouched."""
    if not _classify_application_outcome(
        item.get("subject", ""), item.get("message", "")
    ):
        return None

    ranked = sorted(
        ((_company_match_score(app, item), app) for app in applications),
        key=lambda pair: pair[0],
        reverse=True,
    )
    if not ranked or ranked[0][0] < 3:
        return None

    best_score, best = ranked[0]
    if not _has_company_evidence(best, item):
        return None
    if len(ranked) > 1 and ranked[0][0] == ranked[1][0]:
        return None

    same_company = [
        app for app in applications
        if _company_match_score(app, item) >= 3
    ]
    if len(same_company) > 1:
        role = _normalize(best.role)
        message_text = _normalize(
            f"{item.get('subject', '')} {item.get('message', '')}"
        )
        if not role or not re.search(rf"\b{re.escape(role)}\b", message_text):
            return None

    return best if best_score >= 3 else None


def _received_date(item: dict[str, Any]):
    received_at = item.get("receivedAt")
    if not received_at:
        return None
    try:
        return datetime.fromisoformat(
            received_at.replace("Z", "+00:00")
        ).date()
    except (TypeError, ValueError):
        return None


def _apply_rejection_updates(
    db: Session,
    user_id: int,
    messages: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    applications = (
        db.query(JobApplication)
        .filter(JobApplication.user_id == user_id)
        .all()
    )
    updates: list[dict[str, Any]] = []
    changed = False

    for item in messages:
        if not item.get("id"):
            continue
        outcome = _classify_application_outcome(
            item.get("subject", ""), item.get("message", "")
        )
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

        received_date = _received_date(item)
        applied_date = getattr(app, "applied_date", None)
        if received_date and applied_date and received_date < applied_date:
            item["matchReviewRequired"] = True
            continue

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
        try:
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Failed to commit Gmail rejection status updates")
            raise HTTPException(
                status_code=500,
                detail="Could not update application statuses from Gmail.",
            )
    return updates


def _company_from_sender(sender: str) -> str:
    address = parseaddr(sender or "")[1]
    if "@" not in address:
        return "Company"
    domain = address.rsplit("@", 1)[1].split(".")[0]
    return domain.replace("-", " ").title() or "Company"


def _parse_message(message: dict[str, Any]) -> dict[str, Any]:
    payload = message.get("payload") or {}
    headers = payload.get("headers") or []
    subject = _header(headers, "Subject") or "Recruiter update"
    sender = _header(headers, "From")
    date_value = _header(headers, "Date")

    received = None
    if date_value:
        try:
            parsed_date = parsedate_to_datetime(date_value)
            if parsed_date.tzinfo is None:
                parsed_date = parsed_date.replace(tzinfo=timezone.utc)
            received = parsed_date.astimezone(timezone.utc).isoformat()
        except (TypeError, ValueError, OverflowError):
            received = None

    body = _extract_text(payload) or message.get("snippet", "")
    role = "Role not specified"
    role_match = re.search(
        r"(?:for|position|role|opening)\s*[:\-]?\s*"
        r"([A-Za-z][A-Za-z0-9 /&.-]{2,80})",
        f"{subject} {body}",
        re.I,
    )
    if role_match:
        role = role_match.group(1).strip(" .,:;-\n")

    return {
        "id": message.get("id"),
        "threadId": message.get("threadId"),
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
    try:
        response = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": mailbox.refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=20,
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Could not connect to Google. Try again later.",
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail="Google authorization expired or was revoked. Reconnect Gmail.",
        )

    try:
        token_data = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Google returned an invalid token response.")

    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=502,
            detail="Google did not return an access token. Reconnect Gmail.",
        )
    return access_token


def _gmail_get(url: str, headers: dict[str, str], params: dict[str, Any] | None = None):
    try:
        response = httpx.get(url, headers=headers, params=params, timeout=20)
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Could not connect to Gmail. Try again later.",
        )
    if response.status_code == 401:
        raise HTTPException(
            status_code=502,
            detail="Google authorization expired or was revoked. Reconnect Gmail.",
        )
    if response.status_code == 429:
        raise HTTPException(
            status_code=503,
            detail="Gmail rate limit reached. Try syncing again later.",
        )
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Gmail message was not found.")
    if response.status_code >= 400:
        # Do not expose Google's raw response, which can contain account/provider details.
        raise HTTPException(
            status_code=502,
            detail="Gmail could not return messages. Try again later.",
        )
    try:
        return response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Gmail returned an invalid response.")


def _fetch_messages(mailbox: GoogleMailbox) -> list[dict[str, Any]]:
    access_token = _refresh_access_token(mailbox)
    headers = {"Authorization": f"Bearer {access_token}"}
    params: dict[str, Any] = {
        "maxResults": 100,
        "q": (
            'newer_than:180d {interview recruiter hiring application candidate '
            'assessment offer "job opportunity" rejection rejected "not selected" '
            '"not moving forward" "regret to inform" unsuccessful '
            '"position has been filled"}'
        ),
    }

    messages: list[dict[str, Any]] = []
    page_token = None

    # Cap work at 300 messages per sync to limit request duration.
    for _ in range(3):
        page_params = dict(params)
        if page_token:
            page_params["pageToken"] = page_token

        page = _gmail_get(f"{GMAIL_API}/messages", headers, page_params)
        for ref in page.get("messages", []):
            message_id = ref.get("id")
            if not message_id:
                continue
            try:
                detail = _gmail_get(
                    f"{GMAIL_API}/messages/{message_id}",
                    headers,
                    {"format": "full"},
                )
            except HTTPException as exc:
                # A message can disappear between list and detail calls. Skip only that
                # message; propagate authentication, rate-limit, and service failures.
                if exc.status_code == 404:
                    logger.info("Skipping Gmail message that no longer exists")
                    continue
                raise

            item = _parse_message(detail)
            if _is_recruiter_message(
                item["subject"], item["sender"], item["message"]
            ):
                item["detectedStatus"] = _classify_application_outcome(
                    item["subject"], item["message"]
                )
                messages.append(item)

        page_token = page.get("nextPageToken")
        if not page_token:
            break

    messages.sort(key=lambda item: item.get("receivedAt") or "", reverse=True)
    return messages


def _sync_messages_for_user(
    db: Session,
    user_id: int,
    mailbox: GoogleMailbox,
) -> dict[str, Any]:
    messages = _fetch_messages(mailbox)
    updates = _apply_rejection_updates(db, user_id, messages)
    return {
        "messages": messages,
        "applicationUpdates": updates,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/status")
def connection_status(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    mailbox = (
        db.query(GoogleMailbox)
        .filter(GoogleMailbox.user_id == user.id)
        .first()
    )
    return {
        "connected": bool(mailbox),
        "email": mailbox.email if mailbox else None,
    }


@router.get("/connect")
def connect_google(user=Depends(get_current_user)):
    client_id, _, redirect_uri, _ = _google_config()
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
def google_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    if not state:
        raise HTTPException(status_code=400, detail="Missing Google connection state.")

    user_id = _decode_state(state)
    _, _, redirect_uri, frontend_url = _google_config()

    if error:
        return RedirectResponse(
            f"{frontend_url}/?gmail=cancelled&open=recruiter-messages"
        )
    if not code:
        raise HTTPException(
            status_code=400,
            detail="Google did not return an authorization code.",
        )

    client_id, client_secret, _, _ = _google_config()
    try:
        response = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=20,
        )
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not connect to Google OAuth.")

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail="Google authorization failed. Check OAuth redirect URI and credentials.",
        )
    try:
        token_data = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Google returned an invalid token response.")

    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        # Google may omit refresh_token on repeat authorization; do not overwrite a
        # previously stored refresh token with an empty value.
        existing = (
            db.query(GoogleMailbox)
            .filter(GoogleMailbox.user_id == user_id)
            .first()
        )
        if existing:
            refresh_token = existing.refresh_token
        else:
            raise HTTPException(
                status_code=502,
                detail="Google did not return a refresh token. Reconnect with consent enabled.",
            )

    access_token = token_data.get("access_token")
    email = "Connected Gmail"
    if access_token:
        try:
            profile_response = httpx.get(
                f"{GMAIL_API}/profile",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=20,
            )
            if profile_response.is_success:
                email = profile_response.json().get("emailAddress") or email
        except (httpx.RequestError, ValueError):
            logger.warning("Could not retrieve Gmail profile after OAuth connection")

    mailbox = (
        db.query(GoogleMailbox)
        .filter(GoogleMailbox.user_id == user_id)
        .first()
    )
    if mailbox:
        mailbox.email = email
        mailbox.refresh_token = refresh_token
    else:
        db.add(
            GoogleMailbox(
                user_id=user_id,
                email=email,
                refresh_token=refresh_token,
            )
        )

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to save Gmail mailbox connection")
        raise HTTPException(status_code=500, detail="Could not save Gmail connection.")

    return RedirectResponse(
        f"{frontend_url}/?gmail=connected&open=recruiter-messages"
    )


@router.get("")
def list_messages(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Sync on page load so confirmed rejection emails can update application status."""
    mailbox = (
        db.query(GoogleMailbox)
        .filter(GoogleMailbox.user_id == user.id)
        .first()
    )
    if not mailbox:
        return []
    return _sync_messages_for_user(db, user.id, mailbox)["messages"]


@router.post("/sync")
def sync_messages(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    mailbox = (
        db.query(GoogleMailbox)
        .filter(GoogleMailbox.user_id == user.id)
        .first()
    )
    if not mailbox:
        raise HTTPException(
            status_code=409,
            detail="Gmail is not connected. Connect Gmail first.",
        )
    return _sync_messages_for_user(db, user.id, mailbox)["messages"]


@router.get("/cron-sync", include_in_schema=False)
def cron_sync_all_mailboxes(
    request: Request,
    db: Session = Depends(get_db),
):
    """Secure endpoint for an external scheduler; configure CRON_SECRET before use."""
    expected = os.getenv("CRON_SECRET", "")
    supplied = request.headers.get("authorization", "")
    if not expected or not hmac.compare_digest(supplied, f"Bearer {expected}"):
        raise HTTPException(status_code=401, detail="Unauthorized scheduled sync request.")

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
            failed += 1
            logger.warning(
                "Scheduled Gmail sync failed for mailbox user_id=%s (%s)",
                mailbox.user_id,
                type(exc).__name__,
            )
            db.rollback()

    return {
        "mailboxes": len(mailboxes),
        "messages_checked": processed,
        "applications_updated": updated,
        "mailboxes_failed": failed,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }

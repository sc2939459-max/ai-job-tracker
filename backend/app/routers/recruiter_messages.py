import base64
import binascii
import html
import hmac
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr, parsedate_to_datetime
from typing import Any
from urllib import response
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import GoogleMailbox, JobApplication, RecruiterMessage
from ..services.application_status import record_status_change

router = APIRouter(prefix="/recruiter-messages", tags=["Recruiter Messages"])
logger = logging.getLogger(__name__)


class ManualMatchRequest(BaseModel):
    application_id: int


class GmailRateLimitError(HTTPException):
    def __init__(
        self,
        retry_after_seconds: int = 60,
        partial_messages: list[dict[str, Any]] | None = None,
    ):
        self.retry_after_seconds = retry_after_seconds
        self.partial_messages = partial_messages or []
        super().__init__(
            status_code=503,
            detail="Gmail rate limit reached. Please wait and try again.",
            headers={"Retry-After": str(retry_after_seconds)},
        )


GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"
GOOGLE_SCOPES = "https://www.googleapis.com/auth/gmail.readonly"
ALGORITHM = "HS256"
GMAIL_SYNC_INTERVAL_SECONDS = 60
GMAIL_SYNC_PAGE_SIZE = 10
GMAIL_RATE_LIMIT_MAX_COOLDOWN_SECONDS = 900
GMAIL_MESSAGE_PREFIX = "gmail:"
GMAIL_SYNC_MARKER_URL = "gmail:sync-state"

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
    """Classify a clear application update without guessing from generic language."""
    text = re.sub(r"\s+", " ", f"{subject} {body}").lower()
    outcomes = (
        ("Rejected", (
            r"\bwe regret to inform you\b",
            r"\bnot moving forward with (?:your )?(?:application|candidacy)\b",
            r"\bwill not be moving forward\b",
            r"\bdecided to move forward with another candidate\b",
            r"\bmove forward with another candidate for this particular role\b",
            r"\b(?:we|the team) (?:won't|will not) be progressing with your application\b",
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
        )),
        ("Withdrawn", (
            r"\b(?:we have|you have) withdrawn your application\b",
            r"\byour application has been withdrawn\b",
        )),
        ("Offer", (
            r"\b(?:job offer|offer of employment|pleased to offer you|offer letter)\b",
        )),
        ("Interview", (
            r"\b(?:invite|invitation|schedule|scheduled) (?:you )?(?:to an? )?interview\b",
            r"\binterview (?:invitation|schedule|scheduled)\b",
            r"\bphone screen\b",
        )),
        ("Assessment", (
            r"\b(?:assessment|coding challenge|technical test) (?:is|has been|will be|to be)? ?(?:the )?(?:next step|assigned|available|sent)?\b",
        )),
        ("Shortlisted", (
            r"\bshortlisted\b",
            r"\bselected for the next round\b",
        )),
        ("In Review", (
            r"\bapplication (?:is|has been|is currently) under review\b",
            r"\bwe are reviewing your application\b",
            r"\byour application is being reviewed\b",
        )),
        ("Applied", (
            r"\bapplication (?:has been )?received\b",
            r"\bthank you for applying\b",
            r"\bwe received your application\b",
            r"\byour application has been submitted\b",
        )),
    )
    for status, patterns in outcomes:
        if any(re.search(pattern, text, re.I) for pattern in patterns):
            return status
    return None


def _sender_domain(sender: str) -> str:
    address = parseaddr(sender or "")[1].lower()
    return address.rsplit("@", 1)[1] if "@" in address else ""


GENERIC_EMAIL_DOMAINS = {
    "gmail", "googlemail", "outlook", "hotmail", "live", "yahoo",
    "icloud", "protonmail",
}

ATS_EMAIL_DOMAINS = {
    "ashbyhq.com",
    "bamboohr.com",
    "brassring.com",
    "breezy.hr",
    "comeet.com",
    "greenhouse.io",
    "greenhouse-mail.io",
    "icims.com",
    "jobvite.com",
    "lever.co",
    "myworkdayjobs.com",
    "recruitee.com",
    "smartrecruiters.com",
    "successfactors.com",
    "taleo.net",
    "workable.com",
    "workday.com",
}


def _is_ats_sender(sender: str) -> bool:
    domain = _sender_domain(sender)
    return any(
        domain == ats_domain or domain.endswith(f".{ats_domain}")
        for ats_domain in ATS_EMAIL_DOMAINS
    )


def _company_domain_matches(company: str, sender: str) -> bool:
    if _is_ats_sender(sender):
        return False
    company_norm = _normalize(company)
    domain_root = _normalize(_sender_domain(sender).split(".")[0])
    if not company_norm or not domain_root or domain_root in GENERIC_EMAIL_DOMAINS:
        return False
    company_words = set(company_norm.split())
    domain_words = set(domain_root.split())
    company_compact = company_norm.replace(" ", "")
    domain_compact = domain_root.replace(" ", "")
    return (
        company_norm == domain_root
        or company_norm in domain_root
        or domain_root in company_norm
        or company_compact == domain_compact
        or bool(company_words & domain_words)
    )


def _message_text(item: dict[str, Any]) -> str:
    return " ".join(
        str(item.get(key) or "")
        for key in ("subject", "message", "sender", "senderName", "snippet")
    )


def _phrase_in_text(phrase: str, text: str) -> bool:
    normalized_phrase = _normalize(phrase)
    normalized_text = _normalize(text)
    return bool(
        normalized_phrase
        and f" {normalized_phrase} " in f" {normalized_text} "
    )


def _role_mentioned(role: str, text: str) -> bool:
    if not _phrase_in_text(role, text):
        return False
    tokens = _normalize(text).split()
    role_tokens = _normalize(role).split()
    for index in range(len(tokens) - len(role_tokens) + 1):
        if tokens[index:index + len(role_tokens)] != role_tokens:
            continue
        following = tokens[index + len(role_tokens):index + len(role_tokens) + 1]
        if following and following[0] in {
            "i", "ii", "iii", "iv", "senior", "junior", "staff", "lead",
            "principal", "associate",
        }:
            continue
        return True
    return False


def _reference_ids(item: dict[str, Any]) -> set[str]:
    text = _message_text(item)
    refs = {
        re.sub(r"[^a-z0-9]", "", str(item.get("jobReferenceId") or "").lower())
    }
    pattern = (
        r"\b(?:job|application|requisition|reference|candidate)"
        r"\s*(?:id|number|no\.?|#)\s*[:#-]?\s*([a-z0-9][a-z0-9-]{3,})"
    )
    refs.update(
        re.sub(r"[^a-z0-9]", "", match.lower())
        for match in re.findall(pattern, text, re.I)
    )
    return {ref for ref in refs if ref}


def _has_company_evidence(app: JobApplication, item: dict[str, Any]) -> bool:
    return _company_domain_matches(
        app.company or "", item.get("sender", "")
    ) or _phrase_in_text(app.company or "", _message_text(item))


def _company_from_application_records(
    text: str,
    applications: list[JobApplication],
) -> str | None:
    matches = {
        _normalize(app.company): app.company
        for app in applications
        if app.company and _phrase_in_text(app.company, text)
    }
    return next(iter(matches.values())) if len(matches) == 1 else None


def _company_from_reference(
    item: dict[str, Any],
    applications: list[JobApplication],
) -> str | None:
    references = _reference_ids(item)
    matches = {
        _normalize(app.company): app.company
        for app in applications
        if app.company
        and getattr(app, "external_application_id", None)
        and re.sub(
            r"[^a-z0-9]",
            "",
            str(app.external_application_id).lower(),
        ) in references
    }
    return next(iter(matches.values())) if len(matches) == 1 else None


def _company_from_text(text: str) -> str | None:
    """Extract employer names only from explicit company/organization phrasing."""
    patterns = (
        r"(?im)^\s*(?:hiring\s+)?(?:company|employer|organization)\s*[:\-]\s*"
        r"([^\r\n|;,]+)",
        r"\b(?:at|with)\s+([A-Z][A-Za-z0-9&.,'’ -]*?)"
        r"(?=\s+(?:for|regarding|about|position|role|application|job|opening|"
        r"is|has|was|will|would|offers|offered)\b"
        r"|[\[\]()\.,!?;:]|$)",
    )
    excluded = {
        "our company",
        "the company",
        "this time",
        "the moment",
        "your convenience",
    }
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            candidate = match.group(1).strip(" .,:;-\n\t")
            normalized = _normalize(candidate)
            if normalized and normalized not in excluded:
                return candidate
    return None


def _match_application(
    item: dict[str, Any],
    applications: list[JobApplication],
) -> JobApplication | None:
    """Match by explicit reference or unique company/role evidence; never guess."""
    if not applications:
        return None

    reference_matches = [
        app for app in applications
        if re.sub(
            r"[^a-z0-9]",
            "",
            str(getattr(app, "external_application_id", "") or "").lower(),
        ) in _reference_ids(item)
        and getattr(app, "external_application_id", None)
    ]
    if len(reference_matches) == 1:
        return reference_matches[0]
    if len(reference_matches) > 1:
        return None

    company_matches = [
        app for app in applications if _has_company_evidence(app, item)
    ]
    if not company_matches:
        if not _classify_application_outcome(
            item.get("subject", ""), item.get("message", "")
        ):
            return None
        role_matches = [
            app for app in applications
            if _role_mentioned(app.role or "", _message_text(item))
        ]
        return role_matches[0] if len(role_matches) == 1 else None

    if len(company_matches) == 1:
        return company_matches[0]

    role_matches = [
        app for app in company_matches
        if _role_mentioned(app.role or "", _message_text(item))
    ]
    if len(role_matches) == 1:
        return role_matches[0]
    return None


def _received_datetime(item: dict[str, Any]) -> datetime | None:
    received_at = item.get("receivedAt")
    if not received_at:
        return None
    try:
        parsed = datetime.fromisoformat(str(received_at).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


STATUS_RANK = {
    "Wishlist": 0,
    "Applying": 0,
    "Applied": 1,
    "Application Received": 1,
    "In Review": 2,
    "Under Review": 2,
    "Screening": 2,
    "Shortlisted": 3,
    "Assessment": 4,
    "Interview Scheduled": 5,
    "Interview": 5,
    "Offer Received": 6,
    "Selected": 6,
    "Offer": 6,
    "Rejected": 7,
    "Withdrawn": 7,
}


def _safe_status_update(app: JobApplication, item: dict[str, Any], status: str) -> bool:
    current = (app.status or "Applied").strip()
    if current in {"Rejected", "Offer", "Offer Received", "Selected", "Withdrawn"}:
        return False
    if status == current or STATUS_RANK.get(status, 0) < STATUS_RANK.get(current, 0):
        return False

    received_at = _received_datetime(item)
    if received_at is None:
        return False

    applied_date = getattr(app, "applied_date", None)
    if applied_date and received_at.date() < applied_date:
        return False

    history = getattr(app, "status_history", None) or ()
    manual_corrections = [
        event
        for event in history
        if (getattr(event, "source", "") or "").lower() == "manual"
        and getattr(event, "created_at", None) is not None
    ]
    if manual_corrections:
        latest_correction = max(
            manual_corrections,
            key=lambda event: (
                event.created_at.replace(tzinfo=timezone.utc)
                if event.created_at.tzinfo is None
                else event.created_at.astimezone(timezone.utc)
            ),
        )
        corrected_at = latest_correction.created_at
        corrected_at = corrected_at.replace(tzinfo=timezone.utc) if corrected_at.tzinfo is None else corrected_at.astimezone(timezone.utc)
        if received_at <= corrected_at:
            return False

    updated_at = getattr(app, "updated_at", None)
    if (
        status == "Rejected"
        and STATUS_RANK.get(current, 0) >= STATUS_RANK["Shortlisted"]
        and updated_at
    ):
        updated_utc = updated_at.replace(tzinfo=timezone.utc) if updated_at.tzinfo is None else updated_at.astimezone(timezone.utc)
        if received_at < updated_utc:
            return False

    app.status = status
    return True


def _gmail_external_url(message_id: str) -> str:
    return f"{GMAIL_MESSAGE_PREFIX}{message_id}"


def _serialize_gmail_message(record: RecruiterMessage) -> dict[str, Any]:
    matched = record.job_id is not None
    needs_review = record.category == "needs_review"
    return {
        "id": (record.external_url or "").removeprefix(GMAIL_MESSAGE_PREFIX),
        "company": record.company or "Company",
        "matchedCompany": record.company if matched else None,
        "role": record.role or "Role not specified",
        "matchedRole": record.role if matched else None,
        "applicationId": record.job_id,
        "sender": (
            f"{record.sender_name} <{record.sender_email}>"
            if record.sender_name and record.sender_email
            else record.sender_email or record.sender_name or ""
        ),
        "subject": record.subject,
        "message": record.body,
        "receivedAt": record.received_at.isoformat() if record.received_at else None,
        "detectedStatus": record.application_status,
        "statusUpdated": record.category == "updated",
        "matchingReviewStatus": "needs_review" if needs_review else ("matched" if matched else "unmatched"),
        "matchReviewRequired": needs_review,
        "matchReviewReason": (
            "No unique application match was found."
            if needs_review
            else None
        ),
        "status": "New",
    }


def _process_gmail_messages(
    db: Session,
    user_id: int,
    messages: list[dict[str, Any]],
    commit: bool = True,
) -> list[dict[str, Any]]:
    applications = (
        db.query(JobApplication)
        .filter(JobApplication.user_id == user_id)
        .all()
    )
    message_urls = [
        _gmail_external_url(str(item["id"]))
        for item in messages
        if item.get("id")
    ]
    existing = (
        db.query(RecruiterMessage)
        .filter(
            RecruiterMessage.user_id == user_id,
            RecruiterMessage.source == "gmail",
            RecruiterMessage.external_url.in_(message_urls),
        )
        .all()
        if message_urls
        else []
    )
    existing_by_url = {record.external_url: record for record in existing}
    updates_by_message: dict[str, dict[str, Any]] = {}
    status_messages_seen: set[int] = set()
    changed = False

    ordered_messages = sorted(
        (item for item in messages if item.get("id")),
        key=lambda item: _received_datetime(item) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    for item in ordered_messages:
        external_url = _gmail_external_url(str(item["id"]))
        if external_url in existing_by_url:
            continue

        outcome = _classify_application_outcome(
            item.get("subject", ""), item.get("message", "")
        )
        app = _match_application(item, applications)
        category = "needs_review"
        if app:
            item["applicationId"] = app.id
            item["matchedRole"] = app.role
            item["matchedCompany"] = app.company
            category = "matched"

        item["detectedStatus"] = outcome
        item["statusUpdated"] = False
        item["matchReviewRequired"] = not app
        item["matchingReviewStatus"] = "matched" if app else "needs_review"

        if app and outcome:
            if app.id not in status_messages_seen:
                status_messages_seen.add(app.id)
                previous_status = app.status
                if _safe_status_update(app, item, outcome):
                    record_status_change(
                        db,
                        app,
                        previous_status,
                        "gmail",
                        f"Detected {outcome} from recruiter email: "
                        f"{item.get('subject') or 'Recruiter update'}",
                        source_email_id=str(item["id"]),
                    )
                    category = "updated"
                    item["statusUpdated"] = True
                    updates_by_message[str(item["id"])] = {
                        "messageId": item["id"],
                        "applicationId": app.id,
                        "company": app.company,
                        "role": app.role,
                        "status": outcome,
                        "source": "gmail",
                    }
            else:
                category = "matched"

        sender_name, sender_email = parseaddr(item.get("sender", ""))
        received_at = _received_datetime(item)
        record = RecruiterMessage(
            user_id=user_id,
            job_id=app.id if app else None,
            company=app.company if app else item.get("company"),
            role=app.role if app else item.get("role"),
            sender_name=sender_name or None,
            sender_email=sender_email or None,
            subject=(item.get("subject") or "Recruiter update")[:250],
            body=item.get("message", ""),
            category=category,
            application_status=outcome,
            source="gmail",
            external_url=external_url,
            received_at=received_at.replace(tzinfo=None) if received_at else None,
        )
        db.add(record)
        existing_by_url[external_url] = record
        changed = True

    if changed:
        if commit:
            try:
                db.commit()
            except Exception:
                db.rollback()
                logger.exception("Failed to save Gmail messages and application updates")
                raise HTTPException(
                    status_code=500,
                    detail="Could not save Gmail messages or application statuses.",
                )
        else:
            db.flush()
    return list(updates_by_message.values())


def _company_from_sender(sender: str) -> str:
    address = parseaddr(sender or "")[1]
    if "@" not in address:
        return "Company"
    domain = address.rsplit("@", 1)[1].split(".")[0]
    return domain.replace("-", " ").title() or "Company"


def _extract_company(
    subject: str,
    body: str,
    sender: str,
    applications: list[JobApplication] | None = None,
) -> str:
    item = {"subject": subject, "message": body}
    applications = applications or []
    for text in (subject, body):
        known_company = _company_from_application_records(text, applications)
        if known_company:
            return known_company
        company = _company_from_text(text)
        if company:
            return company

    known_company = _company_from_reference(item, applications)
    if known_company:
        return known_company

    return "Company" if _is_ats_sender(sender) else _company_from_sender(sender)


def _parse_message(
    message: dict[str, Any],
    applications: list[JobApplication] | None = None,
) -> dict[str, Any]:
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
    if received is None and message.get("internalDate"):
        try:
            received = datetime.fromtimestamp(
                int(message["internalDate"]) / 1000,
                tz=timezone.utc,
            ).isoformat()
        except (TypeError, ValueError, OverflowError, OSError):
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
        "company": _extract_company(subject, body, sender, applications),
        "role": role,
        "sender": sender,
        "subject": subject,
        "message": body,
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


def _retry_after_seconds(value: str | None) -> int:
    if not value:
        return GMAIL_SYNC_INTERVAL_SECONDS
    try:
        return min(
            max(int(float(value)), 1),
            GMAIL_RATE_LIMIT_MAX_COOLDOWN_SECONDS,
        )
    except ValueError:
        try:
            retry_time = parsedate_to_datetime(value)
            if retry_time.tzinfo is None:
                retry_time = retry_time.replace(tzinfo=timezone.utc)
            seconds = int((retry_time - datetime.now(timezone.utc)).total_seconds())
            return min(
                max(seconds, 1),
                GMAIL_RATE_LIMIT_MAX_COOLDOWN_SECONDS,
            )
        except (TypeError, ValueError, OverflowError):
            return GMAIL_SYNC_INTERVAL_SECONDS


def _gmail_get(
    url: str,
    headers: dict[str, str],
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Make one Gmail API request; mailbox sync applies cooldown after quota errors."""

    try:
        response = httpx.get(
            url,
            headers=headers,
            params=params,
            timeout=20,
        )
    except httpx.TimeoutException:
        logger.warning("Gmail API request timed out.")
        raise HTTPException(
            status_code=504,
            detail="Gmail took too long to respond. Please try again.",
        )
    except httpx.RequestError:
        logger.exception("Could not connect to Gmail API.")
        raise HTTPException(
            status_code=502,
            detail="Could not connect to Gmail. Please try again later.",
        )

    reasons: set[str] = set()
    try:
        payload = response.json()
        error = payload.get("error", {})
        errors = error.get("errors", []) if isinstance(error, dict) else []
        reasons = {
            str(item["reason"])
            for item in errors
            if isinstance(item, dict) and item.get("reason")
        }
        if not reasons and isinstance(error, dict) and error.get("status"):
            reasons = {str(error["status"])}
    except (ValueError, AttributeError, TypeError):
        pass

    if response.status_code == 401:
        logger.warning("Gmail API rejected the access token.")
        raise HTTPException(
            status_code=502,
            detail="Google authorization expired. Reconnect Gmail.",
        )

    rate_limited = response.status_code == 429 or (
        response.status_code == 403
        and bool(reasons.intersection({"rateLimitExceeded", "userRateLimitExceeded"}))
    )
    if rate_limited:
        endpoint = (
            "message detail" if "/messages/" in url else "message list"
        )
        logger.warning(
            "Gmail API rate limited %s; status=%s reasons=%s",
            endpoint,
            response.status_code,
            sorted(reasons) or ["not provided"],
        )
        raise GmailRateLimitError(
            _retry_after_seconds(response.headers.get("Retry-After"))
        )

    if response.status_code == 403:
        logger.warning(
            "Gmail API returned 403; reasons=%s",
            sorted(reasons) or ["not provided"],
        )
        raise HTTPException(
            status_code=403,
            detail="Gmail denied access to this request.",
        )

    if response.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail="Gmail message was not found.",
        )

    if response.status_code >= 500:
        logger.warning(
            "Gmail API returned HTTP %s.",
            response.status_code,
        )
        raise HTTPException(
            status_code=502,
            detail="Gmail is temporarily unavailable. Please try again.",
        )

    if response.status_code >= 400:
        logger.warning(
            "Gmail API returned HTTP %s.",
            response.status_code,
        )
        raise HTTPException(
            status_code=502,
            detail="Gmail could not return messages. Check Gmail permissions.",
        )

    try:
        data = response.json()
    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="Gmail returned an invalid response.",
        )

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=502,
            detail="Gmail returned an unexpected response.",
        )

    return data


def _fetch_messages(
    db: Session,
    mailbox: GoogleMailbox,
    page_token: str | None = None,
    after_timestamp: int | None = None,
) -> tuple[list[dict[str, Any]], str | None]:
    access_token = _refresh_access_token(mailbox)
    headers = {"Authorization": f"Bearer {access_token}"}
    applications = (
        db.query(JobApplication)
        .filter(JobApplication.user_id == mailbox.user_id)
        .all()
    )
    params: dict[str, Any] = {
        "maxResults": GMAIL_SYNC_PAGE_SIZE,
        "q": (
            'newer_than:180d {"another candidate" "not moving forward" '
            '"regret to inform" "position has been filled" "application received" '
            '"under review" shortlisted interview assessment "offer letter" '
            '"offer of employment" "coding challenge" "technical test" '
            '"withdrawn your application"}'
        ),
    }
    if after_timestamp:
        params["q"] += f" after:{after_timestamp}"
    if page_token:
        params["pageToken"] = page_token

    page = _gmail_get(f"{GMAIL_API}/messages", headers, params)
    references = [
        ref for ref in page.get("messages", []) if ref.get("id")
    ]

    external_urls = [
        _gmail_external_url(str(ref["id"]))
        for ref in references
    ]
    existing_urls = (
        {
            row[0]
            for row in db.query(RecruiterMessage.external_url)
            .filter(
                RecruiterMessage.user_id == mailbox.user_id,
                RecruiterMessage.source == "gmail",
                RecruiterMessage.external_url.in_(external_urls),
            )
            .all()
        }
        if external_urls
        else set()
    )

    messages: list[dict[str, Any]] = []
    for ref in references:
        message_id = str(ref["id"])
        if _gmail_external_url(message_id) in existing_urls:
            continue
        try:
            detail = _gmail_get(
                f"{GMAIL_API}/messages/{message_id}",
                headers,
                {"format": "full"},
            )
        except GmailRateLimitError as exc:
            exc.partial_messages = messages
            raise
        except HTTPException as exc:
            if exc.status_code == 404:
                logger.info("Skipping Gmail message that no longer exists")
                continue
            raise

        item = _parse_message(detail, applications)
        if _is_recruiter_message(item["subject"], item["sender"], item["message"]):
            item["detectedStatus"] = _classify_application_outcome(
                item["subject"], item["message"]
            )
            messages.append(item)

    messages.sort(key=lambda item: item.get("receivedAt") or "", reverse=True)
    return messages, page.get("nextPageToken")


def _sync_messages_for_user(
    db: Session,
    user_id: int,
    mailbox: GoogleMailbox,
) -> dict[str, Any]:
    mailbox = (
        db.query(GoogleMailbox)
        .filter(GoogleMailbox.user_id == user_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if mailbox is None:
        raise HTTPException(status_code=409, detail="Gmail is not connected.")

    sync_marker = (
        db.query(RecruiterMessage)
        .filter(
            RecruiterMessage.user_id == user_id,
            RecruiterMessage.source == "gmail_sync",
            RecruiterMessage.external_url == GMAIL_SYNC_MARKER_URL,
        )
        .first()
    )
    now_utc = datetime.now(timezone.utc)
    now = now_utc.replace(tzinfo=None)

    try:
        cursor = json.loads(sync_marker.body) if sync_marker and sync_marker.body else {}
    except json.JSONDecodeError:
        logger.warning(
            "Resetting invalid Gmail synchronization cursor for user_id=%s",
            user_id,
        )
        cursor = {}

    cooldown_until = cursor.get("cooldown_until")
    if cooldown_until:
        try:
            cooldown_time = datetime.fromisoformat(cooldown_until)
            if cooldown_time.tzinfo is None:
                cooldown_time = cooldown_time.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            cooldown_time = None
        if cooldown_time and cooldown_time > now_utc:
            retry_after = max(int((cooldown_time - now_utc).total_seconds()), 1)
            db.rollback()
            raise GmailRateLimitError(retry_after)

    if (
        mailbox.updated_at
        and (now - mailbox.updated_at).total_seconds() < GMAIL_SYNC_INTERVAL_SECONDS
    ):
        cached_messages = _list_gmail_messages(db, user_id)
        checked_at = mailbox.updated_at.isoformat()
        db.rollback()
        return {
            "messages": cached_messages,
            "applicationUpdates": [],
            "checkedAt": checked_at,
        }

    mode = cursor.get("mode", "backfill")
    if mode not in {"backfill", "incremental"}:
        mode = "backfill"
        cursor = {}
    after_timestamp = cursor.get("after") if mode == "incremental" else None
    try:
        after_timestamp = int(after_timestamp) if after_timestamp else None
    except (TypeError, ValueError):
        after_timestamp = None

    if sync_marker is None:
        sync_marker = RecruiterMessage(
            user_id=user_id,
            subject="",
            body="",
            category="sync_state",
            source="gmail_sync",
            external_url=GMAIL_SYNC_MARKER_URL,
        )
        db.add(sync_marker)

    try:
        messages, next_page_token = _fetch_messages(
            db,
            mailbox,
            page_token=cursor.get("page_token"),
            after_timestamp=after_timestamp,
        )
    except GmailRateLimitError as exc:
        try:
            _process_gmail_messages(
                db,
                user_id,
                exc.partial_messages,
                commit=False,
            )
        except Exception:
            db.rollback()
            raise
        try:
            failures = max(int(cursor.get("rate_limit_count", 0)), 0) + 1
        except (TypeError, ValueError):
            failures = 1
        cooldown = min(
            max(
                exc.retry_after_seconds,
                GMAIL_SYNC_INTERVAL_SECONDS * (2 ** min(failures - 1, 4)),
            ),
            GMAIL_RATE_LIMIT_MAX_COOLDOWN_SECONDS,
        )
        cursor["mode"] = mode
        if after_timestamp:
            cursor["after"] = after_timestamp
        cursor["rate_limit_count"] = failures
        cursor["cooldown_until"] = (
            now_utc + timedelta(seconds=cooldown)
        ).isoformat()
        sync_marker.body = json.dumps(cursor)
        sync_marker.updated_at = now
        try:
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Failed to save Gmail rate-limit cooldown")
            raise HTTPException(
                status_code=500,
                detail="Could not save Gmail synchronization state.",
            )
        logger.warning(
            "Gmail sync paused for user_id=%s after quota response; cooldown=%s seconds",
            user_id,
            cooldown,
        )
        raise GmailRateLimitError(cooldown, exc.partial_messages)
    except Exception:
        db.rollback()
        raise

    try:
        updates = _process_gmail_messages(db, user_id, messages, commit=False)
    except Exception:
        db.rollback()
        raise
    mailbox.updated_at = now
    if next_page_token:
        next_cursor = {
            "mode": mode,
            "page_token": next_page_token,
        }
        if after_timestamp:
            next_cursor["after"] = after_timestamp
    else:
        next_cursor = {
            "mode": "incremental",
            "after": max(int(now.replace(tzinfo=timezone.utc).timestamp()) - 120, 0),
        }
    next_cursor["rate_limit_count"] = 0
    sync_marker.body = json.dumps(next_cursor)
    sync_marker.updated_at = now
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to save Gmail synchronization timestamp")
        raise HTTPException(status_code=500, detail="Could not save Gmail sync state.")

    return {
        "messages": _list_gmail_messages(db, user_id),
        "applicationUpdates": updates,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }


def _list_gmail_messages(db: Session, user_id: int) -> list[dict[str, Any]]:
    records = (
        db.query(RecruiterMessage)
        .filter(
            RecruiterMessage.user_id == user_id,
            RecruiterMessage.source == "gmail",
        )
        .order_by(RecruiterMessage.received_at.desc(), RecruiterMessage.id.desc())
        .limit(200)
        .all()
    )
    return [_serialize_gmail_message(record) for record in records]


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


@router.get("/messages")
def get_stored_messages(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    return _list_gmail_messages(db, user.id)


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


@router.put("/{message_id}/review")
def review_message_match(
    message_id: str,
    data: ManualMatchRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    message = (
        db.query(RecruiterMessage)
        .filter(
            RecruiterMessage.user_id == user.id,
            RecruiterMessage.source == "gmail",
            RecruiterMessage.external_url == _gmail_external_url(message_id),
        )
        .first()
    )
    if not message:
        raise HTTPException(status_code=404, detail="Gmail message not found.")
    if message.job_id is not None:
        raise HTTPException(
            status_code=409,
            detail="This Gmail message is already matched to an application.",
        )

    application = (
        db.query(JobApplication)
        .filter(
            JobApplication.id == data.application_id,
            JobApplication.user_id == user.id,
        )
        .first()
    )
    if not application:
        raise HTTPException(status_code=404, detail="Application not found.")

    message.job_id = application.id
    message.company = application.company
    message.role = application.role
    message.category = "matched"

    if message.application_status:
        previous_status = application.status
        item = {
            "receivedAt": (
                message.received_at.replace(tzinfo=timezone.utc).isoformat()
                if message.received_at
                else None
            )
        }
        if _safe_status_update(application, item, message.application_status):
            record_status_change(
                db,
                application,
                previous_status,
                "gmail_review",
                f"Status update reviewed from recruiter email: {message.subject}",
                source_email_id=message_id,
            )
            message.category = "updated"

    try:
        db.commit()
        db.refresh(message)
    except Exception:
        db.rollback()
        logger.exception("Failed to save manual Gmail message match")
        raise HTTPException(
            status_code=500,
            detail="Could not save the reviewed Gmail match.",
        )
    return _serialize_gmail_message(message)
4

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

import base64
import json
from datetime import date, datetime, timedelta, timezone
from email.utils import format_datetime
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import JobApplication, RecruiterMessage, User
from app.routers.recruiter_messages import (
    ManualMatchRequest,
    _classify_application_outcome,
    _fetch_messages,
    _is_recruiter_message,
    _list_gmail_messages,
    _match_application,
    _parse_message,
    _process_gmail_messages,
    _safe_status_update,
    _sync_messages_for_user,
    review_message_match,
)
from app.routers import recruiter_messages as recruiter_messages_router


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    test_session = sessionmaker(bind=engine)
    session = test_session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _create_user(db: Session, email: str = "test@example.com") -> User:
    user = User(name="Test User", email=email, password_hash="unused")
    db.add(user)
    db.commit()
    return user


def _create_application(
    db: Session,
    user_id: int,
    company: str = "Smiths Detection",
    role: str = "Software Engineer",
    status: str = "Applied",
    external_application_id: str | None = None,
) -> JobApplication:
    application = JobApplication(
        user_id=user_id,
        company=company,
        role=role,
        status=status,
        applied_date=date.today() - timedelta(days=5),
        external_application_id=external_application_id,
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    return application


def _smiths_email(message_id: str = "smiths-rejection-1") -> dict:
    return {
        "id": message_id,
        "sender": "Abhijit Lamb from Smiths Detection <notifications@smartrecruiters.com>",
        "subject": "Thank you for your interest in Software Engineer position at Smiths Detection",
        "message": (
            "Dear Maddipatla,\n\nThank you very much for your interest in the "
            "Software Engineer position at Smiths Detection. After careful "
            "consideration, we have decided to move forward with another "
            "candidate for this particular role.\n\nWhile we won't be "
            "progressing with your application at this time, we believe you "
            "could be a great fit for future opportunities. Smiths Detection "
            "Talent Acquisition Team"
        ),
        "receivedAt": datetime(2026, 10, 14, 5, 10, tzinfo=timezone.utc).isoformat(),
    }


def _smiths_gmail_message(message_id: str = "smiths-gmail-message") -> dict:
    email = _smiths_email(message_id)
    return {
        "id": message_id,
        "payload": {
            "mimeType": "text/plain",
            "headers": [
                {
                    "name": "From",
                    "value": email["sender"],
                },
                {
                    "name": "Subject",
                    "value": email["subject"],
                },
                {
                    "name": "Date",
                    "value": format_datetime(datetime.fromisoformat(email["receivedAt"])),
                },
            ],
            "body": {
                "data": base64.urlsafe_b64encode(email["message"].encode()).decode(),
            },
        },
    }


def test_rejection_phrases_are_detected():
    assert _classify_application_outcome(
        "Update on your application", "Unfortunately, we will not be moving forward with your application."
    ) == "Rejected"
    assert _classify_application_outcome(
        "Application outcome", "We regret to inform you that another candidate was selected."
    ) == "Rejected"


def test_application_confirmation_is_classified_as_applied():
    assert _classify_application_outcome(
        "Application received", "Thank you for applying. We will review your application."
    ) == "Applied"


def test_unrelated_email_is_not_a_recruiter_message():
    assert not _is_recruiter_message("Weekend newsletter", "news@example.com", "Rejected movies of the year")


def test_rejection_matches_company_and_role_unambiguously():
    app = SimpleNamespace(id=7, company="Acme Technologies", role="Python Developer", status="Applied", applied_date=None)
    email = {
        "subject": "Python Developer application update",
        "message": "Acme Technologies has decided not to proceed with your application for Python Developer.",
        "sender": "careers@acme.com",
    }
    assert _match_application(email, [app]) is app


def test_ambiguous_same_company_applications_are_not_guessed():
    app1 = SimpleNamespace(id=7, company="Acme Technologies", role="Python Developer", status="Applied", applied_date=None)
    app2 = SimpleNamespace(id=8, company="Acme Technologies", role="Data Analyst", status="Applied", applied_date=None)
    email = {
        "subject": "Application update",
        "message": "Acme Technologies has decided not to proceed with your application.",
        "sender": "careers@acme.com",
    }
    assert _match_application(email, [app1, app2]) is None

def test_smiths_detection_rejection_email_is_detected():
    subject = "Update on your application for Software Engineer at Smiths Detection"
    body = "We have decided to move forward with another candidate for this particular role."

    assert _classify_application_outcome(subject, body) == "Rejected"
    assert _is_recruiter_message(
        subject,
        "notifications@smartrecruiters.com",
        body,
    )


def test_smiths_detection_rejection_matches_software_engineer():
    app = SimpleNamespace(
        id=10,
        company="Smiths Detection",
        role="Software Engineer",
        status="Applied",
        applied_date=None,
    )

    email = {
        "id": "test-smiths-001",
        **_smiths_email(),
    }

    assert _match_application(email, [app]) is app


def test_company_and_role_match_from_email_when_sender_is_third_party():
    app = SimpleNamespace(
        id=11, company="Smiths Detection", role="Software Engineer",
        status="Applied", applied_date=None, external_application_id=None,
    )
    email = _smiths_email()
    email["sender"] = "SmartRecruiters <notifications@smartrecruiters.com>"
    assert _match_application(email, [app]) is app


def test_same_company_applications_are_disambiguated_by_role():
    software = SimpleNamespace(
        id=1, company="Smiths Detection", role="Software Engineer",
        status="Applied", applied_date=None, external_application_id=None,
    )
    analyst = SimpleNamespace(
        id=2, company="Smiths Detection", role="Data Analyst",
        status="Applied", applied_date=None, external_application_id=None,
    )
    assert _match_application(_smiths_email(), [software, analyst]) is software


def test_reference_id_can_match_without_company_or_role_text():
    app = SimpleNamespace(
        id=1, company="Smiths Detection", role="Software Engineer",
        status="Applied", applied_date=None, external_application_id="REQ-88421",
    )
    email = {
        "subject": "Application update",
        "message": "Requisition ID: REQ-88421. We have selected another candidate.",
        "sender": "notifications@smartrecruiters.com",
    }
    assert _match_application(email, [app]) is app


def test_unique_role_can_match_status_email_without_company_name():
    app = SimpleNamespace(
        id=1, company="Smiths Detection", role="Software Engineer",
        status="Applied", applied_date=None, external_application_id=None,
    )
    email = {
        "subject": "Update on your Software Engineer application",
        "message": "We have decided to move forward with another candidate.",
        "sender": "SmartRecruiters <notifications@smartrecruiters.com>",
    }
    assert _match_application(email, [app]) is app


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ("Your application is under review.", "In Review"),
        ("You have been shortlisted for this position.", "Shortlisted"),
        ("Please complete the coding challenge as the next step.", "Assessment"),
        ("We would like to invite you to an interview.", "Interview"),
        ("We are pleased to offer you the role.", "Offer"),
        ("We have decided to move forward with another candidate.", "Rejected"),
        ("You have withdrawn your application.", "Withdrawn"),
        ("Thank you for applying.", "Applied"),
    ],
)
def test_application_statuses_are_classified(body, expected):
    assert _classify_application_outcome("Application update", body) == expected


def test_email_update_persists_rejection_and_message_in_database(db_session):
    user = _create_user(db_session)
    application = _create_application(db_session, user.id)
    application.applied_date = date(2026, 10, 10)
    parsed_email = _parse_message(_smiths_gmail_message("smiths-db-update"))

    updates = _process_gmail_messages(db_session, user.id, [parsed_email])

    db_session.refresh(application)
    stored = _list_gmail_messages(db_session, user.id)
    assert application.status == "Rejected"
    assert updates[0]["applicationId"] == application.id
    assert stored[0]["id"] == "smiths-db-update"
    assert stored[0]["matchedCompany"] == "Smiths Detection"
    assert stored[0]["matchedRole"] == "Software Engineer"
    assert stored[0]["detectedStatus"] == "Rejected"
    assert stored[0]["statusUpdated"] is True
    assert stored[0]["message"] == _smiths_email("smiths-db-update")["message"]


def test_ambiguous_email_is_persisted_for_review_without_status_change(db_session):
    user = _create_user(db_session)
    software = _create_application(db_session, user.id)
    software.applied_date = date(2026, 10, 10)
    _create_application(
        db_session, user.id, role="Software Engineer", status="Applied"
    )
    db_session.query(JobApplication).filter(
        JobApplication.user_id == user.id,
        JobApplication.id != software.id,
    ).one().applied_date = date(2026, 10, 10)
    email = _smiths_email("ambiguous-smiths")
    email["subject"] = "Application update at Smiths Detection"

    _process_gmail_messages(db_session, user.id, [email])

    db_session.refresh(software)
    stored = _list_gmail_messages(db_session, user.id)
    assert software.status == "Applied"
    assert stored[0]["matchingReviewStatus"] == "needs_review"
    assert stored[0]["matchReviewRequired"] is True


def test_manual_review_matches_email_and_updates_owned_application(db_session):
    user = _create_user(db_session)
    _process_gmail_messages(
        db_session, user.id, [_smiths_email("manual-review-message")]
    )
    application = _create_application(db_session, user.id)
    application.applied_date = date(2026, 10, 10)
    db_session.commit()

    reviewed = review_message_match(
        "manual-review-message",
        ManualMatchRequest(application_id=application.id),
        db_session,
        user,
    )

    db_session.refresh(application)
    assert application.status == "Rejected"
    assert reviewed["applicationId"] == application.id
    assert reviewed["matchingReviewStatus"] == "matched"
    assert reviewed["statusUpdated"] is True


def test_duplicate_gmail_message_is_not_processed_or_stored_twice(db_session):
    user = _create_user(db_session)
    application = _create_application(db_session, user.id)
    application.applied_date = date(2026, 10, 10)
    db_session.commit()
    email = _smiths_email("duplicate-message")

    _process_gmail_messages(db_session, user.id, [email])
    _process_gmail_messages(db_session, user.id, [email])

    db_session.refresh(application)
    stored_count = (
        db_session.query(RecruiterMessage)
        .filter(
            RecruiterMessage.user_id == user.id,
            RecruiterMessage.external_url == "gmail:duplicate-message",
        )
        .count()
    )
    assert application.status == "Rejected"
    assert stored_count == 1


def test_older_rejection_does_not_replace_advanced_application_state():
    now = datetime.now(timezone.utc)
    app = SimpleNamespace(
        status="Interview",
        applied_date=date.today() - timedelta(days=30),
        updated_at=(now - timedelta(days=1)).replace(tzinfo=None),
    )
    old_email = {
        "receivedAt": (now - timedelta(days=2)).isoformat(),
    }
    assert not _safe_status_update(app, old_email, "Rejected")
    assert app.status == "Interview"


def test_message_matching_is_scoped_to_the_current_user(db_session):
    owner = _create_user(db_session, "owner@example.com")
    other_user = _create_user(db_session, "other@example.com")
    application = _create_application(db_session, owner.id)

    _process_gmail_messages(db_session, other_user.id, [_smiths_email("other-user-mail")])

    db_session.refresh(application)
    assert application.status == "Applied"
    assert not _list_gmail_messages(db_session, owner.id)
    assert len(_list_gmail_messages(db_session, other_user.id)) == 1


@pytest.mark.parametrize(
    "rate_response",
    [
        httpx.Response(
            429,
            json={"error": {"status": "RESOURCE_EXHAUSTED"}},
            headers={"Retry-After": "0"},
        ),
        httpx.Response(
            403,
            json={"error": {"errors": [{"reason": "userRateLimitExceeded"}]}},
            headers={"Retry-After": "0"},
        ),
    ],
)
def test_gmail_rate_limits_retry_once_with_server_error_recovery(
    monkeypatch, rate_response
):
    responses = [rate_response, httpx.Response(200, json={"messages": []})]
    request_count = []
    monkeypatch.setattr(
        recruiter_messages_router.httpx,
        "get",
        lambda *args, **kwargs: request_count.append(True) or responses.pop(0),
    )
    monkeypatch.setattr(recruiter_messages_router.time, "sleep", lambda _delay: None)

    result = recruiter_messages_router._gmail_get("https://gmail.test/messages", {})

    assert result == {"messages": []}
    assert len(request_count) == 2


def test_fetch_skips_detail_requests_for_already_persisted_message(
    db_session, monkeypatch
):
    user = _create_user(db_session)
    _create_application(db_session, user.id)
    now = datetime.utcnow()
    mailbox = SimpleNamespace(
        user_id=user.id,
        refresh_token="unused",
        created_at=now - timedelta(days=10),
        updated_at=now - timedelta(minutes=5),
    )
    db_session.add(
        RecruiterMessage(
            user_id=user.id,
            company="Smiths Detection",
            role="Software Engineer",
            subject="Previously processed",
            body="",
            category="matched",
            source="gmail",
            external_url="gmail:already-seen",
        )
    )
    db_session.commit()

    requested_urls = []
    monkeypatch.setattr(
        recruiter_messages_router,
        "_refresh_access_token",
        lambda _mailbox: "access",
    )

    def fake_gmail_get(url, headers, params=None):
        requested_urls.append(url)
        if url.endswith("/messages"):
            return {"messages": [{"id": "already-seen"}, {"id": "new-message"}]}
        return {
            "id": "new-message",
            "payload": {
                "headers": [
                    {"name": "From", "value": "SmartRecruiters <notifications@smartrecruiters.com>"},
                    {"name": "Subject", "value": "Software Engineer at Smiths Detection"},
                ],
                "mimeType": "text/plain",
                "body": {
                    "data": base64.urlsafe_b64encode(
                        b"We have decided to move forward with another candidate."
                    ).decode(),
                },
            },
        }

    monkeypatch.setattr(recruiter_messages_router, "_gmail_get", fake_gmail_get)
    fetched, next_page_token = _fetch_messages(db_session, mailbox)

    assert len(fetched) == 1
    assert next_page_token is None
    assert requested_urls.count("https://gmail.googleapis.com/gmail/v1/users/me/messages/new-message") == 1
    assert not any(url.endswith("/messages/already-seen") for url in requested_urls)


def test_gmail_backfill_cursor_advances_without_repeating_list_pages(
    db_session, monkeypatch
):
    user = _create_user(db_session)
    mailbox = SimpleNamespace(
        user_id=user.id,
        updated_at=datetime.now(timezone.utc).replace(tzinfo=None)
        - timedelta(minutes=5),
    )
    requested_tokens = []
    responses = [([], "next-backfill-page"), ([], None)]

    def fake_fetch(_db, _mailbox, page_token=None, after_timestamp=None):
        requested_tokens.append((page_token, after_timestamp))
        return responses.pop(0)

    monkeypatch.setattr(recruiter_messages_router, "_fetch_messages", fake_fetch)
    _sync_messages_for_user(db_session, user.id, mailbox, force=True)
    _sync_messages_for_user(db_session, user.id, mailbox, force=True)

    marker = (
        db_session.query(RecruiterMessage)
        .filter(
            RecruiterMessage.user_id == user.id,
            RecruiterMessage.source == "gmail_sync",
        )
        .one()
    )
    cursor = json.loads(marker.body)
    assert requested_tokens == [(None, None), ("next-backfill-page", None)]
    assert cursor["mode"] == "incremental"
    assert "after" in cursor
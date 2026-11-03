from datetime import date, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    ApplicationStatusHistory,
    JobApplication,
    RecruiterMessage,
    User,
)
from app.routers.response_activity import build_response_activity, response_activity


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session = sessionmaker(bind=engine)()
    Base.metadata.create_all(bind=engine)
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _user(db: Session, email: str) -> User:
    user = User(name="Analytics User", email=email, password_hash="unused")
    db.add(user)
    db.commit()
    return user


def _application(
    db: Session,
    user_id: int,
    company: str,
    role: str,
    status: str,
    applied_date: date = date(2026, 8, 1),
) -> JobApplication:
    application = JobApplication(
        user_id=user_id,
        company=company,
        role=role,
        status=status,
        applied_date=applied_date,
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    return application


def _message(
    db: Session,
    user_id: int,
    application: JobApplication,
    email_id: str,
    status: str,
    subject: str,
    received_at: datetime | None,
    body: str = "",
) -> RecruiterMessage:
    message = RecruiterMessage(
        user_id=user_id,
        job_id=application.id,
        company=application.company,
        role=application.role,
        sender_email="talent@example.com",
        subject=subject,
        body=body,
        category="updated",
        application_status=status,
        source="gmail",
        external_url=f"gmail:{email_id}",
        received_at=received_at,
    )
    db.add(message)
    db.commit()
    return message


def test_response_activity_counts_unique_applications_and_separates_confirmation(db_session):
    user = _user(db_session, "stats@example.com")
    confirmation = _application(
        db_session, user.id, "Northstar", "Engineer", "Application Received"
    )
    rejected = _application(db_session, user.id, "Pine", "Analyst", "Rejected")
    interview = _application(db_session, user.id, "Cedar", "Developer", "Interview")
    offer = _application(db_session, user.id, "Maple", "Designer", "Offer Received")
    awaiting = _application(db_session, user.id, "Birch", "Engineer", "Applied")
    review = _application(db_session, user.id, "Ash", "Engineer", "In Review")
    withdrawn = _application(db_session, user.id, "Willow", "Analyst", "Withdrawn")
    _application(db_session, user.id, "Saved", "Engineer", "Applying")

    _message(
        db_session,
        user.id,
        confirmation,
        "ack-1",
        "Applied",
        "Application received",
        datetime(2026, 8, 2),
        "Thank you for applying. We received your application.",
    )
    _message(
        db_session, user.id, rejected, "reject-1", "Rejected", "Application update",
        datetime(2026, 8, 3), "We decided to move forward with another candidate.",
    )
    _message(
        db_session, user.id, interview, "interview-1", "Interview", "Interview invitation",
        datetime(2026, 8, 4), "We would like to schedule an interview.",
    )
    _message(
        db_session, user.id, offer, "offer-1", "Offer", "Offer of employment",
        datetime(2026, 8, 5), "We are pleased to offer you the role.",
    )
    db_session.add(
        ApplicationStatusHistory(
            user_id=user.id,
            job_id=rejected.id,
            previous_status="Applied",
            new_status="Rejected",
            source="gmail",
            source_email_id="reject-1",
            created_at=datetime(2026, 8, 3),
        )
    )
    db_session.add(
        ApplicationStatusHistory(
            user_id=user.id,
            job_id=review.id,
            previous_status="Applied",
            new_status="In Review",
            source="manual",
            created_at=datetime(2026, 8, 6),
        )
    )
    db_session.commit()

    result = response_activity(None, None, None, None, None, db_session, user)
    metrics = result["metrics"]

    assert metrics["totalSubmitted"] == 7
    assert metrics["applicationReceived"] == 1
    assert metrics["recruiterResponses"] == 4
    assert metrics["awaitingResponse"] == 2
    assert metrics["underReview"] == 1
    assert metrics["shortlisted"] == 0
    assert metrics["interviewInvitations"] == 1
    assert metrics["assessmentInvitations"] == 0
    assert metrics["rejected"] == 1
    assert metrics["offers"] == 1
    assert metrics["withdrawn"] == 1
    assert metrics["responseRate"] == pytest.approx(57.1)
    assert metrics["interviewConversionRate"] == pytest.approx(14.3)
    assert metrics["offerConversionRate"] == pytest.approx(14.3)
    assert metrics["rejectionRate"] == pytest.approx(14.3)
    assert next(item for item in result["recentResponses"] if item["applicationId"] == rejected.id)["events"][0]["type"] == "Rejected"


def test_multiple_responses_count_as_events_but_one_application(db_session):
    user = _user(db_session, "multiple@example.com")
    application = _application(db_session, user.id, "Cedar", "Developer", "Interview")
    _message(
        db_session, user.id, application, "assessment-1", "Assessment",
        "Technical assessment", datetime(2026, 8, 3),
    )
    _message(
        db_session, user.id, application, "interview-1", "Interview",
        "Interview invitation", datetime(2026, 8, 4),
    )

    result = response_activity(None, None, None, None, None, db_session, user)

    assert result["metrics"]["totalSubmitted"] == 1
    assert result["metrics"]["recruiterResponses"] == 1
    assert result["metrics"]["interviewInvitations"] == 1
    assert result["metrics"]["assessmentInvitations"] == 1
    distribution = {item["type"]: item for item in result["responseDistribution"]}
    assert distribution["Interview Invitation"] == {
        "type": "Interview Invitation",
        "events": 1,
        "applications": 1,
    }
    assert distribution["Assessment Invitation"]["events"] == 1


def test_shortlisting_is_a_recruiter_response_and_status_filter_is_unique(db_session):
    user = _user(db_session, "shortlist@example.com")
    application = _application(
        db_session, user.id, "Cedar", "Developer", "Shortlisted"
    )
    db_session.add(
        ApplicationStatusHistory(
            user_id=user.id,
            job_id=application.id,
            previous_status="Applied",
            new_status="Shortlisted",
            source="gmail",
            source_email_id="shortlist-1",
            created_at=datetime(2026, 8, 3),
        )
    )
    db_session.add(
        RecruiterMessage(
            user_id=user.id,
            job_id=application.id,
            company=application.company,
            role=application.role,
            subject="You have been shortlisted",
            body="You have been shortlisted for the next round.",
            category="updated",
            application_status="Shortlisted",
            source="gmail",
            external_url="gmail:shortlist-1",
            received_at=datetime(2026, 8, 3),
        )
    )
    db_session.commit()

    result = response_activity(
        None, None, None, "Shortlisted", "Shortlisted", db_session, user
    )

    assert result["metrics"]["totalSubmitted"] == 1
    assert result["metrics"]["shortlisted"] == 1
    assert result["metrics"]["recruiterResponses"] == 1
    shortlisted_events = next(
        item
        for item in result["responseDistribution"]
        if item["type"] == "Shortlisted"
    )
    assert shortlisted_events["events"] == 1
    assert shortlisted_events["applications"] == 1


def test_duplicate_gmail_records_and_linked_history_are_deduplicated(db_session):
    user = _user(db_session, "duplicates@example.com")
    application = _application(db_session, user.id, "Pine", "Analyst", "Rejected")
    message = _message(
        db_session, user.id, application, "reject-1", "Rejected",
        "Rejection notice", datetime(2026, 8, 3),
    )
    duplicate = RecruiterMessage(
        user_id=user.id,
        job_id=application.id,
        company=application.company,
        role=application.role,
        subject=message.subject,
        body=message.body,
        category="updated",
        application_status="Rejected",
        source="gmail",
        external_url=message.external_url,
        received_at=message.received_at,
    )
    history = ApplicationStatusHistory(
        user_id=user.id,
        job_id=application.id,
        previous_status="Applied",
        new_status="Rejected",
        source="gmail",
        source_email_id="reject-1",
        created_at=datetime(2026, 8, 3),
    )
    db_session.add_all([duplicate, history])
    db_session.commit()

    result = response_activity(None, None, None, None, None, db_session, user)
    rejected_events = next(
        item for item in result["responseDistribution"] if item["type"] == "Rejected"
    )

    assert rejected_events["events"] == 1
    assert rejected_events["applications"] == 1


def test_application_acknowledgement_is_not_a_meaningful_recruiter_response():
    application = JobApplication(
        id=1,
        user_id=1,
        company="Northstar",
        role="Engineer",
        status="Application Received",
        applied_date=date(2026, 8, 1),
    )
    message = RecruiterMessage(
        id=1,
        user_id=1,
        job_id=1,
        company="Northstar",
        role="Engineer",
        subject="Application received",
        body="Thank you for applying.",
        application_status="Applied",
        category="updated",
        source="gmail",
        external_url="gmail:ack",
        received_at=datetime(2026, 8, 2),
    )
    second_acknowledgement = RecruiterMessage(
        id=2,
        user_id=1,
        job_id=1,
        company="Northstar",
        role="Engineer",
        subject="Thank you for your interest",
        body="We will review your application and contact you if selected.",
        application_status=None,
        category="matched",
        source="gmail",
        external_url="gmail:ack-2",
        received_at=datetime(2026, 8, 3),
    )

    result = build_response_activity(
        [application], [], [message, second_acknowledgement]
    )
    metrics = result["metrics"]

    assert metrics["applicationReceived"] == 1
    assert metrics["recruiterResponses"] == 0
    assert metrics["awaitingResponse"] == 1
    assert metrics["responseRate"] == 0
    assert next(
        item
        for item in result["recentResponses"][0]["events"]
        if item["subject"] == "Thank you for your interest"
    )["type"] == "Application Received"


def test_filters_update_metrics_charts_and_recent_applications(db_session):
    user = _user(db_session, "filters@example.com")
    pine = _application(
        db_session,
        user.id,
        "Pine Systems",
        "Analyst",
        "Rejected",
        date(2026, 8, 1),
    )
    cedar = _application(
        db_session,
        user.id,
        "Cedar Labs",
        "Developer",
        "Interview",
        date(2026, 9, 1),
    )
    _message(
        db_session, user.id, pine, "pine-reject", "Rejected",
        "Regret notice", datetime(2026, 8, 2),
    )
    _message(
        db_session, user.id, cedar, "cedar-interview", "Interview",
        "Interview invite", datetime(2026, 9, 2),
    )

    result = response_activity(
        date(2026, 8, 1),
        date(2026, 8, 31),
        "Pine",
        "Rejected",
        "Rejected",
        db_session,
        user,
    )

    assert result["metrics"]["totalSubmitted"] == 1
    assert result["metrics"]["rejected"] == 1
    assert len(result["recentResponses"]) == 1
    assert result["recentResponses"][0]["applicationId"] == pine.id
    assert [item["month"] for item in result["monthlyTrends"]] == ["2026-08"]


def test_empty_dataset_returns_zero_rates_and_empty_visualizations(db_session):
    user = _user(db_session, "empty@example.com")

    result = response_activity(None, None, None, None, None, db_session, user)

    assert result["metrics"]["totalSubmitted"] == 0
    assert result["metrics"]["responseRate"] == 0
    assert result["metrics"]["interviewConversionRate"] == 0
    assert result["metrics"]["offerConversionRate"] == 0
    assert result["statusDistribution"] == []
    assert result["monthlyTrends"] == []
    assert result["recentResponses"] == []


def test_missing_email_timestamp_is_safe_and_does_not_invent_a_date(db_session):
    user = _user(db_session, "missing-date@example.com")
    application = _application(
        db_session, user.id, "Northstar", "Engineer", "Application Received"
    )
    _message(
        db_session,
        user.id,
        application,
        "undated-ack",
        "Applied",
        "Application received",
        None,
    )

    result = response_activity(None, None, None, None, None, db_session, user)

    assert result["recentResponses"][0]["latestResponseDate"] is None
    assert result["monthlyTrends"] == [
        {"month": "2026-08", "applications": 1, "responses": 0}
    ]


def test_response_activity_is_scoped_to_authenticated_user(db_session):
    user = _user(db_session, "owner@example.com")
    other_user = _user(db_session, "other@example.com")
    _application(db_session, user.id, "Owner Co", "Engineer", "Applied")
    _application(db_session, other_user.id, "Other Co", "Engineer", "Offer")

    result = response_activity(None, None, None, None, None, db_session, user)

    assert result["metrics"]["totalSubmitted"] == 1
    assert result["metrics"]["offers"] == 0
    assert [item["company"] for item in result["recentResponses"]] == ["Owner Co"]

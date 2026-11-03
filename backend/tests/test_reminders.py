from datetime import date, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    ApplicationStatusHistory,
    FollowUpReminder,
    FollowUpSettings,
    JobApplication,
    Notification,
    User,
)
from app.routers.reminders import (
    FollowUpSettingsUpdate,
    ReminderUpdate,
    _generate_due_reminders,
    list_reminders,
    update_reminder,
    update_settings,
)


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


def _create_user(db: Session, email: str) -> User:
    user = User(name="Reminder User", email=email, password_hash="unused")
    db.add(user)
    db.commit()
    return user


def _create_application(
    db: Session,
    user_id: int,
    status: str = "Applied",
    applied_date: date = date(2026, 1, 1),
) -> JobApplication:
    job = JobApplication(
        user_id=user_id,
        company="Example Co",
        role="Engineer",
        status=status,
        applied_date=applied_date,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def test_due_reminder_created_once_for_unanswered_application(db_session):
    user = _create_user(db_session, "reminder@example.com")
    job = _create_application(db_session, user.id)
    now = datetime(2026, 1, 10, 12)

    assert _generate_due_reminders(db_session, user.id, now) == 1
    assert _generate_due_reminders(db_session, user.id, now) == 0

    reminder = db_session.query(FollowUpReminder).one()
    assert reminder.job_id == job.id
    assert reminder.status == "pending"
    assert reminder.due_at == datetime(2026, 1, 8)
    assert db_session.query(Notification).filter_by(
        notification_type="follow_up_reminder"
    ).count() == 1


@pytest.mark.parametrize("status", ["Offer", "Selected", "Rejected", "Withdrawn"])
def test_terminal_application_does_not_get_a_reminder(db_session, status):
    user = _create_user(db_session, f"{status.lower()}@example.com")
    _create_application(db_session, user.id, status=status)

    assert _generate_due_reminders(
        db_session,
        user.id,
        datetime(2026, 1, 20),
    ) == 0
    assert db_session.query(FollowUpReminder).count() == 0


def test_status_update_resets_follow_up_clock(db_session):
    user = _create_user(db_session, "status-clock@example.com")
    job = _create_application(db_session, user.id)
    db_session.add(
        ApplicationStatusHistory(
            user_id=user.id,
            job_id=job.id,
            previous_status="Applied",
            new_status="In Review",
            source="gmail",
            created_at=datetime(2026, 1, 9),
        )
    )
    db_session.commit()

    assert _generate_due_reminders(
        db_session,
        user.id,
        datetime(2026, 1, 12),
    ) == 0
    assert _generate_due_reminders(
        db_session,
        user.id,
        datetime(2026, 1, 17),
    ) == 1


def test_disabling_reminders_cancels_pending_reminders(db_session):
    user = _create_user(db_session, "disabled@example.com")
    job = _create_application(db_session, user.id)
    reminder = FollowUpReminder(
        user_id=user.id,
        job_id=job.id,
        due_at=datetime(2026, 1, 2),
        status="pending",
    )
    db_session.add(reminder)
    db_session.add(FollowUpSettings(user_id=user.id, enabled=False))
    db_session.commit()

    assert _generate_due_reminders(
        db_session,
        user.id,
        datetime(2026, 1, 10),
    ) == 0
    db_session.refresh(reminder)
    assert reminder.status == "cancelled"


def test_user_can_configure_interval_and_list_only_owned_reminders(db_session):
    user = _create_user(db_session, "config@example.com")
    other_user = _create_user(db_session, "other@example.com")
    job = _create_application(db_session, user.id)
    other_job = _create_application(db_session, other_user.id)
    settings = update_settings(
        FollowUpSettingsUpdate(interval_days=3, enabled=True),
        db_session,
        user,
    )
    assert settings == {"intervalDays": 3, "enabled": True}

    _generate_due_reminders(
        db_session,
        user.id,
        datetime(2026, 1, 5),
    )
    _generate_due_reminders(
        db_session,
        other_user.id,
        datetime(2026, 1, 10),
    )
    result = list_reminders(db_session, user)

    assert result["settings"]["intervalDays"] == 3
    assert [item["applicationId"] for item in result["reminders"]] == [job.id]
    assert other_job.id not in [item["applicationId"] for item in result["reminders"]]


def test_pending_reminder_can_be_rescheduled_or_completed(db_session):
    user = _create_user(db_session, "actions@example.com")
    job = _create_application(db_session, user.id)
    reminder = FollowUpReminder(
        user_id=user.id,
        job_id=job.id,
        due_at=datetime.utcnow() + timedelta(days=1),
        status="pending",
    )
    db_session.add(reminder)
    db_session.commit()

    rescheduled = update_reminder(
        reminder.id,
        ReminderUpdate(due_at=datetime.utcnow() + timedelta(days=3)),
        db_session,
        user,
    )
    assert rescheduled["status"] == "pending"

    completed = update_reminder(
        reminder.id,
        ReminderUpdate(complete=True),
        db_session,
        user,
    )
    assert completed["status"] == "completed"
    assert completed["completedAt"] is not None


def test_reminder_mutation_is_user_scoped(db_session):
    user = _create_user(db_session, "owner@example.com")
    other_user = _create_user(db_session, "intruder@example.com")
    job = _create_application(db_session, user.id)
    reminder = FollowUpReminder(
        user_id=user.id,
        job_id=job.id,
        due_at=datetime.utcnow() + timedelta(days=1),
        status="pending",
    )
    db_session.add(reminder)
    db_session.commit()

    with pytest.raises(HTTPException) as error:
        update_reminder(
            reminder.id,
            ReminderUpdate(complete=True),
            db_session,
            other_user,
        )
    assert error.value.status_code == 404


def test_reminder_configuration_validates_interval():
    with pytest.raises(ValueError):
        FollowUpSettingsUpdate(interval_days=0)

import hmac
import os
from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import (
    ApplicationStatusHistory,
    FollowUpReminder,
    FollowUpSettings,
    JobApplication,
    Notification,
    User,
)

router = APIRouter(prefix="/reminders", tags=["Follow-up Reminders"])
DEFAULT_INTERVAL_DAYS = 7
TERMINAL_STATUSES = {
    "offer",
    "offer received",
    "selected",
    "rejected",
    "withdrawn",
}


class FollowUpSettingsUpdate(BaseModel):
    interval_days: int = Field(default=DEFAULT_INTERVAL_DAYS, ge=1, le=90)
    enabled: bool = True


class ReminderUpdate(BaseModel):
    due_at: datetime | None = None
    complete: bool = False


def _naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _serialize_settings(settings: FollowUpSettings | None) -> dict:
    return {
        "intervalDays": settings.interval_days if settings else DEFAULT_INTERVAL_DAYS,
        "enabled": settings.enabled if settings else True,
    }


def _generate_due_reminders(
    db: Session,
    user_id: int,
    now: datetime | None = None,
) -> int:
    now = _naive_utc(now or datetime.now(timezone.utc))
    settings = (
        db.query(FollowUpSettings)
        .filter(FollowUpSettings.user_id == user_id)
        .first()
    )
    interval_days = settings.interval_days if settings else DEFAULT_INTERVAL_DAYS
    enabled = settings.enabled if settings else True

    applications = (
        db.query(JobApplication)
        .filter(JobApplication.user_id == user_id)
        .with_for_update()
        .all()
    )
    app_ids = [app.id for app in applications]
    latest_history: dict[int, datetime] = {}
    completed_at_by_job: dict[int, datetime] = {}
    pending_by_job: dict[int, FollowUpReminder] = {}

    if app_ids:
        latest_history = {
            job_id: _naive_utc(timestamp)
            for job_id, timestamp in db.query(
                ApplicationStatusHistory.job_id,
                func.max(ApplicationStatusHistory.created_at),
            )
            .filter(
                ApplicationStatusHistory.user_id == user_id,
                ApplicationStatusHistory.job_id.in_(app_ids),
            )
            .group_by(ApplicationStatusHistory.job_id)
            .all()
        }
        reminders = (
            db.query(FollowUpReminder)
            .filter(
                FollowUpReminder.user_id == user_id,
                FollowUpReminder.job_id.in_(app_ids),
            )
            .all()
        )
        for reminder in reminders:
            if reminder.status == "pending":
                pending_by_job[reminder.job_id] = reminder
            elif reminder.status == "completed" and reminder.completed_at:
                completed = _naive_utc(reminder.completed_at)
                if completed > completed_at_by_job.get(reminder.job_id, datetime.min):
                    completed_at_by_job[reminder.job_id] = completed

    created = 0
    for application in applications:
        status = (application.status or "").strip().lower()
        pending = pending_by_job.get(application.id)
        if status in TERMINAL_STATUSES or not enabled:
            if pending:
                pending.status = "cancelled"
            continue
        if pending:
            continue

        applied_at = (
            datetime.combine(application.applied_date, time.min)
            if application.applied_date
            else _naive_utc(application.created_at)
        )
        anchor = latest_history.get(application.id, applied_at)
        completed_at = completed_at_by_job.get(application.id)
        due_at = anchor + timedelta(days=interval_days)
        if completed_at:
            due_at = max(due_at, completed_at + timedelta(days=interval_days))
        if due_at > now:
            continue

        reminder = FollowUpReminder(
            user_id=user_id,
            job_id=application.id,
            due_at=due_at,
            status="pending",
        )
        db.add(reminder)
        db.flush()
        db.add(
            Notification(
                user_id=user_id,
                job_id=application.id,
                title=f"Follow up with {application.company}",
                description=f"No recent update for {application.role}. Consider sending a follow-up.",
                notification_type="follow_up_reminder",
                company=application.company,
                link=f"/applications/{application.id}",
                details={"reminder_id": reminder.id},
            )
        )
        created += 1

    if created or any(
        reminder.status == "cancelled" for reminder in pending_by_job.values()
    ):
        db.commit()
    return created


def _serialize_reminder(reminder: FollowUpReminder) -> dict:
    return {
        "id": reminder.id,
        "applicationId": reminder.job_id,
        "company": reminder.job.company,
        "role": reminder.job.role,
        "dueAt": reminder.due_at,
        "status": reminder.status,
        "completedAt": reminder.completed_at,
    }


@router.get("/settings")
def get_settings(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    settings = (
        db.query(FollowUpSettings)
        .filter(FollowUpSettings.user_id == user.id)
        .first()
    )
    return _serialize_settings(settings)


@router.put("/settings")
def update_settings(
    data: FollowUpSettingsUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    settings = (
        db.query(FollowUpSettings)
        .filter(FollowUpSettings.user_id == user.id)
        .first()
    )
    if settings is None:
        settings = FollowUpSettings(user_id=user.id)
        db.add(settings)
    settings.interval_days = data.interval_days
    settings.enabled = data.enabled
    db.commit()
    db.refresh(settings)
    return _serialize_settings(settings)


@router.get("")
def list_reminders(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _generate_due_reminders(db, user.id)
    reminders = (
        db.query(FollowUpReminder)
        .filter(
            FollowUpReminder.user_id == user.id,
            FollowUpReminder.status == "pending",
        )
        .order_by(FollowUpReminder.due_at.asc())
        .all()
    )
    settings = (
        db.query(FollowUpSettings)
        .filter(FollowUpSettings.user_id == user.id)
        .first()
    )
    return {
        "settings": _serialize_settings(settings),
        "reminders": [_serialize_reminder(item) for item in reminders],
    }


@router.patch("/{reminder_id}")
def update_reminder(
    reminder_id: int,
    data: ReminderUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    reminder = (
        db.query(FollowUpReminder)
        .filter(
            FollowUpReminder.id == reminder_id,
            FollowUpReminder.user_id == user.id,
        )
        .first()
    )
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if reminder.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending reminders can be changed")
    if data.complete and data.due_at is not None:
        raise HTTPException(status_code=400, detail="Complete or reschedule the reminder, not both")
    if data.complete:
        reminder.status = "completed"
        reminder.completed_at = datetime.utcnow()
    elif data.due_at is not None:
        due_at = _naive_utc(data.due_at)
        if due_at <= datetime.utcnow():
            raise HTTPException(status_code=400, detail="Rescheduled time must be in the future")
        reminder.due_at = due_at
    else:
        raise HTTPException(status_code=400, detail="Provide complete=true or a new due_at")
    db.commit()
    db.refresh(reminder)
    return _serialize_reminder(reminder)


@router.get("/cron", include_in_schema=False)
def run_reminder_schedule(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    secret = os.getenv("CRON_SECRET", "")
    if not secret or not hmac.compare_digest(authorization or "", f"Bearer {secret}"):
        raise HTTPException(status_code=401, detail="Unauthorized reminder schedule request")

    user_ids = [row[0] for row in db.query(User.id).all()]
    created = sum(_generate_due_reminders(db, user_id) for user_id in user_ids)
    return {"users_checked": len(user_ids), "reminders_created": created}

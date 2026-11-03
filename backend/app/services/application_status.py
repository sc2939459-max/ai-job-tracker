from sqlalchemy.orm import Session

from ..models import ApplicationStatusHistory, JobApplication


def record_status_change(
    db: Session,
    job: JobApplication,
    previous_status: str | None,
    source: str,
    reason: str,
    source_email_id: str | None = None,
) -> ApplicationStatusHistory | None:
    if previous_status == job.status:
        return None

    history = ApplicationStatusHistory(
        user_id=job.user_id,
        job_id=job.id,
        previous_status=previous_status,
        new_status=job.status,
        source=source,
        source_email_id=source_email_id,
        reason=reason,
    )
    db.add(history)
    return history

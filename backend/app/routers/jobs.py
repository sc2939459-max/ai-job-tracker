from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import JobApplication, Notification
from ..schemas import JobCreate, JobOut

router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"],
)

STATUSES = [
    "Wishlist",
    "Applying",
    "Applied",
    "Application Received",
    "Under Review",
    "Shortlisted",
    "Interview Scheduled",
    "Assessment",
    "Selected",
    "Offer Received",
    "Screening",
    "Interview",
    "Offer",
    "Rejected",
    "Withdrawn",
]

STATUS_ALIASES = {
    "application received": "Application Received",
    "under review": "Under Review",
    "shortlisted": "Shortlisted",
    "interview scheduled": "Interview Scheduled",
    "assessment": "Assessment",
    "selected": "Selected",
    "offer received": "Offer Received",
    "screening": "Screening",
    "interview": "Interview",
    "offer": "Offer",
    "wishlist": "Wishlist",
    "applying": "Applying",
    "applied": "Applied",
    "rejected": "Rejected",
    "withdrawn": "Withdrawn",
}


def normalize_status(value):
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    lowered = raw.lower()
    if lowered in STATUS_ALIASES:
        return STATUS_ALIASES[lowered]
    for status in STATUSES:
        if raw.lower() == status.lower():
            return status
    return raw


def create_status_notification(db, user, job, previous_status=None):
    if not job or not job.user_id:
        return
    current_status = normalize_status(job.status) or "Applied"
    if previous_status is not None and normalize_status(previous_status) == current_status:
        return
    if current_status in {"Wishlist", "Applying"}:
        return

    title = f"{job.company}: {current_status}"
    description = (
        f"Your application for {job.role or 'the role'} has moved to {current_status}."
    )
    link = f"/applications/{job.id}"
    existing = (
        db.query(Notification)
        .filter(
            Notification.user_id == user.id,
            Notification.job_id == job.id,
            Notification.title == title,
            Notification.notification_type == "status_update",
        )
        .first()
    )
    if existing:
        return

    notification = Notification(
        user_id=user.id,
        job_id=job.id,
        title=title,
        description=description,
        notification_type="status_update",
        company=job.company,
        link=link,
        metadata={"status": current_status},
    )
    db.add(notification)


def owned(job, user):
    return job is not None and job.user_id == user.id


def normalize_url(value):
    if not value:
        return ""
    return str(value).strip().rstrip("/").lower()


class JobUpdate(BaseModel):
    company: str | None = None
    role: str | None = None
    location: str | None = None
    job_url: str | None = None
    source: str | None = None
    status: str | None = None
    applied_date: date | None = None
    salary: str | None = None
    notes: str | None = None
    required_skills: list | None = None
    resume_version_id: int | None = None


@router.get("", response_model=list[JobOut])
def list_jobs(
    search: str = "",
    status: str = "",
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(JobApplication).filter(JobApplication.user_id == user.id)

    if search:
        like = f"%{search}%"
        q = q.filter(
            or_(
                JobApplication.company.ilike(like),
                JobApplication.role.ilike(like),
                JobApplication.location.ilike(like),
            )
        )

    if status:
        normalized_status = normalize_status(status)
        if not normalized_status or normalized_status not in STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        q = q.filter(JobApplication.status == normalized_status)

    return q.order_by(JobApplication.applied_date.desc(), JobApplication.id.desc()).all()


@router.get("/statuses")
def statuses():
    return STATUSES


@router.get("/{job_id}", response_model=JobOut)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    job = db.get(JobApplication, job_id)
    if not owned(job, user):
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("", response_model=JobOut, status_code=201)
def create_or_update_job(
    data: JobCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    payload = data.model_dump()
    requested_status = normalize_status(payload.get("status")) or "Applying"

    if requested_status not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    job_url = normalize_url(payload.get("job_url"))
    existing = None

    # Search Job Market listings have a stable URL, so use that as the
    # primary identity. This prevents repeated clicks from creating rows.
    if job_url:
        candidates = (
            db.query(JobApplication)
            .filter(JobApplication.user_id == user.id)
            .all()
        )
        existing = next(
            (item for item in candidates if normalize_url(item.job_url) == job_url),
            None,
        )

    if existing:
        previous_status = existing.status
        for field, value in payload.items():
            if field == "status":
                continue
            if value is not None:
                setattr(existing, field, value)
        existing.status = requested_status
        db.commit()
        create_status_notification(db, user, existing, previous_status)
        db.commit()
        db.refresh(existing)
        return existing

    payload["status"] = requested_status
    job = JobApplication(user_id=user.id, **payload)
    db.add(job)
    db.commit()
    db.refresh(job)
    create_status_notification(db, user, job, None)
    db.commit()
    return job


@router.put("/{job_id}", response_model=JobOut)
def update_job(
    job_id: int,
    data: JobUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    job = db.get(JobApplication, job_id)
    if not owned(job, user):
        raise HTTPException(status_code=404, detail="Job not found")

    updates = data.model_dump(exclude_unset=True)
    previous_status = job.status

    if "status" in updates:
        normalized_status = normalize_status(updates["status"])
        if not normalized_status or normalized_status not in STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        updates["status"] = normalized_status

    for field, value in updates.items():
        setattr(job, field, value)

    db.commit()
    create_status_notification(db, user, job, previous_status)
    db.commit()
    db.refresh(job)
    return job


@router.delete("/{job_id}")
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    job = db.get(JobApplication, job_id)
    if not owned(job, user):
        raise HTTPException(status_code=404, detail="Job not found")

    db.delete(job)
    db.commit()
    return {"message": "Application deleted", "job_id": job_id}

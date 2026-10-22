from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import JobApplication, Interview


router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("")
def dashboard(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    jobs = (
        db.query(JobApplication)
        .filter(JobApplication.user_id == user.id)
        .all()
    )

    interviews = (
        db.query(Interview)
        .join(JobApplication, Interview.job_id == JobApplication.id)
        .filter(JobApplication.user_id == user.id)
        .all()
    )

    # Keep dashboard metrics derived from the same records shown in the
    # Applications and Interviews pages.
    status_names = [
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

    status_breakdown = [
        {
            "status": status,
            "count": sum(
                1 for job in jobs
                if str(job.status or "").strip().lower() == status.lower()
            ),
        }
        for status in status_names
    ]

    submitted_jobs = [
        job for job in jobs
        if str(job.status or "").strip().lower()
        not in {"wishlist", "withdrawn"}
    ]

    responded_jobs = [
        job for job in submitted_jobs
        if str(job.status or "").strip().lower()
        not in {"applied"}
    ]

    submitted_count = len(submitted_jobs)
    response_rate = (
        round((len(responded_jobs) / submitted_count) * 100, 1)
        if submitted_count
        else 0
    )

    offers = sum(
        1 for job in jobs
        if str(job.status or "").strip().lower() == "offer"
    )

    # Interview count is the number of actual scheduled Interview rows,
    # not the number of applications whose status happens to be Interview.
    applications_with_interviews = len(interviews)

    # Preserve the frontend's expected five-week trend shape.
    today = datetime.now()
    monthly_applications = []

    for index in range(5):
        end = today - timedelta(days=(4 - index) * 7)
        start = end - timedelta(days=6)

        count = 0
        for job in jobs:
            if not job.applied_date:
                continue

            value = job.applied_date
            if isinstance(value, datetime):
                date_value = value
            else:
                try:
                    date_value = datetime.combine(value, datetime.min.time())
                except (TypeError, ValueError):
                    continue

            if start.date() <= date_value.date() <= end.date():
                count += 1

        monthly_applications.append(
            {
                "month": end.strftime("%Y-%m-%d"),
                "count": count,
            }
        )

    return {
        "submitted_applications": submitted_count,
        "applications_with_interviews": applications_with_interviews,
        "offers": offers,
        "response_rate": response_rate,
        "status_breakdown": status_breakdown,
        "monthly_applications": monthly_applications,
    }

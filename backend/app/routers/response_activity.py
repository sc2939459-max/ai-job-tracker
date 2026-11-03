from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import ApplicationStatusHistory, JobApplication, RecruiterMessage

router = APIRouter(prefix="/response-activity", tags=["Response Activity"])

NOT_SUBMITTED_STATUSES = {"wishlist", "applying"}
UNDER_REVIEW_STATUSES = {"in review", "under review", "screening"}
RESPONSE_TYPE_OPTIONS = (
    "Application Received",
    "Recruiter Response",
    "In Review",
    "Shortlisted",
    "Interview Invitation",
    "Assessment Invitation",
    "Rejected",
    "Offer",
    "Withdrawn",
    "Awaiting Response",
)


def _normalized(value: str | None) -> str:
    return " ".join((value or "").strip().lower().split())


def _date_value(value: date | datetime | None) -> date | None:
    return value.date() if isinstance(value, datetime) else value


def _event_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _email_response_type(message: RecruiterMessage) -> str | None:
    status = _normalized(message.application_status)
    if status in {"applied", "application received"}:
        return "Application Received"
    if status in {"in review", "under review", "screening"}:
        return "In Review"
    if status == "shortlisted":
        return "Shortlisted"
    if status in {"interview", "interview scheduled"}:
        return "Interview Invitation"
    if status == "assessment":
        return "Assessment Invitation"
    if status in {"rejected", "regret"}:
        return "Rejected"
    if status in {"offer", "offer received"}:
        return "Offer"
    if status == "selected":
        return "Recruiter Response"
    if status == "withdrawn":
        return "Withdrawn"

    text = _normalized(f"{message.subject} {message.body}")
    if any(
        phrase in text
        for phrase in (
            "application received",
            "thank you for applying",
            "we received your application",
            "application has been submitted",
            "your application has been received",
            "we have received your application",
            "application successfully submitted",
            "submission confirmed",
            "we will review your application",
            "we'll review your application",
            "we will be reviewing your application",
        )
    ):
        return "Application Received"
    if "interview" in text and any(
        phrase in text for phrase in ("invite", "invitation", "schedule", "scheduled")
    ):
        return "Interview Invitation"
    if any(
        phrase in text
        for phrase in ("assessment", "coding challenge", "technical test")
    ):
        return "Assessment Invitation"
    if any(
        phrase in text
        for phrase in (
            "offer of employment",
            "job offer",
            "offer letter",
            "pleased to offer",
        )
    ):
        return "Offer"
    if any(
        phrase in text
        for phrase in (
            "regret to inform",
            "not moving forward",
            "another candidate",
            "not selected",
            "application was unsuccessful",
            "no longer under consideration",
        )
    ):
        return "Rejected"
    if any(
        phrase in text
        for phrase in ("under review", "reviewing your application")
    ):
        return "In Review"
    if "shortlisted" in text or "selected for the next round" in text:
        return "Shortlisted"
    if any(
        phrase in text
        for phrase in ("withdrawn your application", "application has been withdrawn")
    ):
        return "Withdrawn"

    if message.category == "needs_review":
        return None
    return "Recruiter Response"


def _status_response_type(status: str | None) -> str | None:
    normalized = _normalized(status)
    if normalized == "application received":
        return "Application Received"
    if normalized in UNDER_REVIEW_STATUSES:
        return "In Review"
    if normalized == "shortlisted":
        return "Shortlisted"
    if normalized in {"interview", "interview scheduled"}:
        return "Interview Invitation"
    if normalized == "assessment":
        return "Assessment Invitation"
    if normalized == "rejected":
        return "Rejected"
    if normalized in {"offer", "offer received"}:
        return "Offer"
    if normalized == "selected":
        return "Recruiter Response"
    if normalized == "withdrawn":
        return "Withdrawn"
    return None


def _meaningful_response(response_type: str) -> bool:
    return response_type not in {"Application Received", "Withdrawn"}


def _within_date_range(
    value: date | datetime | None,
    start_date: date | None,
    end_date: date | None,
) -> bool:
    if start_date is None and end_date is None:
        return True
    day = _date_value(value)
    if day is None:
        return False
    return (start_date is None or day >= start_date) and (
        end_date is None or day <= end_date
    )


def build_response_activity(
    applications: list[JobApplication],
    history: list[ApplicationStatusHistory],
    messages: list[RecruiterMessage],
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    company: str | None = None,
    status: str | None = None,
    response_type: str | None = None,
) -> dict:
    submitted = [
        application
        for application in applications
        if _normalized(application.status) not in NOT_SUBMITTED_STATUSES
    ]
    app_by_id = {application.id: application for application in submitted}
    events_by_app: dict[int, list[dict]] = {application.id: [] for application in submitted}
    email_event_by_id: dict[tuple[int, str], dict] = {}

    for message in messages:
        if message.job_id not in app_by_id:
            continue
        kind = _email_response_type(message)
        if not kind:
            continue
        email_id = (
            (message.external_url or "").removeprefix("gmail:")
            if message.external_url
            else f"message:{message.id}"
        )
        key = (message.job_id, email_id)
        if key in email_event_by_id:
            continue
        event = {
            "type": kind,
            "date": _event_datetime(message.received_at),
            "subject": message.subject,
            "source": "gmail",
            "emailId": email_id,
        }
        email_event_by_id[key] = event
        events_by_app[message.job_id].append(event)

    for item in history:
        if item.job_id not in app_by_id:
            continue
        kind = _status_response_type(item.new_status)
        if not kind:
            continue
        if item.source_email_id:
            key = (item.job_id, item.source_email_id)
            existing = email_event_by_id.get(key)
            if existing:
                if existing["type"] == "Recruiter Response":
                    existing["type"] = kind
                if existing["date"] is None:
                    existing["date"] = _event_datetime(item.created_at)
                continue
        events_by_app[item.job_id].append(
            {
                "type": kind,
                "date": _event_datetime(item.created_at),
                "subject": None,
                "source": item.source,
                "emailId": item.source_email_id,
            }
        )

    for application in submitted:
        current_type = _status_response_type(application.status)
        if current_type and not events_by_app[application.id]:
            events_by_app[application.id].append(
                {
                    "type": current_type,
                    "date": None,
                    "subject": None,
                    "source": "application_status",
                    "emailId": None,
                }
            )

    filtered_apps = []
    for application in submitted:
        if not _within_date_range(application.applied_date, start_date, end_date):
            continue
        if company and _normalized(company) not in _normalized(application.company):
            continue
        if status and _normalized(status) != _normalized(application.status):
            continue
        app_events = events_by_app[application.id]
        has_meaningful_response = any(
            _meaningful_response(event["type"]) for event in app_events
        )
        if response_type:
            normalized_response_filter = _normalized(response_type)
            if normalized_response_filter == "awaiting response":
                if has_meaningful_response or _normalized(application.status) == "withdrawn":
                    continue
            elif normalized_response_filter == "recruiter response":
                if not has_meaningful_response:
                    continue
            elif not any(
                _normalized(event["type"]) == normalized_response_filter
                for event in app_events
            ):
                continue
        filtered_apps.append(application)

    filtered_ids = {application.id for application in filtered_apps}
    filtered_events = {
        app_id: events_by_app[app_id] for app_id in filtered_ids
    }

    def matching_ids(kind: str) -> set[int]:
        return {
            app_id
            for app_id, events in filtered_events.items()
            if any(event["type"] == kind for event in events)
        }

    meaningful_ids = {
        app_id
        for app_id, events in filtered_events.items()
        if any(_meaningful_response(event["type"]) for event in events)
    }
    awaiting_ids = {
        application.id
        for application in filtered_apps
        if application.id not in meaningful_ids
        and _normalized(application.status) != "withdrawn"
    }
    confirmation_ids = matching_ids("Application Received")
    interview_ids = matching_ids("Interview Invitation")
    assessment_ids = matching_ids("Assessment Invitation")
    rejection_ids = matching_ids("Rejected")
    offer_ids = matching_ids("Offer")
    withdrawn_ids = matching_ids("Withdrawn")
    under_review_ids = {
        application.id
        for application in filtered_apps
        if _normalized(application.status) in UNDER_REVIEW_STATUSES
    }
    shortlisted_ids = matching_ids("Shortlisted")
    shortlisted_ids.update(
        application.id
        for application in filtered_apps
        if _normalized(application.status) == "shortlisted"
    )

    total = len(filtered_apps)
    response_rate = round(100 * len(meaningful_ids) / total, 1) if total else 0
    interview_rate = round(100 * len(interview_ids) / total, 1) if total else 0
    offer_rate = round(100 * len(offer_ids) / total, 1) if total else 0
    rejection_rate = round(100 * len(rejection_ids) / total, 1) if total else 0

    current_status_counts: dict[str, int] = {}
    for application in filtered_apps:
        label = application.status or "Unknown"
        current_status_counts[label] = current_status_counts.get(label, 0) + 1
    status_distribution = [
        {"status": key, "count": value}
        for key, value in sorted(
            current_status_counts.items(), key=lambda entry: entry[0].lower()
        )
    ]

    distribution_types = (
        "Application Received",
        "Recruiter Response",
        "In Review",
        "Shortlisted",
        "Interview Invitation",
        "Assessment Invitation",
        "Rejected",
        "Offer",
        "Withdrawn",
    )
    response_distribution = []
    for kind in distribution_types:
        event_count = sum(
            1
            for events in filtered_events.values()
            for event in events
            if event["type"] == kind and event["source"] != "application_status"
        )
        unique_count = sum(
            1
            for events in filtered_events.values()
            if any(event["type"] == kind for event in events)
        )
        response_distribution.append(
            {"type": kind, "events": event_count, "applications": unique_count}
        )

    monthly: dict[str, dict[str, int]] = {}

    def month_bucket(value: date | datetime | None) -> dict[str, int] | None:
        day = _date_value(value)
        if not day:
            return None
        if start_date and day < start_date:
            return None
        if end_date and day > end_date:
            return None
        month = day.strftime("%Y-%m")
        return monthly.setdefault(month, {"applications": 0, "responses": 0})

    for application in filtered_apps:
        bucket = month_bucket(application.applied_date)
        if bucket is not None:
            bucket["applications"] += 1
        for event in filtered_events[application.id]:
            if not _meaningful_response(event["type"]):
                continue
            bucket = month_bucket(event["date"])
            if bucket is not None:
                bucket["responses"] += 1

    recent = []
    for application in filtered_apps:
        events = filtered_events[application.id]
        dated_events = [event for event in events if event["date"] is not None]
        latest = max(
            dated_events,
            key=lambda event: event["date"],
            default=None,
        )
        latest_email = max(
            (event for event in dated_events if event["subject"]),
            key=lambda event: event["date"],
            default=None,
        )
        fallback = latest or (events[-1] if events else None)
        recent.append(
            {
                "applicationId": application.id,
                "company": application.company,
                "role": application.role,
                "applicationDate": application.applied_date,
                "latestResponseDate": latest["date"] if latest else None,
                "status": application.status,
                "responseType": fallback["type"] if fallback else "Awaiting Response",
                "emailSubject": latest_email["subject"] if latest_email else None,
                "events": [
                    {
                        "type": event["type"],
                        "date": event["date"],
                        "subject": event["subject"],
                        "source": event["source"],
                    }
                    for event in sorted(
                        events,
                        key=lambda event: event["date"] or datetime.min,
                        reverse=True,
                    )
                ],
            }
        )
    recent.sort(
        key=lambda item: (
            item["latestResponseDate"] or datetime.min,
            item["applicationDate"] or date.min,
        ),
        reverse=True,
    )

    return {
        "metrics": {
            "totalSubmitted": total,
            "awaitingResponse": len(awaiting_ids),
            "applicationReceived": len(confirmation_ids),
            "recruiterResponses": len(meaningful_ids),
            "underReview": len(under_review_ids),
            "shortlisted": len(shortlisted_ids),
            "interviewInvitations": len(interview_ids),
            "assessmentInvitations": len(assessment_ids),
            "rejected": len(rejection_ids),
            "offers": len(offer_ids),
            "withdrawn": len(withdrawn_ids),
            "responseRate": response_rate,
            "interviewConversionRate": interview_rate,
            "offerConversionRate": offer_rate,
            "rejectionRate": rejection_rate,
        },
        "statusDistribution": status_distribution,
        "monthlyTrends": [
            {"month": month, **counts}
            for month, counts in sorted(monthly.items())
        ],
        "responseDistribution": response_distribution,
        "recentResponses": recent,
        "filterOptions": {
            "companies": sorted({job.company for job in submitted if job.company}),
            "statuses": sorted({job.status for job in submitted if job.status}),
            "responseTypes": list(RESPONSE_TYPE_OPTIONS),
        },
    }


@router.get("")
def response_activity(
    start_date: date | None = Query(default=None, alias="date_from"),
    end_date: date | None = Query(default=None, alias="date_to"),
    company: str | None = Query(default=None, min_length=1),
    status: str | None = Query(default=None, min_length=1),
    response_type: str | None = Query(default=None, alias="response_type", min_length=1),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=400,
            detail="date_from must be on or before date_to",
        )
    applications = (
        db.query(JobApplication)
        .filter(JobApplication.user_id == user.id)
        .all()
    )
    app_ids = [application.id for application in applications]
    if app_ids:
        history = (
            db.query(ApplicationStatusHistory)
            .filter(
                ApplicationStatusHistory.user_id == user.id,
                ApplicationStatusHistory.job_id.in_(app_ids),
            )
            .all()
        )
        messages = (
            db.query(RecruiterMessage)
            .filter(
                RecruiterMessage.user_id == user.id,
                RecruiterMessage.job_id.in_(app_ids),
                RecruiterMessage.source == "gmail",
            )
            .all()
        )
    else:
        history = []
        messages = []
    return build_response_activity(
        applications,
        history,
        messages,
        start_date=start_date,
        end_date=end_date,
        company=company,
        status=status,
        response_type=response_type,
    )

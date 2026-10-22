from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Notification

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    notification_type: str = "status_update"
    company: str | None = None
    job_id: int | None = None
    message_id: int | None = None
    link: str | None = None
    metadata: dict | None = None


@router.get("")
def list_notifications(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .all()
    )
    return [
        {
            "id": item.id,
            "user_id": item.user_id,
            "job_id": item.job_id,
            "message_id": item.message_id,
            "title": item.title,
            "description": item.description,
            "notification_type": item.notification_type,
            "company": item.company,
            "link": item.link,
            "is_read": item.is_read,
            "metadata": item.details,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
        for item in notifications
    ]


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.is_read.is_(False))
        .count()
    )
    return {"count": count}


@router.post("")
def create_notification(
    payload: NotificationCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    notification = Notification(
        user_id=user.id,
        job_id=payload.job_id,
        message_id=payload.message_id,
        title=payload.title,
        description=payload.description,
        notification_type=payload.notification_type,
        company=payload.company,
        link=payload.link,
        details=payload.metadata,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return {
        "id": notification.id,
        "user_id": notification.user_id,
        "job_id": notification.job_id,
        "message_id": notification.message_id,
        "title": notification.title,
        "description": notification.description,
        "notification_type": notification.notification_type,
        "company": notification.company,
        "link": notification.link,
        "is_read": notification.is_read,
        "metadata": notification.details,
        "created_at": notification.created_at,
        "updated_at": notification.updated_at,
    }


@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user.id)
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    db.commit()
    return {"message": "Notification marked as read", "notification_id": notification_id, "metadata": notification.details}


@router.post("/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.is_read.is_(False),
    ).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}

from datetime import datetime, date

from sqlalchemy import (
    String,
    Text,
    DateTime,
    Date,
    Integer,
    ForeignKey,
    JSON,
    Float,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)

from .database import Base


# ============================================================
# USER
# ============================================================

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    name: Mapped[str] = mapped_column(
        String(100),
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    # --------------------------------------------------------
    # Relationships
    # --------------------------------------------------------

    jobs = relationship(
        "JobApplication",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    resumes = relationship(
        "ResumeVersion",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    recruiter_messages = relationship(
        "RecruiterMessage",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    notifications = relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan",
    )


# ============================================================
# COMPANY / ATS INTEGRATION
# ============================================================

class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    name: Mapped[str] = mapped_column(
        String(150),
        unique=True,
        index=True,
    )

    email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )

    api_key_hash: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    # --------------------------------------------------------
    # Relationships
    # --------------------------------------------------------

    applications = relationship(
        "JobApplication",
        back_populates="company_integration",
    )


# ============================================================
# JOB APPLICATION
# ============================================================

class JobApplication(Base):
    __tablename__ = "job_applications"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    # --------------------------------------------------------
    # USER
    # --------------------------------------------------------

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        index=True,
    )

    # --------------------------------------------------------
    # COMPANY / ATS INTEGRATION
    # --------------------------------------------------------

    company_integration_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    external_application_id: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
        index=True,
    )

    integration_source: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    # --------------------------------------------------------
    # APPLICATION INFORMATION
    # --------------------------------------------------------

    company: Mapped[str] = mapped_column(
        String(150),
        index=True,
    )

    role: Mapped[str] = mapped_column(
        String(150),
        index=True,
    )

    location: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    job_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    source: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(40),
        default="Applied",
        index=True,
    )

    applied_date: Mapped[date] = mapped_column(
        Date,
        default=date.today,
    )

    salary: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    required_skills: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
    )

    # --------------------------------------------------------
    # RESUME
    # --------------------------------------------------------

    resume_version_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "resume_versions.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    # --------------------------------------------------------
    # TIMESTAMPS
    # --------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    # --------------------------------------------------------
    # RELATIONSHIPS
    # --------------------------------------------------------

    user = relationship(
        "User",
        back_populates="jobs",
    )

    company_integration = relationship(
        "Company",
        back_populates="applications",
        foreign_keys=[company_integration_id],
    )

    interviews = relationship(
        "Interview",
        back_populates="job",
        cascade="all, delete-orphan",
    )

    resume_version = relationship(
        "ResumeVersion",
        foreign_keys=[resume_version_id],
    )

    recruiter_messages = relationship(
        "RecruiterMessage",
        back_populates="job",
        cascade="all, delete-orphan",
    )

    notifications = relationship(
        "Notification",
        back_populates="job",
        cascade="all, delete-orphan",
    )


# ============================================================
# INTERVIEW
# ============================================================

class Interview(Base):
    __tablename__ = "interviews"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    job_id: Mapped[int] = mapped_column(
        ForeignKey(
            "job_applications.id",
            ondelete="CASCADE",
        ),
        index=True,
    )

    round_name: Mapped[str] = mapped_column(
        String(100),
    )

    interview_date: Mapped[datetime] = mapped_column(
        DateTime,
    )

    interviewer: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    type: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    result: Mapped[str] = mapped_column(
        String(40),
        default="Scheduled",
    )

    # --------------------------------------------------------
    # Relationship
    # --------------------------------------------------------

    job = relationship(
        "JobApplication",
        back_populates="interviews",
    )


# ============================================================
# GOOGLE MAILBOX
# ============================================================

class GoogleMailbox(Base):
    __tablename__ = "google_mailboxes"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        unique=True,
        index=True,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        index=True,
    )

    refresh_token: Mapped[str] = mapped_column(
        Text,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    user = relationship(
        "User",
    )


# ============================================================
# RESUME VERSION
# ============================================================

class ResumeVersion(Base):
    __tablename__ = "resume_versions"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(150),
    )

    file_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    file_path: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    skills: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    # --------------------------------------------------------
    # Relationship
    # --------------------------------------------------------

    user = relationship(
        "User",
        back_populates="resumes",
    )


# ============================================================
# RESUME ANALYSIS
# ============================================================

class ResumeAnalysis(Base):
    __tablename__ = "resume_analyses"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    resume_id: Mapped[int] = mapped_column(
        ForeignKey(
            "resume_versions.id",
            ondelete="CASCADE",
        ),
        unique=True,
        index=True,
    )

    extracted_text: Mapped[str] = mapped_column(
        Text,
    )

    detected_skills: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
    )

    summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    resume = relationship(
        "ResumeVersion",
    )


# ============================================================
# JOB DESCRIPTION
# ============================================================

class JobDescription(Base):
    __tablename__ = "job_descriptions"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        index=True,
    )

    job_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "job_applications.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    title: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    raw_text: Mapped[str] = mapped_column(
        Text,
    )

    detected_skills: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    user = relationship(
        "User",
    )

    job = relationship(
        "JobApplication",
    )


# ============================================================
# MATCH ANALYSIS
# ============================================================

class MatchAnalysis(Base):
    __tablename__ = "match_analyses"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        index=True,
    )

    resume_id: Mapped[int] = mapped_column(
        ForeignKey(
            "resume_versions.id",
            ondelete="CASCADE",
        ),
        index=True,
    )

    job_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "job_applications.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    job_description_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "job_descriptions.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    score: Mapped[float] = mapped_column(
        Float,
    )

    matched_skills: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
    )

    missing_skills: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
    )

    keyword_matches: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
    )

    recommendations: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    user = relationship(
        "User",
    )

    resume = relationship(
        "ResumeVersion",
    )

    job = relationship(
        "JobApplication",
    )

    job_description = relationship(
        "JobDescription",
    )


# ============================================================
# RECRUITER MESSAGES
# ============================================================

class RecruiterMessage(Base):
    __tablename__ = "recruiter_messages"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        index=True,
    )

    job_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "job_applications.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    company: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
        index=True,
    )

    role: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    sender_name: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    sender_email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    subject: Mapped[str] = mapped_column(
        String(250),
        default="Recruiter update",
    )

    body: Mapped[str] = mapped_column(
        Text,
        default="",
    )

    category: Mapped[str] = mapped_column(
        String(80),
        default="General Recruiter Message",
    )

    application_status: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
    )

    source: Mapped[str] = mapped_column(
        String(40),
        default="portal",
    )

    external_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    received_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    is_read: Mapped[bool] = mapped_column(
        default=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    user = relationship(
        "User",
        back_populates="recruiter_messages",
    )

    job = relationship(
        "JobApplication",
        back_populates="recruiter_messages",
    )

    notifications = relationship(
        "Notification",
        back_populates="message",
        cascade="all, delete-orphan",
    )


# ============================================================
# NOTIFICATIONS
# ============================================================

class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        index=True,
    )

    job_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "job_applications.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    message_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "recruiter_messages.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(200),
    )

    description: Mapped[str] = mapped_column(
        Text,
        default="",
    )

    notification_type: Mapped[str] = mapped_column(
        String(80),
        default="status_update",
    )

    company: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    link: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    is_read: Mapped[bool] = mapped_column(
        default=False,
    )

    details: Mapped[dict | None] = mapped_column(
        "metadata",
        JSON,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    user = relationship(
        "User",
        back_populates="notifications",
    )

    job = relationship(
        "JobApplication",
        back_populates="notifications",
    )

    message = relationship(
        "RecruiterMessage",
        back_populates="notifications",
    )
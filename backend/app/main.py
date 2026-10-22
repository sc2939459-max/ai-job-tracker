import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine

from .routers import (
    auth,
    jobs,
    interviews,
    resumes,
    skills,
    dashboard,
    ai,
    job_market,
    recruiter_messages,
    notifications,
)

from .routers.company_sync import router as company_router


# ============================================================
# DATABASE
# ============================================================

Base.metadata.create_all(bind=engine)


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="AI Job Application Tracker",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)


# ============================================================
# CORS
# ============================================================

origins = [
    x.strip()
    for x in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173",
    ).split(",")
    if x.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# API ROUTERS
# ============================================================

app.include_router(
    auth.router,
    prefix="/api",
)

app.include_router(
    jobs.router,
    prefix="/api",
)

app.include_router(
    interviews.router,
    prefix="/api",
)

app.include_router(
    resumes.router,
    prefix="/api",
)

app.include_router(
    skills.router,
    prefix="/api",
)

app.include_router(
    dashboard.router,
    prefix="/api",
)

app.include_router(
    ai.router,
    prefix="/api",
)

app.include_router(
    job_market.router,
    prefix="/api",
)

app.include_router(
    recruiter_messages.router,
    prefix="/api",
)

app.include_router(
    notifications.router,
    prefix="/api",
)

# ============================================================
# COMPANY / ATS INTEGRATION
# ============================================================

app.include_router(
    company_router,
    prefix="/api",
)


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():
    return {
        "message": "AI Job Application Tracker API",
        "docs": "/docs",
    }


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health():
    return {
        "status": "ok",
    }
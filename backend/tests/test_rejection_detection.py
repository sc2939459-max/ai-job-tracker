from types import SimpleNamespace

from app.routers.recruiter_messages import (
    _classify_application_outcome,
    _is_recruiter_message,
    _match_application,
)


def test_rejection_phrases_are_detected():
    assert _classify_application_outcome(
        "Update on your application", "Unfortunately, we will not be moving forward with your application."
    ) == "Rejected"
    assert _classify_application_outcome(
        "Application outcome", "We regret to inform you that another candidate was selected."
    ) == "Rejected"


def test_neutral_application_confirmation_is_not_rejection():
    assert _classify_application_outcome(
        "Application received", "Thank you for applying. We will review your application."
    ) is None


def test_unrelated_email_is_not_a_recruiter_message():
    assert not _is_recruiter_message("Weekend newsletter", "news@example.com", "Rejected movies of the year")


def test_rejection_matches_company_and_role_unambiguously():
    app = SimpleNamespace(id=7, company="Acme Technologies", role="Python Developer", status="Applied", applied_date=None)
    email = {
        "subject": "Python Developer application update",
        "message": "Acme Technologies has decided not to proceed with your application for Python Developer.",
        "sender": "careers@acme.com",
    }
    assert _match_application(email, [app]) is app


def test_ambiguous_same_company_applications_are_not_guessed():
    app1 = SimpleNamespace(id=7, company="Acme Technologies", role="Python Developer", status="Applied", applied_date=None)
    app2 = SimpleNamespace(id=8, company="Acme Technologies", role="Data Analyst", status="Applied", applied_date=None)
    email = {
        "subject": "Application update",
        "message": "Acme Technologies has decided not to proceed with your application.",
        "sender": "careers@acme.com",
    }
    assert _match_application(email, [app1, app2]) is None

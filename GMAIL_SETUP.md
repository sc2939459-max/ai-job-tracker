# Gmail recruiter-message integration

The Recruiter Messages page uses Gmail read-only access. It does not send, delete, or modify email.

## 1. Enable Gmail API

In Google Cloud Console:

1. Create/select a project.
2. Enable **Gmail API**.
3. Configure the OAuth consent screen.
4. Create an **OAuth 2.0 Web application** client.
5. Add this authorized redirect URI for local development:

```text
http://localhost:8000/api/recruiter-messages/google/callback
```

## 2. Backend environment

Copy the values into `backend/.env` (never commit this file):

```text
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8000/api/recruiter-messages/google/callback
```

The current implementation stores the Gmail refresh token so the backend can sync without asking the user to authorize every time. For production, encrypt that token at rest and keep the encryption key in a secret manager.

## 3. Start the app

Start the FastAPI backend and Vite frontend as usual. Open **Recruiter Messages → Connect Gmail**, complete Google consent, and return to the Recruiter Messages page.

The backend searches recent Gmail messages for job-related signals such as interview, recruiter, hiring, application, assessment, candidate, offer, and job opportunity. It stores processed Gmail message IDs and message content so repeated syncs can avoid fetching the same message details again. Message matching uses company and role text, sender information, and explicitly labeled job/application reference IDs. SmartRecruiters and other ATS senders are not treated as the hiring company by default.

Clear detected outcomes update the matching user's application: Applied, In Review, Shortlisted, Assessment, Interview, Offer, Rejected, or Withdrawn. The backend is the source of truth for classification and status transitions. An email that does not uniquely match an application is retained in Recruiter Messages for manual review and does not change application status. Older or lower-stage updates are not allowed to roll back an advanced application status.

The Applications list and application detail page check for new mail automatically while open, with a short server-side cooldown. Manual sync remains available from Recruiter Messages or through `POST /api/recruiter-messages/sync`.

Vercel runs `GET /api/recruiter-messages/cron-sync` once daily at 10:00 UTC, which is compatible with the Hobby plan's daily cron limit. Set a strong `CRON_SECRET` in the Vercel project environment so scheduled requests are authorized; keep that secret private. This background schedule continues checking connected mailboxes when the user is not in the app. Use **Check for updates** in Recruiter Messages for an immediate manual sync; the scheduled frequency does not limit manual synchronization.

## 4. Important limitation

The tracker does not claim that every email is a recruiter message. Filtering is keyword-based and can produce false positives or miss unusual recruiter emails. Company/role matching is intentionally conservative: ambiguous messages require manual review rather than automatically changing an application. Application sites do not provide a universal status feed, so changes visible only in an external portal cannot be detected automatically. The Gmail permission is read-only. Verify live synchronization only after configuring Google OAuth, a reachable backend/database, a connected Gmail mailbox, and `CRON_SECRET` for scheduled checks.

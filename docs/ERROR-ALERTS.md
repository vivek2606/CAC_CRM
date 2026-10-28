# Error alerts (Sentry)

When a page, a form or the server fails for anyone, the error is sent to
Sentry, which emails you what broke, on which page, and who hit it (name
and role). Free plan: errors only, no performance tracing or session
recording. Nothing is sent until the DSN below is set.

## Setup (about 10 minutes)

1. Sign up at https://sentry.io (free "Developer" plan) and create a project:
   platform **Next.js**, name e.g. `cac-crm`.
2. Copy the project's **DSN** (Settings -> Client Keys (DSN)) - looks like
   `https://abc123@o123.ingest.sentry.io/456`.
3. In Vercel: *Project -> Settings -> Environment Variables*, add for
   Production (and Preview if you like):
   - `NEXT_PUBLIC_SENTRY_DSN` = the DSN
   - `SENTRY_DSN` = the same DSN
4. Redeploy (Deployments -> ... -> Redeploy).
5. In the CRM: *Company Details -> Send a test error*. Within a few minutes
   Sentry emails you, and the error shows under *Issues*.

## Emails

Sentry's default alert emails you the first time each new kind of error
happens. To be told about every occurrence too: *Alerts -> Create Alert ->
Issues -> "When an issue is seen more than 1 time..."*.

## Optional: readable stack traces

Add `SENTRY_AUTH_TOKEN` (Sentry -> Settings -> Auth Tokens), `SENTRY_ORG`
and `SENTRY_PROJECT` in Vercel too; builds then upload source maps, so the
error shows the exact line of the CRM's code instead of compiled code.

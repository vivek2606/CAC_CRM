// Error alerts (Sentry): every error on a page, a form or the server is
// sent to Sentry, which emails the Head with where it broke and who hit it.
// Off until the DSN is set in Vercel (see docs/ERROR-ALERTS.md). Errors
// only - no performance tracing or session recording (stays in the free
// plan).
export const sentryOptions = (dsn: string | undefined) => ({
  dsn,
  enabled: !!dsn,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});

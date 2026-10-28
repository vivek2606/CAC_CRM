"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// The last resort when the whole app fails (even its layout): reported to
// the error alerts, with a plain page to reload from.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, background: "#f8fafc", color: "#0f172a" }}>
        <h1 style={{ fontSize: 18 }}>Something went wrong</h1>
        <p style={{ fontSize: 14 }}>The Head of Sales has been notified. Reload the page to carry on - nothing you saved was lost.</p>
        {error.digest && <p style={{ fontSize: 12, color: "#64748b" }}>Reference: {error.digest}</p>}
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 12, padding: "8px 14px" }}>
          Reload
        </button>
      </body>
    </html>
  );
}

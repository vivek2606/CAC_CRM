"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";

// Shown instead of a blank error page when something on a page fails.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    // Error alerts: the Head is told (see src/lib/sentry-options.ts).
    Sentry.captureException(error);
  }, [error]);
  // In production the server's message is hidden (only a digest is sent);
  // show it when it's one of ours, otherwise a plain explanation.
  const own = error.message && !error.message.startsWith("An error occurred in the Server Components render");
  return (
    <div className="p-6">
      <div className="max-w-xl rounded-xl border border-red-200 bg-red-50 p-5">
        <h1 className="text-base font-semibold text-red-900">Something went wrong</h1>
        <p className="mt-1 text-sm text-red-800">
          {own ? error.message : "This page couldn't be completed. Nothing was lost - try again. The Head of Sales has been notified; if it keeps happening, tell them what you were doing."}
        </p>
        {error.digest && <p className="mt-2 text-xs text-red-700/70">Reference: {error.digest}</p>}
        <div className="mt-4 flex gap-3">
          <button type="button" onClick={reset} className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-500">
            Try again
          </button>
          <Link href="/" className="rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-800 hover:bg-red-100">
            Go to the dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

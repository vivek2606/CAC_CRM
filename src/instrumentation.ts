import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry-options";

// Server-side error alerts (see src/lib/sentry-options.ts).
export function register() {
  Sentry.init(sentryOptions(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN));
}

// Every error while rendering a page, in a server action or a route.
export const onRequestError = Sentry.captureRequestError;

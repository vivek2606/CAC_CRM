"use client";

import { AppWindow } from "lucide-react";

// Opens the current page in another window of the app. In the installed
// app (PWA) on a computer this is a second app window, so two sections can
// be worked on side by side. Shift+click on any link does the same.
export function NewWindowButton() {
  return (
    <button
      type="button"
      onClick={() => window.open(window.location.href, "_blank")}
      title="Open this page in a new window (or Shift+click any link)"
      aria-label="Open in new window"
      className="hidden lg:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
    >
      <AppWindow className="h-4 w-4" />
      New window
    </button>
  );
}

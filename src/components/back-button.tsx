"use client";

import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft, ChevronLeft } from "lucide-react";

// Two looks, one behavior: pass `label` for an explicit text link (e.g. "←
// Back to Pipeline" pointing somewhere specific), or omit it for the plain
// chevron icon PageHeader renders on every page - the PWA runs standalone
// with no browser chrome, so this is the only "go back" a user has. Falls
// back to `fallbackHref` when there's no meaningful history to go back to
// (e.g. the PWA was opened straight into a deep link).
export function BackButton({ fallbackHref = "/", label }: { fallbackHref?: string; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  // The icon-only variant is auto-rendered by PageHeader everywhere,
  // including the Dashboard - hide it there since there's nothing "back"
  // of the app's root. A caller that explicitly asks for a labeled link
  // still gets it, even on "/", since that's a deliberate placement.
  if (!label && pathname === "/") return null;

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  if (label) {
    return (
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Go back"
      className="shrink-0 -ml-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  );
}

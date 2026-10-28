"use client";

import { useState } from "react";
import { sendTestErrorAlert } from "./actions";

// Error alerts: send a test error and see the email arrive.
export function TestErrorButton({ configured }: { configured: boolean }) {
  const [note, setNote] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={async () => {
          setNote(null);
          try {
            await sendTestErrorAlert();
          } catch {
            setNote(configured ? "Test error sent - the alert email should arrive within a few minutes." : "Error alerts aren't set up yet (see docs/ERROR-ALERTS.md).");
          }
        }}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        title="Fails on purpose, to check error alerts reach you"
      >
        Send a test error
      </button>
      {note && <span className="text-xs text-slate-500">{note}</span>}
    </span>
  );
}

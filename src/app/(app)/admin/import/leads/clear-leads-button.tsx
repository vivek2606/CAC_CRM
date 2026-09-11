"use client";

import { useState } from "react";
import { clearLeadsWithoutNewFile, type ClearLeadsState } from "./actions";
import { Card } from "@/components/ui";

export function ClearLeadsButton() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ClearLeadsState | null>(null);

  async function handleClick() {
    const confirmed = window.confirm(
      "This removes every lead brought in by a previous leads-file import that hasn't been converted to a deal yet (and any orphaned contact from that same import). Leads already converted to a deal are never touched. Continue?"
    );
    if (!confirmed) return;
    setPending(true);
    setResult(null);
    try {
      const state = await clearLeadsWithoutNewFile();
      setResult(state);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-60 text-sm font-medium px-4 py-2 transition-colors"
      >
        {pending ? "Clearing…" : "Clear leads from a removed file"}
      </button>

      {result?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{result.error}</p>
      )}

      {result?.summary && (
        <Card className="p-4">
          <p className="text-sm text-slate-700">
            Removed <strong>{result.summary.leadsRemoved}</strong> lead{result.summary.leadsRemoved === 1 ? "" : "s"} and{" "}
            <strong>{result.summary.contactsRemoved}</strong> orphaned contact{result.summary.contactsRemoved === 1 ? "" : "s"}.
          </p>
        </Card>
      )}
    </div>
  );
}

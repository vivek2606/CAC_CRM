"use client";

import { Trash2 } from "lucide-react";
import { deleteAccount } from "./actions";

export function DeleteAccountButton({ accountId, accountName }: { accountId: string; accountName: string }) {
  const action = deleteAccount.bind(null, accountId);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Delete ${accountName}? This can't be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-slate-500 text-sm font-medium px-3 py-2 transition-colors"
        aria-label="Delete account"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </form>
  );
}

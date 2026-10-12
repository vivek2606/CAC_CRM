"use client";

import { Trash2 } from "lucide-react";

// A delete button that asks first - for a bound server action.
export function ConfirmDeleteButton({ action, message, label }: { action: () => Promise<void>; message: string; label: string }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-slate-500 text-sm font-medium px-3 py-2 transition-colors"
        aria-label={label}
        title={label}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </form>
  );
}

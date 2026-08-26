"use client";

import { useActionState } from "react";
import { resetPassword, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = {};

export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const boundAction = resetPassword.bind(null, userId);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  if (state.tempPassword) {
    return (
      <div>
        <span className="font-mono text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1 text-amber-800">
          {state.tempPassword}
        </span>
        <p className="text-xs text-slate-400 mt-1">Share this with {name} now — it won&apos;t be shown again.</p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Reset ${name}'s password? Their current password stops working immediately.`)) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        disabled={isPending}
        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-60"
      >
        {isPending ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}

"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePassword, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4 max-w-sm">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Current password</label>
        <input
          type="password"
          name="currentPassword"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">New password</label>
        <input
          type="password"
          name="newPassword"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Confirm new password</label>
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Password updated.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors"
      >
        {isPending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

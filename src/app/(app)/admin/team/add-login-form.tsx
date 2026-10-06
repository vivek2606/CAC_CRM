"use client";

import { useActionState, useTransition } from "react";
import { Card } from "@/components/ui";
import { createUser, setUserRole, type CreateUserState } from "./actions";

const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";

export function AddLoginForm() {
  const [state, formAction, isPending] = useActionState<CreateUserState, FormData>(createUser, {});

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-900">Add a login</h2>
      <p className="text-xs text-slate-500 mt-1">
        A Sales Coordinator sees every record, enters leads, deals and pending orders for any sales person, does the
        data entry (imports, stock, targets, prices) and sees Team Reports. Team &amp; Logins, incentives and discount
        approval stay with you.
      </p>
      <form action={formAction} className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
          <input name="name" required className={inputClass} placeholder="Joy Sale" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Email (used to sign in)</label>
          <input name="email" type="email" required className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Job title</label>
          <input name="title" className={inputClass} placeholder="Sales Coordinator" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Access</label>
          <select name="role" defaultValue="COORDINATOR" className={inputClass}>
            <option value="COORDINATOR">Sales Coordinator</option>
            <option value="SALES_MANAGER">Sales Manager</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-60"
        >
          {isPending ? "Creating…" : "Create login"}
        </button>
      </form>
      {state.error && <p className="mt-3 text-sm text-rose-600">{state.error}</p>}
      {state.created && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          Login created for <strong>{state.created.name}</strong> - email <strong>{state.created.email}</strong>,
          temporary password <span className="font-mono bg-white border border-amber-200 rounded px-1.5">{state.created.tempPassword}</span>.
          Share it now - it won&apos;t be shown again. They can change it under Change password.
        </div>
      )}
    </Card>
  );
}

export function RoleSelect({ userId, role }: { userId: string; role: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <select
      defaultValue={role}
      disabled={isPending}
      title="Takes effect the next time they sign in"
      onChange={(e) => {
        const next = e.target.value;
        startTransition(() => setUserRole(userId, next));
      }}
      className="mt-1 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-600 disabled:opacity-60"
    >
      <option value="SALES_MANAGER">Access: Sales Manager</option>
      <option value="COORDINATOR">Access: Sales Coordinator</option>
    </select>
  );
}

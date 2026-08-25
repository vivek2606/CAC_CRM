"use client";

import { useState } from "react";
import { OPEN_DEAL_STAGES, DEAL_STAGE_LABELS } from "@/lib/constants";
import type { DealStage } from "@prisma/client";

type Option = { id: string; label: string };

export function DealForm({
  action,
  isHead,
  owners,
  accounts,
  contacts,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  isHead: boolean;
  owners: Option[];
  accounts: Option[];
  contacts: (Option & { accountId: string | null })[];
  defaultValues?: {
    title?: string;
    stage?: DealStage;
    value?: number;
    probability?: number;
    expectedCloseDate?: string | null;
    accountId?: string | null;
    contactId?: string | null;
    ownerId?: string;
  };
  submitLabel: string;
}) {
  const [accountId, setAccountId] = useState(defaultValues?.accountId ?? "");
  const visibleContacts = contacts.filter((c) => !accountId || c.accountId === accountId);

  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Deal title *</label>
          <input
            name="title"
            required
            defaultValue={defaultValues?.title}
            placeholder="e.g. Acme Corp - New Business"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Deal value (₹) *</label>
          <input
            name="value"
            type="number"
            min={0}
            required
            defaultValue={defaultValues?.value}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Stage</label>
          <select
            name="stage"
            defaultValue={defaultValues?.stage ?? "QUALIFICATION"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {OPEN_DEAL_STAGES.map((s) => (
              <option key={s} value={s}>
                {DEAL_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Expected close date</label>
          <input
            name="expectedCloseDate"
            type="date"
            defaultValue={defaultValues?.expectedCloseDate ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Probability (%)</label>
          <input
            name="probability"
            type="number"
            min={0}
            max={100}
            defaultValue={defaultValues?.probability}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Account</label>
          <select
            name="accountId"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">None</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Contact</label>
          <select
            name="contactId"
            defaultValue={defaultValues?.contactId ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">None</option>
            {visibleContacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {isHead && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Owner</label>
            <select
              name="ownerId"
              defaultValue={defaultValues?.ownerId}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {!isHead && <input type="hidden" name="ownerId" value={defaultValues?.ownerId ?? ""} />}
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

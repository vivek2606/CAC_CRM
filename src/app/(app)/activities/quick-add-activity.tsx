"use client";

import { useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPES, CALL_OUTCOMES, CALL_OUTCOME_LABELS } from "@/lib/constants";
import type { ActivityType } from "@prisma/client";

type Option = { id: string; label: string };

// The Activities tab's own quick-add form - the one entry point for logging
// an activity that ISN'T already anchored to a Lead/Deal/Contact page (those
// use Record Timeline instead, which fixes owner/contact from the record
// itself). So this is also the only place a Head needs to pick who a call or
// meeting is actually for (e.g. one they sat in on with a sales manager) and
// tag which account/contact it concerned.
export function QuickAddActivity({
  action,
  isHead,
  owners,
  accounts,
  contacts,
}: {
  action: (formData: FormData) => void;
  isHead: boolean;
  owners: Option[];
  accounts: Option[];
  contacts: (Option & { accountId: string | null })[];
}) {
  const [type, setType] = useState<ActivityType>("TASK");
  const [accountId, setAccountId] = useState("");
  const visibleContacts = contacts.filter((c) => !accountId || c.accountId === accountId);

  return (
    <form action={action} className="flex flex-wrap gap-2">
      <select
        name="type"
        value={type}
        onChange={(e) => setType(e.target.value as ActivityType)}
        className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {ACTIVITY_TYPES.filter((t) => t !== "NOTE").map((t) => (
          <option key={t} value={t}>
            {ACTIVITY_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      {type === "CALL" && (
        <select
          name="callOutcome"
          defaultValue=""
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Outcome (optional)</option>
          {CALL_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {CALL_OUTCOME_LABELS[o]}
            </option>
          ))}
        </select>
      )}
      <input
        name="subject"
        placeholder="Quick add a task for yourself..."
        required
        className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <input
        name="dueAt"
        type="datetime-local"
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {isHead && (
        <select
          name="ownerId"
          defaultValue=""
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">For myself</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <div className="w-44">
        <SearchableSelect
          name="accountId"
          options={accounts}
          placeholder="Account (optional)"
          onSelect={(opt) => setAccountId(opt?.id ?? "")}
        />
      </div>
      <div className="w-44">
        <SearchableSelect name="contactId" options={visibleContacts} placeholder="Contact (optional)" />
      </div>
      <button
        type="submit"
        className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 transition-colors"
      >
        Add
      </button>
    </form>
  );
}

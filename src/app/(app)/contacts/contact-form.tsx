"use client";

import { SearchableSelect } from "@/components/searchable-select";
import { MONTHS, SPECIAL_LABELS, dayMonth } from "@/lib/key-dates-shared";

const sel = "rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
function DayMonth({ prefix, value }: { prefix: string; value: Date | null | undefined }) {
  const dm = dayMonth(value);
  return (
    <div className="flex gap-2">
      <select name={`${prefix}Day`} defaultValue={dm?.day ?? ""} className={sel} aria-label="Day">
        <option value="">Day</option>
        {Array.from({ length: 31 }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
      <select name={`${prefix}Month`} defaultValue={dm?.month ?? ""} className={`${sel} flex-1`} aria-label="Month">
        <option value="">Month</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

type Option = { id: string; label: string };

export function ContactForm({
  action,
  isHead,
  owners,
  accounts,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  isHead: boolean;
  owners: Option[];
  accounts: Option[];
  defaultValues?: {
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
    whatsappNumber?: string | null;
    jobTitle?: string | null;
    department?: string | null;
    accountId?: string | null;
    ownerId?: string;
    birthday?: Date | null;
    specialDate?: Date | null;
    specialDateLabel?: string | null;
  };
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">First name *</label>
          <input
            name="firstName"
            required
            defaultValue={defaultValues?.firstName}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Last name *</label>
          <input
            name="lastName"
            required
            defaultValue={defaultValues?.lastName}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Job title</label>
          <input
            name="jobTitle"
            defaultValue={defaultValues?.jobTitle ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
          <input
            name="department"
            placeholder="e.g. Procurement, Facilities"
            defaultValue={defaultValues?.department ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Account</label>
          <SearchableSelect
            name="accountId"
            options={accounts}
            defaultValue={defaultValues?.accountId ?? ""}
            placeholder="Type to search accounts..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={defaultValues?.email ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
          <input
            name="phone"
            defaultValue={defaultValues?.phone ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">WhatsApp number</label>
          <input
            name="whatsappNumber"
            placeholder="If different from phone"
            defaultValue={defaultValues?.whatsappNumber ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border border-slate-200 p-4">
        <p className="sm:col-span-2 text-xs text-slate-500">Dates to remember - you&apos;ll be reminded on My Day 3 days before, with a WhatsApp greeting ready.</p>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Birthday</label>
          <DayMonth prefix="birthday" value={defaultValues?.birthday} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Other date</label>
          <DayMonth prefix="special" value={defaultValues?.specialDate} />
          <input
            name="specialDateLabel"
            list="special-labels"
            placeholder="e.g. Wedding anniversary"
            defaultValue={defaultValues?.specialDateLabel ?? ""}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <datalist id="special-labels">
            {SPECIAL_LABELS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
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

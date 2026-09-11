"use client";

import { useState } from "react";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import { CompanyNameField, type AccountNameOption } from "./company-name-field";
import { SearchableSelect } from "@/components/searchable-select";
import type { AccountType } from "@prisma/client";

type Option = { id: string; label: string };

const CONTACT_MODES = [
  { value: "none", label: "Don't add a contact" },
  { value: "existing", label: "Link existing contact" },
  { value: "new", label: "Create new contact" },
] as const;
type ContactMode = (typeof CONTACT_MODES)[number]["value"];

export function AccountForm({
  action,
  isHead,
  owners,
  accounts,
  contacts,
  excludeId,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  isHead: boolean;
  owners: Option[];
  accounts: AccountNameOption[];
  // When present, renders the "Add a contact" section below - passed from
  // both the New and Edit Account pages, since an account can always use
  // another contact linked, not just at creation.
  contacts?: Option[];
  excludeId?: string;
  defaultValues?: {
    name?: string;
    code?: string | null;
    industry?: string | null;
    accountType?: AccountType | null;
    website?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    registrationNumber?: string | null;
    ownerId?: string;
  };
  submitLabel: string;
}) {
  const [contactMode, setContactMode] = useState<ContactMode>("none");

  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Company name *</label>
          <CompanyNameField accounts={accounts} defaultValue={defaultValues?.name} excludeId={excludeId} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Customer code *</label>
          <input
            name="code"
            required
            placeholder="e.g. CUST-00123"
            defaultValue={defaultValues?.code ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-slate-400">
            Usually filled in automatically from the Sales Register import - required so every account stays linked to the ERP system.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Account type</label>
          <select
            name="accountType"
            defaultValue={defaultValues?.accountType ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Unspecified</option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Industry</label>
          <input
            name="industry"
            defaultValue={defaultValues?.industry ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Website</label>
          <input
            name="website"
            defaultValue={defaultValues?.website ?? ""}
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
          <label className="block text-sm font-medium text-slate-700 mb-1">RC number / Tax ID</label>
          <input
            name="registrationNumber"
            placeholder="e.g. RC 1234567"
            defaultValue={defaultValues?.registrationNumber ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
          <input
            name="city"
            defaultValue={defaultValues?.city ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
          <input
            name="state"
            placeholder="e.g. Lagos"
            defaultValue={defaultValues?.state ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
          <input
            name="country"
            defaultValue={defaultValues?.country ?? "Nigeria"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
          <input
            name="address"
            defaultValue={defaultValues?.address ?? ""}
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

      {contacts && (
        <div className="border-t border-slate-200 pt-5">
          <label className="block text-sm font-medium text-slate-700 mb-2">Add a contact</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {CONTACT_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setContactMode(m.value)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  contactMode === m.value
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="contactMode" value={contactMode} />

          {contactMode === "existing" && (
            <SearchableSelect name="contactId" options={contacts} placeholder="Type to search contacts..." />
          )}

          {contactMode === "new" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">First name *</label>
                <input
                  name="contactFirstName"
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Last name *</label>
                <input
                  name="contactLastName"
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Job title</label>
                <input
                  name="contactJobTitle"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                <input
                  name="contactEmail"
                  type="email"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
                <input
                  name="contactPhone"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}
        </div>
      )}

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

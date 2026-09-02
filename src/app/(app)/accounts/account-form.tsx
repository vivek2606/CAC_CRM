"use client";

import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import type { AccountType } from "@prisma/client";

type Option = { id: string; label: string };

export function AccountForm({
  action,
  isHead,
  owners,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  isHead: boolean;
  owners: Option[];
  defaultValues?: {
    name?: string;
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
  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Company name *</label>
          <input
            name="name"
            required
            defaultValue={defaultValues?.name}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
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

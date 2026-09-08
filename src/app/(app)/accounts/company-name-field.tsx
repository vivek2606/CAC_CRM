"use client";

import { useState } from "react";
import Link from "next/link";

export type AccountNameOption = { id: string; name: string; code: string | null };

// Plain text input for the account name, but warns as you type if it looks
// like a duplicate of an account already in the CRM - Account.code is the
// identity key the ERP keys customers on, so creating a second account for
// the same company under a different id is exactly what breaks that link.
export function CompanyNameField({
  accounts,
  defaultValue,
  excludeId,
}: {
  accounts: AccountNameOption[];
  defaultValue?: string;
  excludeId?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const candidates = excludeId ? accounts.filter((a) => a.id !== excludeId) : accounts;
  const query = value.trim().toLowerCase();

  const exactMatch = query ? candidates.find((a) => a.name.trim().toLowerCase() === query) : undefined;
  const partialMatches =
    query.length >= 2 && !exactMatch
      ? candidates.filter((a) => a.name.toLowerCase().includes(query)).slice(0, 5)
      : [];

  return (
    <div>
      <input
        name="name"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {exactMatch && (
        <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
          An account named &quot;{exactMatch.name}&quot; already exists
          {exactMatch.code ? ` — Customer code: ${exactMatch.code}` : " — no customer code yet"}. Creating another
          will duplicate it.{" "}
          <Link href={`/accounts/${exactMatch.id}`} target="_blank" className="underline font-medium">
            View existing account →
          </Link>
        </p>
      )}
      {!exactMatch && partialMatches.length > 0 && (
        <div className="mt-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
          <p className="text-xs text-slate-500 mb-1">Similar accounts already registered:</p>
          <ul className="space-y-0.5">
            {partialMatches.map((a) => (
              <li key={a.id} className="text-xs">
                <Link href={`/accounts/${a.id}`} target="_blank" className="text-indigo-600 hover:text-indigo-700 underline">
                  {a.name}
                </Link>
                <span className="text-slate-400"> — {a.code ? `Code: ${a.code}` : "No customer code"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

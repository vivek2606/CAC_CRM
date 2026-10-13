"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BILLING_COMPANIES, DEFAULT_BILLING_COMPANY } from "@/lib/billing-company";
import { setDealCompany } from "../../deals/actions";

// Set a won deal's missing billing company right here.
export function CompanyFix({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [company, setCompany] = useState<string>(DEFAULT_BILLING_COMPANY);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <select
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        aria-label="Billing company"
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
      >
        {BILLING_COMPANIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await setDealCompany(dealId, company);
            if (res.error) setError(res.error);
            else router.refresh();
          })
        }
        className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {error && <span className="basis-full text-xs text-red-600">{error}</span>}
    </span>
  );
}

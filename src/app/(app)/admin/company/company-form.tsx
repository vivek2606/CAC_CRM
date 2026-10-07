"use client";

import { useActionState, useState } from "react";
import type { CompanySettings, CompanyProfile } from "@/lib/company-profile";
import { saveCompanySettingsAction, type CompanySettingsState } from "./actions";

const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const label = "block text-xs font-medium text-slate-500 mb-1";

const FIELDS: { key: keyof CompanyProfile; label: string; placeholder?: string }[] = [
  { key: "name", label: "Company name (as on the letterhead)" },
  { key: "refPrefix", label: "Ref no. prefix (e.g. SNL)" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "rcNumber", label: "RC number" },
  { key: "tin", label: "TIN" },
  { key: "bankName", label: "Bank" },
  { key: "accountName", label: "Account name" },
  { key: "accountNumber", label: "Account number" },
];
// FIELDS covers the text inputs; the logo has its own upload control.

export function CompanyForm({ initial }: { initial: CompanySettings }) {
  const [s, setS] = useState<CompanySettings>(initial);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [state, action, isPending] = useActionState<CompanySettingsState, FormData>(saveCompanySettingsAction, {});
  const setCompany = (i: number, patch: Partial<CompanyProfile>) =>
    setS({ ...s, companies: s.companies.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="settings" value={JSON.stringify(s)} />

      {s.companies.map((c, i) => (
        <div key={c.key} className="rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">{c.name || c.key}</h2>
            <span className="text-xs text-slate-500">Issues all quotations and proforma invoices</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.key === "name" ? "sm:col-span-2" : ""}>
                <label className={label}>{f.label}</label>
                <input
                  value={String(c[f.key] ?? "")}
                  onChange={(e) => setCompany(i, { [f.key]: e.target.value } as Partial<CompanyProfile>)}
                  className={input}
                />
              </div>
            ))}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={label}>Logo (PNG or JPG, under 500 KB) - the official Sakuragi logo is used unless you upload another</label>
              <div className="flex flex-wrap items-center gap-4">
                {c.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.logo} alt={`${c.name} logo`} className="h-14 max-w-[220px] object-contain rounded border border-slate-200 bg-white p-1" />
                ) : (
                  <span className="text-xs text-slate-400">No logo yet</span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (!/^image\/(png|jpeg)$/.test(file.type)) return setLogoError("Use a PNG or JPG image.");
                    if (file.size > 500_000) return setLogoError("That image is over 500 KB - use a smaller one.");
                    setLogoError(null);
                    const reader = new FileReader();
                    reader.onload = () => setCompany(i, { logo: String(reader.result) });
                    reader.readAsDataURL(file);
                  }}
                  className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:px-3 file:py-1.5 file:text-sm file:font-medium"
                />
                {c.logo && (
                  <button type="button" onClick={() => setCompany(i, { logo: "" })} className="text-sm text-rose-600 hover:text-rose-700">
                    Use the default logo
                  </button>
                )}
              </div>
              {logoError && <p className="mt-1 text-xs text-red-600">{logoError}</p>}
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={label}>Address (one line each)</label>
              <textarea
                rows={3}
                value={c.addressLines.join("\n")}
                onChange={(e) => setCompany(i, { addressLines: e.target.value.split("\n") })}
                className={input}
              />
            </div>
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Quotation &amp; proforma settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={label}>VAT %</label>
            <input type="number" step="0.01" min={0} value={s.vatRatePct} onChange={(e) => setS({ ...s, vatRatePct: Number(e.target.value) })} className={input} />
          </div>
          <div>
            <label className={label}>Quotation valid for (days)</label>
            <input type="number" min={1} value={s.quoteValidityDays} onChange={(e) => setS({ ...s, quoteValidityDays: Number(e.target.value) })} className={input} />
          </div>
          <div>
            <label className={label}>Proforma valid for (days)</label>
            <input type="number" min={1} value={s.proformaValidityDays} onChange={(e) => setS({ ...s, proformaValidityDays: Number(e.target.value) })} className={input} />
          </div>
          <div className="sm:col-span-3">
            <label className={label}>Payment terms (used when the deal has none)</label>
            <input value={s.defaultPaymentTerms} onChange={(e) => setS({ ...s, defaultPaymentTerms: e.target.value })} className={input} />
          </div>
          <div className="sm:col-span-3">
            <label className={label}>Other terms &amp; conditions (one per line; payment terms and price validity are added above these)</label>
            <textarea rows={4} value={s.terms.join("\n")} onChange={(e) => setS({ ...s, terms: e.target.value.split("\n") })} className={input} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={isPending} className="rounded-lg bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2">
          {isPending ? "Saving…" : "Save"}
        </button>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.saved && <p className="text-sm text-emerald-700">Saved - new quotations and proformas use these details.</p>}
      </div>
    </form>
  );
}

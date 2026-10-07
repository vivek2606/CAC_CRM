"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import type { DupGroup } from "@/lib/account-duplicates";
import { mergeAccounts } from "./actions";

export function MergeGroup({ group }: { group: DupGroup }) {
  const router = useRouter();
  const [keep, setKeep] = useState(group.accounts[0].id);
  const [merge, setMerge] = useState<Set<string>>(() => new Set(group.accounts.slice(1).map((a) => a.id)));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toMerge = group.accounts.filter((a) => a.id !== keep && merge.has(a.id));
  const keepName = group.accounts.find((a) => a.id === keep)?.name;

  const run = () => {
    if (toMerge.length === 0) return setMsg("Tick at least one account to merge.");
    if (!window.confirm(`Merge ${toMerge.map((a) => a.name).join(", ")} into "${keepName}"? Their deals, leads, contacts and activities move to it. This can't be undone.`)) return;
    setMsg(null);
    start(async () => {
      const res = await mergeAccounts(keep, toMerge.map((a) => a.id));
      if (res.error) setMsg(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      {group.differentCodes && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          These have different customer codes in the ERP - make sure they really are the same customer before merging.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
            <th className="pb-1 pr-2 font-medium">Keep</th>
            <th className="pb-1 pr-2 font-medium">Merge</th>
            <th className="pb-1 pr-2 font-medium">Account</th>
            <th className="pb-1 pr-2 font-medium">Code</th>
            <th className="pb-1 pr-2 font-medium">Owner</th>
            <th className="pb-1 pr-2 font-medium text-right">Deals</th>
            <th className="pb-1 pr-2 font-medium text-right">Contacts</th>
            <th className="pb-1 pr-2 font-medium text-right">Leads</th>
            <th className="pb-1 font-medium">Last sale</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {group.accounts.map((a) => (
            <tr key={a.id} className={a.id === keep ? "bg-emerald-50/60" : ""}>
              <td className="py-1.5 pr-2">
                <input type="radio" name={`keep-${group.key}`} checked={a.id === keep} onChange={() => setKeep(a.id)} aria-label={`Keep ${a.name}`} />
              </td>
              <td className="py-1.5 pr-2">
                <input
                  type="checkbox"
                  disabled={a.id === keep}
                  checked={a.id !== keep && merge.has(a.id)}
                  onChange={(e) => {
                    const next = new Set(merge);
                    if (e.target.checked) next.add(a.id);
                    else next.delete(a.id);
                    setMerge(next);
                  }}
                  aria-label={`Merge ${a.name}`}
                />
              </td>
              <td className="py-1.5 pr-2">
                <Link href={`/accounts/${a.id}`} className="font-medium text-indigo-700 hover:underline">
                  {a.name}
                </Link>
                {a.city && <span className="ml-1 text-xs text-slate-400">{a.city}</span>}
              </td>
              <td className="py-1.5 pr-2 text-slate-600">{a.code ?? "—"}</td>
              <td className="py-1.5 pr-2 text-slate-600">{a.owner}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{a.deals}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{a.contacts}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{a.leads}</td>
              <td className="py-1.5 text-slate-600">{a.lastSale ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? "Merging…" : `Merge ${toMerge.length || ""} into "${keepName}"`}
        </button>
        {msg && <p className="text-sm text-rose-700">{msg}</p>}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Building2, Link2, X } from "lucide-react";

export type CustomerAccount = { id: string; name: string; code: string | null; lines: string[] };

// The quotation's "To" box: typing the customer's name (or customer code)
// suggests existing accounts; picking one fills in its name, address and
// phone and links the quotation to the account. Typed in freely, it's a
// customer without an account.
export function CustomerField({
  value,
  accountId,
  accounts,
  onChange,
  className,
}: {
  value: string;
  accountId: string;
  accounts: CustomerAccount[];
  onChange: (to: string, accountId: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const linked = accountId ? accounts.find((a) => a.id === accountId) : undefined;
  const first = value.split("\n")[0].trim().toLowerCase();
  const matches =
    first.length >= 2 && !linked
      ? accounts
          .map((a) => {
            const n = a.name.toLowerCase();
            const rank = n.startsWith(first) ? 0 : n.includes(first) ? 1 : a.code?.toLowerCase().includes(first) ? 2 : -1;
            return { a, rank };
          })
          .filter((x) => x.rank >= 0)
          .sort((x, y) => x.rank - y.rank || x.a.name.localeCompare(y.a.name))
          .slice(0, 8)
          .map((x) => x.a)
      : [];
  const pick = (a: CustomerAccount) => {
    onChange([a.name, ...a.lines].join("\n"), a.id);
    setOpen(false);
  };
  return (
    <div className="relative">
      <textarea
        rows={3}
        value={value}
        onChange={(e) => {
          const to = e.target.value;
          // Still the linked account while its name stays on the first line.
          const keep = linked && to.split("\n")[0].toLowerCase().includes(linked.name.toLowerCase());
          onChange(to, keep ? accountId : "");
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !matches.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(matches.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter" && value.indexOf("\n") < 0) {
            e.preventDefault();
            pick(matches[hi]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Customer name (required) - type to find an existing account"
        className={className}
      />
      {open && matches.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <li className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Existing accounts - pick to link the quotation</li>
          {matches.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(a)}
                onMouseEnter={() => setHi(i)}
                className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm ${i === hi ? "bg-indigo-50" : ""}`}
              >
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">
                    {a.name}
                    {a.code && <span className="ml-1.5 text-xs font-normal text-slate-400">{a.code}</span>}
                  </span>
                  {a.lines.length > 0 && <span className="block truncate text-xs text-slate-500">{a.lines.join(" · ")}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {linked ? (
        <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
          <Link2 className="h-3 w-3" />
          Linked to account: <b>{linked.name}</b>
          {linked.code ? ` (${linked.code})` : ""}
          <button type="button" onClick={() => onChange(value, "")} className="ml-1 inline-flex items-center gap-0.5 text-emerald-700 hover:text-rose-600" title="Keep the text, drop the link">
            <X className="h-3 w-3" />
            Unlink
          </button>
        </p>
      ) : (
        first.length >= 2 &&
        !open && <p className="mt-1 text-[11px] text-slate-400">Not linked to an account - type the name to pick an existing one, or leave it as a new customer.</p>
      )}
    </div>
  );
}

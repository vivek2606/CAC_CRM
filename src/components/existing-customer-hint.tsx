"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { checkExistingCustomer } from "@/app/(app)/shared-actions";

type Match = Awaited<ReturnType<typeof checkExistingCustomer>>[number];
const KIND: Record<Match["kind"], string> = { account: "Account", contact: "Contact", lead: "Open lead", deal: "Open deal" };

// "Already in the CRM": shown under a lead / account / deal form while the
// phone no. or company name is typed, with whose it is.
export function ExistingCustomerHint({ phone, name, exclude }: { phone?: string; name?: string; exclude?: { kind: Match["kind"]; id: string } }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const excludeKey = exclude ? `${exclude.kind}:${exclude.id}` : "";
  useEffect(() => {
    const digits = (phone ?? "").replace(/\D/g, "");
    if (digits.length < 7 && (name ?? "").trim().length < 3) {
      const t = setTimeout(() => setMatches([]), 0);
      return () => clearTimeout(t);
    }
    let live = true;
    const t = setTimeout(async () => {
      const res = await checkExistingCustomer({ phone, name, exclude: excludeKey ? { kind: excludeKey.split(":")[0] as Match["kind"], id: excludeKey.split(":")[1] } : undefined }).catch(() => []);
      if (live) setMatches(res);
    }, 600);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [phone, name, excludeKey]);
  if (!matches.length) return null;
  const others = matches.filter((m) => !m.mine);
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${others.length ? "border-amber-300 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
      <p className="font-semibold">
        {others.length ? `This customer may already be in the CRM - ${[...new Set(others.map((m) => m.owner))].join(", ")}'s.` : "You already have this customer in the CRM."}
      </p>
      <ul className="mt-1 space-y-0.5">
        {matches.map((m, i) => (
          <li key={i}>
            {KIND[m.kind]}:{" "}
            {m.href ? (
              <Link href={m.href} target="_blank" className="font-medium underline">
                {m.label}
              </Link>
            ) : (
              <span className="font-medium">{m.label}</span>
            )}{" "}
            - {m.mine ? "yours" : m.owner} (same {m.why === "phone" ? "phone no." : "name"})
          </li>
        ))}
      </ul>
      {others.length > 0 && <p className="mt-1 text-xs">Check with them (or the Head of Sales) before adding it, so two people don&apos;t chase the same customer.</p>}
    </div>
  );
}

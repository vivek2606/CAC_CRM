"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LostReason } from "@prisma/client";
import { LOST_REASONS, LOST_REASON_LABELS } from "@/lib/constants";
import { SendQuoteButton } from "../send-quote-button";
import { followUpQuote, markQuoteLost, type FollowUpChannel } from "./actions";

export type FollowUpItem = {
  id: string;
  ref: string;
  customerName: string;
  total: number;
  dealId: string | null;
  dealTitle: string | null;
  ownerName: string;
  sentOn: string;
  ageDays: number;
  lastFollowUpOn: string | null;
  level: "amber" | "red";
  priceChanges: { description: string; from: number; to: number; on: string; upcoming: boolean }[];
};

const naira = (n: number) => `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
const dmy = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const field = "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm";

// Open quotations due a follow-up: "Follow up" logs how (call, WhatsApp,
// email, meeting) on the deal and sets the next reminder; "Mark lost"
// closes it (and its open deal) with the reason.
export function FollowUpList({ items, showOwner = false }: { items: FollowUpItem[]; showOwner?: boolean }) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((q) => (
        <FollowUpRow key={q.id} q={q} showOwner={showOwner} />
      ))}
    </ul>
  );
}

function FollowUpRow({ q, showOwner }: { q: FollowUpItem; showOwner: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<"follow" | "lost" | null>(null);
  const [channel, setChannel] = useState<FollowUpChannel>("CALL");
  const [note, setNote] = useState("");
  const [next, setNext] = useState("7");
  const [reason, setReason] = useState<LostReason>("PRICE_TOO_HIGH");
  const [brand, setBrand] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError("");
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        setOpen(null);
        router.refresh();
      }
    });

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span
          className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${q.level === "red" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}
        >
          {q.ageDays}d
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">
            {q.dealId ? (
              <Link href={`/deals/${q.dealId}`} className="hover:text-indigo-600">
                {q.dealTitle ?? q.customerName}
              </Link>
            ) : (
              q.customerName
            )}
          </p>
          <p className="text-xs text-slate-500">
            <Link href={`/quotations?quote=${q.id}`} className="text-indigo-600 hover:text-indigo-700">
              {q.ref}
            </Link>{" "}
            · {naira(q.total)} · sent {dmy(q.sentOn)}
            {q.lastFollowUpOn ? ` · last followed up ${dmy(q.lastFollowUpOn)}` : " · not followed up yet"}
            {showOwner ? ` · ${q.ownerName}` : ""}
          </p>
          {q.priceChanges.length > 0 && (
            <p className="mt-1 text-xs text-amber-800">
              ⚠{" "}
              {q.priceChanges
                .map((c) => `${c.description} ${c.upcoming ? (c.to > c.from ? "increases" : "drops") : c.to > c.from ? "increased" : "dropped"} to ${naira(c.to)} on ${dmy(c.on)}`)
                .join("; ")}{" "}
              - revise before re-sending
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <SendQuoteButton quoteId={q.id} variant="button" />
          <button
            type="button"
            onClick={() => setOpen(open === "follow" ? null : "follow")}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            Follow up
          </button>
          <button
            type="button"
            onClick={() => setOpen(open === "lost" ? null : "lost")}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Mark lost
          </button>
        </div>
      </div>

      {open === "follow" && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">How</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value as FollowUpChannel)} className={field}>
              <option value="CALL">Call</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="EMAIL">Email</option>
              <option value="MEETING">Meeting</option>
            </select>
          </label>
          <label className="min-w-[200px] flex-1 text-xs text-slate-500">
            <span className="mb-1 block">What the customer said</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={`${field} w-full`} placeholder="e.g. waiting on the consultant's approval" />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Remind me in</span>
            <select value={next} onChange={(e) => setNext(e.target.value)} className={field}>
              {[2, 3, 5, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => followUpQuote(q.id, channel, note, Number(next)))}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save follow-up"}
          </button>
        </div>
      )}
      {open === "lost" && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-rose-50 p-3">
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value as LostReason)} className={field}>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {LOST_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          {reason === "COMPETITOR" && (
            <label className="text-xs text-slate-500">
              <span className="mb-1 block">Brand they bought</span>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} className={field} />
            </label>
          )}
          <label className="min-w-[200px] flex-1 text-xs text-slate-500">
            <span className="mb-1 block">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={`${field} w-full`} />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => markQuoteLost(q.id, reason, note, brand))}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {pending ? "Saving..." : q.dealId ? "Mark quote & deal lost" : "Mark quote lost"}
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </li>
  );
}

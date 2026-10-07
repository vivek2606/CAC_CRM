"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Clock, FileDown, Send, Undo2 } from "lucide-react";
import { approveIncentives, returnIncentives, submitIncentives } from "./actions";

export type ApprovalView = {
  status: "NONE" | "SUBMITTED" | "APPROVED" | "RETURNED";
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  returnedBy?: string;
  returnedAt?: string;
  note?: string;
  approvedTotal?: number;
};

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

export function ApprovalPanel({
  month,
  monthLabel,
  isHead,
  payable,
  notPayableReason,
  approval,
  liveTotal,
}: {
  month: string;
  monthLabel: string;
  isHead: boolean;
  payable: boolean;
  notPayableReason: string;
  approval: ApprovalView;
  liveTotal: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sendingBack, setSendingBack] = useState(false);
  const [note, setNote] = useState("");
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        setSendingBack(false);
        setNote("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });

  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium disabled:opacity-60";
  const { status } = approval;
  const changed = status === "APPROVED" && approval.approvedTotal != null && Math.abs(approval.approvedTotal - liveTotal) >= 1;

  let tone = "border-slate-200 bg-white";
  let icon = <Clock className="h-5 w-5 text-slate-400" />;
  let title = `${monthLabel} - not yet submitted for approval`;
  let detail = isHead
    ? "The Sales Coordinator prepares and submits the month; you can also approve it directly."
    : "Check the figures below, then submit them to the Head of Sales for approval. The PDF for finance is available once approved.";
  if (!payable) {
    title = `${monthLabel} - not ready for sign-off`;
    detail = notPayableReason;
  } else if (status === "SUBMITTED") {
    tone = "border-amber-200 bg-amber-50";
    icon = <Clock className="h-5 w-5 text-amber-600" />;
    title = isHead ? `${monthLabel} - awaiting your approval` : `${monthLabel} - awaiting the Head's approval`;
    detail = `Submitted by ${approval.submittedBy} on ${when(approval.submittedAt)}.`;
  } else if (status === "APPROVED") {
    tone = "border-emerald-200 bg-emerald-50";
    icon = <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
    title = `${monthLabel} - approved`;
    detail = `Approved by ${approval.approvedBy} on ${when(approval.approvedAt)}${approval.submittedBy ? `, prepared by ${approval.submittedBy}` : ""}. Total payable ${naira(approval.approvedTotal ?? 0)}.`;
  } else if (status === "RETURNED") {
    tone = "border-rose-200 bg-rose-50";
    icon = <Undo2 className="h-5 w-5 text-rose-600" />;
    title = `${monthLabel} - sent back`;
    detail = `${approval.returnedBy} on ${when(approval.returnedAt)}: "${approval.note}"`;
  }

  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-start gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-sm text-slate-600 mt-0.5">{detail}</p>
          {changed && (
            <p className="mt-1 text-sm font-medium text-amber-700">
              The figures have changed since approval (now {naira(liveTotal)}). The PDF shows the approved figures - withdraw the approval and approve again to
              use the new ones.
            </p>
          )}
        </div>
        {payable && (
          <div className="flex flex-wrap gap-2">
            {status === "APPROVED" && (
              <a href={`/incentives/statement?month=${month}`} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-500`}>
                <FileDown className="h-4 w-4" />
                Download PDF for finance
              </a>
            )}
            {(status === "NONE" || status === "RETURNED") && !isHead && (
              <button type="button" disabled={pending} onClick={() => run(() => submitIncentives(month))} className={`${btn} bg-slate-900 text-white hover:bg-slate-700`}>
                <Send className="h-4 w-4" />
                {pending ? "Submitting…" : "Submit for approval"}
              </button>
            )}
            {isHead && status !== "APPROVED" && (
              <button type="button" disabled={pending} onClick={() => run(() => approveIncentives(month))} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}>
                <CheckCircle2 className="h-4 w-4" />
                {pending ? "Approving…" : "Approve"}
              </button>
            )}
            {isHead && (status === "SUBMITTED" || status === "APPROVED") && !sendingBack && (
              <button type="button" disabled={pending} onClick={() => setSendingBack(true)} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
                <Undo2 className="h-4 w-4" />
                {status === "APPROVED" ? "Withdraw approval" : "Send back"}
              </button>
            )}
          </div>
        )}
      </div>
      {sendingBack && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={status === "APPROVED" ? "Reason (optional)" : "What needs changing? (optional)"}
            className="min-w-[260px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <button type="button" disabled={pending} onClick={() => run(() => returnIncentives(month, note))} className={`${btn} bg-rose-600 text-white hover:bg-rose-500`}>
            {status === "APPROVED" ? "Withdraw" : "Send back"}
          </button>
          <button type="button" onClick={() => setSendingBack(false)} className="text-sm text-slate-500 hover:text-slate-800">
            Cancel
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { whatsappLink } from "@/lib/whatsapp";
import { RATING_LABEL, LOW_RATING, FEEDBACK_KIND_LABEL } from "@/lib/feedback-labels";
import { prepareFeedbackRequest } from "./actions";

export type FeedbackView = { id: string; kind: string; rating: number | null; comment: string | null; createdAt: string; respondedAt: string | null };

export const Stars = ({ n }: { n: number }) => (
  <span className={n <= LOW_RATING ? "text-rose-500" : "text-amber-400"} aria-label={`${n} of 5`}>
    {"★".repeat(n)}
    <span className="text-slate-200">{"★".repeat(5 - n)}</span>
  </span>
);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// On a won order: the customer's rating, or ask for it on WhatsApp once
// delivered / commissioned.
export function FeedbackCard({ dealId, feedback, readyFor, canAsk }: { dealId: string; feedback: FeedbackView[]; readyFor: string | null; canAsk: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState("");
  const answered = feedback.find((f) => f.respondedAt);
  const asked = feedback[0];
  return (
    <div className="space-y-2 text-sm">
      {answered ? (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg leading-none">
              <Stars n={answered.rating ?? 0} />
            </span>
            <span className="font-medium text-slate-800">{RATING_LABEL[answered.rating ?? 0]}</span>
            <span className="text-xs text-slate-500">
              on the {FEEDBACK_KIND_LABEL[answered.kind]}, {day(answered.respondedAt!)}
            </span>
          </div>
          {answered.comment && <p className="mt-1 whitespace-pre-line text-slate-700">&ldquo;{answered.comment}&rdquo;</p>}
        </div>
      ) : asked ? (
        <p className="text-slate-600">
          Asked about the {FEEDBACK_KIND_LABEL[asked.kind]} on {day(asked.createdAt)} - not answered yet.
        </p>
      ) : readyFor ? (
        <p className="text-slate-600">The {FEEDBACK_KIND_LABEL[readyFor]} is done - ask the customer how it went.</p>
      ) : (
        <p className="text-slate-500">Ask for feedback once the order is delivered (or, when we install it, commissioned).</p>
      )}
      {canAsk && readyFor && !answered && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await prepareFeedbackRequest(dealId);
                if (res.error || !res.url) return setMsg(res.error ?? "Couldn't make the link.");
                setLink(res.url);
                setMsg("");
                window.open(whatsappLink(res.phone ?? "", res.message ?? res.url), "_blank");
                router.refresh();
              })
            }
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {asked ? "Remind on WhatsApp" : "Ask for feedback on WhatsApp"}
          </button>
          {link && (
            <button type="button" onClick={() => navigator.clipboard.writeText(link).then(() => setMsg("Link copied."))} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
              Copy link
            </button>
          )}
          {msg && <span className="text-xs text-slate-600">{msg}</span>}
        </div>
      )}
    </div>
  );
}

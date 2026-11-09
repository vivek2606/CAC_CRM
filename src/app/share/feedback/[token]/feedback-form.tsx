"use client";

import { useState, useTransition } from "react";
import { RATING_LABEL } from "@/lib/feedback-labels";
import { submitFeedback } from "../actions";

export function FeedbackForm({ token }: { token: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <p className="mt-5 text-sm font-medium text-emerald-700">Thank you for your feedback - it helps us serve you better.</p>;
  return (
    <div className="mt-5 space-y-4">
      <div>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              onClick={() => setRating(n)}
              className={`text-4xl leading-none transition-colors ${n <= rating ? "text-amber-400" : "text-slate-200 hover:text-amber-200"}`}
            >
              ★
            </button>
          ))}
        </div>
        <p className="mt-1 h-4 text-xs text-slate-500">{RATING_LABEL[rating]}</p>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={4}
        placeholder={rating && rating <= 2 ? "Sorry to hear that - what went wrong?" : "Anything you'd like to tell us? (optional)"}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={pending || !rating}
        onClick={() =>
          start(async () => {
            const res = await submitFeedback(token, rating, comment);
            if (res.error) setError(res.error);
            else setDone(true);
          })
        }
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        Send feedback
      </button>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}

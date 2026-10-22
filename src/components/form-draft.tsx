"use client";

import { useEffect, useRef, useState } from "react";

// Draft saving for a long form: what's typed is kept in this browser as it
// changes, so a reload, the phone dropping the app or a closed tab doesn't
// lose it. The next time the same form opens, the draft is offered back
// (Restore / Discard). Saving the form clears it. Put <FormDraft> inside
// the <form>; onRestore gets the saved field values (by field name) and
// re-opens the form filled with them.

export type DraftValues = Record<string, string>;
const KEEP_DAYS = 7;
const storeKey = (key: string) => `cac-draft-v1:${key}`;

function serialize(form: HTMLFormElement): DraftValues {
  const out: DraftValues = {};
  for (const [k, v] of new FormData(form)) if (typeof v === "string") out[k] = k in out ? `${out[k]},${v}` : v;
  return out;
}
const same = (a: DraftValues, b: DraftValues) => JSON.stringify(a) === JSON.stringify(b);

function read(key: string): { at: number; values: DraftValues } | null {
  try {
    const d = JSON.parse(window.localStorage.getItem(storeKey(key)) ?? "null") as { at: number; values: DraftValues } | null;
    return d && Date.now() - d.at < KEEP_DAYS * 86400000 ? d : null;
  } catch {
    return null;
  }
}
function write(key: string, values: DraftValues | null) {
  try {
    if (values) window.localStorage.setItem(storeKey(key), JSON.stringify({ at: Date.now(), values }));
    else window.localStorage.removeItem(storeKey(key));
  } catch {}
}

export function FormDraft({ draftKey, restored = false, onRestore }: { draftKey: string; restored?: boolean; onRestore: (values: DraftValues) => void }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [offer, setOffer] = useState<{ at: number; values: DraftValues } | null>(null);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const saved = read(draftKey);
    const formPath = window.location.pathname;
    // The form as it opened: nothing to keep until it differs.
    let initial: DraftValues | null = null;
    const timer0 = window.setTimeout(() => {
      initial = serialize(form);
      if (saved && !restored && !same(saved.values, initial)) setOffer(saved);
    }, 0);
    let submitted = false;
    let pending: number | undefined;
    const save = () => {
      if (!initial) return;
      const now = serialize(form);
      if (same(now, initial)) return;
      write(draftKey, now);
    };
    const onInput = () => {
      submitted = false;
      setOffer(null); // typing anew replaces the old draft
      window.clearTimeout(pending);
      pending = window.setTimeout(save, 500);
    };
    const onSubmit = () => {
      save();
      submitted = true;
    };
    // Fields set by the form itself (a picked account, products...) don't fire input events.
    const poll = window.setInterval(() => !submitted && save(), 3000);
    form.addEventListener("input", onInput, true);
    form.addEventListener("change", onInput, true);
    form.addEventListener("submit", onSubmit, true);
    return () => {
      window.clearTimeout(timer0);
      window.clearTimeout(pending);
      window.clearInterval(poll);
      form.removeEventListener("input", onInput, true);
      form.removeEventListener("change", onInput, true);
      form.removeEventListener("submit", onSubmit, true);
      // Saved and moved on to the record: the draft is done with. (An error
      // page shows on the same address - then the draft stays.)
      if (submitted) {
        const path = formPath;
        window.setTimeout(() => window.location.pathname !== path && write(draftKey, null), 1500);
      }
    };
  }, [draftKey, restored]);

  return (
    <span ref={anchor} className="contents">
      {offer && (
        <span className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>
            You have an unsaved draft of this form from{" "}
            {new Date(offer.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}.
          </span>
          <button
            type="button"
            onClick={() => {
              onRestore(offer.values);
              setOffer(null);
            }}
            className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-500"
          >
            Restore it
          </button>
          <button
            type="button"
            onClick={() => {
              write(draftKey, null);
              setOffer(null);
            }}
            className="text-xs font-medium text-amber-800 underline hover:text-amber-950"
          >
            Discard
          </button>
        </span>
      )}
    </span>
  );
}

// Field value helpers for turning a draft back into a form's defaults.
export const draftText = (v: string | undefined) => (v == null ? undefined : v);
export const draftNumber = (v: string | undefined) => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v.replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
export const draftOrNull = <T extends string>(v: string | undefined) => (v ? (v as T) : null);

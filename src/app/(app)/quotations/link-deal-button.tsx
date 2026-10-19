"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/searchable-select";
import { createForQuote, linkQuotationDeal, quoteLinkContext } from "./actions";

type Mode = "existing" | "deal" | "lead";
type Context = Awaited<ReturnType<typeof quoteLinkContext>>;

// "Link deal" on a quotation saved without one: pick one of the sales
// person's deals, or - when it isn't in the CRM yet - create the deal, or
// the lead and its deal, right here.
export function LinkDealButton({ quoteId, quoteRef, ownerName }: { quoteId: string; quoteRef: string; ownerName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<Context | null>(null);
  const [mode, setMode] = useState<Mode>("existing");
  const [dealId, setDealId] = useState("");
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const show = () => {
    setOpen(true);
    setError(null);
    if (!ctx)
      start(async () => {
        const c = await quoteLinkContext(quoteId);
        setCtx(c);
        setTitle(c.customerName);
        setOwnerId(c.defaultOwnerId);
        if (c.deals.length === 0) setMode("deal");
      });
  };
  const save = () => {
    setError(null);
    if (mode === "existing") {
      if (!dealId) return setError("Pick the deal.");
      return start(async () => {
        const res = await linkQuotationDeal(quoteId, dealId);
        if (res.error) return setError(res.error);
        setOpen(false);
        router.refresh();
      });
    }
    if (!title.trim()) return setError(`Enter a name for the ${mode}.`);
    if (ctx?.owners && !ownerId) return setError("Pick the sales person.");
    start(async () => {
      const res = await createForQuote(quoteId, { kind: mode, title, ownerId: ownerId || undefined, phone });
      if (res.error) return setError(res.error);
      setOpen(false);
      router.push(`/deals/${res.dealId}`);
    });
  };

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setError(null);
      }}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === m ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <button type="button" onClick={show} className="text-amber-700 hover:text-amber-600 font-medium">
        Link deal
      </button>
      {/* On the body: an animated table row would otherwise trap the overlay inside the table. */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 text-left" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl whitespace-normal" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-900">Link {quoteRef} to a deal</h2>
            <p className="mt-1 mb-3 text-xs text-slate-500">The quotation then shows on the deal&apos;s page. Not in the CRM yet? Create the deal - or the lead and its deal - here.</p>
            {ctx == null ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : (
              <>
                <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
                  {tab("existing", "Existing deal")}
                  {tab("deal", "New deal")}
                  {tab("lead", "New lead → deal")}
                </div>
                {mode === "existing" ? (
                  ctx.deals.length === 0 ? (
                    <p className="text-sm text-slate-500">{ownerName} has no deals yet - create one with New deal or New lead.</p>
                  ) : (
                    <>
                      <p className="mb-2 text-xs text-slate-500">{ownerName}&apos;s deals.</p>
                      <SearchableSelect options={ctx.deals} value={dealId} onSelect={(o) => setDealId(o?.id ?? "")} placeholder="Type to search deals…" />
                    </>
                  )
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-500">
                      {mode === "deal"
                        ? "A new deal at Proposal, with this quotation's products and value."
                        : "Records the enquiry as a lead and converts it to a deal at Proposal straight away, with this quotation's products and value - so it counts in lead-to-deal conversion."}
                    </p>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">{mode === "deal" ? "Deal" : "Lead / deal"} name *</label>
                      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lifemate HQ - VRF system" className={input} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {ctx.owners && (
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">Sales person *</label>
                          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={input}>
                            <option value="">Pick…</option>
                            {ctx.owners.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">Customer phone</label>
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Optional" className={input} />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3.5 py-2 text-sm text-slate-600 hover:text-slate-900">
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || !ctx || (mode === "existing" && !ctx.deals.length)}
                onClick={save}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-3.5 py-2"
              >
                {pending && ctx ? "Saving…" : mode === "existing" ? "Link deal" : mode === "deal" ? "Create deal & link" : "Create lead & deal"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

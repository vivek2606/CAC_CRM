"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";
import type { AccountInput } from "@/lib/account-link";
import { linkDealAccount } from "../../deals/actions";
import { LinkAccountDialog } from "../../deals/link-account-dialog";
import { linkProjectBillingAccount } from "../../project-billing/actions";

// A register line with no account: link one right here - search and pick
// (saves on pick), or create it. For a sales line it links the deal (all
// that invoice's lines); for a project billing line, that line.
export function AccountCell({
  name,
  dealId,
  billingId,
  accounts,
}: {
  name: string;
  dealId?: string;
  billingId?: string;
  accounts: SearchableOption[];
}) {
  const router = useRouter();
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (input: AccountInput) => (billingId ? linkProjectBillingAccount(billingId, input) : linkDealAccount(dealId!, input));

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return null;
    return { top: Math.min(r.bottom + 4, window.innerHeight - 300), left: Math.max(8, Math.min(r.left, window.innerWidth - 336)) };
  };
  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement).closest("[data-account-pop]")) setPos(null);
    };
    // Follows the button when the page or table scrolls.
    const onScroll = () => setPos(place());
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [pos]);

  const open = () => {
    setError(null);
    setPos(place());
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={open}
        disabled={pending}
        title={`${name} - not linked to an account. Click to link it.`}
        className="max-w-full truncate rounded-md border border-dashed border-amber-400 bg-amber-50 px-1.5 py-0.5 text-left text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-60"
      >
        {pending ? "Saving…" : `${name} · link`}
      </button>
      {pos &&
        createPortal(
          <div
            data-account-pop
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-50 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
          >
            <p className="mb-1.5 text-xs font-medium text-slate-500">Link &ldquo;{name}&rdquo; to an account</p>
            <SearchableSelect
              options={accounts}
              value=""
              placeholder="Type to search accounts…"
              onSelect={(o) => {
                if (!o) return;
                setPos(null);
                start(async () => {
                  const res = await save({ accountId: o.id });
                  if (res.error) setError(res.error);
                  else router.refresh();
                });
              }}
            />
            <button
              type="button"
              onClick={() => {
                setPos(null);
                setCreating(true);
              }}
              className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              + Not in the list - create the account
            </button>
          </div>,
          document.body,
        )}
      {error && <div className="whitespace-normal text-xs text-red-600">{error}</div>}
      {creating && (
        <LinkAccountDialog
          accounts={accounts}
          save={save}
          initialMode="new"
          initialName={name}
          title={`Link "${name}" to an account`}
          hint={dealId ? "Links the account to this sale's deal - every line of that invoice." : "Links this project billing line to the account."}
          onCancel={() => setCreating(false)}
          onLinked={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

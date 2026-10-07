"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import type { Notifications } from "@/lib/notifications";

const REFRESH_MS = 5 * 60 * 1000;

// Things needing attention (tasks due, quiet / overdue deals, approvals),
// refreshed every few minutes and when the app comes back into view. The
// count also shows on the installed app's icon where the device supports it.
export function NotificationBell({ onNavigate }: { onNavigate?: () => void }) {
  const [data, setData] = useState<Notifications | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as Notifications;
      setData(next);
      const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
      if (next.total > 0) nav.setAppBadge?.(next.total).catch(() => {});
      else nav.clearAppBadge?.().catch(() => {});
    } catch {
      // offline - keep what we have
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const total = data?.total ?? 0;
  const go = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        aria-label={`Notifications${total ? ` (${total})` : ""}`}
        className="relative inline-flex items-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      >
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-900">Needs your attention</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {!data && <p className="px-4 py-6 text-center text-sm text-slate-500">Loading…</p>}
            {data && data.groups.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">All clear - nothing needs attention right now.</p>}
            {data?.groups.map((g) => (
              <div key={g.key} className="border-b border-slate-100 last:border-0">
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</p>
                  <span className="rounded-full bg-slate-100 px-2 text-[11px] font-semibold text-slate-700">{g.count}</span>
                </div>
                <ul>
                  {g.items.map((it, i) => (
                    <li key={i}>
                      <Link href={it.href} onClick={go} className="block px-4 py-1.5 hover:bg-slate-50">
                        <span className="block truncate text-sm text-slate-800">{it.label}</span>
                        {it.sub && <span className="block truncate text-xs text-slate-500">{it.sub}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
                {g.count > g.items.length && (
                  <Link href={g.href} onClick={go} className="block px-4 pb-2.5 pt-0.5 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                    See all {g.count} →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

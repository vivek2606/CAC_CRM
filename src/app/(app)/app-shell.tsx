"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, RefreshCw, X } from "lucide-react";
import type { SessionUser } from "@/lib/rbac";
import { Sidebar, sectionFor } from "./sidebar";
import { SearchBox } from "./search-box";
import { SakuragiMark } from "@/components/sakuragi-logo";
import { CalculatorButton } from "@/components/calculator";
import { NotificationBell } from "@/components/notification-bell";

// In-app tabs: the installed app has no browser tab strip, so each menu
// section opens in a tab of its own here. The first tab is the normal page;
// the others are the same app in a frame (which hides its own menu - see
// the embed-detect script in the root layout), so each keeps its place and
// anything half-typed while you switch between them.
// href: what the tab opened; url: the page it's on now (kept for a reload).
type Tab = { id: string; href: string; label: string; url?: string };
const MAX_TABS = 8;

// The open tabs (and the page in the main area) are kept in the browser for
// a while, so a reload - pressing refresh, the phone reloading the app in
// the background, a new version of the app - brings them back instead of
// leaving just the dashboard.
const KEEP_MS = 12 * 3600_000;
type Saved = { tabs: Tab[]; active: string; main: string; at: number };
const storeKey = (userId: string) => `cac-tabs-v1:${userId}`;
function readSaved(userId: string): Saved | null {
  try {
    const s = JSON.parse(window.localStorage.getItem(storeKey(userId)) ?? "null") as Saved | null;
    return s && Date.now() - s.at < KEEP_MS ? s : null;
  } catch {
    return null;
  }
}
const here = (w: Window) => w.location.pathname + w.location.search;

// Typing in a form that hasn't been saved yet - in the page itself or in
// an in-app tab. Cleared when the form is submitted or the page changes.
function watchTyping(doc: Document, onChange: (dirty: boolean) => void) {
  const typed = (e: Event) => {
    // Only fields of a form - not the search box or a table's filters.
    const t = e.target as HTMLInputElement | null;
    if (!t?.form || t.closest("[role=search], [data-no-unsaved]") || t.type === "search") return;
    onChange(true);
  };
  const submitted = () => onChange(false);
  doc.addEventListener("input", typed, true);
  doc.addEventListener("submit", submitted, true);
  return () => {
    doc.removeEventListener("input", typed, true);
    doc.removeEventListener("submit", submitted, true);
  };
}

const noopSubscribe = () => () => {};
function useEmbedded() {
  return useSyncExternalStore(
    noopSubscribe,
    () => document.documentElement.hasAttribute("data-embed"),
    () => false,
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  // Error alerts say who hit the error.
  useEffect(() => {
    Sentry.setUser({ id: user.id, username: user.name ?? undefined, role: user.role });
  }, [user.id, user.name, user.role]);
  const [open, setOpen] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string>("main");
  const pathname = usePathname();
  const embedded = useEmbedded();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [tabReloading, setTabReloading] = useState(false);
  const lastRefresh = useRef(0);
  // Where there's unsaved typing: "main" and/or tab ids.
  const dirty = useRef(new Set<string>());
  const restored = useRef(false);
  // Saving what's open starts only once it has been restored (else the
  // first save would write over it with nothing).
  const [ready, setReady] = useState(false);
  // Per tab: the timer following the page it's on.
  const followers = useRef(new Map<string, ReturnType<typeof setInterval>>());
  useEffect(() => {
    const timers = followers.current;
    return () => timers.forEach(clearInterval);
  }, []);

  // Bring back the tabs (and, on a fresh launch at the dashboard, the page
  // that was open) after a reload.
  useEffect(() => {
    if (embedded || restored.current) return;
    restored.current = true;
    const saved = readSaved(user.id);
    /* eslint-disable react-hooks/set-state-in-effect -- restoring browser-stored state once on load */
    setReady(true);
    if (!saved) return;
    setTabs(saved.tabs.map((t) => ({ ...t, href: t.url ?? t.href })));
    setActive(saved.tabs.some((t) => t.id === saved.active) ? saved.active : "main");
    /* eslint-enable react-hooks/set-state-in-effect */
    const fresh = !window.sessionStorage.getItem("cac-session");
    if (fresh && window.location.pathname === "/" && saved.main && saved.main !== "/") router.replace(saved.main);
  }, [embedded, user.id, router]);
  useEffect(() => {
    if (embedded) return;
    try {
      window.sessionStorage.setItem("cac-session", "1");
    } catch {}
  }, [embedded]);

  // Keep what's open, as it changes.
  useEffect(() => {
    if (embedded || !ready) return;
    try {
      window.localStorage.setItem(storeKey(user.id), JSON.stringify({ tabs, active, main: pathname + window.location.search, at: Date.now() } satisfies Saved));
    } catch {}
  }, [tabs, active, pathname, embedded, user.id, ready]);

  // Unsaved typing in the page: warn before a reload / closing; the page
  // changing clears it.
  useEffect(() => {
    if (embedded) return;
    const stop = watchTyping(document, (d) => (d ? dirty.current.add("main") : dirty.current.delete("main")));
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current.size === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      stop();
      window.removeEventListener("beforeunload", warn);
    };
  }, [embedded]);
  useEffect(() => {
    dirty.current.delete("main");
  }, [pathname]);

  // Coming back to the app after a minute or more away: fetch the page's
  // data again, so the figures are current without pressing Refresh.
  // (Not inside an in-app tab - the open tab is refreshed with the button.)
  useEffect(() => {
    if (embedded) return;
    lastRefresh.current = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefresh.current < 60_000) return;
      // Not while something typed in a form is waiting to be saved.
      if (dirty.current.size > 0) return;
      lastRefresh.current = Date.now();
      router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router, embedded]);

  // Inside a tab: just the page.
  if (embedded) return <main className="flex-1 min-w-0">{children}</main>;

  const mainSection = sectionFor(pathname, user.role);
  const activeTab = tabs.find((t) => t.id === active);
  const currentPath = activeTab ? activeTab.href : pathname;

  const openSection = (href: string, label: string) => {
    setOpen(false);
    if (mainSection?.href === href) return setActive("main");
    const existing = tabs.find((t) => t.href === href);
    if (existing) return setActive(existing.id);
    const tab = { id: `${href}-${Date.now()}`, href, label };
    setTabs((ts) => {
      const next = [...ts, tab];
      // Too many open: the oldest tab you're not on is closed.
      return next.length > MAX_TABS ? next.filter((t, i) => i !== next.findIndex((x) => x.id !== active)) : next;
    });
    setActive(tab.id);
  };
  // Refresh: the data on the page you're looking at - the main page, or the
  // open in-app tab.
  const refresh = () => {
    lastRefresh.current = Date.now();
    if (active !== "main") {
      const frame = document.querySelector<HTMLIFrameElement>(`iframe[data-tab="${active}"]`);
      if (frame?.contentWindow) {
        setTabReloading(true);
        frame.addEventListener("load", () => setTabReloading(false), { once: true });
        frame.contentWindow.location.reload();
        return;
      }
    }
    startRefresh(() => router.refresh());
  };
  const busy = refreshing || tabReloading;

  const closeTab = (id: string) => {
    if (dirty.current.has(id) && !window.confirm("This tab has something typed that isn't saved. Close it anyway?")) return;
    dirty.current.delete(id);
    clearInterval(followers.current.get(id));
    followers.current.delete(id);
    const i = tabs.findIndex((t) => t.id === id);
    setTabs((ts) => ts.filter((t) => t.id !== id));
    if (active === id) setActive(tabs[i - 1]?.id ?? "main");
  };

  const tabClass = (on: boolean) =>
    `group inline-flex max-w-[200px] shrink-0 items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-xs font-medium transition-colors ${
      on ? "border-slate-200 bg-white text-slate-900" : "border-transparent text-slate-500 hover:bg-white/70 hover:text-slate-800"
    }`;

  return (
    <div className="flex min-h-screen w-full" style={{ "--app-top": tabs.length > 0 ? "calc(3.5rem + 36px)" : "3.5rem" } as React.CSSProperties}>
      <Sidebar user={user} open={open} onClose={() => setOpen(false)} currentPath={currentPath} onOpenSection={openSection} />

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          aria-hidden="true"
        />
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="app-chrome sticky top-0 z-20">
          <div className="h-14 flex items-center gap-3 px-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50/70 via-white to-white">
            <button
              onClick={() => setOpen(true)}
              className="lg:hidden text-slate-600 hover:text-slate-900 p-1 -ml-1"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            <SakuragiMark className="lg:hidden h-7 w-7 shrink-0" />
            <span className="lg:hidden font-semibold text-slate-900 text-sm shrink-0">SAKURAGI</span>
            <SearchBox />
            <div className="ml-auto shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={refresh}
                disabled={busy}
                title="Refresh - load the latest data on this page"
                aria-label="Refresh data"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-70"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{busy ? "Refreshing…" : "Refresh"}</span>
              </button>
              <NotificationBell onNavigate={() => setActive("main")} />
              <CalculatorButton />
            </div>
          </div>
          {tabs.length > 0 && (
            <div className="flex items-end gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100 px-3 pt-1.5" role="tablist">
              <button type="button" role="tab" aria-selected={active === "main"} onClick={() => setActive("main")} className={tabClass(active === "main")}>
                <span className="truncate">{mainSection?.label ?? "Main"}</span>
              </button>
              {tabs.map((t) => (
                <div key={t.id} role="tab" aria-selected={active === t.id} className={tabClass(active === t.id)}>
                  <button type="button" onClick={() => setActive(t.id)} className="truncate">
                    {t.label}
                  </button>
                  <button type="button" onClick={() => closeTab(t.id)} aria-label={`Close ${t.label}`} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <main className="flex-1 min-w-0" hidden={active !== "main"}>
          {children}
        </main>
        {tabs.map((t) => (
          <iframe
            key={t.id}
            data-tab={t.id}
            src={t.href}
            // Each page the tab opens: remember it (for a reload) and watch
            // it for unsaved typing.
            onLoad={(e) => {
              const w = e.currentTarget.contentWindow;
              if (!w) return;
              dirty.current.delete(t.id);
              try {
                const url = here(w);
                setTabs((ts) => ts.map((x) => (x.id === t.id && x.url !== url ? { ...x, url } : x)));
                watchTyping(w.document, (d) => (d ? dirty.current.add(t.id) : dirty.current.delete(t.id)));
                // Pages inside the tab move on without a full load (links,
                // a form saved and moving on): keep up.
                clearInterval(followers.current.get(t.id));
                let last = url;
                followers.current.set(
                  t.id,
                  setInterval(() => {
                    try {
                      const now = here(w);
                      if (now === last) return;
                      last = now;
                      dirty.current.delete(t.id);
                      setTabs((ts) => ts.map((x) => (x.id === t.id ? { ...x, url: now } : x)));
                    } catch {}
                  }, 1500),
                );
              } catch {}
            }}
            title={t.label}
            hidden={active !== t.id}
            className="w-full flex-1 border-0 bg-slate-50"
            style={{ height: "calc(100vh - 56px - 36px)" }}
          />
        ))}
      </div>
    </div>
  );
}

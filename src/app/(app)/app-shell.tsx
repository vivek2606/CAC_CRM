"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
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
type Tab = { id: string; href: string; label: string };
const MAX_TABS = 8;

const noopSubscribe = () => () => {};
function useEmbedded() {
  return useSyncExternalStore(
    noopSubscribe,
    () => document.documentElement.hasAttribute("data-embed"),
    () => false,
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string>("main");
  const pathname = usePathname();
  const embedded = useEmbedded();

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
  const closeTab = (id: string) => {
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
            src={t.href}
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

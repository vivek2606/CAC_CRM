"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import type { SessionUser } from "@/lib/rbac";
import { Sidebar } from "./sidebar";
import { SearchBox } from "./search-box";

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar user={user} open={open} onClose={() => setOpen(false)} />

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          aria-hidden="true"
        />
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-14 flex items-center gap-3 px-4 border-b border-slate-200 bg-white sticky top-0 z-20">
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden text-slate-600 hover:text-slate-900 p-1 -ml-1"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="lg:hidden h-7 w-7 rounded-lg bg-indigo-500 text-white font-bold flex items-center justify-center text-xs">
            S
          </div>
          <span className="lg:hidden font-semibold text-slate-900 text-sm shrink-0">SAKURAGI</span>
          <SearchBox />
        </div>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      title="Sign out"
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
    >
      <LogOut className="h-4 w-4" />
      <span className={compact ? "lg:hidden" : ""}>Sign out</span>
    </button>
  );
}

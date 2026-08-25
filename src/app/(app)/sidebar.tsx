"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Target,
  KanbanSquare,
  Building2,
  Contact,
  CheckSquare,
  BarChart3,
  Package,
  Tags,
  Upload,
  X,
} from "lucide-react";
import type { SessionUser } from "@/lib/rbac";
import { SignOutButton } from "./sign-out-button";
import { initials } from "@/lib/format";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Target },
  { href: "/deals", label: "Pipeline", icon: KanbanSquare },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Contact },
  { href: "/activities", label: "Activities", icon: CheckSquare },
  { href: "/products", label: "Products", icon: Package },
  { href: "/pricelist", label: "Price List", icon: Tags },
];

export function Sidebar({
  user,
  open,
  onClose,
}: {
  user: SessionUser;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={`w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col h-screen
        fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out
        lg:sticky lg:top-0 lg:translate-x-0
        ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className="h-16 flex items-center gap-2 px-5 border-b border-slate-200">
        <div className="h-8 w-8 rounded-lg bg-indigo-500 text-white font-bold flex items-center justify-center text-sm">
          C
        </div>
        <span className="font-semibold text-slate-900">CAC CRM</span>
        <button
          onClick={onClose}
          className="ml-auto lg:hidden text-slate-400 hover:text-slate-700 p-1"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {user.role === "HEAD" && (
          <>
            <div className="pt-4 pb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Management
            </div>
            <Link
              href="/reports"
              onClick={onClose}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                pathname.startsWith("/reports")
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              Team Reports
            </Link>
            <Link
              href="/admin/import"
              onClick={onClose}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                pathname.startsWith("/admin/import")
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Upload className="h-4 w-4" />
              Import Data
            </Link>
          </>
        )}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
            style={{ backgroundColor: user.avatarColor }}
          >
            {initials(user.name ?? "?")}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">
              {user.role === "HEAD" ? "Head of Sales" : "Sales Manager"}
            </p>
          </div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}

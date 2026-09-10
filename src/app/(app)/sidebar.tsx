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
  Upload,
  Users,
  DollarSign,
  TrendingUp,
  PieChart,
  X,
  KeyRound,
} from "lucide-react";
import type { SessionUser } from "@/lib/rbac";
import { SignOutButton } from "./sign-out-button";
import { SakuragiMark } from "@/components/sakuragi-logo";
import { initials } from "@/lib/format";

// Each item keeps one fixed color everywhere it appears (nav icon here,
// active-state accent) rather than cycling hues - color follows what the
// section is, so a rep learns "Leads is blue" once and it stays true.
// Both classes are spelled out as literals (not built at runtime) so
// Tailwind's static scan picks them up.
type NavColor =
  | "indigo"
  | "sky"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "teal"
  | "orange"
  | "fuchsia"
  | "cyan"
  | "lime"
  | "yellow"
  | "pink";

const NAV_COLOR_CLASSES: Record<NavColor, { text: string; bar: string }> = {
  indigo: { text: "text-indigo-500", bar: "bg-indigo-500" },
  sky: { text: "text-sky-500", bar: "bg-sky-500" },
  violet: { text: "text-violet-500", bar: "bg-violet-500" },
  emerald: { text: "text-emerald-500", bar: "bg-emerald-500" },
  amber: { text: "text-amber-500", bar: "bg-amber-500" },
  rose: { text: "text-rose-500", bar: "bg-rose-500" },
  teal: { text: "text-teal-500", bar: "bg-teal-500" },
  orange: { text: "text-orange-500", bar: "bg-orange-500" },
  fuchsia: { text: "text-fuchsia-500", bar: "bg-fuchsia-500" },
  cyan: { text: "text-cyan-500", bar: "bg-cyan-500" },
  lime: { text: "text-lime-500", bar: "bg-lime-500" },
  yellow: { text: "text-yellow-500", bar: "bg-yellow-500" },
  pink: { text: "text-pink-500", bar: "bg-pink-500" },
};

const NAV_ITEMS: { href: string; label: string; icon: typeof LayoutDashboard; color: NavColor }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, color: "indigo" },
  { href: "/leads", label: "Leads", icon: Target, color: "sky" },
  { href: "/deals", label: "Pipeline", icon: KanbanSquare, color: "violet" },
  { href: "/targets", label: "Targets", icon: TrendingUp, color: "emerald" },
  { href: "/accounts", label: "Accounts", icon: Building2, color: "amber" },
  { href: "/contacts", label: "Contacts", icon: Contact, color: "rose" },
  { href: "/activities", label: "Activities", icon: CheckSquare, color: "teal" },
  { href: "/products", label: "Products", icon: Package, color: "orange" },
  { href: "/reports/category", label: "Sales by Category", icon: PieChart, color: "fuchsia" },
];

const MANAGEMENT_NAV_ITEMS: { href: string; label: string; icon: typeof LayoutDashboard; color: NavColor }[] = [
  { href: "/reports", label: "Team Reports", icon: BarChart3, color: "cyan" },
  { href: "/admin/import", label: "Import Data", icon: Upload, color: "lime" },
  { href: "/admin/exchange-rate", label: "Exchange Rate", icon: DollarSign, color: "yellow" },
  { href: "/admin/team", label: "Team & Logins", icon: Users, color: "pink" },
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
      <div className="h-16 flex items-center gap-2 px-5 border-b border-slate-200 bg-gradient-to-r from-indigo-50/70 via-white to-white">
        <SakuragiMark className="h-8 w-8 shrink-0" />
        <span className="font-semibold text-slate-900 tracking-tight">SAKURAGI CRM Pro</span>
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
          const colors = NAV_COLOR_CLASSES[item.color];
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {active && <span className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full ${colors.bar}`} aria-hidden />}
              <Icon className={`h-4 w-4 ${colors.text}`} />
              {item.label}
            </Link>
          );
        })}

        {user.role === "HEAD" && (
          <>
            <div className="pt-4 pb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Management
            </div>
            {MANAGEMENT_NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              const colors = NAV_COLOR_CLASSES[item.color];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {active && <span className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full ${colors.bar}`} aria-hidden />}
                  <Icon className={`h-4 w-4 ${colors.text}`} />
                  {item.label}
                </Link>
              );
            })}
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
        <Link
          href="/account"
          onClick={onClose}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            pathname.startsWith("/account")
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <KeyRound className="h-4 w-4" />
          Change password
        </Link>
        <SignOutButton />
      </div>
    </aside>
  );
}

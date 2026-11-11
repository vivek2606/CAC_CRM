"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Target,
  KanbanSquare,
  Building2,
  BarChart3,
  Package,
  Upload,
  Users,
  DollarSign,
  X,
  KeyRound,
  Boxes,
  ClipboardList,
  BadgePercent,
  Receipt,
  Landmark,
  TableProperties,
  FileText, HeartPulse, Trash2, History, LifeBuoy, CircleHelp, CalendarCheck, Gauge, Star, ShieldCheck, PackageSearch } from "lucide-react";
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
  | "pink"
  | "red"
  | "blue"
  | "purple";

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
  red: { text: "text-red-500", bar: "bg-red-500" },
  blue: { text: "text-blue-500", bar: "bg-blue-500" },
  purple: { text: "text-purple-500", bar: "bg-purple-500" },
};

// The menu, in groups. service: only for those with service access (the
// Head, the Sales Coordinator and the Service Manager). sales: not for the
// Service Manager (no leads, deals or incentives). backOffice: the Head and
// the Sales Coordinator only; headOnly: the Head only.
type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; color: NavColor; service?: boolean; sales?: boolean; backOffice?: boolean; headOnly?: boolean };
const NAV_GROUPS: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, color: "indigo" },
      { href: "/my-day", label: "My Day", icon: CalendarCheck, color: "emerald" },
    ],
  },
  {
    title: "Sell",
    items: [
      { href: "/leads", label: "Leads & Activities", icon: Target, color: "sky", sales: true },
      { href: "/deals", label: "Pipeline", icon: KanbanSquare, color: "violet", sales: true },
      { href: "/quotations", label: "Quotations", icon: FileText, color: "indigo" },
      { href: "/accounts", label: "Accounts & Contacts", icon: Building2, color: "amber" },
      { href: "/project-billing", label: "Project & Service Billing", icon: Receipt, color: "teal", backOffice: true },
    ],
  },
  {
    title: "Stock",
    items: [
      { href: "/products", label: "Products", icon: Package, color: "orange" },
      { href: "/stock", label: "Stock & Pending Orders", icon: Boxes, color: "red" },
      { href: "/stock/sell", label: "Stock to Sell", icon: PackageSearch, color: "emerald", sales: true },
      { href: "/reorder", label: "Reorder Planning", icon: ClipboardList, color: "blue", backOffice: true },
    ],
  },
  { title: "Service", items: [{ href: "/service", label: "Service & Complaints", icon: LifeBuoy, color: "cyan", service: true }] },
  {
    title: "Reports",
    items: [
      { href: "/reports/sales-register", label: "Sales Register", icon: TableProperties, color: "teal" },
      { href: "/reports", label: "Team Reports", icon: BarChart3, color: "cyan", backOffice: true },
      { href: "/feedback", label: "Customer Feedback", icon: Star, color: "amber", sales: true },
      { href: "/standards", label: "Activity Standards", icon: Gauge, color: "lime", sales: true },
      { href: "/incentives", label: "Incentives & Targets", icon: BadgePercent, color: "purple", sales: true },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/admin/import", label: "Import Data", icon: Upload, color: "lime", backOffice: true },
      { href: "/admin/data-health", label: "Data Health", icon: HeartPulse, color: "red", backOffice: true },
      { href: "/admin/recycle-bin", label: "Recycle Bin", icon: Trash2, color: "pink", backOffice: true },
      { href: "/admin/approval-log", label: "Approval Log", icon: ShieldCheck, color: "emerald", headOnly: true },
      { href: "/admin/change-history", label: "Change History", icon: History, color: "sky", headOnly: true },
      { href: "/admin/exchange-rate", label: "Exchange Rate", icon: DollarSign, color: "yellow", headOnly: true },
      { href: "/admin/company", label: "Company Details", icon: Landmark, color: "violet", headOnly: true },
      { href: "/admin/team", label: "Team & Logins", icon: Users, color: "pink", headOnly: true },
    ],
  },
];
const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

// Who sees an item.
function canSee(item: NavItem, user: { role: string; title?: string | null; service?: boolean }): boolean {
  const backOffice = user.role === "HEAD" || user.role === "COORDINATOR";
  if (item.headOnly && user.role !== "HEAD") return false;
  if (item.backOffice && !backOffice) return false;
  if (item.service && !user.service) return false;
  if (item.sales && user.title === "Service Manager") return false;
  return true;
}

function roleLabel(role: string): string {
  return role === "HEAD" ? "Head of Sales" : role === "COORDINATOR" ? "Sales Coordinator" : "Sales Manager";
}

// The menu section a page belongs to: the most specific entry - so
// /reports/sales-register is "Sales Register", not "Team Reports" (/reports).
// Contact pages sit under Accounts & Contacts, activity pages under Leads &
// Activities, targets under Incentives & Targets.
export function sectionFor(pathname: string, role: SessionUser["role"]): { href: string; label: string } | null {
  const path = pathname.split("?")[0];
  const under = (base: string) => path === base || path.startsWith(base + "/");
  const navPath = under("/contacts")
    ? "/accounts"
    : under("/activities")
      ? "/leads"
      : under("/targets")
        ? "/incentives"
        : under("/deals/closed")
          ? "/reports/sales-register"
          : under("/service-billings")
            ? "/project-billing"
            : path;
  const items = ALL_NAV_ITEMS.filter((n) => (!n.backOffice && !n.headOnly) || role === "HEAD" || (role === "COORDINATOR" && !n.headOnly));
  return (
    items
      .filter((n) => (n.href === "/" ? navPath === "/" : navPath === n.href || navPath.startsWith(n.href + "/")))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}

// Collapsed (icons only) on computer screens - remembered in this browser.
const COLLAPSE_KEY = "sidebar-collapsed";
const COLLAPSE_EVENT = "sidebar-collapse";
function useCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(
    (cb) => {
      window.addEventListener(COLLAPSE_EVENT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(COLLAPSE_EVENT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => {
      try {
        return localStorage.getItem(COLLAPSE_KEY) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const toggle = () => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    } catch {
      // storage blocked - stays as it is
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  };
  return [collapsed, toggle];
}

export function Sidebar({
  user,
  open,
  onClose,
  currentPath,
  onOpenSection,
}: {
  user: SessionUser;
  open: boolean;
  onClose: () => void;
  // The page in the tab being looked at (highlights its section).
  currentPath: string;
  // Opens a section in its own in-app tab (see AppShell).
  onOpenSection: (href: string, label: string) => void;
}) {
  const pathname = usePathname();
  const [collapsed, toggleCollapsed] = useCollapsed();
  // Hidden on computer screens while collapsed (the phone drawer always shows labels).
  const label = collapsed ? "lg:hidden" : "";
  const activeHref = sectionFor(currentPath, user.role)?.href ?? null;
  // A plain click opens the section in its own tab; Ctrl / Cmd / Shift /
  // middle click keep the browser's usual behaviour.
  const openInTab = (href: string, label: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpenSection(href, label);
  };

  return (
    <aside
      className={`app-chrome w-64 ${collapsed ? "lg:w-16" : ""} shrink-0 border-r border-slate-200 bg-white flex flex-col h-screen
        fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out
        lg:sticky lg:top-0 lg:translate-x-0
        ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className={`h-16 flex items-center gap-2 px-5 ${collapsed ? "lg:px-0 lg:justify-center" : ""} border-b border-slate-200 bg-gradient-to-r from-indigo-50/70 via-white to-white`}>
        <SakuragiMark className={`h-8 w-8 shrink-0 ${collapsed ? "lg:hidden" : ""}`} />
        <span className={`font-semibold text-slate-900 tracking-tight ${label}`}>SAKURAGI CRM Pro</span>
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`hidden lg:inline-flex ${collapsed ? "" : "ml-auto"} rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700`}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          title={collapsed ? "Expand menu" : "Collapse menu"}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
        <button
          onClick={onClose}
          className="ml-auto lg:hidden text-slate-400 hover:text-slate-700 p-1"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className={`flex-1 overflow-y-auto py-4 px-3 ${collapsed ? "lg:px-2" : ""} space-y-1`}>
        {NAV_GROUPS.map((group) => {
          const visible = group.items.filter((item) => canSee(item, user));
          if (!visible.length) return null;
          return (
            <div key={group.title ?? "top"} className="space-y-1">
              {group.title && (
                <>
                  <div className={`pt-4 pb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400 ${label}`}>{group.title}</div>
                  {collapsed && <div className="hidden lg:block my-3 border-t border-slate-200" />}
                </>
              )}
              {visible.map((item) => {
                const active = item.href === activeHref;
                const Icon = item.icon;
                const colors = NAV_COLOR_CLASSES[item.color];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={openInTab(item.href, item.label)}
                    title={item.label}
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-2 ${collapsed ? "lg:justify-center lg:px-0" : ""} text-sm font-medium transition-colors ${
                      active ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {active && <span className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full ${colors.bar}`} aria-hidden />}
                    <Icon className={`h-4 w-4 shrink-0 ${colors.text}`} />
                    <span className={label}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className={`border-t border-slate-200 p-3 ${collapsed ? "lg:p-2" : ""}`}>
        <div className={`flex items-center gap-3 px-2 py-2 ${collapsed ? "lg:justify-center lg:px-0" : ""}`} title={collapsed ? user.name ?? undefined : undefined}>
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
            style={{ backgroundColor: user.avatarColor }}
          >
            {initials(user.name ?? "?")}
          </div>
          <div className={`min-w-0 ${label}`}>
            <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">
              {user.title || roleLabel(user.role)}
            </p>
          </div>
        </div>
        <Link
          href="/help"
          onClick={onClose}
          title="Help & user guide"
          className={`flex items-center gap-2 rounded-lg px-3 py-2 ${collapsed ? "lg:justify-center lg:px-0" : ""} text-sm transition-colors ${
            pathname.startsWith("/help")
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <CircleHelp className="h-4 w-4 shrink-0" />
          <span className={label}>Help & user guide</span>
        </Link>
        <Link
          href="/account"
          onClick={onClose}
          title="Change password"
          className={`flex items-center gap-2 rounded-lg px-3 py-2 ${collapsed ? "lg:justify-center lg:px-0" : ""} text-sm transition-colors ${
            pathname.startsWith("/account")
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <KeyRound className="h-4 w-4 shrink-0" />
          <span className={label}>Change password</span>
        </Link>
        <SignOutButton compact={collapsed} />
      </div>
    </aside>
  );
}

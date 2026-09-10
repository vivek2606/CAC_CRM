import Link from "next/link";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-b border-slate-200 bg-white px-4 sm:px-6 py-4 sm:py-5 flex flex-wrap items-center justify-between gap-3 sm:gap-4 sticky top-14 z-10">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function NewButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3.5 py-2 transition-colors"
    >
      <Plus className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50 ${className}`}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  bg = "bg-slate-100",
  text = "text-slate-700",
}: {
  children: ReactNode;
  bg?: string;
  text?: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${bg} ${text}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
    </div>
  );
}

export type StatAccent = "indigo" | "emerald" | "violet" | "sky" | "amber" | "rose" | "slate";

const STAT_ACCENT_CHIP: Record<StatAccent, string> = {
  indigo: "bg-indigo-50",
  emerald: "bg-emerald-50",
  violet: "bg-violet-50",
  sky: "bg-sky-50",
  amber: "bg-amber-50",
  rose: "bg-rose-50",
  slate: "bg-slate-100",
};

const STAT_ACCENT_BAR: Record<StatAccent, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-300",
};

export function StatCard({
  label,
  value,
  sub,
  icon,
  chart,
  accent = "slate",
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  icon?: ReactNode;
  // Optional sparkline/mini-chart rendered below the sub-caption, for a
  // stat that also has a trend worth showing at a glance.
  chart?: ReactNode;
  // Ties the icon chip's color to what the stat means (growth = emerald,
  // pipeline = indigo, etc.) rather than decorating cards with arbitrary
  // hues - color still follows the entity, not a cycled palette.
  accent?: StatAccent;
}) {
  return (
    <Card className="relative overflow-hidden p-4">
      <span className={`absolute inset-x-0 top-0 h-0.5 ${STAT_ACCENT_BAR[accent]}`} aria-hidden />
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        {icon && (
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${STAT_ACCENT_CHIP[accent]}`}>
            {icon}
          </span>
        )}
      </div>
      <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      {chart && <div className="-mx-1 -mb-1 mt-2">{chart}</div>}
    </Card>
  );
}

export function Avatar({ name, color, size = 8 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className={`h-${size} w-${size} rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0`}
      style={{ backgroundColor: color, width: size * 4, height: size * 4 }}
    >
      {initials}
    </div>
  );
}

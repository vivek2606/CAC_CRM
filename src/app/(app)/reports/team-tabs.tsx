import Link from "next/link";
import { LayoutDashboard, Plus } from "lucide-react";
import type { StudioView } from "@/components/chart-studio/studio";

// Team Reports' tabs: the standard Overview, then the user's own chart /
// table tabs, then "New tab".
export function TeamTabs({ tabs, active }: { tabs: StudioView[]; active: string }) {
  const tab = (href: string, on: boolean, children: React.ReactNode) => (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium ${on ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
    >
      {children}
    </Link>
  );
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-6">
      {tab(
        "/reports",
        active === "overview",
        <>
          <LayoutDashboard className="h-4 w-4" />
          Overview
        </>,
      )}
      {tabs.map((t) => (
        <span key={t.id}>{tab(`/reports?tab=${t.id}`, active === t.id, t.name)}</span>
      ))}
      {tab(
        "/reports?tab=new",
        active === "new",
        <>
          <Plus className="h-4 w-4" />
          New tab
        </>,
      )}
    </div>
  );
}

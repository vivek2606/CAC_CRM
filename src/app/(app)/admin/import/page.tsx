import Link from "next/link";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { FileSpreadsheet, Target, ChevronRight, TrendingUp, Tags } from "lucide-react";

const IMPORTS = [
  {
    href: "/admin/import/sales-register",
    icon: FileSpreadsheet,
    title: "Sales Register",
    description: "Orion ERP historical sales export — accounts, products, price history, and Won deals.",
  },
  {
    href: "/admin/import/leads",
    icon: Target,
    title: "Leads",
    description: "The Excel sheet used to track hot/warm/cold leads.",
  },
  {
    href: "/admin/import/targets",
    icon: TrendingUp,
    title: "Monthly Targets",
    description: "Set each sales rep's sales target for one or more months from a sheet.",
  },
  {
    href: "/admin/import/price-master",
    icon: Tags,
    title: "Price Master",
    description: "Upload the dealer price list for a given month, and set that month's exchange rate.",
  },
];

export default async function ImportHubPage() {
  await requireHead();

  return (
    <div>
      <PageHeader title="Import Data" description="Bring in data from your existing spreadsheets" />
      <div className="p-6 space-y-3 max-w-2xl">
        {IMPORTS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <Card className="p-5 flex items-center gap-4 hover:border-indigo-300 transition-colors">
                <div className="h-10 w-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-slate-900">{item.title}</h2>
                  <p className="text-sm text-slate-500">{item.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 shrink-0" />
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

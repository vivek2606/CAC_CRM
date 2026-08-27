import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { RateForm } from "./rate-form";
import { ImportForm } from "./import-form";

export const maxDuration = 60;

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function ImportPriceMasterPage() {
  await requireHead();

  const recentRates = await prisma.monthlyExchangeRate.findMany({
    orderBy: { month: "desc" },
    take: 6,
  });

  return (
    <div>
      <PageHeader
        title="Price Master & Exchange Rate"
        description="Set the month's exchange rate, then upload that month's dealer price list"
        action={
          <Link href="/admin/import" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← All imports
          </Link>
        }
      />
      <div className="p-6 space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">1. Set this month&apos;s exchange rate</h2>
          <p className="text-xs text-slate-500 mb-4">
            Used to compute Landed Price (Dealer Price × Rate) for every product priced this month. Do this before uploading the price list below.
          </p>
          <RateForm />
          {recentRates.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {recentRates.map((r) => (
                <span key={r.id} className="text-xs bg-slate-50 border border-slate-200 rounded-full px-3 py-1 text-slate-600">
                  {monthLabel(r.month)}: ₦{r.rate.toLocaleString()}
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">2. Upload the price sheet</h2>
          <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside mb-4">
            <li>
              Columns required: <strong>Product Code</strong>, <strong>Category</strong>, <strong>Sub-Category</strong>,{" "}
              <strong>Model</strong>, <strong>Dealer Price</strong>. Brand and Capacity (kW) are optional — Brand defaults to Midea.
            </li>
            <li>Dealer Price should be in USD; Landed Price is calculated automatically using the rate set above.</li>
            <li>Products are matched by Product Code — a known code updates that product&apos;s details, a new one is created.</li>
            <li>Safe to re-run — re-uploading for the same month replaces that month&apos;s prices instead of duplicating them.</li>
          </ul>
          <ImportForm />
        </Card>
      </div>
    </div>
  );
}

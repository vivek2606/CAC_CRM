import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { RateForm } from "./rate-form";

export default async function ExchangeRatePage() {
  await requireHead();

  const recentRates = await prisma.monthlyExchangeRate.findMany({
    orderBy: { month: "desc" },
    take: 12,
  });

  return (
    <div>
      <PageHeader
        title="Exchange Rate"
        description="Naira-to-USD rate used to convert sales into USD for growth reporting"
      />
      <div className="p-6 space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Set a month&apos;s rate</h2>
          <p className="text-xs text-slate-500 mb-4">
            Enter this at the start of a month for the month just closed, so that month&apos;s Naira sales can be
            compared in USD terms against previous years and months. This has no effect on product pricing or
            stock costing - those stay in Naira everywhere else in the app.
          </p>
          <RateForm />
          {recentRates.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {recentRates.map((r) => (
                <span
                  key={r.id}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-full px-3 py-1 text-slate-600"
                >
                  {new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
                    r.month
                  )}
                  : ₦{formatNumber(r.rate)}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

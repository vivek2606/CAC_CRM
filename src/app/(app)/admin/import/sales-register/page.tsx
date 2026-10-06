import Link from "next/link";
import { requireBackOffice } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { ImportForm } from "./import-form";

export const maxDuration = 60;

export default async function ImportPage() {
  await requireBackOffice();
  // Default "Import up to": the month before the first Won deal entered in
  // the CRM (imported deals carry a register Txn No; CRM ones don't).
  const firstCrmWon = await prisma.deal.findFirst({
    where: { stage: "WON", sourceTxnNo: null, closedAt: { not: null } },
    orderBy: { closedAt: "asc" },
    select: { closedAt: true },
  });
  const crmFrom = firstCrmWon?.closedAt
    ? new Date(Date.UTC(firstCrmWon.closedAt.getUTCFullYear(), firstCrmWon.closedAt.getUTCMonth(), 1))
    : null;
  const lastRegisterMonth = crmFrom ? new Date(Date.UTC(crmFrom.getUTCFullYear(), crmFrom.getUTCMonth() - 1, 1)) : null;
  const defaultUpTo = lastRegisterMonth
    ? `${lastRegisterMonth.getUTCFullYear()}-${String(lastRegisterMonth.getUTCMonth() + 1).padStart(2, "0")}`
    : "";
  const crmFromLabel = crmFrom?.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) ?? null;

  return (
    <div>
      <PageHeader
        title="Import Sales Register"
        description="Historical data import from the Orion ERP export"
        action={
          <div className="flex items-center gap-4">
            <Link href="/admin/import/sales-register/reconcile" className="text-sm text-indigo-600 hover:text-indigo-700">
              Reconcile sales totals →
            </Link>
            <Link href="/admin/import" className="text-sm text-indigo-600 hover:text-indigo-700">
              ← All imports
            </Link>
          </div>
        }
      />
      <div className="p-6 space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Before you upload</h2>
          <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside">
            <li>Upload the Sales Register .xlsx file exactly as exported from Orion ERP.</li>
            <li>
              This creates customer accounts, the product catalog, and Won deals dated back to when they actually
              closed, each broken down into its product-level line items (item code, category, quantity, rate,
              value) - visible on the deal&apos;s own page.
            </li>
            <li>
              This never sets a product&apos;s current dealer price - that only ever comes from a Stock &amp;
              Price List upload or a manually-added price. A product known only from historical sales, with no
              price entry of its own, won&apos;t show up when a rep searches for it to quote.
            </li>
            <li>
              The file&apos;s Exchange Rate column sets that month&apos;s Naira-to-USD rate automatically (averaged
              if it varies row to row) — this is now the only place exchange rate comes from for months covered
              by a Sales Register file.
            </li>
            <li>
              Project &amp; Service lines, and everything invoiced under the Service Manager, are kept out of product
              sales, stock and the category report. Under a sales person they are saved as project billing and count toward
              their target and incentive; under the Service Manager they show as service billing.
            </li>
            <li>
              Return/credit-note lines (negative Qty and Net Amt) are netted into the affected product&apos;s
              quantity and value, rather than dropped. A return raised as its own invoice is recorded as a
              negative &quot;Return&quot; entry, so sales totals are net of returns.
            </li>
            <li>
              Safe to re-run on the same file — already-imported records are skipped, not duplicated. Uploading a
              newer extract updates each customer&apos;s code to the most recent one in the file.
            </li>
            <li>
              To correct a register uploaded earlier, tick <span className="font-medium">Replace existing data</span>{" "}
              and upload the corrected file. Set <span className="font-medium">Import rows up to</span> to the last month
              billed from the register - months whose deals are entered in the CRM are then left out of the file
              (otherwise the upload is refused, so nothing is counted twice).
            </li>
            <li>This can take a minute for a large file. Don&apos;t close the tab while it&apos;s running.</li>
          </ul>
        </Card>
        <Card className="p-6">
          <ImportForm defaultUpTo={defaultUpTo} crmFromLabel={crmFromLabel} />
        </Card>
      </div>
    </div>
  );
}

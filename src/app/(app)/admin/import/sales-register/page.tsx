import Link from "next/link";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ImportForm } from "./import-form";

export const maxDuration = 60;

export default async function ImportPage() {
  await requireHead();

  return (
    <div>
      <PageHeader
        title="Import Sales Register"
        description="One-time historical data import from the Orion ERP export"
        action={
          <Link href="/admin/import" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← All imports
          </Link>
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
            <li>Installation/service billing lines are excluded automatically.</li>
            <li>
              Return/credit-note lines (negative Qty and Net Amt) are netted into the affected product&apos;s
              quantity and value, rather than dropped - a transaction whose rows net to zero or below just
              doesn&apos;t become a Won deal on its own.
            </li>
            <li>
              Safe to re-run on the same file — already-imported records are skipped, not duplicated. Uploading a
              newer extract updates each customer&apos;s code to the most recent one in the file.
            </li>
            <li>This can take a minute for a large file. Don&apos;t close the tab while it&apos;s running.</li>
          </ul>
        </Card>
        <Card className="p-6">
          <ImportForm />
        </Card>
      </div>
    </div>
  );
}

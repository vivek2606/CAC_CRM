import Link from "next/link";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ImportForm } from "./import-form";

export const maxDuration = 60;

export default async function ImportPricelistPage() {
  await requireHead();

  return (
    <div>
      <PageHeader
        title="Stock & Price List"
        description="Upload the current available-stock price sheet"
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
            <li>
              Columns required: <strong>PRODUCT CODE</strong>, <strong>MODEL</strong>, <strong>CATEGORY</strong> and{" "}
              <strong>Quantity</strong>. Optional: <strong>Dealer&apos;s Price</strong>, <strong>Landed Cost</strong> and{" "}
              <strong>MONTH</strong> - leave them out for a quantities-only opening stock.
            </li>
            <li>
              Landed Cost and Dealer&apos;s Price are both taken as-is in Naira, excluding VAT @ 7.5%. A row without a
              Dealer&apos;s Price keeps the item&apos;s current price; a priced row with no MONTH is filed under the opening
              stock date&apos;s month.
            </li>
            <li>Products are matched by Product Code — a known code updates that product; a new one is created.</li>
            <li>
              This file should list every item currently available, with its quantity — anything not in this file
              is treated as out of stock as of the date you pick below, even if a previous upload had a quantity for
              it.
            </li>
            <li>
              &quot;Opening stock at the start of&quot; is the first day these quantities apply - count before that
              day&apos;s billing. Every billing (Sales Register or a deal won in the CRM) and every arrival dated on or
              after it adjusts the quantity from there.
            </li>
            <li>Safe to re-run for prices — re-uploading for the same MONTH replaces that month&apos;s prices instead of duplicating them. Stock is always fully replaced by the latest upload.</li>
          </ul>
        </Card>
        <Card className="p-6">
          <ImportForm />
        </Card>
      </div>
    </div>
  );
}

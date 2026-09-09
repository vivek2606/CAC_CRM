import Link from "next/link";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ImportForm } from "./import-form";

export const maxDuration = 60;

export default async function ImportPriceMasterPage() {
  await requireHead();

  return (
    <div>
      <PageHeader
        title="Price Master"
        description="Upload that month's dealer price list, in USD"
        action={
          <Link href="/admin/import" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← All imports
          </Link>
        }
      />
      <div className="p-6 space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Upload the price sheet</h2>
          <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside mb-4">
            <li>
              Columns required: <strong>Product Code</strong>, <strong>Category</strong>, <strong>Sub-Category</strong>,{" "}
              <strong>Model</strong>, <strong>Dealer Price</strong>. Brand and Capacity (kW) are optional — Brand defaults to Midea.
            </li>
            <li>
              Dealer Price should be in USD; Landed Price is calculated automatically using that month&apos;s
              exchange rate - picked up from a Sales Register upload, or set manually on the Exchange Rate page if
              this month didn&apos;t have one.
            </li>
            <li>Products are matched by Product Code — a known code updates that product&apos;s details, a new one is created.</li>
            <li>Safe to re-run — re-uploading for the same month replaces that month&apos;s prices instead of duplicating them.</li>
          </ul>
          <ImportForm />
        </Card>
      </div>
    </div>
  );
}

import Link from "next/link";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { UpdateForm } from "./update-form";

export const maxDuration = 60;

export default async function WonDealsUpdatePage() {
  await requireHead();

  return (
    <div>
      <PageHeader
        title="Update Won Deals"
        description="Correct won deals in bulk from a sheet - visible to you only"
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
              Columns: <strong>Lead Date</strong>, <strong>Conversion Date</strong>, <strong>Won Date</strong>, <strong>Invoice No</strong>,{" "}
              <strong>Customer Code</strong>, <strong>Company</strong>, <strong>Product</strong> (item code or model), <strong>Quantity</strong>,{" "}
              <strong>Rate</strong> (excl. VAT), <strong>Sales Person</strong>.{" "}
              <a href="/admin/import/won-deals/template" className="text-indigo-600 hover:underline">
                Download the template
              </a>
              .
            </li>
            <li>One row per product on an invoice. Each invoice updates the won deal that has that invoice no.</li>
            <li>A blank cell leaves that detail as it is. When an invoice has products, they replace the deal&apos;s products and value.</li>
            <li>Lead date goes on the lead the deal came from (a converted lead is added if there is none). Conversion date is the deal&apos;s &quot;converted to deal on&quot; date.</li>
            <li>Invoices with no won deal, or from the Sales Register import, are listed and left alone - nothing new is created.</li>
            <li>
              <strong>Check</strong> shows every change first; nothing is saved until you press <strong>Apply</strong>. Each change is recorded in the deal&apos;s history.
            </li>
          </ul>
        </Card>
        <Card className="p-6">
          <UpdateForm />
        </Card>
      </div>
    </div>
  );
}

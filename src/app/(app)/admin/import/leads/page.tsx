import Link from "next/link";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ImportForm } from "./import-form";

export const maxDuration = 60;

export default async function ImportLeadsPage() {
  await requireHead();

  return (
    <div>
      <PageHeader
        title="Import Leads"
        description="Bulk-upload new leads using the same fields as the New Lead form"
        action={
          <Link href="/admin/import" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← All imports
          </Link>
        }
      />
      <div className="p-6 space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Before you upload</h2>
          <p className="text-sm text-slate-600 mb-3">
            The first row of the .xlsx file must have exactly these column headers, in any order. Only{" "}
            <strong>Lead title</strong>, <strong>Customer name</strong>, <strong>Customer phone</strong>, and{" "}
            <strong>Assigned to</strong> need a value in every row — leave any other cell blank if it doesn&apos;t
            apply.
          </p>
          <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside">
            <li>
              Lead title, Date, Customer name, Company, Estimated value, Status, Winning probability, Budget
              confirmed, Expected purchase timeframe, Source, Equipment type, End-use segment, Competing brand,
              Email, Customer phone, Linked account, Linked contact, Assigned to, Notes.
            </li>
            <li>Status, Source, Equipment type, End-use segment, and Expected purchase timeframe accept the exact same option text shown in the Lead form&apos;s dropdowns (e.g. &quot;Qualified&quot;, &quot;Cold Call&quot;, &quot;Atom Mini VRF&quot;) — anything blank or unrecognized falls back to the form&apos;s own default.</li>
            <li>Budget confirmed accepts Yes/No, left blank for unknown.</li>
            <li>Assigned to must match a rep&apos;s exact name as shown in the CRM — anything that doesn&apos;t match is assigned to you instead and flagged after import.</li>
            <li>Linked account/Linked contact create or match by name; if left blank, the Account is created from Company (or Customer name if no company), and the Contact from Customer name.</li>
            <li>Winning probability accepts 10–100 in steps of 10; anything else is left unspecified.</li>
            <li>Safe to re-run — a row with the same Lead title + Customer phone as before replaces it instead of duplicating it, unless it&apos;s already been converted to a Deal.</li>
          </ul>
        </Card>
        <Card className="p-6">
          <ImportForm />
        </Card>
      </div>
    </div>
  );
}

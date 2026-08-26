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
        description="One-time import from the Hot Leads tracking sheet"
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
            <li>Upload the Hot Leads .xlsx file exactly as maintained today.</li>
            <li>Each row becomes a Lead, with its Account and Contact created or matched by name.</li>
            <li>Hot/Warm/Cold become Qualified, Won becomes Converted, Lost becomes Unqualified.</li>
            <li>Won and Lost rows are not turned into Deals automatically — only their Lead status is set.</li>
            <li>Where the Lead Source column actually named a person, it&apos;s relabeled &quot;Contractor&quot; and the name is kept under Influencer in the notes.</li>
            <li>Project, equipment, site, and the original tracker status are kept in the Lead&apos;s notes.</li>
            <li>Safe to re-run — run the Sales Register import first so the 5 sales reps already exist.</li>
          </ul>
        </Card>
        <Card className="p-6">
          <ImportForm />
        </Card>
      </div>
    </div>
  );
}

import Link from "next/link";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ImportForm } from "./import-form";

export const maxDuration = 60;

export default async function ImportTargetsPage() {
  await requireHead();

  return (
    <div>
      <PageHeader
        title="Import Monthly Targets"
        description="Upload a target sheet to set each sales rep's target for one or more months"
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
            <li>The file needs three columns: <strong>Sales Person</strong>, <strong>Month</strong>, <strong>Target</strong>.</li>
            <li>Month can be written as 2026-08, Aug-2026, August 2026, or 8/2026.</li>
            <li>One row per sales person per month — Target is the full month&apos;s Naira sales value goal.</li>
            <li>Safe to re-run — re-uploading updates a rep&apos;s target for a month instead of duplicating it.</li>
            <li>You can also set or adjust a single rep&apos;s target by hand from the Targets page.</li>
          </ul>
        </Card>
        <Card className="p-6">
          <ImportForm />
        </Card>
      </div>
    </div>
  );
}

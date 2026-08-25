import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ImportForm } from "./import-form";

export const maxDuration = 60;

export default async function ImportPage() {
  await requireHead();

  return (
    <div>
      <PageHeader title="Import Sales Register" description="One-time historical data import from the Orion ERP export" />
      <div className="p-6 space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Before you upload</h2>
          <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside">
            <li>Upload the Sales Register .xlsx file exactly as exported from Orion ERP.</li>
            <li>This creates customer accounts, the product catalog, historical price entries, and Won deals dated back to when they actually closed.</li>
            <li>Installation/service billing lines and return/credit-note lines are excluded automatically.</li>
            <li>Safe to re-run on the same file — already-imported records are skipped, not duplicated.</li>
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

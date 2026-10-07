import Link from "next/link";
import { requireBackOffice } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { findDuplicateGroups } from "@/lib/account-duplicates";
import { MergeGroup } from "./merge-group";

// Head / Sales Coordinator: accounts that look like the same customer, to
// merge into one.
export default async function DuplicateAccountsPage() {
  await requireBackOffice();
  const groups = await findDuplicateGroups();
  return (
    <div>
      <PageHeader
        title="Duplicate accounts"
        description={`${groups.length} possible duplicate${groups.length === 1 ? "" : "s"} - pick the account to keep and merge the rest into it`}
        action={
          <Link href="/accounts" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← Accounts &amp; Contacts
          </Link>
        }
      />
      <div className="p-6 space-y-3">
        <p className="text-xs text-slate-500">
          Matched on the name, ignoring case, punctuation and endings like Ltd / Limited / Nig, and close spellings. Merging moves deals, leads, contacts,
          activities and project billing to the account kept; empty details are filled from the others. The merged names and codes are remembered, so a later
          Sales Register upload doesn&apos;t bring them back. Shared cash-customer accounts aren&apos;t affected.
        </p>
        {groups.length === 0 ? (
          <Card className="p-6">
            <EmptyState title="No duplicates found" description="Every account name looks distinct." />
          </Card>
        ) : (
          groups.map((g) => <MergeGroup key={g.key} group={g} />)
        )}
      </div>
    </div>
  );
}

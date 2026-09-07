import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";
import { PageHeader, NewButton, Card } from "@/components/ui";
import { LEAD_STATUS_LABELS, LEAD_STATUSES } from "@/lib/constants";
import { BulkConvertButton } from "./bulk-convert-button";
import { LeadsTable } from "./leads-table";
import type { LeadStatus } from "@prisma/client";

export const maxDuration = 60;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; owner?: string; q?: string }>;
}) {
  const user = await requireUser();
  const ownerIds = await visibleOwnerIds(user);
  const params = await searchParams;

  const where: {
    ownerId: { in: string[] };
    status?: LeadStatus;
    OR?: { title?: { contains: string }; company?: { contains: string } }[];
  } = {
    ownerId: { in: params.owner ? [params.owner] : ownerIds },
  };
  if (params.status && LEAD_STATUSES.includes(params.status as LeadStatus)) {
    where.status = params.status as LeadStatus;
  }
  if (params.q) {
    where.OR = [{ title: { contains: params.q } }, { company: { contains: params.q } }];
  }

  const [leads, owners] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { name: true, avatarColor: true } } },
    }),
    user.role === "HEAD"
      ? prisma.user.findMany({ where: { role: "SALES_MANAGER" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        title="Leads"
        description={`${leads.length} lead${leads.length === 1 ? "" : "s"}`}
        action={
          <div className="flex items-center gap-2">
            {user.role === "HEAD" && <BulkConvertButton />}
            <NewButton href="/leads/new" label="New Lead" />
          </div>
        }
      />

      <div className="p-6 space-y-4">
        <form className="flex flex-wrap gap-3 items-center" action="/leads">
          <input
            type="text"
            name="q"
            defaultValue={params.q}
            placeholder="Search title or company..."
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {user.role === "HEAD" && (
            <select
              name="owner"
              defaultValue={params.owner ?? ""}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All sales managers</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="submit"
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 transition-colors"
          >
            Filter
          </button>
          {(params.q || params.status || params.owner) && (
            <Link href="/leads" className="text-sm text-slate-500 hover:text-slate-700">
              Clear
            </Link>
          )}
        </form>

        <Card>
          <LeadsTable leads={leads} />
        </Card>
      </div>
    </div>
  );
}

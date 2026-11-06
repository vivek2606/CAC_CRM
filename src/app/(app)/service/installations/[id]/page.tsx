import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireService } from "@/lib/service-access";
import { PageHeader, Card, Badge } from "@/components/ui";
import { INSTALL_LABEL, INSTALL_TONE, installationUnits, type InstallStatus } from "@/lib/installation";
import { ServiceTabs } from "../../service-tabs";
import { InstallationActions } from "./installation-actions-ui";

const dmy = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "-");
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export default async function InstallationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireService();
  const { id } = await params;
  const job = await prisma.installationJob.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      deal: { select: { id: true, title: true, invoiceNo: true, closedAt: true, billingCompany: true, owner: { select: { name: true } } } },
    },
  });
  if (!job) notFound();
  const [units, teams] = await Promise.all([
    installationUnits(job.dealId),
    prisma.installationJob.findMany({ where: { team: { not: null } }, distinct: ["team"], select: { team: true }, take: 100 }),
  ]);
  const st = job.status as InstallStatus;
  const now = new Date();
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex gap-3 py-1 text-sm">
      <dt className="w-36 shrink-0 text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );

  return (
    <div>
      <PageHeader title={`Installation ${job.ref}`} description={job.customerName} />
      <div className="p-6 space-y-5">
        <ServiceTabs active="installations" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <Card className="p-5 lg:col-span-2">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Hand-over</h2>
              <Badge bg={INSTALL_TONE[st].bg} text={INSTALL_TONE[st].text}>
                {INSTALL_LABEL[st]}
              </Badge>
            </div>
            <dl>
              {row("Customer", job.customerName)}
              {row("Site", job.siteAddress ?? "-")}
              {row("Contact", [job.contactName, job.phone].filter(Boolean).join(" · ") || "-")}
              {row(
                "Deal",
                <Link href={`/deals/${job.deal.id}`} className="text-indigo-700 hover:underline">
                  {job.deal.title}
                </Link>,
              )}
              {row("Invoice", job.deal.invoiceNo ? `${job.deal.invoiceNo}${job.deal.billingCompany ? ` (${job.deal.billingCompany})` : ""} · ${dmy(job.deal.closedAt)}` : "-")}
              {row("Sales person", job.deal.owner.name)}
              {row("Handed over", `${dmy(job.createdAt)} by ${job.createdBy.name}`)}
              {row("Preferred date", dmy(job.preferredDate))}
              {job.handoverNotes && row("For the installer", <span className="whitespace-pre-line">{job.handoverNotes}</span>)}
              {row("Scheduled", job.scheduledDate ? `${dmy(job.scheduledDate)}${job.team ? ` · ${job.team}` : ""}` : "-")}
              {job.commissionedAt && row("Commissioned", dmy(job.commissionedAt))}
              {job.cancelReason && row("Cancelled", job.cancelReason)}
            </dl>
            <h3 className="mb-1 mt-4 text-sm font-semibold text-slate-900">Units</h3>
            {units.length === 0 ? (
              <p className="text-sm text-slate-500">No products recorded on the deal.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {units.map((u) => (
                  <li key={u.unitId}>
                    <span className="text-slate-800">
                      {u.qty} × {u.model}
                    </span>
                    {u.serials.some(Boolean) && <span className="text-xs text-slate-500"> · S/N {u.serials.filter(Boolean).join(", ")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5 lg:col-span-3">
            <InstallationActions
              id={job.id}
              status={st}
              scheduledDate={iso(job.scheduledDate) || iso(job.preferredDate)}
              team={job.team ?? ""}
              teams={teams.map((t) => t.team!).filter(Boolean)}
              units={units}
              today={iso(now)}
              details={{ notes: job.notes ?? "", contactName: job.contactName ?? "", phone: job.phone ?? "", siteAddress: job.siteAddress ?? "" }}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

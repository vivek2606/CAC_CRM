import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireService } from "@/lib/service-access";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { ExportCsvButton } from "@/components/export-csv-button";
import { syncInstalledUnits } from "@/lib/installed-base";
import { ServiceTabs } from "../service-tabs";
import { RefreshUnitsButton, UnitRow, AddUnitForm } from "./unit-forms";

// The installed base: every unit sold, its warranty, serial nos. and AMC.
// Warranties ending soon without an AMC are the AMCs to offer.

const DAY = 86400000;
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function InstalledUnitsPage({ searchParams }: { searchParams: Promise<{ q?: string; w?: string; amc?: string }> }) {
  await requireService();
  const sp = await searchParams;
  // First visit: build it from the sales.
  if ((await prisma.installedUnit.count()) === 0) await syncInstalledUnits();
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const in30 = new Date(today.getTime() + 30 * DAY);
  const in60 = new Date(today.getTime() + 60 * DAY);
  const q = sp.q?.trim() ?? "";
  const w = sp.w ?? "";
  const where: Prisma.InstalledUnitWhereInput = {
    ...(w === "in" ? { warrantyUntil: { gte: today } } : {}),
    ...(w === "ending" ? { warrantyUntil: { gte: today, lt: in60 }, amcId: null } : {}),
    ...(w === "expired" ? { OR: [{ warrantyUntil: { lt: today } }, { warrantyUntil: null }] } : {}),
    ...(sp.amc === "yes" ? { amcId: { not: null } } : sp.amc === "no" ? { amcId: null } : {}),
    ...(q
      ? {
          AND: [
            {
              OR: [
                { customerName: { contains: q, mode: "insensitive" } },
                { model: { contains: q, mode: "insensitive" } },
                { invoiceNo: { contains: q, mode: "insensitive" } },
                { serialNos: { has: q } },
                { siteAddress: { contains: q, mode: "insensitive" } },
              ],
            },
          ],
        }
      : {}),
  };
  const [units, total, inWarranty, ending30, ending60, underAmc, accounts] = await Promise.all([
    prisma.installedUnit.findMany({
      where,
      orderBy: w === "ending" ? { warrantyUntil: "asc" } : { invoiceDate: "desc" },
      take: 500,
      include: { amc: { select: { id: true, ref: true, endDate: true, cancelled: true } } },
    }),
    prisma.installedUnit.aggregate({ _sum: { qty: true } }),
    prisma.installedUnit.aggregate({ where: { warrantyUntil: { gte: today } }, _sum: { qty: true } }),
    prisma.installedUnit.aggregate({ where: { warrantyUntil: { gte: today, lt: in30 }, amcId: null }, _sum: { qty: true } }),
    prisma.installedUnit.aggregate({ where: { warrantyUntil: { gte: today, lt: in60 }, amcId: null }, _count: true, _sum: { qty: true } }),
    prisma.installedUnit.aggregate({ where: { amc: { cancelled: false, endDate: { gte: today } } }, _sum: { qty: true } }),
    prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
  ]);
  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
  const n = (x: number | null | undefined) => (x ?? 0).toLocaleString();

  return (
    <div>
      <PageHeader
        title="Installed Units & Warranty"
        description="Every unit sold (from the Sales Register and won deals) - warranty until, serial nos., site and AMC"
        action={<RefreshUnitsButton />}
      />
      <div className="p-6 space-y-5">
        <ServiceTabs active="units" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Units sold" value={n(total._sum.qty)} sub="Installed base on record" accent="indigo" />
          <StatCard label="In warranty" value={n(inWarranty._sum.qty)} sub="Warranty not ended yet" accent="emerald" />
          <StatCard
            label="Warranty ending - offer AMC"
            value={n(ending60._sum.qty)}
            sub={
              <Link href="/service/units?w=ending" className="text-indigo-600 hover:text-indigo-500">
                {n(ending30._sum.qty)} in 30 days · {ending60._count} sales in 60 days →
              </Link>
            }
            accent="amber"
          />
          <StatCard label="Under AMC" value={n(underAmc._sum.qty)} sub="Active contracts" accent="sky" />
        </div>

        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">+ Add a unit by hand (sold before the CRM&apos;s records)</summary>
          <div className="mt-3">
            <AddUnitForm accounts={accounts.map((a) => ({ id: a.id, label: a.code ? `${a.name} (${a.code})` : a.name }))} />
          </div>
        </details>

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <form action="/service/units" className="flex flex-wrap items-end gap-2">
              <input name="q" defaultValue={q} placeholder="Customer, model, invoice, serial no., site" className={`${field} w-72`} />
              <select name="w" defaultValue={w} className={field}>
                <option value="">Any warranty</option>
                <option value="in">In warranty</option>
                <option value="ending">Ending in 60 days, no AMC</option>
                <option value="expired">Warranty ended</option>
              </select>
              <select name="amc" defaultValue={sp.amc ?? ""} className={field}>
                <option value="">AMC or not</option>
                <option value="yes">Under AMC</option>
                <option value="no">No AMC</option>
              </select>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
                Show
              </button>
            </form>
            <span className="ml-auto text-xs text-slate-500">{units.length === 500 ? "First 500 shown - narrow the search" : `${units.length} shown`}</span>
            <ExportCsvButton
              filename="installed-units.csv"
              headers={["Customer", "Model", "Qty", "Invoice", "Invoice date", "Warranty until", "AMC", "Serial nos.", "Site", "Phone"]}
              rows={units.map((u) => [u.customerName, u.model, u.qty, u.invoiceNo ?? "", iso(u.invoiceDate), iso(u.warrantyUntil), u.amc?.ref ?? "", u.serialNos.join(" "), u.siteAddress ?? "", u.phone ?? ""])}
            />
          </div>
          {units.length === 0 ? (
            <EmptyState title="No units" description="Try another search, or Refresh from sales." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3 font-medium">Customer</th>
                    <th className="py-2 pr-3 font-medium">Unit</th>
                    <th className="py-2 pr-3 font-medium">Invoice</th>
                    <th className="py-2 pr-3 font-medium">Warranty</th>
                    <th className="py-2 pr-3 font-medium">AMC</th>
                    <th className="py-2 pr-3 font-medium">Serial nos. / site</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {units.map((u) => (
                    <UnitRow
                      key={u.id}
                      u={{
                        id: u.id,
                        customerName: u.customerName,
                        accountId: u.accountId,
                        dealId: u.dealId,
                        model: u.model,
                        qty: u.qty,
                        invoiceNo: u.invoiceNo,
                        invoiceDate: iso(u.invoiceDate),
                        warrantyUntil: iso(u.warrantyUntil),
                        warrantyMonths: u.warrantyMonths,
                        serialNos: u.serialNos,
                        siteAddress: u.siteAddress ?? "",
                        phone: u.phone ?? "",
                        installedAt: iso(u.installedAt),
                        notes: u.notes ?? "",
                        amc: u.amc ? { id: u.amc.id, ref: u.amc.ref, until: iso(u.amc.endDate), active: !u.amc.cancelled && u.amc.endDate >= today } : null,
                      }}
                      today={iso(today)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import { requireService } from "@/lib/service-access";
import { PageHeader, Card } from "@/components/ui";
import { defaultEnd } from "@/lib/amc";
import { AmcForm, type AmcUnitOption } from "./amc-form";

// A new AMC: opened from a unit ("Offer AMC") it starts with that customer
// and their units not under an AMC; or blank.
export default async function NewAmcPage({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  await requireService();
  const sp = await searchParams;
  const unit = sp.unit ? await prisma.installedUnit.findUnique({ where: { id: sp.unit } }) : null;
  const sameCustomer = unit ? (unit.accountId ? { accountId: unit.accountId } : { customerName: unit.customerName }) : null;
  const [units, accounts] = await Promise.all([
    sameCustomer ? prisma.installedUnit.findMany({ where: sameCustomer, orderBy: { invoiceDate: "desc" }, take: 300 }) : Promise.resolve([]),
    prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
  ]);
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  // An AMC usually starts when the warranty ends.
  const from = unit?.warrantyUntil && unit.warrantyUntil > start ? new Date(unit.warrantyUntil.getTime() + 86400000) : start;
  const options: AmcUnitOption[] = units.map((u) => ({
    id: u.id,
    label: `${u.qty} × ${u.model}${u.invoiceNo ? ` · inv ${u.invoiceNo}` : ""}${u.warrantyUntil ? ` · warranty until ${iso(u.warrantyUntil).split("-").reverse().join("/")}` : ""}${u.serialNos.length ? ` · S/N ${u.serialNos.join(", ")}` : ""}`,
    inAmc: !!u.amcId,
    preselect: !u.amcId,
  }));
  return (
    <div>
      <PageHeader title="New AMC contract" description="The customer, the units covered, period, value and visits a year" />
      <div className="p-6">
        <Card className="p-5">
          <AmcForm
            accounts={accounts.map((a) => ({ id: a.id, label: a.code ? `${a.name} (${a.code})` : a.name }))}
            units={options}
            initial={{
              customerName: unit?.customerName ?? "",
              accountId: unit?.accountId ?? "",
              phone: unit?.phone ?? "",
              siteAddress: unit?.siteAddress ?? "",
              billingCompany: unit?.billingCompany ?? "Sakuragi",
              startDate: iso(from),
              endDate: iso(defaultEnd(from)),
            }}
          />
        </Card>
      </div>
    </div>
  );
}

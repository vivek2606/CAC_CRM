import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { getIncentiveSettings } from "@/lib/incentive";
import { IncentiveSettingsForm } from "./settings-form";

export default async function IncentiveSettingsPage() {
  await requireHead();
  const [stored, users] = await Promise.all([
    getIncentiveSettings(),
    prisma.user.findMany({ where: { isActive: true, role: { not: "HEAD" } }, orderBy: { name: "asc" }, select: { id: true, name: true, title: true } }),
  ]);
  const salesPeople = users.filter((u) => u.title === "Sales Manager").map(({ id, name }) => ({ id, name }));
  // Salary support entries set up by name (e.g. the default) are shown
  // against the matching login, and saved with it.
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const settings = {
    ...stored,
    salarySupport: stored.salarySupport.map((e) =>
      e.userId ? e : { ...e, userId: salesPeople.find((u) => norm(u.name) === norm(e.name))?.id ?? null },
    ),
  };
  return (
    <div>
      <PageHeader
        title="Incentive Scheme"
        description="Rates, split and support staff used to calculate monthly incentives - only you can change these"
        action={
          <Link href="/incentives" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← Incentives
          </Link>
        }
      />
      <div className="p-6">
        <Card className="p-6">
          <IncentiveSettingsForm initial={settings} users={users.map(({ id, name }) => ({ id, name }))} salesPeople={salesPeople} />
        </Card>
      </div>
    </div>
  );
}

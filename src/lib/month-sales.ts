import { prisma } from "@/lib/prisma";

export type PersonSales = { userId: string; name: string; target: number; productSales: number; projectSales: number; sales: number };
export type CategorySales = { category: string; qty: number; value: number };

// This month's sales broken down by sales person (won deals + project
// billing, against target) and by product category (Sales Register product
// lines, plus project / service billing and won deals with no products
// listed). Same figures as Targets and the Sales Register.
export async function getMonthSales(ownerIds: string[], from: Date, to: Date, salesTeamIds: string[]) {
  const owner = { ownerId: { in: ownerIds } };
  const [deals, projects, lines, bare, targets] = await Promise.all([
    prisma.deal.groupBy({ by: ["ownerId"], where: { ...owner, stage: "WON", closedAt: { gte: from, lt: to } }, _sum: { value: true } }),
    prisma.projectBilling.groupBy({ by: ["ownerId"], where: { ...owner, docDate: { gte: from, lt: to } }, _sum: { value: true } }),
    prisma.saleLineItem.findMany({ where: { ...owner, docDate: { gte: from, lt: to } }, select: { qty: true, value: true, product: { select: { category: true } } } }),
    prisma.deal.aggregate({
      where: { ...owner, stage: "WON", sourceTxnNo: null, closedAt: { gte: from, lt: to }, items: { none: {} }, lineItems: { none: {} } },
      _sum: { value: true },
      _count: true,
    }),
    prisma.target.findMany({ where: { userId: { in: ownerIds }, month: from }, select: { userId: true, targetValue: true } }),
  ]);

  const product = new Map(deals.map((d) => [d.ownerId, d._sum.value ?? 0]));
  const project = new Map(projects.map((p) => [p.ownerId, p._sum.value ?? 0]));
  const target = new Map(targets.map((t) => [t.userId, t.targetValue]));
  const ids = [...new Set([...salesTeamIds, ...product.keys(), ...project.keys()])].filter((id) => ownerIds.includes(id));
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const people: PersonSales[] = users
    .map((u) => {
      const p = product.get(u.id) ?? 0;
      const q = project.get(u.id) ?? 0;
      return { userId: u.id, name: u.name, target: target.get(u.id) ?? 0, productSales: p, projectSales: q, sales: p + q };
    })
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));

  const byCat = new Map<string, CategorySales>();
  const add = (category: string, qty: number, value: number) => {
    const c = byCat.get(category) ?? { category, qty: 0, value: 0 };
    c.qty += qty;
    c.value += value;
    byCat.set(category, c);
  };
  for (const l of lines) add(l.product.category, l.qty, l.value);
  const projectTotal = projects.reduce((t, p) => t + (p._sum.value ?? 0), 0);
  if (projectTotal) add("Project & Service", 0, projectTotal);
  if (bare._sum.value) add("No products listed", 0, bare._sum.value);
  const categories = [...byCat.values()].sort((a, b) => b.value - a.value);

  return { people, categories };
}

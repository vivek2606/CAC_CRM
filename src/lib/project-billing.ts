import { prisma } from "@/lib/prisma";

// Project & Service billing (from the Sales Register) counts toward target
// achievement and incentives alongside Won product sales. Returned as raw
// rows so callers can bucket by owner, month or day as they need.
export async function getProjectBillings(
  ownerId: string | { in: string[] } | { notIn: string[] },
  from: Date,
  to: Date,
): Promise<{ ownerId: string; docDate: Date; value: number }[]> {
  return prisma.projectBilling.findMany({
    where: { ownerId, docDate: { gte: from, lt: to } },
    select: { ownerId: true, docDate: true, value: true },
  });
}

export function sumByOwner(rows: { ownerId: string; value: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.ownerId, (map.get(r.ownerId) ?? 0) + r.value);
  return map;
}

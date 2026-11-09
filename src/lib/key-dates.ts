import { prisma } from "@/lib/prisma";
import { daysUntil } from "@/lib/key-dates-shared";

export * from "@/lib/key-dates-shared";

export type KeyDate = { contactId: string; firstName: string; name: string; account: string | null; accountId: string | null; phone: string | null; kind: string; date: Date; daysAway: number; ownerName: string };

const lagosToday = (now: Date) => new Date(now.getTime() + 3600000).toISOString().slice(0, 10);

// Contacts' birthdays and special dates from today to `days` ahead (the
// owners' contacts, or everyone's with null), soonest first.
export async function upcomingKeyDates(ownerIds: string[] | null, days = 3, now = new Date(), accountId?: string): Promise<KeyDate[]> {
  const contacts = await prisma.contact.findMany({
    where: { ...(ownerIds ? { ownerId: { in: ownerIds } } : {}), ...(accountId ? { accountId } : {}), OR: [{ birthday: { not: null } }, { specialDate: { not: null } }] },
    select: {
      id: true, firstName: true, lastName: true, phone: true, whatsappNumber: true, birthday: true, specialDate: true, specialDateLabel: true,
      account: { select: { id: true, name: true } }, owner: { select: { name: true } },
    },
  });
  const today = lagosToday(now);
  const out: KeyDate[] = [];
  for (const c of contacts) {
    const base = {
      contactId: c.id, firstName: c.firstName, name: `${c.firstName} ${c.lastName}`.trim(), account: c.account?.name ?? null, accountId: c.account?.id ?? null,
      phone: c.whatsappNumber ?? c.phone, ownerName: c.owner.name,
    };
    for (const [kind, date] of [["Birthday", c.birthday], [c.specialDateLabel || "Anniversary", c.specialDate]] as const) {
      if (!date) continue;
      const daysAway = daysUntil(date, today);
      if (daysAway <= days) out.push({ ...base, kind, date, daysAway });
    }
  }
  return out.sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name));
}

export const whenLabel = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

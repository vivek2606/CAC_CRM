import { prisma } from "@/lib/prisma";
import { custNameMatchKey } from "@/lib/import/sales-register";
import { similarity } from "@/lib/account-duplicates";

// "This customer is already in the CRM": while a lead or account is being
// entered, the phone no. and company / customer name are checked against
// accounts, contacts, open leads and open deals - so a second sales person
// doesn't start chasing someone else's customer.

export type ExistingMatch = { kind: "account" | "contact" | "lead" | "deal"; id: string; label: string; owner: string; ownerId: string; why: "phone" | "name"; href: string };

// The phone's last 10 digits: 0803 123 4567, +234 803 123 4567 and
// 2348031234567 are the same number.
export function phoneKey(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-10) : null;
}

const sameName = (a: string, b: string) => {
  const x = custNameMatchKey(a);
  const y = custNameMatchKey(b);
  if (x.length < 3 || y.length < 3) return false;
  return x === y || (x.length >= 5 && y.length >= 5 && (x.startsWith(y) || y.startsWith(x))) || similarity(x, y) >= 0.85;
};

export async function findExisting(input: { phone?: string; name?: string; exclude?: { kind: ExistingMatch["kind"]; id: string } }): Promise<ExistingMatch[]> {
  const key = phoneKey(input.phone);
  const name = (input.name ?? "").trim();
  const nameKey = custNameMatchKey(name);
  if (!key && nameKey.length < 3) return [];
  const firstWord = nameKey.split(" ")[0] ?? "";
  const nameLike = firstWord.length >= 3 ? { contains: firstWord, mode: "insensitive" as const } : undefined;
  // Phones are stored as typed (spaces, +234...): compare digits only.
  const phoneIds = async (table: "Account" | "Contact" | "Lead" | "Deal", col: "phone" | "customerPhone") =>
    key
      ? (await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "${table}" WHERE "${col}" IS NOT NULL AND right(regexp_replace("${col}", '\\D', '', 'g'), 10) = $1 LIMIT 50`, key)).map((r) => r.id)
      : [];
  const [accPh, conPh, leadPh, dealPh] = await Promise.all([phoneIds("Account", "phone"), phoneIds("Contact", "phone"), phoneIds("Lead", "phone"), phoneIds("Deal", "customerPhone")]);
  const either = <T>(ids: string[], byName: T[]) => [...(ids.length ? [{ id: { in: ids } }] : []), ...byName];

  const [accounts, contacts, leads, deals] = await Promise.all([
    either(accPh, nameLike ? [{ name: nameLike }] : []).length
      ? prisma.account.findMany({
          where: { OR: either(accPh, nameLike ? [{ name: nameLike }] : []) },
          select: { id: true, name: true, phone: true, ownerId: true, owner: { select: { name: true } } },
          take: 100,
        })
      : [],
    conPh.length
      ? prisma.contact.findMany({ where: { id: { in: conPh } }, select: { id: true, firstName: true, lastName: true, phone: true, ownerId: true, owner: { select: { name: true } }, account: { select: { name: true } } } })
      : [],
    either(leadPh, nameLike ? [{ company: nameLike }, { customerName: nameLike }] : []).length
      ? prisma.lead.findMany({
          where: { status: { notIn: ["CONVERTED", "UNQUALIFIED"] }, OR: either(leadPh, nameLike ? [{ company: nameLike }, { customerName: nameLike }] : []) },
          select: { id: true, title: true, company: true, customerName: true, phone: true, ownerId: true, owner: { select: { name: true } } },
          take: 100,
        })
      : [],
    either(dealPh, nameLike ? [{ customerName: nameLike }] : []).length
      ? prisma.deal.findMany({
          where: { stage: { notIn: ["WON", "LOST"] }, OR: either(dealPh, nameLike ? [{ customerName: nameLike }] : []) },
          select: { id: true, title: true, customerName: true, customerPhone: true, ownerId: true, owner: { select: { name: true } } },
          take: 100,
        })
      : [],
  ]);

  const out: ExistingMatch[] = [];
  const add = (m: ExistingMatch) => {
    if (input.exclude && input.exclude.kind === m.kind && input.exclude.id === m.id) return;
    if (!out.some((x) => x.kind === m.kind && x.id === m.id)) out.push(m);
  };
  const byPhone = (p: string | null) => !!key && phoneKey(p) === key;
  const byName = (...ns: (string | null)[]) => nameKey.length >= 3 && ns.some((n) => n && sameName(n, name));
  for (const a of accounts)
    if (byPhone(a.phone) || byName(a.name)) add({ kind: "account", id: a.id, label: a.name, owner: a.owner.name, ownerId: a.ownerId, why: byPhone(a.phone) ? "phone" : "name", href: `/accounts/${a.id}` });
  for (const c of contacts)
    if (byPhone(c.phone))
      add({ kind: "contact", id: c.id, label: `${c.firstName} ${c.lastName ?? ""}`.trim() + (c.account ? ` (${c.account.name})` : ""), owner: c.owner.name, ownerId: c.ownerId, why: "phone", href: `/contacts/${c.id}` });
  for (const l of leads)
    if (byPhone(l.phone) || byName(l.company, l.customerName)) add({ kind: "lead", id: l.id, label: l.title, owner: l.owner.name, ownerId: l.ownerId, why: byPhone(l.phone) ? "phone" : "name", href: `/leads/${l.id}` });
  for (const d of deals)
    if (byPhone(d.customerPhone) || byName(d.customerName)) add({ kind: "deal", id: d.id, label: d.title, owner: d.owner.name, ownerId: d.ownerId, why: byPhone(d.customerPhone) ? "phone" : "name", href: `/deals/${d.id}` });
  // Phone matches first - they're the surest.
  return out.sort((a, b) => (a.why === b.why ? 0 : a.why === "phone" ? -1 : 1)).slice(0, 8);
}

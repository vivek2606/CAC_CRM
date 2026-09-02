"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds } from "@/lib/rbac";

export type SearchResults = {
  leads: { id: string; title: string; company: string | null }[];
  accounts: { id: string; name: string; city: string | null }[];
  contacts: { id: string; name: string; jobTitle: string | null }[];
  deals: { id: string; title: string; stage: string }[];
};

const EMPTY: SearchResults = { leads: [], accounts: [], contacts: [], deals: [] };

export async function searchAll(query: string): Promise<SearchResults> {
  const user = await requireUser();
  const q = query.trim();
  if (q.length < 2) return EMPTY;

  const ownerIds = await visibleOwnerIds(user);
  const insensitive = { contains: q, mode: "insensitive" as const };

  const [leads, accounts, contacts, deals] = await Promise.all([
    prisma.lead.findMany({
      where: {
        ownerId: { in: ownerIds },
        OR: [{ title: insensitive }, { company: insensitive }, { customerName: insensitive }],
      },
      select: { id: true, title: true, company: true },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.account.findMany({
      where: { ownerId: { in: ownerIds }, name: insensitive },
      select: { id: true, name: true, city: true },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.contact.findMany({
      where: { ownerId: { in: ownerIds }, OR: [{ firstName: insensitive }, { lastName: insensitive }] },
      select: { id: true, firstName: true, lastName: true, jobTitle: true },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.deal.findMany({
      where: { ownerId: { in: ownerIds }, OR: [{ title: insensitive }, { customerName: insensitive }] },
      select: { id: true, title: true, stage: true },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    leads: leads.map((l) => ({ id: l.id, title: l.title, company: l.company })),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, city: a.city })),
    contacts: contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, jobTitle: c.jobTitle })),
    deals: deals.map((d) => ({ id: d.id, title: d.title, stage: d.stage })),
  };
}

"use server";

import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { parseLeadsRegisterBuffer } from "@/lib/import/parse-leads-register";
import { transformLeadsRegister, aliasedAwayDisplayNames } from "@/lib/import/leads-register";
import { lookupRosterEntry } from "@/lib/import/roster";

export type ImportSummary = {
  accountsCreated: number;
  contactsCreated: number;
  leadsCreated: number;
  leadsReplaced: number;
  totalLeadValue: number;
  hotCount: number;
  warmCount: number;
  coldCount: number;
  wonCount: number;
  lostCount: number;
  unresolvedOwners: string[];
  skippedFileRows: number;
};

export type ImportState = { error?: string; summary?: ImportSummary };

export async function importLeadsRegister(
  _prevState: ImportState | undefined,
  formData: FormData
): Promise<ImportState> {
  const head = await requireHead();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  let rows: Awaited<ReturnType<typeof parseLeadsRegisterBuffer>>["rows"];
  let skippedFileRows = 0;
  try {
    const buffer = await file.arrayBuffer();
    const parsed = await parseLeadsRegisterBuffer(buffer);
    rows = parsed.rows;
    skippedFileRows = parsed.skippedRows;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the uploaded file." };
  }

  if (rows.length === 0) {
    return { error: "No usable rows found in the file." };
  }

  const result = transformLeadsRegister(rows);

  // Re-running this import replaces its own previously-imported rows (rather
  // than duplicating them), so it's always safe to re-upload the same or an
  // updated file.
  const { count: leadsReplaced } = await prisma.lead.deleteMany({
    where: { importKey: { startsWith: "leadsheet:" } },
  });
  await prisma.contact.deleteMany({ where: { importKey: { startsWith: "leadsheet:contact:" } } });

  // Resolve each ownerKey (a roster-normalized rep name) to a real User id.
  const uniqueOwnerKeys = Array.from(new Set(result.leads.map((l) => l.ownerKey)));
  const ownerEmailByKey = new Map<string, string>();
  for (const key of uniqueOwnerKeys) {
    const roster = lookupRosterEntry(key);
    if (roster?.active && roster.email) ownerEmailByKey.set(key, roster.email);
  }
  const ownerUsers = await prisma.user.findMany({
    where: { email: { in: Array.from(ownerEmailByKey.values()) } },
    select: { id: true, email: true },
  });
  const userIdByEmail = new Map(ownerUsers.map((u) => [u.email, u.id]));
  const unresolvedOwners: string[] = [];
  const ownerIdByKey = new Map<string, string>();
  for (const key of uniqueOwnerKeys) {
    const email = ownerEmailByKey.get(key);
    const id = email ? userIdByEmail.get(email) : undefined;
    if (id) {
      ownerIdByKey.set(key, id);
    } else {
      unresolvedOwners.push(key);
      ownerIdByKey.set(key, head.id);
    }
  }

  // Accounts: dedupe against every existing account by case-insensitive name.
  const existingAccounts = await prisma.account.findMany({ select: { id: true, name: true } });
  const accountIdByNormalizedName = new Map(
    existingAccounts.map((a) => [a.name.trim().toLowerCase(), a.id])
  );
  const newAccounts = result.accounts.filter(
    (a) => !accountIdByNormalizedName.has(a.name.trim().toLowerCase())
  );
  if (newAccounts.length > 0) {
    await prisma.account.createMany({
      data: newAccounts.map((a) => ({
        name: a.name,
        ownerId: ownerIdByKey.get(a.ownerKey) ?? head.id,
      })),
    });
    const created = await prisma.account.findMany({
      where: { name: { in: newAccounts.map((a) => a.name) } },
      select: { id: true, name: true },
    });
    for (const a of created) accountIdByNormalizedName.set(a.name.trim().toLowerCase(), a.id);
  }
  const accountIdByName = new Map(
    result.accounts.map((a) => [a.name, accountIdByNormalizedName.get(a.name.trim().toLowerCase())!])
  );

  // Clean up any leftover duplicate account left behind under a pre-merge
  // name from an earlier run of this import, now that it's unused.
  const staleNames = aliasedAwayDisplayNames();
  if (staleNames.length > 0) {
    const staleAccounts = await prisma.account.findMany({
      where: { name: { in: staleNames } },
      include: {
        _count: { select: { contacts: true, leads: true, deals: true } },
      },
    });
    for (const a of staleAccounts) {
      const c = a._count;
      if (c.contacts + c.leads + c.deals === 0) {
        await prisma.account.delete({ where: { id: a.id } });
      }
    }
  }

  // Contacts: one per (account, contact person) pair in this file, owned by the lead's rep.
  const contactOwnerByKey = new Map<string, string>();
  for (const lead of result.leads) {
    if (!contactOwnerByKey.has(lead.contactKey)) {
      contactOwnerByKey.set(lead.contactKey, ownerIdByKey.get(lead.ownerKey) ?? head.id);
    }
  }
  const contactCreateData = result.contacts.map((c) => ({
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    ownerId: contactOwnerByKey.get(c.key) ?? head.id,
    accountId: accountIdByName.get(c.accountName) ?? null,
    importKey: c.importKey,
  }));
  const contactsResult =
    contactCreateData.length > 0 ? await prisma.contact.createMany({ data: contactCreateData }) : { count: 0 };

  // Re-fetch to map contactKey -> id (createMany doesn't return rows).
  const dbContacts = await prisma.contact.findMany({
    where: { importKey: { in: result.contacts.map((c) => c.importKey) } },
    select: { id: true, importKey: true },
  });
  const contactIdByImportKey = new Map(dbContacts.map((c) => [c.importKey!, c.id]));
  const contactIdByKey = new Map<string, string>();
  for (const c of result.contacts) {
    const id = contactIdByImportKey.get(c.importKey);
    if (id) contactIdByKey.set(c.key, id);
  }

  // Leads
  const leadCreateData = result.leads.map((l) => ({
    title: l.title,
    status: l.status,
    source: l.source,
    equipmentType: l.equipmentType,
    value: l.value,
    phone: l.phone,
    notes: l.notes,
    ownerId: ownerIdByKey.get(l.ownerKey) ?? head.id,
    accountId: accountIdByName.get(l.accountName) ?? null,
    contactId: contactIdByKey.get(l.contactKey) ?? null,
    importKey: l.importKey,
  }));
  const leadsResult = await prisma.lead.createMany({ data: leadCreateData });

  const totalLeadValue = result.leads.reduce((sum, l) => sum + (l.value ?? 0), 0);

  return {
    summary: {
      accountsCreated: newAccounts.length,
      contactsCreated: contactsResult.count,
      leadsCreated: leadsResult.count,
      leadsReplaced,
      totalLeadValue,
      hotCount: result.leads.filter((l) => l.status === "HOT").length,
      warmCount: result.leads.filter((l) => l.status === "WARM").length,
      coldCount: result.leads.filter((l) => l.status === "COLD").length,
      wonCount: result.leads.filter((l) => l.status === "WON").length,
      lostCount: result.leads.filter((l) => l.status === "LOST").length,
      unresolvedOwners: Array.from(new Set(unresolvedOwners)),
      skippedFileRows,
    },
  };
}

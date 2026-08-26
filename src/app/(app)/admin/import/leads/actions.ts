"use server";

import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { parseLeadsRegisterBuffer } from "@/lib/import/parse-leads-register";
import { transformLeadsRegister } from "@/lib/import/leads-register";
import { lookupRosterEntry } from "@/lib/import/roster";

export type ImportSummary = {
  accountsCreated: number;
  contactsCreated: number;
  leadsCreated: number;
  totalLeadValue: number;
  qualifiedCount: number;
  convertedCount: number;
  unqualifiedCount: number;
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
  }));
  const contactsResult = contactCreateData.length > 0 ? await prisma.contact.createMany({ data: contactCreateData }) : { count: 0 };

  // Re-fetch to map contactKey -> id (createMany doesn't return rows).
  const contactAccountIds = Array.from(new Set(contactCreateData.map((c) => c.accountId).filter((v): v is string => !!v)));
  const dbContacts = await prisma.contact.findMany({
    where: { accountId: { in: contactAccountIds } },
    select: { id: true, firstName: true, lastName: true, accountId: true },
  });
  const contactIdByKey = new Map<string, string>();
  for (const c of result.contacts) {
    const accountId = accountIdByName.get(c.accountName);
    const match = dbContacts.find(
      (d) => d.accountId === accountId && d.firstName === c.firstName && d.lastName === c.lastName
    );
    if (match) contactIdByKey.set(c.key, match.id);
  }

  // Leads
  const leadCreateData = result.leads.map((l) => ({
    title: l.title,
    status: l.status,
    value: l.value,
    phone: l.phone,
    notes: l.notes,
    ownerId: ownerIdByKey.get(l.ownerKey) ?? head.id,
    accountId: accountIdByName.get(l.accountName) ?? null,
    contactId: contactIdByKey.get(l.contactKey) ?? null,
  }));
  const leadsResult = await prisma.lead.createMany({ data: leadCreateData });

  const totalLeadValue = result.leads.reduce((sum, l) => sum + (l.value ?? 0), 0);

  return {
    summary: {
      accountsCreated: newAccounts.length,
      contactsCreated: contactsResult.count,
      leadsCreated: leadsResult.count,
      totalLeadValue,
      qualifiedCount: result.leads.filter((l) => l.status === "QUALIFIED").length,
      convertedCount: result.leads.filter((l) => l.status === "CONVERTED").length,
      unqualifiedCount: result.leads.filter((l) => l.status === "UNQUALIFIED").length,
      unresolvedOwners: Array.from(new Set(unresolvedOwners)),
      skippedFileRows,
    },
  };
}

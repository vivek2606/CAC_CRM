"use server";

import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { parseLeadsRegisterBuffer } from "@/lib/import/parse-leads-register";
import { transformLeadsRegister } from "@/lib/import/leads-register";
import type { LeadStatus } from "@prisma/client";

// Shared by a fresh import (replacing its own previous run) and by
// clearLeadsWithoutNewFile (removing a previous run's data with no fresh
// file to replace it) - same rule either way: a lead already converted to
// a Deal is left alone (deleting it would orphan that Deal), and a contact
// is only removed if it was never actually linked to a Deal (Deal.contactId
// is ON DELETE SET NULL, so a contact still on a Deal only got there via a
// real conversion, not just the import).
async function clearPreviousLeadsImport(): Promise<{ leadsRemoved: number; contactsRemoved: number }> {
  const { count: leadsRemoved } = await prisma.lead.deleteMany({
    where: { importKey: { startsWith: "leadsheet:" }, status: { not: "CONVERTED" } },
  });
  const { count: contactsRemoved } = await prisma.contact.deleteMany({
    where: { importKey: { startsWith: "leadsheet:contact:" }, deals: { none: {} } },
  });
  return { leadsRemoved, contactsRemoved };
}

export type ImportSummary = {
  accountsCreated: number;
  contactsCreated: number;
  leadsCreated: number;
  leadsReplaced: number;
  totalLeadValue: number;
  byStatus: Record<LeadStatus, number>;
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

  // Re-running this import replaces its own previously-imported rows.
  const { leadsRemoved: leadsReplaced } = await clearPreviousLeadsImport();

  // Resolve each ownerKey (the "Assigned to" column, normalized) against the
  // real reps already in the CRM by their display name - not the ERP roster,
  // since this sheet is filled in using the same names shown in the app.
  const allUsers = await prisma.user.findMany({ select: { id: true, name: true } });
  const userIdByNormalizedName = new Map(
    allUsers.map((u) => [u.name.trim().toLowerCase().replace(/\s+/g, " "), u.id])
  );
  const uniqueOwnerKeys = Array.from(new Set(result.leads.map((l) => l.ownerKey)));
  const unresolvedOwners: string[] = [];
  const ownerIdByKey = new Map<string, string>();
  for (const key of uniqueOwnerKeys) {
    const id = userIdByNormalizedName.get(key);
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
    importKey: c.importKey,
  }));
  // skipDuplicates: a contact still linked to a Deal was preserved above and
  // still holds this importKey.
  const contactsResult =
    contactCreateData.length > 0
      ? await prisma.contact.createMany({ data: contactCreateData, skipDuplicates: true })
      : { count: 0 };

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
    customerName: l.customerName,
    company: l.company,
    status: l.status,
    winProbability: l.winProbability,
    source: l.source,
    equipmentType: l.equipmentType,
    endUseSegment: l.endUseSegment,
    competitorBrand: l.competitorBrand,
    budgetConfirmed: l.budgetConfirmed,
    expectedPurchaseTimeframe: l.expectedPurchaseTimeframe,
    value: l.value,
    email: l.email,
    phone: l.phone,
    notes: l.notes,
    ownerId: ownerIdByKey.get(l.ownerKey) ?? head.id,
    accountId: accountIdByName.get(l.accountName) ?? null,
    contactId: contactIdByKey.get(l.contactKey) ?? null,
    importKey: l.importKey,
    ...(l.createdAt ? { createdAt: l.createdAt, updatedAt: l.createdAt } : {}),
  }));
  // skipDuplicates: a lead already converted (and so preserved above,
  // untouched by the delete step) still holds this importKey - don't
  // recreate it as a second, unconverted copy.
  const leadsResult = await prisma.lead.createMany({ data: leadCreateData, skipDuplicates: true });

  const totalLeadValue = result.leads.reduce((sum, l) => sum + (l.value ?? 0), 0);

  return {
    summary: {
      accountsCreated: newAccounts.length,
      contactsCreated: contactsResult.count,
      leadsCreated: leadsResult.count,
      leadsReplaced,
      totalLeadValue,
      byStatus: result.summary.byStatus,
      unresolvedOwners: Array.from(new Set(unresolvedOwners)),
      skippedFileRows,
    },
  };
}

export type ClearLeadsState = { error?: string; summary?: { leadsRemoved: number; contactsRemoved: number } };

// For when a previously-uploaded leads file has been withdrawn and no fresh
// one has replaced it yet - runs the same cleanup a fresh import's own
// "replace my previous run" step would do, without waiting for a new file.
export async function clearLeadsWithoutNewFile(): Promise<ClearLeadsState> {
  await requireHead();
  const summary = await clearPreviousLeadsImport();
  revalidatePath("/leads");
  revalidatePath("/contacts");
  return { summary };
}

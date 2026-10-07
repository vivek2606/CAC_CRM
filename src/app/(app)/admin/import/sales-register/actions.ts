"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { parseSalesRegisterBuffer } from "@/lib/import/parse-sales-register";
import { transformSalesRegister } from "@/lib/import/sales-register";
import { MANUAL_PREFIX, UPLOAD_PREFIX } from "@/lib/project-billing";

const DEMO_EMAILS = [
  "priya@caccrm.com",
  "rohan@caccrm.com",
  "ananya@caccrm.com",
  "karan@caccrm.com",
  "sneha@caccrm.com",
  "vikram@caccrm.com",
];

const AVATAR_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444", "#0ea5e9"];

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function randomPassword(): string {
  return crypto.randomBytes(6).toString("base64url");
}

export type ImportSummary = {
  accountsCreated: number;
  accountsUpdated: number;
  productsCreated: number;
  activeUsers: { name: string; email: string; tempPassword: string }[];
  inactiveUsersCreated: number;
  dealsCreated: number;
  dealsUpdated: number;
  dealsRemoved: number;
  lineItemsCreated: number;
  lineItemsReplaced: number;
  // Set only for a "replace" upload: the months whose imported data was
  // rebuilt from this file, e.g. "Jan 2026 – Aug 2026".
  replacedRange: string | null;
  exchangeRatesSet: number;
  excludedServiceRows: number;
  projectBillingsAdded: number;
  projectBillingValue: number;
  creditNoteRowsNetted: number;
  demoAccountsRemoved: string[];
  totalDealValue: number;
  skippedFileRows: number;
  // "Import up to" month, and how many file rows after it were left out.
  upToLabel: string | null;
  rowsAfterUpTo: number;
};

export type ImportState = { error?: string; summary?: ImportSummary };

export async function importSalesRegister(
  _prevState: ImportState | undefined,
  formData: FormData
): Promise<ImportState> {
  const head = await requireBackOffice();
  const replace = formData.get("replace") === "on";

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  let rows: Awaited<ReturnType<typeof parseSalesRegisterBuffer>>["rows"];
  let skippedFileRows = 0;
  try {
    const buffer = await file.arrayBuffer();
    const parsed = await parseSalesRegisterBuffer(buffer);
    rows = parsed.rows;
    skippedFileRows = parsed.skippedRows;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the uploaded file." };
  }

  if (rows.length === 0) {
    return { error: "No usable rows found in the file." };
  }

  // "Import up to": rows dated after that month are left out, e.g. the
  // months whose sales are now entered in the CRM.
  let upToLabel: string | null = null;
  let rowsAfterUpTo = 0;
  const upTo = String(formData.get("upTo") ?? "").match(/^(\d{4})-(\d{1,2})$/);
  if (upTo) {
    const upToMonth = new Date(Date.UTC(Number(upTo[1]), Number(upTo[2]) - 1, 1));
    const cutoff = new Date(Date.UTC(upToMonth.getUTCFullYear(), upToMonth.getUTCMonth() + 1, 1));
    const before = rows.length;
    rows = rows.filter((r) => r.docDate < cutoff);
    rowsAfterUpTo = before - rows.length;
    upToLabel = monthLabel(upToMonth);
    if (rows.length === 0) return { error: `The file has no rows up to ${upToLabel}.` };
  }

  const result = transformSalesRegister(rows);

  // Replace mode: every month the file touches (first row's month through
  // last row's month) is treated as authoritative - imported deals and line
  // items in that window are corrected to match the file, and ones no
  // longer in it are removed. Months outside the window aren't touched.
  const docTimes = rows.map((r) => r.docDate.getTime());
  const minDate = new Date(Math.min(...docTimes));
  const maxDate = new Date(Math.max(...docTimes));
  const rangeStart = new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), 1));
  const rangeEnd = new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth() + 1, 1));

  // Months with Won deals entered directly in the CRM (e.g. once the team
  // stopped relying on the register) would be counted twice if the file's
  // invoices for those months were imported on top - refuse and say which.
  if (replace) {
    const crmWon = await prisma.deal.findMany({
      where: { stage: "WON", sourceTxnNo: null, closedAt: { gte: rangeStart, lt: rangeEnd } },
      select: { closedAt: true },
    });
    const clashMonths = Array.from(
      new Set(crmWon.map((d) => monthLabel(new Date(Date.UTC(d.closedAt!.getUTCFullYear(), d.closedAt!.getUTCMonth(), 1))))),
    );
    if (clashMonths.length > 0) {
      return {
        error: `This file covers ${monthLabel(rangeStart)} – ${monthLabel(maxDate)}, but ${clashMonths.join(", ")} already ${
          clashMonths.length === 1 ? "has" : "have"
        } Won deals entered in the CRM. Remove those months' rows from the file and upload again, so those sales aren't counted twice.`,
      };
    }
  }

  // Retire the placeholder demo accounts if they don't own anything yet.
  const demoAccountsRemoved: string[] = [];
  const demoUsers = await prisma.user.findMany({
    where: { email: { in: DEMO_EMAILS } },
    include: {
      _count: {
        select: { accounts: true, contacts: true, leads: true, deals: true, activities: true, notes: true },
      },
    },
  });
  for (const u of demoUsers) {
    const c = u._count;
    if (c.accounts + c.contacts + c.leads + c.deals + c.activities + c.notes === 0) {
      await prisma.user.delete({ where: { id: u.id } });
      demoAccountsRemoved.push(u.email);
    }
  }

  // Users (active reps get real random passwords, shown once below; inactive
  // historical records share one unusable password since they can never log in).
  // Only people who don't exist yet get a login created (createMany below
  // skips existing emails), so only they get a temporary password shown -
  // a re-upload must not display passwords that were never actually set.
  const existingUserEmails = new Set(
    (
      await prisma.user.findMany({
        where: { email: { in: result.users.map((u) => u.email) } },
        select: { email: true },
      })
    ).map((u) => u.email),
  );
  const inactivePasswordHash = await bcrypt.hash(crypto.randomUUID(), 10);
  const activeCredentials: { name: string; email: string; tempPassword: string }[] = [];
  const userCreateData = [];
  let colorIdx = 0;
  for (const u of result.users) {
    if (existingUserEmails.has(u.email)) continue;
    let passwordHash: string;
    if (u.isActive) {
      const pwd = randomPassword();
      passwordHash = await bcrypt.hash(pwd, 10);
      activeCredentials.push({ name: u.name, email: u.email, tempPassword: pwd });
    } else {
      passwordHash = inactivePasswordHash;
    }
    userCreateData.push({
      name: u.name,
      email: u.email,
      passwordHash,
      role: "SALES_MANAGER" as const,
      title: u.title,
      avatarColor: AVATAR_COLORS[colorIdx++ % AVATAR_COLORS.length],
      isActive: u.isActive,
      managerId: head.id,
    });
  }
  if (userCreateData.length > 0) {
    await prisma.user.createMany({ data: userCreateData, skipDuplicates: true });
  }

  const dbUsers = await prisma.user.findMany({
    where: { email: { in: result.users.map((u) => u.email) } },
    select: { id: true, email: true },
  });
  const emailByKey = new Map(result.users.map((u) => [u.key, u.email]));
  const userIdByEmail = new Map(dbUsers.map((u) => [u.email, u.id]));
  const userIdByKey = new Map<string, string>();
  for (const [key, email] of emailByKey) {
    const id = userIdByEmail.get(email);
    if (id) userIdByKey.set(key, id);
  }

  // Accounts - upsert by customer name so a repeat import (new transactions
  // for a customer already in the CRM) updates their code/city to this
  // file's most recent value instead of leaving them stale, or - since
  // Account.code is unique - creating a duplicate account under a new code.
  const existingAccounts = await prisma.account.findMany({
    where: { name: { in: result.accounts.map((a) => a.name) } },
    select: { id: true, name: true, code: true, city: true },
  });
  const existingAccountByName = new Map(existingAccounts.map((a) => [a.name, a]));
  // One Cust Code is one account. The transform already bills every row of a
  // shared code (one-time cash customers, name variants) to one name; a code
  // already held by an account under another name links there by the code
  // (see accountIdByCode below) instead of creating a clashing account.
  const codeHolders = await prisma.account.findMany({
    where: { code: { in: result.accounts.map((a) => a.code).filter((c): c is string => !!c) } },
    select: { id: true, code: true, name: true },
  });
  // An account imported earlier under one of a shared code's buyer names
  // (whichever came first took the code) is renamed to the code's account
  // name, e.g. "MR SAMIR" -> "CASH CUSTOMER-CEHA-LAGOS".
  const namesByCode = new Map<string, Set<string>>();
  for (const r of rows) {
    const c = r.custCode.trim();
    if (!c) continue;
    const set = namesByCode.get(c) ?? new Set<string>();
    set.add(r.custName);
    namesByCode.set(c, set);
  }
  for (const a of result.accounts) {
    if (!a.code || existingAccountByName.has(a.name)) continue;
    const holder = codeHolders.find((h) => h.code === a.code);
    if (holder && holder.name !== a.name && namesByCode.get(a.code)?.has(holder.name)) {
      await prisma.account.update({ where: { id: holder.id }, data: { name: a.name } });
      existingAccountByName.set(a.name, { id: holder.id, name: a.name, code: holder.code, city: null });
    }
  }
  const takenCodes = new Set(codeHolders.map((a) => a.code));
  const accountsToCreate = result.accounts.filter((a) => {
    if (existingAccountByName.has(a.name)) return false;
    if (!a.code) return true;
    if (takenCodes.has(a.code)) return false;
    takenCodes.add(a.code);
    return true;
  });
  if (accountsToCreate.length > 0) {
    await prisma.account.createMany({
      data: accountsToCreate.map((a) => ({
        name: a.name,
        code: a.code,
        city: a.city,
        ownerId: userIdByKey.get(a.ownerKey) ?? head.id,
      })),
      skipDuplicates: true,
    });
  }

  let accountsUpdated = 0;
  for (const a of result.accounts) {
    const existing = existingAccountByName.get(a.name);
    // Never blank out a code the account already has.
    const code = a.code ?? existing?.code ?? null;
    if (existing && (existing.code !== code || existing.city !== a.city)) {
      try {
        await prisma.account.update({ where: { id: existing.id }, data: { code, city: a.city } });
        accountsUpdated++;
      } catch {
        // Code collided with a different existing account - leave this one as-is.
      }
    }
  }

  const dbAccounts = await prisma.account.findMany({
    where: {
      OR: [
        { name: { in: result.accounts.map((a) => a.name) } },
        { code: { in: result.deals.map((d) => d.custCode).filter(Boolean) } },
      ],
    },
    select: { id: true, code: true, name: true },
  });
  const accountIdByName = new Map(dbAccounts.map((a) => [a.name, a.id]));
  const accountIdByCode = new Map(dbAccounts.filter((a) => a.code).map((a) => [a.code!, a.id]));

  // Products
  const productCreateData = result.products.map((p) => ({
    code: p.code,
    brand: p.brand,
    category: p.category,
    subCategory: p.subCategory,
    model: p.model,
    capacityKw: p.capacityKw,
  }));
  await prisma.product.createMany({ data: productCreateData, skipDuplicates: true });
  const dbProducts = await prisma.product.findMany({
    where: { code: { in: result.products.map((p) => p.code) } },
    select: { id: true, code: true },
  });
  const productIdByCode = new Map(dbProducts.map((p) => [p.code, p.id]));

  // Deals (one per document - Txn Code + Txn No)
  const fileTxnNos = Array.from(new Set(result.deals.map((d) => d.txnNo)));
  const fileDocKeys = result.deals.map((d) => d.docKey);
  const dealCreateData = result.deals.map((d) => ({
    title: d.title,
    stage: "WON" as const,
    value: d.value,
    probability: 100,
    closedAt: d.closedAt,
    createdAt: d.closedAt,
    updatedAt: d.closedAt,
    ownerId: userIdByKey.get(d.ownerKey) ?? head.id,
    // By name; else by Cust Code (a name billed under a shared code); a
    // name-only account with no code loses to the code's holder.
    accountId:
      (d.custCode && !dbAccounts.some((a) => a.name === d.custName && a.code === d.custCode) ? accountIdByCode.get(d.custCode) : undefined) ??
      accountIdByName.get(d.custName) ??
      null,
    sourceTxnNo: d.txnNo,
    sourceDocKey: d.docKey,
    // The register's Txn No is the invoice no.
    invoiceNo: String(d.txnNo),
  }));

  // Deals imported before documents were keyed by Txn Code + Txn No only
  // carry sourceTxnNo. Adopt each one as the matching document in this file
  // (same Txn No, preferring the same date) instead of creating a duplicate
  // next to it. Where two documents shared that Txn No, the other one is
  // created fresh below.
  const legacyDeals = await prisma.deal.findMany({
    where: { sourceDocKey: null, sourceTxnNo: { in: fileTxnNos } },
    select: { id: true, sourceTxnNo: true, closedAt: true },
  });
  if (legacyDeals.length > 0) {
    const taken = new Set(
      (
        await prisma.deal.findMany({ where: { sourceDocKey: { in: fileDocKeys } }, select: { sourceDocKey: true } })
      ).map((d) => d.sourceDocKey!),
    );
    const docsByTxnNo = new Map<number, typeof result.deals>();
    for (const d of result.deals) {
      const list = docsByTxnNo.get(d.txnNo);
      if (list) list.push(d);
      else docsByTxnNo.set(d.txnNo, [d]);
    }
    const day = (d: Date | null) => d?.toISOString().slice(0, 10);
    const adoptions = [];
    for (const legacy of legacyDeals) {
      const candidates = (docsByTxnNo.get(legacy.sourceTxnNo!) ?? []).filter((d) => !taken.has(d.docKey));
      const match = candidates.find((d) => day(d.closedAt) === day(legacy.closedAt)) ?? candidates[0];
      if (!match) continue;
      taken.add(match.docKey);
      adoptions.push(prisma.deal.update({ where: { id: legacy.id }, data: { sourceDocKey: match.docKey } }));
    }
    for (let i = 0; i < adoptions.length; i += 100) {
      await prisma.$transaction(adoptions.slice(i, i + 100));
    }
  }

  let dealsUpdated = 0;
  let dealsRemoved = 0;
  let lineItemsReplaced = 0;
  if (replace) {
    // Imported line items (never the "deal-item:" ones a pipeline deal won
    // in the CRM writes) in the window, plus any belonging to this file's
    // documents in case a correction moved one across the window edge.
    const existingFileDeals = await prisma.deal.findMany({
      where: { sourceDocKey: { in: fileDocKeys } },
      select: { id: true },
    });
    const deleted = await prisma.saleLineItem.deleteMany({
      where: {
        NOT: { sourceKey: { startsWith: "deal-item:" } },
        OR: [
          { month: { gte: rangeStart, lt: rangeEnd } },
          { dealId: { in: existingFileDeals.map((d) => d.id) } },
        ],
      },
    });
    lineItemsReplaced = deleted.count;

    // Imported deals in the window that aren't in this file any more (a
    // removed invoice, one whose rows now net to zero, or an old deal that
    // couldn't be matched to a document).
    const staleDeals = await prisma.deal.findMany({
      where: {
        sourceTxnNo: { not: null },
        closedAt: { gte: rangeStart, lt: rangeEnd },
        OR: [{ sourceDocKey: null }, { sourceDocKey: { notIn: fileDocKeys } }],
      },
      select: { id: true },
    });
    const staleIds = staleDeals.map((d) => d.id);
    if (staleIds.length > 0) {
      await prisma.$transaction([
        prisma.activity.updateMany({ where: { dealId: { in: staleIds } }, data: { dealId: null } }),
        prisma.note.updateMany({ where: { dealId: { in: staleIds } }, data: { dealId: null } }),
        prisma.lead.updateMany({ where: { convertedDealId: { in: staleIds } }, data: { convertedDealId: null } }),
        prisma.saleLineItem.deleteMany({ where: { dealId: { in: staleIds } } }),
        prisma.deal.deleteMany({ where: { id: { in: staleIds } } }),
      ]);
      dealsRemoved = staleIds.length;
    }

    // Correct the deals that already exist - only the ones that actually
    // changed, so a large file doesn't issue one update per invoice.
    const existing = await prisma.deal.findMany({
      where: { sourceDocKey: { in: fileDocKeys } },
      select: { id: true, sourceDocKey: true, title: true, value: true, closedAt: true, ownerId: true, accountId: true, invoiceNo: true },
    });
    const existingByDocKey = new Map(existing.map((d) => [d.sourceDocKey!, d]));
    const updates = [];
    for (const d of dealCreateData) {
      const cur = existingByDocKey.get(d.sourceDocKey);
      if (!cur) continue;
      if (
        cur.title !== d.title ||
        cur.value !== d.value ||
        cur.closedAt?.getTime() !== d.closedAt.getTime() ||
        cur.ownerId !== d.ownerId ||
        cur.accountId !== d.accountId ||
        cur.invoiceNo !== d.invoiceNo
      ) {
        updates.push(
          prisma.deal.update({
            where: { id: cur.id },
            data: {
              title: d.title,
              value: d.value,
              closedAt: d.closedAt,
              ownerId: d.ownerId,
              accountId: d.accountId,
              invoiceNo: d.invoiceNo,
              stage: "WON",
              probability: 100,
            },
          }),
        );
      }
    }
    for (let i = 0; i < updates.length; i += 100) {
      await prisma.$transaction(updates.slice(i, i + 100));
    }
    dealsUpdated = updates.length;
  } else if (result.lineItems.some((li) => li.docKey.includes("/"))) {
    // Line items imported before documents were keyed by Txn Code have the
    // old key format, so this file's line items wouldn't be recognized as
    // already imported - drop the old-format ones in the file's window so
    // they're recreated once under the new key instead of doubled.
    const deleted = await prisma.saleLineItem.deleteMany({
      where: {
        month: { gte: rangeStart, lt: rangeEnd },
        NOT: [{ sourceKey: { startsWith: "deal-item:" } }, { sourceKey: { contains: "/" } }],
      },
    });
    lineItemsReplaced = deleted.count;
  }

  const dealsResult = await prisma.deal.createMany({ data: dealCreateData, skipDuplicates: true });
  const dbDeals = await prisma.deal.findMany({
    where: { sourceDocKey: { in: fileDocKeys } },
    select: { id: true, sourceDocKey: true },
  });
  const dealIdByDocKey = new Map(dbDeals.map((d) => [d.sourceDocKey!, d.id]));

  // Line items (product-level detail per historical sale, for category/month reporting)
  const lineItemCreateData = result.lineItems
    .filter((li) => productIdByCode.has(li.itemCode))
    .map((li) => ({
      sourceKey: li.sourceKey,
      productId: productIdByCode.get(li.itemCode)!,
      ownerId: userIdByKey.get(li.ownerKey) ?? head.id,
      dealId: dealIdByDocKey.get(li.docKey) ?? null,
      docDate: li.docDate,
      month: li.month,
      qty: li.qty,
      value: li.value,
    }));
  const lineItemsResult = await prisma.saleLineItem.createMany({ data: lineItemCreateData, skipDuplicates: true });

  // Project & Service billing - kept apart from deals/line items (it isn't
  // product sales) and counted toward incentives. A Replace rebuilds it for
  // the file's months like everything else.
  if (replace) {
    // Register lines only - billing entered in the CRM is left alone.
    await prisma.projectBilling.deleteMany({
      where: {
        month: { gte: rangeStart, lt: rangeEnd },
        NOT: [{ sourceKey: { startsWith: MANUAL_PREFIX } }, { sourceKey: { startsWith: UPLOAD_PREFIX } }],
      },
    });
  }
  const projectResult = await prisma.projectBilling.createMany({
    data: result.projectBillings.map((pb) => ({
      sourceKey: pb.sourceKey,
      docKey: pb.docKey,
      txnNo: pb.txnNo,
      docDate: pb.docDate,
      month: pb.month,
      custName: pb.custName,
      itemCode: pb.itemCode,
      itemName: pb.itemName,
      value: pb.value,
      ownerId: userIdByKey.get(pb.ownerKey) ?? head.id,
    })),
    skipDuplicates: true,
  });

  // Deliberately no Pricelist writes here - dealer pricing only ever comes
  // from a Stock & Price List upload or a manually-added price entry, never
  // from historical sales figures.

  // Exchange rate - the sole source now (Price Master's manual entry was
  // removed). Upsert per month so a re-upload updates it if the file's rate
  // changed, rather than leaving a stale value behind.
  let exchangeRatesSet = 0;
  for (const er of result.exchangeRates) {
    await prisma.monthlyExchangeRate.upsert({
      where: { month: er.month },
      create: { month: er.month, rate: er.rate },
      update: { rate: er.rate },
    });
    exchangeRatesSet++;
  }

  const totalDealValue = result.deals.reduce((sum, d) => sum + d.value, 0);

  return {
    summary: {
      accountsCreated: accountsToCreate.length,
      accountsUpdated,
      productsCreated: dbProducts.length,
      activeUsers: activeCredentials,
      inactiveUsersCreated: result.users.filter((u) => !u.isActive).length,
      dealsCreated: dealsResult.count,
      dealsUpdated,
      dealsRemoved,
      lineItemsCreated: lineItemsResult.count,
      lineItemsReplaced,
      replacedRange: replace ? `${monthLabel(rangeStart)} – ${monthLabel(new Date(rangeEnd.getTime() - 1))}` : null,
      exchangeRatesSet,
      excludedServiceRows: result.summary.excludedServiceRows,
      projectBillingsAdded: projectResult.count,
      projectBillingValue: result.projectBillings.reduce((s, pb) => s + pb.value, 0),
      creditNoteRowsNetted: result.summary.creditNoteRowsNetted,
      demoAccountsRemoved,
      totalDealValue,
      skippedFileRows,
      upToLabel,
      rowsAfterUpTo,
    },
  };
}

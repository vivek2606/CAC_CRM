"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { parseSalesRegisterBuffer } from "@/lib/import/parse-sales-register";
import { transformSalesRegister } from "@/lib/import/sales-register";

const DEMO_EMAILS = [
  "priya@caccrm.com",
  "rohan@caccrm.com",
  "ananya@caccrm.com",
  "karan@caccrm.com",
  "sneha@caccrm.com",
  "vikram@caccrm.com",
];

const AVATAR_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444", "#0ea5e9"];

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
  pricelistEntriesCreated: number;
  lineItemsCreated: number;
  exchangeRatesSet: number;
  excludedServiceRows: number;
  creditNoteRowsNetted: number;
  demoAccountsRemoved: string[];
  totalDealValue: number;
  skippedFileRows: number;
};

export type ImportState = { error?: string; summary?: ImportSummary };

export async function importSalesRegister(
  _prevState: ImportState | undefined,
  formData: FormData
): Promise<ImportState> {
  const head = await requireHead();

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

  const result = transformSalesRegister(rows);

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
  const inactivePasswordHash = await bcrypt.hash(crypto.randomUUID(), 10);
  const activeCredentials: { name: string; email: string; tempPassword: string }[] = [];
  const userCreateData = [];
  let colorIdx = 0;
  for (const u of result.users) {
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
  await prisma.user.createMany({ data: userCreateData, skipDuplicates: true });

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

  const accountsToCreate = result.accounts.filter((a) => !existingAccountByName.has(a.name));
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
    if (existing && (existing.code !== a.code || existing.city !== a.city)) {
      try {
        await prisma.account.update({ where: { id: existing.id }, data: { code: a.code, city: a.city } });
        accountsUpdated++;
      } catch {
        // Code collided with a different existing account - leave this one as-is.
      }
    }
  }

  const dbAccounts = await prisma.account.findMany({
    where: { name: { in: result.accounts.map((a) => a.name) } },
    select: { id: true, code: true, name: true },
  });
  const accountIdByName = new Map(dbAccounts.map((a) => [a.name, a.id]));

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

  // Deals (one per transaction)
  const dealCreateData = result.deals.map((d) => ({
    title: d.title,
    stage: "WON" as const,
    value: d.value,
    probability: 100,
    closedAt: d.closedAt,
    createdAt: d.closedAt,
    updatedAt: d.closedAt,
    ownerId: userIdByKey.get(d.ownerKey) ?? head.id,
    accountId: accountIdByName.get(d.custName) ?? null,
    sourceTxnNo: d.txnNo,
  }));
  const dealsResult = await prisma.deal.createMany({ data: dealCreateData, skipDuplicates: true });
  const dbDeals = await prisma.deal.findMany({
    where: { sourceTxnNo: { in: result.deals.map((d) => d.txnNo) } },
    select: { id: true, sourceTxnNo: true },
  });
  const dealIdByTxnNo = new Map(dbDeals.map((d) => [d.sourceTxnNo!, d.id]));

  // Line items (product-level detail per historical sale, for category/month reporting)
  const lineItemCreateData = result.lineItems
    .filter((li) => productIdByCode.has(li.itemCode))
    .map((li) => ({
      sourceKey: li.sourceKey,
      productId: productIdByCode.get(li.itemCode)!,
      ownerId: userIdByKey.get(li.ownerKey) ?? head.id,
      dealId: dealIdByTxnNo.get(li.txnNo) ?? null,
      docDate: li.docDate,
      month: li.month,
      qty: li.qty,
      value: li.value,
    }));
  const lineItemsResult = await prisma.saleLineItem.createMany({ data: lineItemCreateData, skipDuplicates: true });

  // Pricelist
  const pricelistCreateData = result.pricelistEntries
    .filter((p) => productIdByCode.has(p.itemCode))
    .map((p) => ({
      productId: productIdByCode.get(p.itemCode)!,
      month: p.month,
      dealerPrice: p.dealerPrice,
    }));
  const pricelistResult = await prisma.pricelist.createMany({ data: pricelistCreateData, skipDuplicates: true });

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
      pricelistEntriesCreated: pricelistResult.count,
      lineItemsCreated: lineItemsResult.count,
      exchangeRatesSet,
      excludedServiceRows: result.summary.excludedServiceRows,
      creditNoteRowsNetted: result.summary.creditNoteRowsNetted,
      demoAccountsRemoved,
      totalDealValue,
      skippedFileRows,
    },
  };
}

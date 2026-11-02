"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { BRANCH_SALES, isBranchSales } from "@/lib/branch-sales";
import { BILLING_COMPANIES } from "@/lib/billing-company";
import { placeholderEmail } from "@/lib/import/sales-register";
import { syncSaleLineItemsForDeal } from "@/lib/sale-line-sync";
import { withChangeReason } from "@/lib/change-log";

// Upcountry branch sales people's CAC sales (they have no login), entered by
// the Head or the Sales Coordinator. Shown in the Sales Register as "Others".

const AVATAR_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444", "#0ea5e9"];

function done() {
  revalidatePath("/reports/sales-register");
  revalidatePath("/reports/sales-register/branch-sales");
}

// The branch sales person by name (as in the Sales Register's Salesman
// column, so an upload puts their lines under the same person): found, or
// made as a record without a login. Someone the register already brought in
// under that name is marked rather than duplicated.
async function branchPerson(name: string, managerId: string): Promise<{ id?: string; error?: string }> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!clean) return { error: "Enter the branch sales person's name." };
  const email = placeholderEmail(clean);
  const existing =
    (await prisma.user.findUnique({ where: { email }, select: { id: true, isActive: true, title: true } })) ??
    (await prisma.user.findFirst({ where: { name: { equals: clean, mode: "insensitive" } }, select: { id: true, isActive: true, title: true } }));
  if (existing?.isActive) return { error: `${clean} has a CRM login - their sales are their own won deals, not branch sales.` };
  if (existing) {
    if (!isBranchSales(existing.title)) await prisma.user.update({ where: { id: existing.id }, data: { title: BRANCH_SALES } });
    return { id: existing.id };
  }
  const count = await prisma.user.count();
  const u = await prisma.user.create({
    data: {
      name: clean,
      email,
      passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
      role: "SALES_MANAGER",
      title: BRANCH_SALES,
      isActive: false,
      managerId,
      avatarColor: AVATAR_COLORS[count % AVATAR_COLORS.length],
    },
  });
  return { id: u.id };
}

export type BranchSaleInput = {
  name: string;
  date: string; // YYYY-MM-DD
  invoiceNo: string;
  company: string;
  accountId: string;
  customer: string;
  lines: { productId: string; qty: number; rate: number }[];
};

// A sale: saved as a won order under the branch sales person - the invoice,
// customer and products billed (rates excl. VAT) - so it shows in the Sales
// Register, by product type, like any other sale.
export async function addBranchSale(input: BranchSaleInput): Promise<{ error?: string }> {
  const user = await requireBackOffice();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Pick the invoice date." };
  const invoiceNo = input.invoiceNo.trim().slice(0, 60);
  if (!invoiceNo) return { error: "Enter the invoice no." };
  if (!(BILLING_COMPANIES as readonly string[]).includes(input.company)) return { error: "Pick the billing company." };
  const account = input.accountId ? await prisma.account.findUnique({ where: { id: input.accountId }, select: { id: true, name: true } }) : null;
  const customer = account?.name ?? input.customer.trim().slice(0, 200);
  if (!customer) return { error: "Pick the customer's account or type their name." };
  const lines = input.lines.filter((l) => l.productId);
  if (!lines.length) return { error: "Add the products sold." };
  if (lines.some((l) => !(l.qty > 0) || !(l.rate > 0))) return { error: "Every product needs a quantity and a rate." };
  const dup = await prisma.deal.findFirst({
    where: { stage: "WON", invoiceNo: { equals: invoiceNo, mode: "insensitive" }, billingCompany: input.company },
    select: { title: true },
  });
  if (dup) return { error: `${input.company} invoice ${invoiceNo} is already recorded (${dup.title}).` };

  const owner = await branchPerson(input.name, user.id);
  const ownerId = owner.id;
  if (!ownerId) return { error: owner.error };
  const date = new Date(`${input.date}T00:00:00Z`);
  const value = Math.round(lines.reduce((t, l) => t + l.qty * l.rate, 0) * 100) / 100;
  await withChangeReason("Branch sale entered", async () => {
    const deal = await prisma.deal.create({
      data: {
        title: `${customer} — branch sale`,
        value,
        stage: "WON",
        probability: 100,
        closedAt: date,
        stageChangedAt: date,
        createdAt: date,
        invoiceNo,
        billingCompany: input.company,
        accountId: account?.id ?? null,
        customerName: customer,
        ownerId,
        items: { create: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: Math.round(l.rate * 100) / 100 })) },
      },
    });
    await syncSaleLineItemsForDeal(deal.id);
  });
  done();
  return {};
}

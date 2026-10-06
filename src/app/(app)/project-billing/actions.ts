"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { parseProjectBillingBuffer, type ProjectBillingRowProblem } from "@/lib/import/parse-project-billing";
import { parseReceiptDate } from "@/lib/import/parse-stock-receipts";
import { MANUAL_PREFIX, UPLOAD_PREFIX, isCrmEntered } from "@/lib/project-billing";

// Project & Service billing entered in the CRM - by hand or from a sheet -
// alongside what the Sales Register import brings in.

const firstOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

// Sales persons and the Service Manager - who project/service billing can be under.
async function billingOwners() {
  return prisma.user.findMany({
    where: { isActive: true, OR: [{ title: "Sales Manager" }, { title: "Service Manager" }] },
    select: { id: true, name: true, title: true },
  });
}

function revalidate() {
  revalidatePath("/project-billing");
  revalidatePath("/service-billings");
  revalidatePath("/incentives");
  revalidatePath("/targets");
  revalidatePath("/");
}

// Invoice numbers are stored as text (docKey); txnNo keeps the number when
// the invoice is purely numeric and fits, else 0.
function txnNoOf(invoiceNo: string | null): number {
  if (!invoiceNo || !/^\d+$/.test(invoiceNo)) return 0;
  const n = Number(invoiceNo);
  return n <= 2_147_483_647 ? n : 0;
}

export type FormState = { error?: string; ok?: string };

const manualSchema = z.object({
  date: z.string().min(1, "Pick the billing date."),
  ownerId: z.string().min(1, "Pick the sales person."),
  customer: z.string().trim().min(1, "Enter the customer."),
  type: z.enum(["Project", "Service"]),
  description: z.string().trim().max(200),
  invoiceNo: z.string().trim().max(60),
  value: z.coerce.number().refine((v) => Number.isFinite(v) && v !== 0, "Enter the amount (negative for a credit note)."),
});

export async function addProjectBilling(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  await requireBackOffice();
  const parsed = manualSchema.safeParse({
    date: formData.get("date"),
    ownerId: formData.get("ownerId"),
    customer: formData.get("customer"),
    type: formData.get("type"),
    description: formData.get("description") ?? "",
    invoiceNo: formData.get("invoiceNo") ?? "",
    value: String(formData.get("value") ?? "").replace(/[₦,\s]/g, ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;
  const date = parseReceiptDate(d.date);
  if (!date) return { error: "Couldn't read the date." };
  const owners = await billingOwners();
  if (!owners.some((o) => o.id === d.ownerId)) return { error: "Pick a valid sales person." };

  await prisma.projectBilling.create({
    data: {
      sourceKey: `${MANUAL_PREFIX}${crypto.randomUUID()}`,
      docKey: d.invoiceNo,
      txnNo: txnNoOf(d.invoiceNo || null),
      docDate: date,
      month: firstOfMonth(date),
      custName: d.customer,
      itemCode: d.type.toUpperCase(),
      itemName: d.description || d.type,
      value: d.value,
      ownerId: d.ownerId,
    },
  });
  revalidate();
  return { ok: `Added ${d.type.toLowerCase()} billing for ${d.customer}.` };
}

// Only entries made in the CRM can be deleted here - register lines are
// corrected by re-uploading the register.
export async function deleteProjectBilling(id: string) {
  await requireBackOffice();
  const row = await prisma.projectBilling.findUnique({ where: { id }, select: { sourceKey: true } });
  if (!row || !isCrmEntered(row.sourceKey)) {
    throw new Error("Only billing entered in the CRM can be deleted here.");
  }
  await prisma.projectBilling.delete({ where: { id } });
  revalidate();
}

export type BulkProjectBillingState = {
  error?: string;
  summary?: { rowsRead: number; added: number; alreadyRecorded: number; total: number; problems: ProjectBillingRowProblem[] };
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

export async function importProjectBilling(
  _prev: BulkProjectBillingState | undefined,
  formData: FormData,
): Promise<BulkProjectBillingState> {
  await requireBackOffice();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Please choose a file to upload." };

  let parsed: Awaited<ReturnType<typeof parseProjectBillingBuffer>>;
  try {
    parsed = await parseProjectBillingBuffer(await file.arrayBuffer());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the uploaded file." };
  }
  const problems = [...parsed.problems];

  // Sales person by name: exact (ignoring case/spacing) first, else the one
  // login whose name words all appear in the sheet's name or vice versa
  // ("Celinah Ojo" ~ "Celinah Oluwamayo Ojo", "ADEDAPO OKUNADE SIKIRU" ~ "Okunade Sikiru").
  const owners = await billingOwners();
  const matchOwner = (name: string) => {
    const n = norm(name);
    const exact = owners.filter((o) => norm(o.name) === n);
    if (exact.length === 1) return exact[0];
    const words = new Set(n.split(" "));
    const loose = owners.filter((o) => {
      const ow = norm(o.name).split(" ");
      return ow.every((w) => words.has(w)) || [...words].every((w) => ow.includes(w));
    });
    return loose.length === 1 ? loose[0] : null;
  };

  const occurrence = new Map<string, number>();
  const data = [];
  for (const r of parsed.rows) {
    const owner = matchOwner(r.salesPerson);
    if (!owner) {
      problems.push({ rowNumber: r.rowNumber, problem: `No sales person login matches "${r.salesPerson}"` });
      continue;
    }
    const type = r.type ?? (owner.title === "Service Manager" ? "Service" : "Project");
    // Same row uploaded again = same key, so a re-upload doesn't double it.
    const base = [r.date.toISOString().slice(0, 10), r.invoiceNo ?? "", norm(r.customer), owner.id, type, r.value].join("|");
    const n = occurrence.get(base) ?? 0;
    occurrence.set(base, n + 1);
    data.push({
      sourceKey: `${UPLOAD_PREFIX}${base}|${n}`,
      docKey: r.invoiceNo ?? "",
      txnNo: txnNoOf(r.invoiceNo),
      docDate: r.date,
      month: firstOfMonth(r.date),
      custName: r.customer,
      itemCode: type.toUpperCase(),
      itemName: r.description ?? type,
      value: r.value,
      ownerId: owner.id,
    });
  }

  const result = data.length > 0 ? await prisma.projectBilling.createMany({ data, skipDuplicates: true }) : { count: 0 };
  revalidate();
  problems.sort((a, b) => a.rowNumber - b.rowNumber);
  return {
    summary: {
      rowsRead: parsed.rows.length + parsed.problems.length,
      added: result.count,
      alreadyRecorded: data.length - result.count,
      total: data.reduce((s, d) => s + d.value, 0),
      problems,
    },
  };
}

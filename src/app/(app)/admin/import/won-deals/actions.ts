"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { withChangeReason } from "@/lib/change-log";
import { audit, auditDiff, fmtDate, fmtMoney } from "@/lib/audit";
import { billingCompanyOf } from "@/lib/billing-company";
import { invoiceTypeOf, type InvoiceType } from "@/lib/invoice-key";
import { syncSaleLineItemsForDeal } from "@/lib/sale-line-sync";
import { parseWonDealUpdatesBuffer, type RawWonUpdateRow, type WonUpdateRowProblem } from "@/lib/import/parse-won-deal-updates";

// The Head's bulk correction of won deals from a sheet: dates (lead,
// conversion, won), customer, company, products and sales person, matched
// to each deal by its invoice no. Checked first (nothing saved), then
// applied. Invoices with no won deal are reported, never created.

export type InvoicePlan = {
  invoiceNo: string;
  company: string | null;
  rows: number[];
  dealId?: string;
  dealTitle?: string;
  changes: string[];
  problem?: string;
};

export type WonUpdateResult = {
  error?: string;
  applied?: boolean;
  plans?: InvoicePlan[];
  rowProblems?: WonUpdateRowProblem[];
};

export async function checkWonDealUpdates(formData: FormData): Promise<WonUpdateResult> {
  return run(formData, false);
}

export async function applyWonDealUpdates(formData: FormData): Promise<WonUpdateResult> {
  return run(formData, true);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const DAY = 86400000;
const dayOf = (d: Date) => Math.floor(d.getTime() / DAY);
const round2 = (n: number) => Math.round(n * 100) / 100;

async function run(formData: FormData, apply: boolean): Promise<WonUpdateResult> {
  const user = await requireHead();
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Please choose a file to upload." };
    let parsed: Awaited<ReturnType<typeof parseWonDealUpdatesBuffer>>;
    try {
      parsed = await parseWonDealUpdatesBuffer(await file.arrayBuffer());
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not read the uploaded file - upload an .xlsx sheet." };
    }
    const rowProblems = [...parsed.problems];
    if (parsed.rows.length === 0) return { error: rowProblems.length ? undefined : "No usable rows found in the file.", rowProblems, plans: [] };

    // ---- lookups
    const [products, accounts, people] = await Promise.all([
      prisma.product.findMany({ select: { id: true, code: true, model: true } }),
      prisma.account.findMany({ where: { code: { not: null } }, select: { id: true, code: true, name: true } }),
      prisma.user.findMany({ where: { isActive: true, role: { not: "COORDINATOR" } }, select: { id: true, name: true } }),
    ]);
    const pkey = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const byCode = new Map(products.map((p) => [p.code.trim().toUpperCase(), p]));
    const byModel = new Map<string, (typeof products)[number]>();
    for (const p of products) if (!byModel.has(pkey(p.model))) byModel.set(pkey(p.model), p);
    const findProduct = (r: RawWonUpdateRow) => {
      for (const v of [r.productCode, r.productName]) if (v && byCode.has(v.trim().toUpperCase())) return byCode.get(v.trim().toUpperCase())!;
      for (const v of [r.productName, r.productCode]) if (v && byModel.has(pkey(v))) return byModel.get(pkey(v))!;
      return null;
    };
    const accountByCode = new Map(accounts.map((a) => [a.code!.trim().toLowerCase(), a]));
    const accountName = new Map(accounts.map((a) => [a.id, a.name]));
    const personName = new Map(people.map((p) => [p.id, p.name]));
    // Exact name (ignoring case/spacing) first, else the one person whose
    // name words all appear in the sheet's name or vice versa.
    const matchPerson = (name: string) => {
      const n = norm(name);
      const exact = people.filter((p) => norm(p.name) === n);
      if (exact.length === 1) return exact[0];
      const words = new Set(n.split(" "));
      const loose = people.filter((p) => {
        const pw = norm(p.name).split(" ");
        return pw.every((w) => words.has(w)) || [...words].every((w) => pw.includes(w));
      });
      return loose.length === 1 ? loose[0] : loose.length > 1 ? "several" : null;
    };

    // ---- rows -> invoices (invoice no. + company)
    const byNo = new Map<string, RawWonUpdateRow[]>();
    for (const r of parsed.rows) {
      if (r.company && !billingCompanyOf(r.company)) {
        rowProblems.push({ rowNumber: r.rowNumber, problem: `Company "${r.company}" - use Sakuragi or Somotex` });
        continue;
      }
      const k = r.invoiceNo.trim().toLowerCase();
      byNo.set(k, [...(byNo.get(k) ?? []), r]);
    }
    const groups: { invoiceNo: string; company: string | null; rows: RawWonUpdateRow[] }[] = [];
    for (const rows of byNo.values()) {
      const companies = [...new Set(rows.map((r) => billingCompanyOf(r.company)).filter((c): c is NonNullable<typeof c> => !!c))];
      if (companies.length <= 1) {
        groups.push({ invoiceNo: rows[0].invoiceNo.trim(), company: companies[0] ?? null, rows });
        continue;
      }
      // The same number from both companies: two invoices - each row must say which.
      for (const r of rows.filter((r) => !r.company)) {
        rowProblems.push({ rowNumber: r.rowNumber, problem: `Invoice ${r.invoiceNo} is in the sheet for both companies - fill in this row's Company` });
      }
      for (const c of companies) groups.push({ invoiceNo: rows[0].invoiceNo.trim(), company: c, rows: rows.filter((r) => billingCompanyOf(r.company) === c) });
    }

    // Every won deal carrying one of these invoice numbers.
    const nos = [...new Set(groups.map((g) => g.invoiceNo))];
    const candidates = await prisma.deal.findMany({
      where: {
        stage: "WON",
        OR: [{ invoiceNo: { in: nos, mode: "insensitive" } }, { sourceTxnNo: { in: nos.filter((n) => /^\d{1,9}$/.test(n)).map(Number) } }],
      },
      include: { items: { include: { product: { select: { code: true } } } } },
    });

    const plans: InvoicePlan[] = [];
    const usedDeals = new Set<string>();
    let changed = 0;
    for (const g of groups) {
      const plan: InvoicePlan = { invoiceNo: g.invoiceNo, company: g.company, rows: g.rows.map((r) => r.rowNumber), changes: [] };
      plans.push(plan);
      const fail = (problem: string) => void (plan.problem = problem);

      // One value per invoice for each detail - blank cells don't count.
      const one = <T,>(label: string, pick: (r: RawWonUpdateRow) => T | null, key: (v: T) => string = String): { value: T | null } | null => {
        const vals = g.rows.map(pick).filter((v): v is T => v != null);
        if (new Set(vals.map(key)).size > 1) {
          fail(`The rows give different ${label}s (${[...new Set(vals.map(key))].join(" / ")}) - one invoice has one ${label}.`);
          return null;
        }
        return { value: vals[0] ?? null };
      };
      const dkey = (d: Date) => d.toISOString().slice(0, 10);
      const leadDate = one("lead date", (r) => r.leadDate, dkey);
      const convDate = one("conversion date", (r) => r.conversionDate, dkey);
      const wonDate = one("won date", (r) => r.wonDate, dkey);
      const custCode = one("customer code", (r) => r.customerCode?.trim().toLowerCase() ?? null);
      const person = one("sales person", (r) => (r.salesPerson ? norm(r.salesPerson) : null));
      if (!leadDate || !convDate || !wonDate || !custCode || !person) continue;

      // Products billed on this invoice (if the sheet gives them).
      const lines: { productId: string; code: string; qty: number; unitPrice: number }[] = [];
      for (const r of g.rows.filter((r) => r.productCode || r.productName)) {
        const p = findProduct(r);
        if (!p) {
          fail(`Row ${r.rowNumber}: no product matches "${r.productCode ?? r.productName}".`);
          break;
        }
        lines.push({ productId: p.id, code: p.code, qty: r.qty!, unitPrice: round2(r.rate!) });
      }
      if (plan.problem) continue;
      const newTotal = round2(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
      const type: InvoiceType | null = lines.length ? invoiceTypeOf(newTotal) : null;

      // ---- the deal
      const no = g.invoiceNo.toLowerCase();
      const hits = candidates.filter(
        (d) =>
          ((d.invoiceNo ?? "").trim().toLowerCase() === no || String(d.sourceTxnNo ?? "") === no) &&
          (!g.company || !d.billingCompany || d.billingCompany === g.company) &&
          (!type || invoiceTypeOf(d.value) === type),
      );
      const crm = hits.filter((d) => d.sourceTxnNo == null);
      if (crm.length === 0) {
        fail(
          hits.length
            ? `Invoice ${g.invoiceNo} is from the Sales Register import ("${hits[0].title}") - correct it by re-uploading the register.`
            : `No won deal has invoice ${g.invoiceNo}${g.company ? ` (${g.company})` : ""}.`,
        );
        continue;
      }
      if (crm.length > 1) {
        fail(`Invoice ${g.invoiceNo} is on ${crm.length} won deals (${crm.map((d) => `"${d.title}"${d.billingCompany ? ` - ${d.billingCompany}` : ""}`).join(", ")}) - fill in the Company column to say which.`);
        continue;
      }
      const deal = crm[0];
      plan.dealId = deal.id;
      plan.dealTitle = deal.title;
      if (usedDeals.has(deal.id)) {
        fail("Another invoice in this sheet already updates this deal.");
        continue;
      }
      usedDeals.add(deal.id);

      // ---- what changes
      let accountId = deal.accountId;
      if (custCode.value) {
        const acc = accountByCode.get(custCode.value);
        if (!acc) {
          fail(`No account has the customer code "${g.rows.find((r) => r.customerCode)?.customerCode}".`);
          continue;
        }
        accountId = acc.id;
      }
      let ownerId = deal.ownerId;
      if (person.value) {
        const raw = g.rows.find((r) => r.salesPerson)!.salesPerson!;
        const p = matchPerson(raw);
        if (!p || p === "several") {
          fail(
            p ? `"${raw}" matches more than one active login - write the name as it is on the login.` : `No active sales person matches "${raw}" (deals can't be under the Sales Coordinator).`,
          );
          continue;
        }
        ownerId = p.id;
      }
      const after = {
        closedAt: wonDate.value ?? deal.closedAt,
        createdAt: convDate.value ?? deal.createdAt,
        accountId,
        billingCompany: g.company ?? deal.billingCompany,
        ownerId,
      };

      const root = deal.orderDealId ?? deal.id;
      const lead = await prisma.lead.findUnique({ where: { convertedDealId: root }, select: { id: true, createdAt: true } });
      const leadAfter = leadDate.value ?? lead?.createdAt ?? null;
      if (leadAfter && dayOf(leadAfter) > dayOf(after.createdAt)) {
        fail(`The lead date (${fmtDate(leadAfter)}) is after the conversion date (${fmtDate(after.createdAt)}).`);
        continue;
      }
      if (after.closedAt && dayOf(after.createdAt) > dayOf(after.closedAt)) {
        fail(`The conversion date (${fmtDate(after.createdAt)}) is after the won date (${fmtDate(after.closedAt)}).`);
        continue;
      }

      const sig = (items: { productId: string; qty: number; unitPrice: number }[]) =>
        items.map((i) => `${i.productId}|${i.qty}|${round2(i.unitPrice)}`).sort().join(",");
      const itemsChange = lines.length > 0 && sig(lines) !== sig(deal.items);

      // A new company or a sale turned return mustn't make this invoice
      // the same as one already recorded on another deal.
      const newType = itemsChange ? invoiceTypeOf(newTotal) : invoiceTypeOf(deal.value);
      if (after.billingCompany !== deal.billingCompany || newType !== invoiceTypeOf(deal.value)) {
        const clash = await prisma.deal.findFirst({
          where: {
            stage: "WON",
            id: { not: deal.id },
            OR: [{ invoiceNo: { equals: g.invoiceNo, mode: "insensitive" } }, ...(/^\d{1,9}$/.test(g.invoiceNo) ? [{ sourceTxnNo: Number(g.invoiceNo) }] : [])],
            ...(after.billingCompany ? { AND: [{ OR: [{ billingCompany: null }, { billingCompany: after.billingCompany }] }] } : {}),
            value: newType === "return" ? { lt: 0 } : { gte: 0 },
          },
          select: { title: true },
        });
        if (clash) {
          fail(`Invoice ${g.invoiceNo}${after.billingCompany ? ` (${after.billingCompany})` : ""} is already recorded on "${clash.title}".`);
          continue;
        }
      }

      plan.changes = auditDiff(
        { ...deal, accountId: deal.accountId, ownerId: deal.ownerId } as Record<string, unknown>,
        after as Record<string, unknown>,
        [
          { key: "closedAt", label: "Won date", fmt: fmtDate },
          { key: "createdAt", label: "Converted to deal on", fmt: fmtDate },
          { key: "accountId", label: "Account", fmt: (v) => accountName.get(String(v)) ?? "another account" },
          { key: "billingCompany", label: "Company" },
          { key: "ownerId", label: "Sales person", fmt: (v) => personName.get(String(v)) ?? "a former sales person" },
        ],
      );
      if (itemsChange) {
        const desc = (items: { qty: number; unitPrice: number; code: string }[], total: number) =>
          items.length ? `${items.map((i) => `${i.code} × ${i.qty}`).join(", ")} (${fmtMoney(total)})` : "none";
        plan.changes.push(`Products: ${desc(deal.items.map((i) => ({ ...i, code: i.product.code })), deal.value)} → ${desc(lines, newTotal)}`);
      }
      const leadDateChange = !!leadDate.value && (!lead || dkey(lead.createdAt) !== dkey(leadDate.value));
      if (leadDateChange) plan.changes.push(lead ? `Lead date: ${fmtDate(lead.createdAt)} → ${fmtDate(leadDate.value!)}` : `Lead added, dated ${fmtDate(leadDate.value!)}`);
      const leadOwnerChange = !!lead && root === deal.id && ownerId !== deal.ownerId;
      if (plan.changes.length === 0 || !apply) {
        if (plan.changes.length) changed++;
        continue;
      }

      // ---- save
      const account = accountId ? await prisma.account.findUnique({ where: { id: accountId }, select: { name: true } }) : null;
      // The deal's changes go into its history (change-log.ts) marked as this upload.
      await withChangeReason(`Won deals upload, invoice ${g.invoiceNo}`, () => prisma.$transaction(async (tx) => {
        await tx.deal.update({
          where: { id: deal.id },
          data: {
            ...after,
            ...(itemsChange ? { value: newTotal, discountApprovedAt: new Date(), discountApprovedById: user.id } : {}),
          },
        });
        if (itemsChange) {
          await tx.dealLineItem.deleteMany({ where: { dealId: deal.id } });
          await tx.dealLineItem.createMany({ data: lines.map((l) => ({ dealId: deal.id, productId: l.productId, qty: l.qty, unitPrice: l.unitPrice })) });
        }
        if (lead && (leadDateChange || leadOwnerChange)) {
          await tx.lead.update({ where: { id: lead.id }, data: { ...(leadDateChange ? { createdAt: leadDate.value! } : {}), ...(leadOwnerChange ? { ownerId } : {}) } });
        } else if (!lead && leadDate.value) {
          const order = await tx.deal.findUniqueOrThrow({ where: { id: root } });
          await tx.lead.create({
            data: {
              title: order.title,
              customerName: order.customerName,
              phone: order.customerPhone,
              company: account?.name ?? null,
              status: "CONVERTED",
              winProbability: 100,
              equipmentType: order.equipmentType,
              endUseSegment: order.endUseSegment,
              competitorBrand: order.competitorBrand,
              value: order.value,
              tags: order.tags,
              createdAt: leadDate.value,
              ownerId: order.ownerId === deal.ownerId ? ownerId : order.ownerId,
              accountId: order.accountId,
              contactId: order.contactId,
              convertedDealId: root,
            },
          });
        }
      }));
      await syncSaleLineItemsForDeal(deal.id);
      if (itemsChange || (!lead && leadDate.value)) {
        // The lead behind an order is worth the whole order.
        const order = await prisma.deal.aggregate({ where: { stage: "WON", OR: [{ id: root }, { orderDealId: root }] }, _sum: { value: true } });
        await prisma.lead.updateMany({ where: { convertedDealId: root }, data: { value: round2(order._sum.value ?? 0) } });
      }
      // Lead changes aren't the deal's own fields - noted on the deal too.
      const leadChanges = plan.changes.filter((c) => c.startsWith("Lead"));
      if (leadChanges.length) await audit("deal", deal.id, user.id, "edited", `Won deals upload - ${leadChanges.join("; ")}.`);
      if (leadDateChange) {
        const l = lead ?? (await prisma.lead.findUnique({ where: { convertedDealId: root }, select: { id: true } }));
        if (l) await audit("lead", l.id, user.id, lead ? "edited" : "created", `Won deals upload (invoice ${g.invoiceNo}) - ${plan.changes.filter((c) => c.startsWith("Lead")).join("; ")}.`);
      }
      changed++;
    }

    if (apply && changed > 0) {
      for (const p of ["/deals", "/leads", "/reports", "/reports/sales-register", "/reports/target-achievement", "/targets", "/incentives", "/"]) revalidatePath(p);
    }
    rowProblems.sort((a, b) => a.rowNumber - b.rowNumber);
    plans.sort((a, b) => Number(!!b.problem) - Number(!!a.problem) || a.rows[0] - b.rows[0]);
    return { applied: apply, plans, rowProblems };
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { error: e instanceof Error ? e.message : "Something went wrong - try again." };
  }
}

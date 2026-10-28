import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, type PrismaClient } from "@prisma/client";
import { DEAL_STAGE_LABELS, END_USE_SEGMENT_LABELS, EQUIPMENT_TYPE_LABELS, LOST_REASON_LABELS, PAYMENT_TERMS_LABELS } from "@/lib/constants";
import { quoteChanges, quoteSummary } from "@/lib/quote-diff";

// Full change history of deals (and their products), quotations and prices
// (products' maximum discount, the monthly price list, the tentative price
// list, the exchange rate), recorded in AuditLog by whoever is signed in -
// for every change, from any screen, upload or approval: the database
// client runs every write on these through here.
//
// A failure to record never blocks the change itself. A deal's products
// replaced in one go (all removed, all added back) are recorded at the end
// of the request, showing only what actually changed.

const reasonStore = new AsyncLocalStorage<string>();
// Context for the changes made inside fn (e.g. "Won deals upload"),
// shown with each history entry.
export function withChangeReason<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  return reasonStore.run(reason, fn);
}

type Row = Record<string, unknown>;
type Fmt = "money" | "date" | "pct" | "stage" | "equipment" | "segment" | "lostReason" | "paymentTerms" | "user" | "account" | "contact" | "deal" | "yesno";
type Field = { key: string; label: string; fmt?: Fmt };

const DEAL_FIELDS: Field[] = [
  { key: "title", label: "Name" },
  { key: "stage", label: "Stage", fmt: "stage" },
  { key: "value", label: "Value", fmt: "money" },
  { key: "probability", label: "Probability", fmt: "pct" },
  { key: "ownerId", label: "Sales person", fmt: "user" },
  { key: "accountId", label: "Account", fmt: "account" },
  { key: "contactId", label: "Contact", fmt: "contact" },
  { key: "customerName", label: "Customer" },
  { key: "customerPhone", label: "Phone" },
  { key: "createdAt", label: "Lead / conversion date", fmt: "date" },
  { key: "expectedCloseDate", label: "Expected close", fmt: "date" },
  { key: "closedAt", label: "Won / closed (invoice) date", fmt: "date" },
  { key: "invoiceNo", label: "Invoice no." },
  { key: "billingCompany", label: "Entity" },
  { key: "paymentTerms", label: "Payment terms", fmt: "paymentTerms" },
  { key: "expectedDeliveryDate", label: "Expected delivery", fmt: "date" },
  { key: "equipmentType", label: "Equipment", fmt: "equipment" },
  { key: "endUseSegment", label: "End-use segment", fmt: "segment" },
  { key: "competitorBrand", label: "Competing brand" },
  { key: "lostReasonCategory", label: "Lost reason", fmt: "lostReason" },
  { key: "lostReason", label: "Lost - details" },
  { key: "lostToBrand", label: "Lost to brand" },
  { key: "quoteNumber", label: "Quote no." },
  { key: "discountApprovedAt", label: "Discount approved", fmt: "date" },
  { key: "orderDealId", label: "Part of order", fmt: "deal" },
  { key: "considerForReorder", label: "Counted for reordering", fmt: "yesno" },
  { key: "tags", label: "Tags" },
];
const QUOTE_FIELDS: Field[] = [
  { key: "ref", label: "Reference" },
  { key: "type", label: "Type" },
  { key: "customerName", label: "Customer" },
  { key: "total", label: "Total", fmt: "money" },
  { key: "dealId", label: "Linked deal", fmt: "deal" },
  { key: "ownerId", label: "Sales person", fmt: "user" },
  { key: "discountStatus", label: "Discount approval" },
];
const PRODUCT_FIELDS: Field[] = [
  { key: "maxDiscountPct", label: "Max discount", fmt: "pct" },
  { key: "code", label: "Code" },
  { key: "model", label: "Model" },
  { key: "brand", label: "Brand" },
  { key: "category", label: "Category" },
  { key: "subCategory", label: "Sub-category" },
  { key: "capacityKw", label: "Capacity (kW)" },
];
const PRICE_FIELDS: Field[] = [
  { key: "dealerPrice", label: "Dealer price", fmt: "money" },
  { key: "landedPrice", label: "Landed price", fmt: "money" },
  { key: "landedCost", label: "Landed cost", fmt: "money" },
];
const TENTATIVE_FIELDS: Field[] = [
  { key: "model", label: "Model" },
  { key: "category", label: "Category" },
  { key: "dealerPrice", label: "Dealer price", fmt: "money" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (d: unknown) => (d instanceof Date ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : String(d));
const money = (v: number) => `₦${v.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

// ---- The queue ------------------------------------------------------------

type ItemSnap = { productId: string; qty: number; unitPrice: number };
type Entry = { entity: string; entityId: string; action: string; lines: string[]; userId: string; reason?: string };
let queue: Entry[] = [];
// Deal product lines removed / added, netted out at flush (key: user|deal).
let items = new Map<string, { userId: string; dealId: string; reason?: string; removed: ItemSnap[]; added: ItemSnap[]; changed: string[] }>();
let scheduled = false;

async function currentUserId(): Promise<string | null> {
  // Scripts (no sign-in) can name who the changes are by.
  if (process.env.CHANGE_LOG_USER) return process.env.CHANGE_LOG_USER;
  try {
    const { auth } = await import("@/auth");
    const s = await auth();
    return (s?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    return null; // outside a request (scripts): not recorded
  }
}

let base: PrismaClient;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  const run = () => {
    scheduled = false;
    void flush();
  };
  import("next/server")
    .then(({ after }) => after(run))
    .catch(() => setTimeout(run, 1000)); // scripts: gather a moment first
}

async function flush() {
  const entries = queue;
  const lineItems = items;
  queue = [];
  items = new Map();
  try {
    // Products: what actually changed per deal.
    const ids = [...new Set([...lineItems.values()].flatMap((x) => [...x.removed, ...x.added].map((i) => i.productId)))];
    const names = new Map((ids.length ? await base.product.findMany({ where: { id: { in: ids } }, select: { id: true, model: true } }) : []).map((p) => [p.id, p.model]));
    const pname = (id: string) => names.get(id) ?? "a product";
    for (const x of lineItems.values()) {
      const removed = [...x.removed];
      const lines: string[] = [...x.changed];
      for (const a of x.added) {
        const i = removed.findIndex((r) => r.productId === a.productId);
        if (i < 0) {
          lines.push(`Product added: ${pname(a.productId)} - ${a.qty} × ${money(a.unitPrice)}`);
          continue;
        }
        const r = removed.splice(i, 1)[0];
        const d: string[] = [];
        if (r.qty !== a.qty) d.push(`qty ${r.qty} → ${a.qty}`);
        if (r.unitPrice !== a.unitPrice) d.push(`rate ${money(r.unitPrice)} → ${money(a.unitPrice)}`);
        if (d.length) lines.push(`Product ${pname(a.productId)}: ${d.join(", ")}`);
      }
      for (const r of removed) lines.push(`Product removed: ${pname(r.productId)} - ${r.qty} × ${money(r.unitPrice)}`);
      if (lines.length) entries.push({ entity: "deal", entityId: x.dealId, action: "edited", lines, userId: x.userId, reason: x.reason });
    }
    const data = entries
      .filter((e) => e.lines.length || e.action !== "edited")
      .map((e) => ({
        entity: e.entity,
        entityId: e.entityId,
        action: e.action,
        userId: e.userId,
        details: [e.reason ? `(${e.reason})` : "", e.lines.join("; ")].filter(Boolean).join(" ").slice(0, 4000) || null,
      }));
    if (data.length) await base.auditLog.createMany({ data });
  } catch (e) {
    console.error("change-log", e);
  }
}

// Written straight away (so the page showing the change shows its history
// too); a deal's products go through the queue (netted out at the end).
async function push(e: Omit<Entry, "reason">) {
  const reason = reasonStore.getStore();
  try {
    await base.auditLog.create({
      data: {
        entity: e.entity,
        entityId: e.entityId,
        action: e.action,
        userId: e.userId,
        details: [reason ? `(${reason})` : "", e.lines.join("; ")].filter(Boolean).join(" ").slice(0, 4000) || null,
      },
    });
  } catch (err) {
    console.error("change-log", err);
  }
}

// ---- Formatting ------------------------------------------------------------

async function fmtAll(fields: Field[], rows: Row[]): Promise<(f: Field, v: unknown) => string> {
  const ids = (fmt: Fmt) => [...new Set(rows.flatMap((r) => fields.filter((f) => f.fmt === fmt).map((f) => r[f.key])).filter((v): v is string => typeof v === "string" && !!v))];
  const [users, accounts, contacts, deals] = await Promise.all([
    ids("user").length ? base.user.findMany({ where: { id: { in: ids("user") } }, select: { id: true, name: true } }) : [],
    ids("account").length ? base.account.findMany({ where: { id: { in: ids("account") } }, select: { id: true, name: true } }) : [],
    ids("contact").length ? base.contact.findMany({ where: { id: { in: ids("contact") } }, select: { id: true, firstName: true, lastName: true } }) : [],
    ids("deal").length ? base.deal.findMany({ where: { id: { in: ids("deal") } }, select: { id: true, title: true } }) : [],
  ]);
  const name = new Map<string, string>([
    ...users.map((u) => [u.id, u.name] as [string, string]),
    ...accounts.map((a) => [a.id, a.name] as [string, string]),
    ...contacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()] as [string, string]),
    ...deals.map((d) => [d.id, d.title] as [string, string]),
  ]);
  return (f, v) => {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "-";
    switch (f.fmt) {
      case "money":
        return money(Number(v));
      case "pct":
        return `${Number(v)}%`;
      case "date":
        return v instanceof Date ? v.toISOString().slice(0, 10).split("-").reverse().join("/") : String(v);
      case "stage":
        return DEAL_STAGE_LABELS[v as keyof typeof DEAL_STAGE_LABELS] ?? String(v);
      case "equipment":
        return EQUIPMENT_TYPE_LABELS[v as keyof typeof EQUIPMENT_TYPE_LABELS] ?? String(v);
      case "segment":
        return END_USE_SEGMENT_LABELS[v as keyof typeof END_USE_SEGMENT_LABELS] ?? String(v);
      case "lostReason":
        return LOST_REASON_LABELS[v as keyof typeof LOST_REASON_LABELS] ?? String(v);
      case "paymentTerms":
        return PAYMENT_TERMS_LABELS[v as keyof typeof PAYMENT_TERMS_LABELS] ?? String(v);
      case "yesno":
        return v ? "Yes" : "No";
      case "user":
      case "account":
      case "contact":
      case "deal":
        return name.get(String(v)) ?? "(removed)";
      default:
        return Array.isArray(v) ? v.join(", ") : String(v);
    }
  };
}
const same = (a: unknown, b: unknown) =>
  a instanceof Date || b instanceof Date
    ? (a instanceof Date ? a.getTime() : a ?? null) === (b instanceof Date ? b.getTime() : b ?? null)
    : Array.isArray(a) || Array.isArray(b)
      ? JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
      : (a ?? null) === (b ?? null) || (a === "" && b == null) || (a == null && b === "");

async function diffLines(fields: Field[], before: Row, after: Row, prefix = ""): Promise<string[]> {
  const changed = fields.filter((f) => !same(before[f.key], after[f.key]));
  if (!changed.length) return [];
  const show = await fmtAll(changed, [before, after]);
  // Not a change when it reads the same (e.g. a date re-saved at another hour).
  return changed
    .map((f) => [show(f, before[f.key]), show(f, after[f.key]), f] as const)
    .filter(([b, a]) => b !== a)
    .map(([b, a, f]) => `${prefix}${f.label}: ${b} → ${a}`);
}

// ---- What each model records -------------------------------------------------

type Spec = {
  // Where its history shows: entity + id.
  key: (r: Row) => { entity: string; entityId: string };
  // The changes between two versions of a record.
  diff: (before: Row, after: Row) => Promise<string[]>;
  created?: (r: Row) => Promise<string | null>; // null: not recorded
  deleted?: (r: Row) => Promise<string | null>;
};

const SPECS: Record<"deal" | "quotation" | "product" | "pricelist" | "tentativePrice" | "monthlyExchangeRate", Spec> = {
  deal: {
    key: (r) => ({ entity: "deal", entityId: String(r.id) }),
    diff: (b, a) => diffLines(DEAL_FIELDS, b, a),
    // Deals made on a screen record their own "created"; imports here.
    created: async (r) => (r.sourceTxnNo != null || r.sourceDocKey ? `Imported from the Sales Register - ${r.title}, ${money(Number(r.value ?? 0))}` : null),
    deleted: async (r) => `Deleted - ${r.title}`,
  },
  quotation: {
    key: (r) => ({ entity: "quote", entityId: String(r.id) }),
    diff: async (b, a) => [...(await diffLines(QUOTE_FIELDS.filter((f) => f.key !== "ref" || !String(b.ref).startsWith("DRAFT-")), b, a)), ...quoteChanges(b.data, a.data)],
    created: async (r) => (String(r.ref).startsWith("DRAFT-") ? `Draft saved - ${quoteSummary(r.data)}` : `${r.ref} saved - ${quoteSummary(r.data)}`),
    deleted: async (r) => `Deleted - ${String(r.ref).startsWith("DRAFT-") ? "draft" : r.ref}`,
  },
  product: {
    key: (r) => ({ entity: "product", entityId: String(r.id) }),
    diff: (b, a) => diffLines(PRODUCT_FIELDS, b, a),
    created: async (r) => `Product added - ${r.model} (${r.code})${r.maxDiscountPct != null ? `, max discount ${r.maxDiscountPct}%` : ""}`,
    deleted: async (r) => `Product deleted - ${r.model} (${r.code})`,
  },
  pricelist: {
    key: (r) => ({ entity: "product", entityId: String(r.productId) }),
    diff: (b, a) => diffLines(PRICE_FIELDS, b, a, `Price list ${monthName(a.month)} - `),
    created: async (r) =>
      `Price list ${monthName(r.month)} added - dealer ${money(Number(r.dealerPrice))}${r.landedPrice != null ? `, landed ${money(Number(r.landedPrice))}` : ""}${r.landedCost != null ? `, landed cost ${money(Number(r.landedCost))}` : ""}`,
    deleted: async (r) => `Price list ${monthName(r.month)} removed (dealer ${money(Number(r.dealerPrice))})`,
  },
  tentativePrice: {
    // By model, so the history carries on when an upload re-creates it.
    key: (r) => ({ entity: "tentative", entityId: String(r.model).trim().toUpperCase() }),
    diff: (b, a) => diffLines(TENTATIVE_FIELDS, b, a),
    created: async (r) => `Tentative price added - ${r.model}: ${money(Number(r.dealerPrice))}`,
    deleted: async (r) => `Tentative price removed - ${r.model} (was ${money(Number(r.dealerPrice))})`,
  },
  monthlyExchangeRate: {
    key: (r) => ({ entity: "exchangeRate", entityId: r.month instanceof Date ? r.month.toISOString().slice(0, 7) : String(r.month) }),
    diff: (b, a) => diffLines([{ key: "rate", label: `Exchange rate ${monthName(a.month)} (₦ per $1)` }], b, a),
    created: async (r) => `Exchange rate ${monthName(r.month)} set - ₦${r.rate} per $1`,
    deleted: async (r) => `Exchange rate ${monthName(r.month)} removed`,
  },
};

type Delegate = { findMany: (a: unknown) => Promise<Row[]>; findUnique: (a: unknown) => Promise<Row | null> };
const delegate = (m: string) => (base as unknown as Record<string, Delegate>)[m];
type Hook = { args: Record<string, unknown>; query: (args: unknown) => Promise<unknown> };

function hooksFor(model: keyof typeof SPECS) {
  const spec = SPECS[model];
  const d = () => delegate(model);
  const record = async (userId: string, before: Row | null, after: Row | null) => {
    if (before && after) {
      const lines = await spec.diff(before, after);
      if (lines.length) await push({ ...spec.key(after), action: "edited", lines, userId });
    } else if (after && spec.created) {
      const line = await spec.created(after);
      if (line) await push({ ...spec.key(after), action: "created", lines: [line], userId });
    } else if (before && spec.deleted) {
      const line = await spec.deleted(before);
      if (line) await push({ ...spec.key(before), action: "deleted", lines: [line], userId });
    }
  };
  // The history never breaks the change itself.
  const safely = async (f: () => Promise<void>) => {
    try {
      await f();
    } catch (e) {
      console.error("change-log", model, e);
    }
  };
  return {
    async update({ args, query }: Hook) {
      const userId = await currentUserId();
      const before = userId ? await d().findUnique({ where: args.where }).catch(() => null) : null;
      const res = await query(args);
      if (userId && before) await safely(async () => record(userId, before, await d().findUnique({ where: { id: before.id } })));
      return res;
    },
    async upsert({ args, query }: Hook) {
      const userId = await currentUserId();
      const before = userId ? await d().findUnique({ where: args.where }).catch(() => null) : null;
      const res = await query(args);
      if (userId) await safely(async () => record(userId, before, await d().findUnique({ where: before ? { id: before.id } : args.where })));
      return res;
    },
    async updateMany({ args, query }: Hook) {
      const userId = await currentUserId();
      const before = userId ? await d().findMany({ where: args.where }).catch(() => [] as Row[]) : [];
      const res = await query(args);
      if (userId && before.length)
        await safely(async () => {
          const after = new Map((await d().findMany({ where: { id: { in: before.map((b) => b.id) } } })).map((a) => [a.id, a]));
          for (const b of before) await record(userId, b, after.get(b.id) ?? null);
        });
      return res;
    },
    async create({ args, query }: Hook) {
      const res = (await query(args)) as Row;
      const userId = await currentUserId();
      if (userId && res?.id) await safely(async () => record(userId, null, await d().findUnique({ where: { id: res.id } })));
      return res;
    },
    async delete({ args, query }: Hook) {
      const userId = await currentUserId();
      const before = userId ? await d().findUnique({ where: args.where }).catch(() => null) : null;
      const res = await query(args);
      if (userId && before) await safely(() => record(userId, before, null));
      return res;
    },
    async deleteMany({ args, query }: Hook) {
      const userId = await currentUserId();
      const before = userId ? await d().findMany({ where: args.where }).catch(() => [] as Row[]) : [];
      const res = await query(args);
      if (userId) await safely(async () => {
        for (const b of before) await record(userId, b, null);
      });
      return res;
    },
  };
}

// A deal's product lines: into its history, netted out at flush.
function itemBucket(userId: string, dealId: string) {
  const k = `${userId}|${dealId}`;
  let b = items.get(k);
  if (!b) items.set(k, (b = { userId, dealId, reason: reasonStore.getStore(), removed: [], added: [], changed: [] }));
  schedule();
  return b;
}
const snap = (r: Row): ItemSnap => ({ productId: String(r.productId), qty: Number(r.qty), unitPrice: Number(r.unitPrice) });
function lineItemHooks() {
  const d = () => delegate("dealLineItem");
  return {
    async create({ args, query }: Hook) {
      const res = (await query(args)) as Row;
      const userId = await currentUserId();
      if (userId && res?.id) {
        const r = await d().findUnique({ where: { id: res.id } }).catch(() => null);
        if (r) itemBucket(userId, String(r.dealId)).added.push(snap(r));
      }
      return res;
    },
    async createMany({ args, query }: Hook) {
      const res = await query(args);
      const userId = await currentUserId();
      if (userId) {
        const data = (Array.isArray(args.data) ? args.data : [args.data]) as Row[];
        for (const r of data) if (r.dealId && r.productId) itemBucket(userId, String(r.dealId)).added.push(snap(r));
      }
      return res;
    },
    async update({ args, query }: Hook) {
      const userId = await currentUserId();
      const before = userId ? await d().findUnique({ where: args.where }).catch(() => null) : null;
      const res = await query(args);
      if (userId && before) {
        const after = await d().findUnique({ where: { id: before.id } }).catch(() => null);
        if (after) {
          const b = itemBucket(userId, String(after.dealId));
          b.removed.push(snap(before));
          b.added.push(snap(after));
        }
      }
      return res;
    },
    async delete({ args, query }: Hook) {
      const userId = await currentUserId();
      const before = userId ? await d().findUnique({ where: args.where }).catch(() => null) : null;
      const res = await query(args);
      if (userId && before) itemBucket(userId, String(before.dealId)).removed.push(snap(before));
      return res;
    },
    async deleteMany({ args, query }: Hook) {
      const userId = await currentUserId();
      const before = userId ? await d().findMany({ where: args.where }).catch(() => [] as Row[]) : [];
      const res = await query(args);
      if (userId) for (const r of before) itemBucket(userId, String(r.dealId)).removed.push(snap(r));
      return res;
    },
  };
}

export const changeLog = Prisma.defineExtension((client) => {
  base = client as unknown as PrismaClient;
  return client.$extends({
    name: "change-log",
    query: {
      deal: hooksFor("deal"),
      quotation: hooksFor("quotation"),
      product: hooksFor("product"),
      pricelist: hooksFor("pricelist"),
      tentativePrice: hooksFor("tentativePrice"),
      monthlyExchangeRate: hooksFor("monthlyExchangeRate"),
      dealLineItem: lineItemHooks(),
    } as never,
  });
});

import { prisma } from "@/lib/prisma";

// The change history of leads and deals (AuditLog): who, what and when.
// Best-effort - a failure to log never blocks the change itself.

export type AuditEntity = "lead" | "deal";

export async function audit(entity: AuditEntity, entityId: string, userId: string, action: string, details?: string | null): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { entity, entityId, userId, action, details: details?.slice(0, 2000) || null } });
  } catch (e) {
    console.error("audit", e);
  }
}

// "field: old → new" for each field that changed between two snapshots.
export type AuditField<T> = { key: keyof T; label: string; fmt?: (v: unknown) => string };
export function auditDiff<T extends Record<string, unknown>>(before: T, after: T, fields: AuditField<T>[]): string[] {
  const show = (f: AuditField<T>, v: unknown) => (v == null || v === "" ? "-" : f.fmt ? f.fmt(v) : String(v));
  const same = (a: unknown, b: unknown) =>
    a instanceof Date || b instanceof Date
      ? (a instanceof Date ? a.toISOString().slice(0, 10) : a ?? null) === (b instanceof Date ? b.toISOString().slice(0, 10) : b ?? null)
      : Array.isArray(a) || Array.isArray(b)
        ? JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
        : (a ?? null) === (b ?? null) || (a === "" && b == null) || (a == null && b === "");
  return fields.filter((f) => !same(before[f.key], after[f.key])).map((f) => `${f.label}: ${show(f, before[f.key])} → ${show(f, after[f.key])}`);
}

export const fmtDate = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10).split("-").reverse().join("/") : String(v));
export const fmtMoney = (v: unknown) => `₦${Number(v).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

// User names for ids (owner changes read as names, not ids).
export async function userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

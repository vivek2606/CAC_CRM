"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { addAccountAliases, repointAliases } from "@/lib/account-duplicates";

const FILLABLE = ["industry", "accountType", "website", "phone", "address", "city", "state", "country", "registrationNumber"] as const;

// Merges duplicate accounts into the one kept: their deals, leads, contacts
// and activities move to it, its empty details are filled from theirs, tags
// are combined, and their project / service billing lines take its name.
// The kept account keeps its code - or takes theirs if it has none. Their
// names and codes are remembered so a Sales Register upload bills them to
// the kept account.
export async function mergeAccounts(keepId: string, mergeIds: string[]): Promise<{ error?: string; merged?: number }> {
  await requireBackOffice();
  const ids = mergeIds.filter((id) => id && id !== keepId);
  if (ids.length === 0) return { error: "Tick at least one account to merge into the one you keep." };
  const keep = await prisma.account.findUnique({ where: { id: keepId } });
  const others = await prisma.account.findMany({ where: { id: { in: ids } } });
  if (!keep || others.length !== ids.length) return { error: "One of these accounts no longer exists - refresh the page." };

  const fill: Record<string, unknown> = {};
  for (const f of FILLABLE) {
    if (keep[f] == null || keep[f] === "") {
      const v = others.find((o) => o[f] != null && o[f] !== "")?.[f];
      if (v != null) fill[f] = v;
    }
  }
  const takeCode = keep.code ? null : (others.find((o) => o.code)?.code ?? null);
  const tags = [...new Set([...keep.tags, ...others.flatMap((o) => o.tags)])];

  await prisma.$transaction(async (tx) => {
    await tx.contact.updateMany({ where: { accountId: { in: ids } }, data: { accountId: keepId } });
    await tx.lead.updateMany({ where: { accountId: { in: ids } }, data: { accountId: keepId } });
    await tx.deal.updateMany({ where: { accountId: { in: ids } }, data: { accountId: keepId } });
    await tx.activity.updateMany({ where: { accountId: { in: ids } }, data: { accountId: keepId } });
    await tx.projectBilling.updateMany({ where: { custName: { in: others.map((o) => o.name) } }, data: { custName: keep.name } });
    await tx.account.deleteMany({ where: { id: { in: ids } } });
    await tx.account.update({ where: { id: keepId }, data: { ...fill, tags, ...(takeCode ? { code: takeCode } : {}) } });
  });
  await repointAliases(ids, keepId);
  await addAccountAliases(
    keepId,
    others.map((o) => o.name),
    others.map((o) => o.code).filter((c): c is string => !!c),
  );

  revalidatePath("/accounts");
  revalidatePath("/accounts/duplicates");
  revalidatePath(`/accounts/${keepId}`);
  revalidatePath("/reports/sales-register");
  return { merged: ids.length };
}

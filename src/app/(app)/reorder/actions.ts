"use server";

import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { modelKey, modelCodeOf } from "@/lib/model-family";

export type ModelSalesHistory = {
  model: string;
  codes: string[];
  years: { year: number; months: number[]; total: number }[];
  // Average units a month over the last three complete months.
  avg3: { from: string; to: string; perMonth: number };
};

// Units sold month by month, this year and last, of a model - every code of the same model and type together (see
// model-family.ts), from the Sales Register and CRM won deals.
export async function modelSalesHistory(productId: string): Promise<ModelSalesHistory | null> {
  await requireBackOffice();
  const products = await prisma.product.findMany({ select: { id: true, code: true, model: true } });
  const me = products.find((p) => p.id === productId);
  if (!me) return null;
  const key = modelKey(me.model);
  const group = products.filter((p) => modelKey(p.model) === key);
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const years = [thisYear, thisYear - 1];
  const last3 = [3, 2, 1].map((back) => new Date(Date.UTC(thisYear, now.getUTCMonth() - back, 1)));
  const sums = await prisma.saleLineItem.groupBy({
    by: ["month"],
    where: { productId: { in: group.map((p) => p.id) }, month: { gte: last3[0] < new Date(Date.UTC(thisYear - 1, 0, 1)) ? last3[0] : new Date(Date.UTC(thisYear - 1, 0, 1)), lt: new Date(Date.UTC(thisYear + 1, 0, 1)) } },
    _sum: { qty: true },
  });
  return {
    model: modelCodeOf(me.model),
    codes: group.map((p) => p.code),
    years: years.map((year) => {
      const months = Array.from({ length: 12 }, (_, m) =>
        sums.filter((x) => x.month.getUTCFullYear() === year && x.month.getUTCMonth() === m).reduce((t, x) => t + (x._sum.qty ?? 0), 0),
      );
      return { year, months, total: months.reduce((t, n) => t + n, 0) };
    }),
    avg3: {
      from: last3[0].toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      to: last3[2].toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }),
      perMonth: Math.round((sums.filter((x) => last3.some((d) => d.getTime() === x.month.getTime())).reduce((t, x) => t + (x._sum.qty ?? 0), 0) / 3) * 10) / 10,
    },
  };
}

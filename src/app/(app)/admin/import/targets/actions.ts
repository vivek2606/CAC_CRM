"use server";

import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { parseTargetsBuffer } from "@/lib/import/parse-targets";
import { transformTargets } from "@/lib/import/targets";
import { normalizeSalesmanName } from "@/lib/import/roster";

export type ImportSummary = {
  totalRowsIn: number;
  targetsSet: number;
  totalTargetValue: number;
  unresolvedNames: string[];
  unparsedMonths: string[];
  skippedFileRows: number;
};

export type ImportState = { error?: string; summary?: ImportSummary };

export async function importTargets(
  _prevState: ImportState | undefined,
  formData: FormData
): Promise<ImportState> {
  await requireHead();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  let rows: Awaited<ReturnType<typeof parseTargetsBuffer>>["rows"];
  let skippedFileRows = 0;
  try {
    const buffer = await file.arrayBuffer();
    const parsed = await parseTargetsBuffer(buffer);
    rows = parsed.rows;
    skippedFileRows = parsed.skippedRows;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the uploaded file." };
  }

  if (rows.length === 0) {
    return { error: "No usable rows found in the file." };
  }

  const result = transformTargets(rows);

  // Match each row's rep name against the active sales team by normalized name.
  const reps = await prisma.user.findMany({
    where: { isActive: true, title: "Sales Manager" },
    select: { id: true, name: true },
  });
  const userIdByNormalizedName = new Map(reps.map((r) => [normalizeSalesmanName(r.name), r.id]));

  const unresolvedNames: string[] = [];
  let targetsSet = 0;
  let totalTargetValue = 0;

  for (const t of result.targets) {
    const userId = userIdByNormalizedName.get(t.repNameKey);
    if (!userId) {
      unresolvedNames.push(t.repNameKey);
      continue;
    }
    await prisma.target.upsert({
      where: { userId_month: { userId, month: t.month } },
      create: { userId, month: t.month, targetValue: t.targetValue },
      update: { targetValue: t.targetValue },
    });
    targetsSet++;
    totalTargetValue += t.targetValue;
  }

  return {
    summary: {
      totalRowsIn: result.summary.totalRowsIn,
      targetsSet,
      totalTargetValue,
      unresolvedNames: Array.from(new Set(unresolvedNames)),
      unparsedMonths: result.unparsedMonths,
      skippedFileRows,
    },
  };
}

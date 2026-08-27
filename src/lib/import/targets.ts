import type { RawTargetRow } from "./parse-targets";
import { parseMonthText } from "./parse-targets";
import { normalizeSalesmanName } from "./roster";

export type TransformedTarget = {
  repNameKey: string; // normalized name/nickname as typed in the sheet, for matching against active reps
  month: Date;
  targetValue: number;
};

export type TargetsTransformResult = {
  targets: TransformedTarget[];
  unparsedMonths: string[];
  summary: { totalRowsIn: number; keptRows: number };
};

// The same nicknames the Leads sheet uses for these 5 reps, so either sheet
// style works without the user having to standardize naming across files.
const NICKNAME_TO_FULL_NAME: Record<string, string> = {
  CHRIS: "CHRIS- CAC",
  ABISOLA: "UDOH ABISOLA",
  CHIOMA: "CHIOMA ADUMEKWE",
  BUNMI: "ODUJEBE OLUWABUNMI AMINAT",
  CELINAH: "CELINAH OLUWAMAYO OJO",
  KAZEEM: "KAZEEM RAMONI",
};

export function transformTargets(rows: RawTargetRow[]): TargetsTransformResult {
  const totalRowsIn = rows.length;
  const targets: TransformedTarget[] = [];
  const unparsedMonths: string[] = [];

  for (const row of rows) {
    const month = parseMonthText(row.month);
    if (!month) {
      unparsedMonths.push(row.month);
      continue;
    }

    const normalized = normalizeSalesmanName(row.salesPerson);
    const repNameKey = NICKNAME_TO_FULL_NAME[normalized] ?? normalized;

    targets.push({ repNameKey, month, targetValue: row.target });
  }

  return {
    targets,
    unparsedMonths: Array.from(new Set(unparsedMonths)),
    summary: { totalRowsIn, keptRows: targets.length },
  };
}

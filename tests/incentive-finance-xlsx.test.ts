import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildIncentiveFinanceXlsx } from "@/lib/incentive-report-xlsx";
import type { IncentiveApproval, IncentiveSnapshot } from "@/lib/incentive-approval";

it("finance payment list: one row per person paid, with the total", async () => {
  const row = (name: string, payout: number, salarySupport: number) =>
    ({ userId: name, name, target: 0, productSales: 0, projectSales: 0, sales: 0, achievement: 1, rate: 0.01, incentive: payout, payout, toPool: 0, salarySupportPct: 0, salarySupport, totalToReceive: payout + salarySupport }) as IncentiveSnapshot["rows"][number];
  const snapshot: IncentiveSnapshot = {
    rows: [row("Priya", 100_000, 20_000), row("Nil", 0, 0)],
    support: [{ name: "Joy", role: "Sales Coordinator", coordinator: true, userId: null, amount: 30_000 }],
    scheme: { tiers: [], salesPersonSharePct: 80, coordinatorFirstShare: 0 },
  };
  const approval: IncentiveApproval & { snapshot: IncentiveSnapshot } = { status: "APPROVED", approvedBy: { id: "h", name: "Head" }, approvedAt: "2026-11-01", snapshot };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildIncentiveFinanceXlsx({ monthLabel: "October 2026", companyName: "Co", approval })) as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("Payment list")!;
  const rows: unknown[][] = [];
  ws.eachRow((r) => rows.push((r.values as unknown[]).slice(1)));
  const priya = rows.find((r) => r[1] === "Priya")!;
  expect(priya.slice(0, 5)).toEqual([1, "Priya", "Sales", 100_000, 20_000]);
  expect(priya[5]).toMatchObject({ formula: expect.stringMatching(/^D\d+\+E\d+$/), result: 120_000 });
  expect(rows.find((r) => r[1] === "Joy")!.slice(0, 4)).toEqual([2, "Joy", "Sales Coordinator", 30_000]);
  expect(rows.some((r) => r[1] === "Nil")).toBe(false);
  const total = rows.find((r) => r[1] === "TOTAL PAYABLE")!;
  expect(total[5]).toMatchObject({ formula: expect.stringMatching(/^SUM\(F\d+:F\d+\)$/) });
});

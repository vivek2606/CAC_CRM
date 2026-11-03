import { expect, it } from "vitest";
import { claimTotals } from "@/lib/warranty-claims";

it("adds up claimed, pending, approved, rejected and credited", () => {
  const t = claimTotals([
    { status: "DRAFT", claimAmount: 100, approvedAmount: null, creditedAmount: null },
    { status: "SUBMITTED", claimAmount: 200, approvedAmount: null, creditedAmount: null },
    { status: "APPROVED", claimAmount: 300, approvedAmount: 250, creditedAmount: null },
    { status: "REJECTED", claimAmount: 50, approvedAmount: null, creditedAmount: null },
    { status: "CREDITED", claimAmount: 400, approvedAmount: 400, creditedAmount: 380 },
  ]);
  expect(t).toEqual({ claimed: 950, drafts: 100, pending: 200, approved: 650, rejected: 50, credited: 380 });
});

import { describe, expect, it } from "vitest";
import { buildRegisterRows, invoiceFromKey, registerTotals, type RegisterLine } from "@/lib/sales-register";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const line = (o: Partial<RegisterLine> & { value: number; qty: number }): RegisterLine => ({
  id: Math.random().toString(36),
  docDate: d("2026-10-05"),
  sourceKey: "deal-item:x",
  owner: { name: "Rep" },
  product: { code: "1301221010", model: "MVC-M730", category: "VRF" },
  deal: null,
  ...o,
});

describe("Sales Register lines", () => {
  it("takes the invoice no. from the deal, the register's txn no., or the import key", () => {
    expect(invoiceFromKey("SI/88001-1301221010-1", "1301221010")).toBe("88001");
    expect(invoiceFromKey("SI/88001~2026-10-01~ACME~REP-1301221010-2", "1301221010")).toBe("88001");
    expect(invoiceFromKey("deal-item:abc", "x")).toBeNull();
    const rows = buildRegisterRows(
      [
        line({ qty: 2, value: 1000, deal: { id: "d1", sourceTxnNo: 777, invoiceNo: "X", title: "T", billingCompany: "Sakuragi", account: null } }),
        line({ qty: 1, value: 500, deal: { id: "d2", sourceTxnNo: null, invoiceNo: "INV-9", title: "T", billingCompany: null, account: { name: "Acme", code: "21" } } }),
      ],
      [],
      [],
      new Map(),
    );
    expect(rows.map((r) => r.invoiceNo)).toEqual(["777", "INV-9"]);
    expect(rows[1].company).toBe("Not recorded");
    expect(rows[1].accountName).toBe("Acme");
  });
  it("works out the rate from the line value (qty 0 keeps the value)", () => {
    const rows = buildRegisterRows([line({ qty: 3, value: 1000 }), line({ qty: 0, value: 250 })], [], [], new Map());
    expect(rows[0].rate).toBe(333.33);
    expect(rows[1].rate).toBe(250);
  });
  it("adds won deals with no products at the deal's value, and project billing", () => {
    const rows = buildRegisterRows(
      [],
      [{ id: "b1", title: "Deal A", value: 2_000_000, closedAt: d("2026-10-02"), invoiceNo: "55", billingCompany: "Somotex", owner: { name: "Rep" }, account: null }],
      [{ id: "pb1", docDate: d("2026-10-03"), value: 3_000_000, txnNo: 0, docKey: "PB/9", custName: "Acme", itemCode: "SVC", itemName: "Installation", billingCompany: null, owner: { name: "Rep" } }],
      new Map([["Acme", "2121"]]),
    );
    expect(rows.map((r) => [r.category, r.amount, r.invoiceNo])).toEqual([
      ["No products listed", 2_000_000, "55"],
      ["Project & Service", 3_000_000, "PB/9"],
    ]);
    expect(rows[1].accountCode).toBe("2121");
  });
});

describe("Sales Register totals", () => {
  it("adds qty and amount (returns negative) and counts invoices per entity", () => {
    const t = registerTotals([
      { qty: 2, amount: 1000.1, invoiceNo: "100", company: "Sakuragi" },
      { qty: 1, amount: 500.2, invoiceNo: "100", company: "Sakuragi" },
      { qty: 1, amount: 700, invoiceNo: "100", company: "Somotex" },
      { qty: -1, amount: -200, invoiceNo: "R1", company: "Sakuragi" },
      { qty: 1, amount: 99.7, invoiceNo: "", company: "Not recorded" },
    ]);
    expect(t.qty).toBe(4);
    expect(t.amount).toBe(2100);
    expect(t.invoices).toBe(3);
  });
});

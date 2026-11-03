import { expect, it } from "vitest";
import { unbilled } from "@/lib/unbilled";

it("finds what wasn't billed, per product, at the deal's rate", () => {
  const items = [
    { productId: "A", qty: 5, unitPrice: 100 },
    { productId: "B", qty: 2, unitPrice: 50 },
    { productId: "C", qty: 1, unitPrice: 10 },
  ];
  // Invoice 1: 3 A + all of C; invoice 2: 1 A. B not billed; a return ignored.
  const left = unbilled(items, [
    { items: [{ productId: "A", qty: 3 }, { productId: "C", qty: 1 }, { productId: "B", qty: -1 }] },
    { items: [{ productId: "A", qty: 1 }] },
  ]);
  expect(left).toEqual([
    { productId: "A", model: "", qty: 1, unitPrice: 100 },
    { productId: "B", model: "", qty: 2, unitPrice: 50 },
  ]);
  // Everything billed (or more): nothing left.
  expect(unbilled(items, [{ items: [{ productId: "A", qty: 6 }, { productId: "B", qty: 2 }, { productId: "C", qty: 1 }] }])).toEqual([]);
});

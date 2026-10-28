import { expect, it } from "vitest";
import { nextQuoteRef } from "@/lib/quote-ref";
import { isIssuedQuoteRef } from "@/lib/document-format";
import { nextServiceInvoiceRef } from "@/lib/service-invoice";
import { describeDb } from "./helpers";

// A year no earlier run has used, so its counter starts at 1.
const Y = 2100 + Math.floor(Math.random() * 7000);
const at = (y: number, md = "05-01") => new Date(`${y}-${md}T10:00:00Z`);

describeDb("quotation numbers", () => {
  it("issues SNIL/CAC/LAG/<initials>/<year>/<no.> numbers that run on", async () => {
    const a = await nextQuoteRef("Vivek Kumar", at(Y));
    const b = await nextQuoteRef("Chris Mokobia", at(Y, "06-01"));
    expect(a).toBe(`SNIL/CAC/LAG/VK/${Y}/0001`);
    expect(b).toBe(`SNIL/CAC/LAG/CM/${Y}/0002`);
    expect(isIssuedQuoteRef(a)).toBe(true);
  });
  it("starts again at 0001 each year", async () => {
    expect(await nextQuoteRef("Vivek Kumar", at(Y + 1, "01-02"))).toBe(`SNIL/CAC/LAG/VK/${Y + 1}/0001`);
  });
  it("never gives two people the same number, even at the same moment", async () => {
    const refs = await Promise.all(Array.from({ length: 25 }, (_, i) => nextQuoteRef(`Rep ${i}`, at(Y + 2))));
    const nos = refs.map((r) => r.split("/").pop());
    expect(new Set(nos).size).toBe(25);
  });
});

describeDb("Somotex invoice numbers", () => {
  it("issues SNL/CAC/LAG/LK/<invoice date>/<no.>, unique even at the same moment", async () => {
    const refs = await Promise.all(Array.from({ length: 20 }, () => nextServiceInvoiceRef(new Date(`${Y + 3}-10-28T00:00:00Z`))));
    expect(refs.every((r) => new RegExp(`^SNL/CAC/LAG/LK/${Y + 3}1028/\\d{4}$`).test(r))).toBe(true);
    expect(new Set(refs).size).toBe(20);
  });
});

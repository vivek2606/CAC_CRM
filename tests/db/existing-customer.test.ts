import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { findExisting, phoneKey } from "@/lib/existing-customer";
import { describeDb, makeUser } from "./helpers";

it("reads Nigerian numbers the same however they're typed", () => {
  expect(phoneKey("0803 123 4567")).toBe("8031234567");
  expect(phoneKey("+234 803-123-4567")).toBe("8031234567");
  expect(phoneKey("2348031234567")).toBe("8031234567");
  expect(phoneKey("12345")).toBeNull();
});

describeDb("already in the CRM", () => {
  it("finds the same customer by phone (any format) or company name, with its owner", async () => {
    const priya = await makeUser("Dup Priya");
    const tag = `${Date.now()}`.slice(-7);
    const phone = `0809 ${tag.slice(0, 3)} ${tag.slice(3)}`;
    const acc = await prisma.account.create({ data: { name: `Zeltron${tag} Engineering Limited`, phone: `+234${phone.replace(/\D/g, "").slice(1)}`, ownerId: priya.id } });
    const lead = await prisma.lead.create({ data: { title: "Chiller enquiry", company: `ZELTRON${tag} ENGINEERING LTD`, ownerId: priya.id } });

    const byPhone = await findExisting({ phone: `0${phone.replace(/\D/g, "").slice(1)}` });
    expect(byPhone.map((m) => [m.kind, m.id, m.why, m.owner])).toContainEqual(["account", acc.id, "phone", "Dup Priya"]);

    const byName = await findExisting({ name: `Zeltron${tag} Engineering Ltd.` });
    expect(byName.map((m) => m.id)).toEqual(expect.arrayContaining([acc.id, lead.id]));

    // The record being edited isn't its own duplicate.
    expect((await findExisting({ name: `Zeltron${tag} Engineering`, exclude: { kind: "lead", id: lead.id } })).map((m) => m.id)).not.toContain(lead.id);
    // Unrelated name: nothing.
    expect(await findExisting({ name: `Quorvex${tag} Foods` })).toEqual([]);
  });
});

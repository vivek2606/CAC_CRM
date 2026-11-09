import { expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { upcomingKeyDates } from "@/lib/key-dates";
import { describeDb, makeUser } from "./helpers";

describeDb("birthdays and anniversaries", () => {
  it("lists your contacts' dates from today to 3 days ahead, Lagos time", async () => {
    const rep = await makeUser(`KD Rep ${Date.now()}`);
    const d = (m: number, day: number) => new Date(Date.UTC(2000, m - 1, day));
    await prisma.contact.createMany({
      data: [
        { firstName: "Ada", lastName: "Today", ownerId: rep.id, birthday: d(11, 10), phone: "08031234567" },
        { firstName: "Bayo", lastName: "Soon", ownerId: rep.id, specialDate: d(11, 13), specialDateLabel: "Wedding anniversary" },
        { firstName: "Chi", lastName: "Later", ownerId: rep.id, birthday: d(11, 20) },
      ],
    });
    // 23:30 UTC on 9 Nov is already 10 Nov in Lagos.
    const list = await upcomingKeyDates([rep.id], 3, new Date("2026-11-09T23:30:00Z"));
    expect(list.map((k) => [k.firstName, k.kind, k.daysAway])).toEqual([
      ["Ada", "Birthday", 0],
      ["Bayo", "Wedding anniversary", 3],
    ]);
  });
});

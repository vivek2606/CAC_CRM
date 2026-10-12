import { prisma } from "@/lib/prisma";
import { QUOTE_REF_PREFIX, nameInitials } from "@/lib/document-format";

// Next quotation reference, unique across the company:
// SNIL/CAC/LAG/<initials>/<year>/<running no.>. The running number is a
// per-year counter kept in AppSetting and incremented in one SQL statement,
// so two people downloading at the same moment can't get the same number.
export async function nextQuoteRef(userName: string, now = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const key = `quote-ref-seq:${year}`;
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    INSERT INTO "AppSetting" ("key", "value", "updatedAt")
    VALUES (${key}, '1'::jsonb, NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = to_jsonb((("AppSetting"."value") #>> '{}')::int + 1), "updatedAt" = NOW()
    RETURNING (("value") #>> '{}')::int AS n
  `;
  const n = Number(rows[0]?.n ?? 1);
  return `${QUOTE_REF_PREFIX}/${nameInitials(userName)}/${year}/${String(n).padStart(4, "0")}`;
}

import { expect, it } from "vitest";
import { quoteShareToken, readQuoteShareToken } from "@/lib/quote-share";
import { waNumber } from "@/lib/whatsapp";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret";

it("share links open only unaltered and unexpired", () => {
  const t = quoteShareToken("cq123");
  expect(readQuoteShareToken(t)).toBe("cq123");
  expect(readQuoteShareToken(t.replace("cq123", "cq124"))).toBeNull();
  expect(readQuoteShareToken(t.slice(0, -1) + (t.endsWith("a") ? "b" : "a"))).toBeNull();
  expect(readQuoteShareToken(t, Date.now() + 61 * 86400000)).toBeNull();
  expect(readQuoteShareToken("garbage")).toBeNull();
});

it("WhatsApp numbers get the country code", () => {
  expect(waNumber("0803 123 4567")).toBe("2348031234567");
  expect(waNumber("+234 803 123 4567")).toBe("2348031234567");
  expect(waNumber("00971501234567")).toBe("971501234567");
  expect(waNumber("12345")).toBeNull();
});

import { describe, expect, it } from "vitest";
import { HELP_SECTIONS, helpAudience } from "@/lib/help-guide";

describe("help guide", () => {
  it("picks the reader's role", () => {
    expect(helpAudience({ role: "HEAD" })).toBe("head");
    expect(helpAudience({ role: "COORDINATOR" })).toBe("coordinator");
    expect(helpAudience({ role: "SALES_MANAGER", title: "Service Manager" })).toBe("service");
    expect(helpAudience({ role: "SALES_MANAGER", title: "Senior Sales Manager" })).toBe("sales");
  });
  it("gives every role some sections, and the service side only to service and back office", () => {
    for (const who of ["sales", "coordinator", "service", "head"] as const) expect(HELP_SECTIONS.some((s) => s.for.includes(who))).toBe(true);
    expect(HELP_SECTIONS.find((s) => s.id === "service")!.for).not.toContain("sales");
    expect(HELP_SECTIONS.find((s) => s.id === "leads")!.for).not.toContain("service");
    expect(new Set(HELP_SECTIONS.map((s) => s.id)).size).toBe(HELP_SECTIONS.length);
  });
});

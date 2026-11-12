// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { inspectDomainDns } from "@/services/commerce/domain-dns";
import type { DomainSetup } from "@/domain/commerce/domain-setup";
const row = { hostname: "shop.example.com", verification_token: "unique-tenant-token", expected_records: [{ type: "A", name: "@", value: "8.8.8.8", ttl: 300 }] } as DomainSetup;
describe("on-demand DNS inspection", () => {
  it("checks both the exact platform proof and operator-provided pointing", async () => {
    const read = vi.fn(async (type: string) => type === "TXT" ? ["pricing-pro=unique-tenant-token"] : ["8.8.8.8"]);
    const result = await inspectDomainDns(row, read);
    expect(result.ownership).toBe(true); expect(result.records[0].matched).toBe(true);
    expect(read).toHaveBeenCalledWith("TXT", "_pricing-pro.shop.example.com"); expect(read).toHaveBeenCalledWith("A", "shop.example.com");
  });
  it("does not authorize a different TXT token or accept mixed old/new A destinations", async () => {
    const result = await inspectDomainDns(row, async type => type === "TXT" ? ["pricing-pro=other-tenant-token"] : ["8.8.8.8", "1.1.1.1"]);
    expect(result.ownership).toBe(false); expect(result.records[0].matched).toBe(false);
  });
  it("handles propagation failure as a humanized result rather than a successful check", async () => {
    const result = await inspectDomainDns(row, async () => { throw new Error("ENODATA"); });
    expect(result.ownership).toBe(false); expect(result.records[0]).toMatchObject({ matched: false, found: [], error: expect.stringContaining("propagação") });
  });
});

// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/schedules/commerce-olist/route";
import { getPool } from "@/lib/db/client";
import { processCommerceOlistQueue } from "@/services/commerce/olist-worker";
vi.mock("@/lib/db/client", () => ({ getPool: vi.fn() }));
vi.mock("@/services/commerce/olist-worker", () => ({ processCommerceOlistQueue: vi.fn() }));
const query = vi.fn();
function dispatch(overrides: Record<string, string> = {}) {
  return new Request("http://localhost/api/schedules/commerce-olist", { method: "POST", headers: {
    "ce-specversion": "1.0", "ce-type": "com.vercel.schedule.v1beta", "ce-source": "vercel/schedules",
    "ce-id": "execution-test", "ce-vssscheduleid": "schedule-test", "ce-vssschedulename": "commerce-olist",
    "ce-vssnamespace": "default", "ce-vssscheduledat": "2026-11-10T12:00:00Z", "ce-vssschedulesource": "static",
    "ce-vssexpression": "* * * * *", ...overrides,
  } });
}
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("COMMERCE_ENABLED", "true");
  query.mockReset(); query.mockResolvedValue({ rowCount: 1, rows: [] });
  vi.mocked(getPool).mockReturnValue({ query } as never);
  vi.mocked(processCommerceOlistQueue).mockResolvedValue(1);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
describe("private Vercel Olist schedule", () => {
  it("rejects ordinary HTTP calls without schedule metadata", async () => {
    expect((await POST(new Request("http://localhost/api/schedules/commerce-olist", { method: "POST" }))).status).toBe(400);
    expect(processCommerceOlistQueue).not.toHaveBeenCalled(); expect(getPool).not.toHaveBeenCalled();
  });
  it.each(["preview", "development"])("does not execute ERP operations in %s even with forged event headers", async environment => {
    vi.stubEnv("VERCEL_ENV", environment);
    expect((await POST(dispatch())).status).toBe(200);
    expect(getPool).not.toHaveBeenCalled(); expect(processCommerceOlistQueue).not.toHaveBeenCalled();
  });
  it("does not touch the database when commerce is disabled", async () => {
    vi.stubEnv("COMMERCE_ENABLED", "false"); expect((await POST(dispatch())).status).toBe(200);
    expect(getPool).not.toHaveBeenCalled();
  });
  it("processes the tenant-filtered existing queue without relying on CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await POST(dispatch())).status).toBe(200);
    expect(processCommerceOlistQueue).toHaveBeenCalledWith(undefined, 1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("interval '7 days'"), expect.any(Array));
  });
  it("deduplicates execution IDs and never drains a second order for a duplicate event", async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect((await POST(dispatch())).status).toBe(200); expect(processCommerceOlistQueue).not.toHaveBeenCalled();
  });
  it("reports failures and releases a failed receipt without concealing the failure", async () => {
    vi.mocked(processCommerceOlistQueue).mockRejectedValueOnce(new Error("simulated worker failure"));
    await expect(POST(dispatch())).rejects.toThrow("simulated worker failure");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("delete from commerce_olist_leases where lock_key=$1"), expect.any(Array));
  });
  it("does not accept another schedule's dispatch", async () => {
    await expect(POST(dispatch({ "ce-vssschedulename": "different-job" }))).rejects.toThrow("Unexpected Olist schedule");
    expect(getPool).not.toHaveBeenCalled();
  });
  it("declares a private target rather than restoring legacy public crons or overriding Next's build", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.schedules["commerce-olist"]).toEqual({ schedule: "* * * * *", timezone: "America/Sao_Paulo", jitter: 1, function: "api/schedules/commerce-olist" });
    expect(config.functions["src/app/api/schedules/commerce-olist/route.ts"].experimentalTriggers).toEqual([{ type: "schedule/v1beta" }]);
    expect(config).not.toHaveProperty("crons"); expect(config).not.toHaveProperty("builds"); expect(config).not.toHaveProperty("outputDirectory");
  });
});

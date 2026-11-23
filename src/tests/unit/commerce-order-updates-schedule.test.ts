// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runScheduledCommerceOrderUpdates } from "@/services/commerce/order-updates-scheduled-run";
import { processCommerceOrderNotifications } from "@/services/commerce/order-notifications";
import { processCommerceShippingOlist } from "@/services/commerce/shipping-olist";
import type { ScheduleMetadata } from "@vercel/schedules";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getPool: () => ({ query }) }));
vi.mock("@/services/commerce/order-notifications", () => ({ processCommerceOrderNotifications: vi.fn() }));
vi.mock("@/services/commerce/shipping-olist", () => ({ processCommerceShippingOlist: vi.fn() }));
const metadata = { name: "commerce-order-updates", namespace: "default", source: "static", executionId: "occurrence-1", scheduledAt: new Date(), scheduleId: "schedule" } as ScheduleMetadata;
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("COMMERCE_ENABLED", "true"); query.mockResolvedValue({ rowCount: 1, rows: [] }); });
describe("private order update schedule", () => {
  it.each(["preview", "development"])("does not send emails or invoke Olist from %s", async environment => {
    vi.stubEnv("VERCEL_ENV", environment); await runScheduledCommerceOrderUpdates(metadata);
    expect(query).not.toHaveBeenCalled(); expect(processCommerceOrderNotifications).not.toHaveBeenCalled();
  });
  it("rejects another schedule name or source", async () => {
    await expect(runScheduledCommerceOrderUpdates({ ...metadata, name: "forged" })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it("processes bounded batches without polling tracking", async () => {
    await runScheduledCommerceOrderUpdates(metadata);
    expect(processCommerceOrderNotifications).toHaveBeenCalledWith(undefined, 5);
    expect(processCommerceShippingOlist).toHaveBeenCalledWith(undefined, 2);
    expect(query.mock.calls[0][1][0]).toMatch(/^commerce-order-updates:/);
  });
  it("deduplicates execution IDs", async () => {
    query.mockResolvedValueOnce({ rowCount: 0 }); await runScheduledCommerceOrderUpdates(metadata);
    expect(processCommerceOrderNotifications).not.toHaveBeenCalled();
  });
});

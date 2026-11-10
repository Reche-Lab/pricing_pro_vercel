import { after } from "next/server";

export function scheduleCommerceOlist(tenantId: string, orderId?: string) {
  if (process.env.COMMERCE_ENABLED !== "true") return;
  try {
    after(async () => {
      try {
        const worker = await import("./olist-worker");
        if (orderId) await worker.processCommerceOlistOrder(tenantId, orderId);
        else await worker.processCommerceOlistQueue(tenantId, 1);
      } catch (error) {
        console.error("Commerce Olist background processing deferred.", { tenantId, orderId, errorType: error instanceof Error ? error.name : "unknown" });
      }
    });
  } catch {
    // CLI/tests have no Next request lifetime; the durable queue is picked up by cron.
  }
}

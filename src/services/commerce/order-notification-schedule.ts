import { after } from "next/server";

export function scheduleCommerceOrderNotifications(tenantId: string, orderId?: string) {
  if (process.env.COMMERCE_ENABLED !== "true") return;
  try {
    after(async () => {
      try {
        const worker = await import("./order-notifications");
        await worker.processCommerceOrderNotifications(tenantId, 5, orderId);
      } catch {
        console.error("Commerce order notifications deferred.", { tenantId, orderId });
      }
    });
  } catch {
    // Outside a Next request lifetime, the durable outbox awaits the periodic worker.
  }
}

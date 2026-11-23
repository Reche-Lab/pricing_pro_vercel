import { createHash, randomUUID } from "node:crypto";
import type { ScheduleMetadata } from "@vercel/schedules";
import { getPool } from "@/lib/db/client";
import { processCommerceOrderNotifications } from "./order-notifications";
import { processCommerceShippingOlist } from "./shipping-olist";

export async function runScheduledCommerceOrderUpdates(metadata: ScheduleMetadata) {
  if (metadata.name !== "commerce-order-updates" || metadata.namespace !== "default" || metadata.source !== "static") throw new Error("Unexpected order updates schedule target.");
  if (process.env.VERCEL_ENV !== "production" || process.env.COMMERCE_ENABLED !== "true") return;
  const pool = getPool(), token = randomUUID();
  const key = `commerce-order-updates:${createHash("sha256").update(metadata.executionId).digest("hex")}`;
  const claimed = await pool.query(`insert into commerce_olist_leases(lock_key,token,expires_at) values($1,$2,now()+interval '5 minutes')
    on conflict(lock_key) do update set token=excluded.token,expires_at=excluded.expires_at where commerce_olist_leases.expires_at<now() returning token`, [key, token]);
  if (!claimed.rowCount) return;
  try {
    const notifications = await processCommerceOrderNotifications(undefined, 5);
    const tracking = await processCommerceShippingOlist(undefined, 2);
    await pool.query("update commerce_olist_leases set expires_at=now()+interval '7 days' where lock_key=$1 and token=$2", [key, token]);
    await pool.query("delete from commerce_olist_leases where starts_with(lock_key,'commerce-order-updates:') and expires_at<now()");
    console.info("Commerce order updates schedule completed.", { executionId: metadata.executionId, notifications, tracking });
  } catch (error) {
    await pool.query("delete from commerce_olist_leases where lock_key=$1 and token=$2", [key, token]);
    throw error;
  }
}

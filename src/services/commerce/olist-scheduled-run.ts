import { createHash, randomUUID } from "node:crypto";
import type { ScheduleMetadata } from "@vercel/schedules";
import { getPool } from "@/lib/db/client";
import { processCommerceOlistQueue } from "./olist-worker";

const receiptPrefix = "commerce-olist-schedule:";

export async function runScheduledCommerceOlist(metadata: ScheduleMetadata) {
  if (metadata.name !== "commerce-olist" || metadata.namespace !== "default" || metadata.source !== "static") throw new Error("Unexpected Olist schedule target.");
  // Next dev also exposes route handlers; synthetic CloudEvent headers must not
  // trigger real ERP operations locally or against a Preview's database.
  if (process.env.VERCEL_ENV !== "production" || process.env.COMMERCE_ENABLED !== "true") {
    console.info("Commerce Olist schedule skipped.", { executionId: metadata.executionId, reason: "not_production_or_disabled" });
    return;
  }
  const db = getPool();
  const key = `${receiptPrefix}${createHash("sha256").update(metadata.executionId).digest("hex")}`;
  const token = randomUUID();
  const claimed = await db.query(`insert into commerce_olist_leases(lock_key,token,expires_at) values($1,$2,now()+interval '2 minutes')
    on conflict(lock_key) do update set token=excluded.token,expires_at=excluded.expires_at
    where commerce_olist_leases.expires_at<now() returning token`, [key, token]);
  if (!claimed.rowCount) {
    console.info("Commerce Olist schedule duplicate skipped.", { executionId: metadata.executionId });
    return;
  }
  const startedAt = Date.now();
  console.info("Commerce Olist schedule started.", { executionId: metadata.executionId, scheduleId: metadata.scheduleId, scheduledAt: metadata.scheduledAt.toISOString() });
  try {
    const selected = await processCommerceOlistQueue(undefined, 1);
    await db.query("update commerce_olist_leases set expires_at=now()+interval '7 days' where lock_key=$1 and token=$2", [key, token]);
    await db.query("delete from commerce_olist_leases where starts_with(lock_key,$1) and expires_at<now()", [receiptPrefix]);
    console.info("Commerce Olist schedule completed.", { executionId: metadata.executionId, selectedOrders: selected, durationMs: Date.now() - startedAt });
  } catch (error) {
    await db.query("delete from commerce_olist_leases where lock_key=$1 and token=$2", [key, token]).catch(() => undefined);
    console.error("Commerce Olist schedule failed.", { executionId: metadata.executionId, durationMs: Date.now() - startedAt, errorType: error instanceof Error ? error.name : "unknown" });
    throw error;
  }
}

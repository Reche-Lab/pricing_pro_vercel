import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db/client";
import { commerceTransaction } from "@/repositories/commerce";
import { safeShippingUrl, trackingValue } from "@/domain/commerce/order-shipping";
import { OlistRequestError } from "@/services/olist/olist";
import { commerceOlistRequest } from "./olist-client";

type TrackingJob = {
  id: string; tenant_id: string; order_id: string;
  tracking_code: string; tracking_url: string;
  sales_order_id: string; invoice_id: string;
};

const trackingQuery = `select s.id,s.tenant_id,s.order_id,s.tracking_code,s.tracking_url,j.sales_order_id,j.invoice_id
  from commerce_order_shipments s
  join commerce_orders o on o.tenant_id=s.tenant_id and o.id=s.order_id
  join commerce_olist_orders j on j.tenant_id=s.tenant_id and j.order_id=s.order_id
  join commerce_olist_settings c on c.tenant_id=s.tenant_id and c.settings->>'enabled'='true'
  join integration_connections i on i.tenant_id=s.tenant_id and i.provider='olist'
    and i.status<>'disabled' and i.credentials_encrypted is not null
  join commerce_stores st on st.tenant_id=s.tenant_id and st.enabled
  join tenants t on t.id=s.tenant_id and t.status='active'
  where o.payment_status='paid' and o.payment_environment='production'
    and o.cancelled_at is null and o.deleted_at is null
    and o.snapshot->>'delivery' is distinct from 'pickup' and s.status<>'cancelled'
    and j.sales_order_id ~ '^[1-9][0-9]{0,14}$' and j.invoice_id ~ '^[1-9][0-9]{0,14}$'
    and j.invoice_status in (6,7)
    and nullif(btrim(s.tracking_code),'') is not null and nullif(btrim(s.tracking_url),'') is not null
    and s.olist_tracking_next_at<=now()
    and (s.olist_tracking_synced_code is distinct from s.tracking_code
      or j.tracking_code is distinct from s.tracking_code or j.tracking_url is distinct from s.tracking_url)`;

function trackingError(error: unknown) {
  // ERP responses may contain credentials or personal data; persist only actionable categories.
  if (error instanceof OlistRequestError) {
    if (error.status === 401 || error.status === 403) return "olist_tracking_reconnect_required";
    if (error.status === 429) return "olist_tracking_rate_limited";
    if (error.status >= 400 && error.status < 500) return "olist_tracking_rejected";
  }
  return "olist_tracking_unavailable";
}

/** Returns the number of eligible shipments attempted, including deferred failures. */
export async function processCommerceShippingOlist(tenantId?: string, limit = 2, orderId?: string): Promise<number> {
  if (orderId && !tenantId) throw new Error("Shipping Olist orderId requires tenantId.");
  if (process.env.COMMERCE_ENABLED !== "true") return 0;
  const batch = Number.isFinite(limit) ? Math.min(10, Math.max(0, Math.floor(limit))) : 2;
  if (!batch) return 0;
  const pool = getPool();
  const started = Date.now();
  const deadline = AbortSignal.timeout(45000);
  const jobs = (await pool.query<TrackingJob>(`${trackingQuery}
    and ($1::uuid is null or s.tenant_id=$1) and ($2::uuid is null or s.order_id=$2)
    order by s.olist_tracking_next_at,s.id limit $3`, [tenantId ?? null, orderId ?? null, batch])).rows;
  let processed = 0;
  for (const candidate of jobs) {
    if (Date.now() - started >= 35000) break;
    // Share the existing ERP worker's order lease so dispatch writes cannot interleave.
    const key = `commerce-olist:${candidate.tenant_id}:${candidate.order_id}`;
    const token = randomUUID();
    const acquired = await pool.query(`insert into commerce_olist_leases(lock_key,token,expires_at)
      values($1,$2,now()+interval '2 minutes') on conflict(lock_key) do update
      set token=excluded.token,expires_at=excluded.expires_at
      where commerce_olist_leases.expires_at<=now() returning token`, [key, token]);
    if (!acquired.rowCount) continue;
    let job: TrackingJob | undefined;
    try {
      const live = async () => (await pool.query<TrackingJob>(`${trackingQuery}
        and s.tenant_id=$1 and s.id=$2 and exists(select 1 from commerce_olist_leases
          where lock_key=$3 and token=$4 and expires_at>now())`,
      [candidate.tenant_id, candidate.id, key, token])).rows[0];
      job = await live();
      if (!job) continue;
      processed++;
      if (!trackingValue(job.tracking_code) || !safeShippingUrl(job.tracking_url)) {
        throw new Error("invalid_tracking");
      }
      const payload = { codigoRastreamento: job.tracking_code, urlRastreamento: job.tracking_url };
      await commerceOlistRequest(job.tenant_id, `/pedidos/${job.sales_order_id}/despacho`, "PUT", payload, deadline);
      const fresh = await live();
      if (!fresh || fresh.tracking_code !== job.tracking_code || fresh.tracking_url !== job.tracking_url
        || fresh.sales_order_id !== job.sales_order_id || fresh.invoice_id !== job.invoice_id) continue;
      await commerceOlistRequest(job.tenant_id, `/notas/${job.invoice_id}/despacho`, "PUT", payload, deadline);
      const sent = job;
      await commerceTransaction(async client => {
        // Lock the lease during acknowledgment, fencing an expired/replaced worker atomically.
        const owned = await client.query(`select token from commerce_olist_leases
          where lock_key=$1 and token=$2 and expires_at>now() for update`, [key, token]);
        if (!owned.rowCount) return;
        await client.query(`update commerce_olist_orders set tracking_code=$3,tracking_url=$4,updated_at=now()
          where tenant_id=$1 and order_id=$2`, [sent.tenant_id, sent.order_id, sent.tracking_code, sent.tracking_url]);
        await client.query(`update commerce_order_shipments set olist_tracking_synced_code=$3,
          olist_tracking_error=null,olist_tracking_next_at=now(),updated_at=now() where tenant_id=$1 and id=$2`,
        [sent.tenant_id, sent.id, sent.tracking_code]);
        await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,'olist.tracking',$3)",
          [sent.tenant_id, sent.order_id, JSON.stringify({ source: "shipping", ...payload })]);
      });
    } catch (error) {
      if (!job) throw error;
      await pool.query(`update commerce_order_shipments set olist_tracking_error=$3,
        olist_tracking_next_at=case when tracking_code is distinct from $6 or tracking_url is distinct from $7
          then now() else now()+interval '5 minutes' end,updated_at=now()
        where tenant_id=$1 and id=$2 and exists(select 1 from commerce_olist_leases
          where lock_key=$4 and token=$5 and expires_at>now() for update)`,
      [job.tenant_id, job.id, error instanceof Error && error.message === "invalid_tracking"
        ? "olist_tracking_invalid" : trackingError(error), key, token, job.tracking_code, job.tracking_url]);
    } finally {
      await pool.query("delete from commerce_olist_leases where lock_key=$1 and token=$2", [key, token]);
    }
  }
  return processed;
}

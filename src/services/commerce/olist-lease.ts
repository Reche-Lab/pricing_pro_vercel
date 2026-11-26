import type { Pool, PoolClient } from "pg";

export async function acquireCommerceOlistLease(client: Pool | PoolClient, key: string, token: string) {
  return Boolean((await client.query(`insert into commerce_olist_leases(lock_key,token,expires_at) values($1,$2,now()+interval '2 minutes')
    on conflict(lock_key) do update set token=excluded.token,expires_at=excluded.expires_at where commerce_olist_leases.expires_at<now() returning token`, [key, token])).rowCount);
}

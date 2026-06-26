import pg from "pg";
import { getServerEnv } from "@/lib/env/server";

const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var __pricingPool: pg.Pool | undefined;
}

export function getPool(): pg.Pool {
  if (!globalThis.__pricingPool) {
    globalThis.__pricingPool = new Pool({
      connectionString: getServerEnv().DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
    });
  }

  return globalThis.__pricingPool;
}

export async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

export async function withTenantContext<T>(
  userId: string,
  tenantId: string,
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    const output = await callback(client);
    await client.query("commit");
    return output;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

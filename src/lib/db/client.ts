import pg from "pg";
import { getServerEnv } from "@/lib/env/server";

const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var __pricingPool: pg.Pool | undefined;
}

export function getPool(): pg.Pool {
  if (!globalThis.__pricingPool) {
    const env = getServerEnv();
    globalThis.__pricingPool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: resolveSslConfig(env.DATABASE_URL, env.DATABASE_SSL)
    });
  }

  return globalThis.__pricingPool;
}

function resolveSslConfig(databaseUrl: string, mode: "true" | "false" | "auto"): pg.PoolConfig["ssl"] {
  if (mode === "true") return { rejectUnauthorized: false };
  if (mode === "false") return undefined;

  if (process.env.NODE_ENV === "production") return { rejectUnauthorized: false };

  try {
    const host = new URL(databaseUrl).hostname;
    const isSupabaseHost =
      host.endsWith(".supabase.co") ||
      host.includes(".pooler.supabase.com") ||
      host.includes("supabase.com");

    return isSupabaseHost ? { rejectUnauthorized: false } : undefined;
  } catch {
    return undefined;
  }
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

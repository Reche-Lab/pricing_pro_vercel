import crypto from "node:crypto";
import pg from "pg";

const [
  tenantSlug,
  accessToken,
  refreshToken = "",
  clientId = "",
  clientSecret = "",
  environment = "sandbox"
] = process.argv.slice(2);

if (!tenantSlug || !accessToken) {
  console.error(
    "Usage: npm run configure:melhor-envio -- ground-shop 'ACCESS_TOKEN' 'REFRESH_TOKEN' 'CLIENT_ID' 'CLIENT_SECRET' sandbox"
  );
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
const encryptionKey = process.env.APP_ENCRYPTION_KEY;

if (!databaseUrl) {
  console.error("DATABASE_URL is not loaded. Check your .env file.");
  process.exit(1);
}
if (!encryptionKey || encryptionKey.length < 32) {
  console.error("APP_ENCRYPTION_KEY must be set and have at least 32 characters.");
  process.exit(1);
}

const baseUrls =
  environment === "production"
    ? {
        app_base_url: "https://www.melhorenvio.com.br",
        api_base_url: "https://www.melhorenvio.com.br/api/v2"
      }
    : {
        app_base_url: "https://sandbox.melhorenvio.com.br",
        api_base_url: "https://sandbox.melhorenvio.com.br/api/v2"
      };

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: resolveSslConfig(databaseUrl, process.env.DATABASE_SSL ?? "auto")
});

await client.connect();

try {
  await client.query("begin");
  const tenant = await one("select id from tenants where slug = $1", [tenantSlug]);
  if (!tenant) throw new Error(`Tenant not found: ${tenantSlug}`);

  const encrypted = encrypt(
    {
      accessToken,
      refreshToken: refreshToken || undefined,
      clientId: clientId || undefined,
      clientSecret: clientSecret || undefined
    },
    encryptionKey
  );

  await client.query(
    `
      insert into integration_connections (
        tenant_id,
        provider,
        status,
        settings,
        credentials_encrypted
      )
      values ($1, 'melhor_envio', 'active', $2, $3)
      on conflict (tenant_id, provider) do update
        set status = 'active',
            settings = excluded.settings,
            credentials_encrypted = excluded.credentials_encrypted,
            updated_at = now()
    `,
    [
      tenant.id,
      JSON.stringify({
        ...baseUrls,
        environment,
        redirect_uri: "",
        user_agent: "Pricing Pro (contato@example.com)",
        services: []
      }),
      encrypted
    ]
  );

  await client.query("commit");
  console.log(`Melhor Envio integration configured for tenant ${tenantSlug} (${environment}).`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

async function one(sql, params) {
  const result = await client.query(sql, params);
  return result.rows[0] ?? null;
}

function encrypt(value, secret) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(secret).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function resolveSslConfig(databaseUrlValue, mode) {
  if (mode === "true") return { rejectUnauthorized: false };
  if (mode === "false") return undefined;

  const host = new URL(databaseUrlValue).hostname;
  const isSupabaseHost =
    host.endsWith(".supabase.co") ||
    host.includes(".pooler.supabase.com") ||
    host.includes("supabase.com");

  return isSupabaseHost ? { rejectUnauthorized: false } : undefined;
}

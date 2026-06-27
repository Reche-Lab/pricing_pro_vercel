import crypto from "node:crypto";
import pg from "pg";

const [tenantSlug, token, contrato = "", apiBaseUrl = "https://api.correios.com.br"] = process.argv.slice(2);

if (!tenantSlug || !token) {
  console.error("Usage: npm run configure:correios -- ground-shop 'TOKEN' 'CONTRATO_OPCIONAL'");
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

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: resolveSslConfig(databaseUrl, process.env.DATABASE_SSL ?? "auto")
});

await client.connect();

try {
  await client.query("begin");
  const tenant = await one("select id from tenants where slug = $1", [tenantSlug]);
  if (!tenant) throw new Error(`Tenant not found: ${tenantSlug}`);

  const encrypted = encrypt({ token }, encryptionKey);
  await client.query(
    `
      insert into integration_connections (
        tenant_id,
        provider,
        status,
        settings,
        credentials_encrypted
      )
      values ($1, 'correios', 'active', $2, $3)
      on conflict (tenant_id, provider) do update
        set status = 'active',
            settings = excluded.settings,
            credentials_encrypted = excluded.credentials_encrypted,
            updated_at = now()
    `,
    [
      tenant.id,
      JSON.stringify({
        api_base_url: apiBaseUrl,
        contrato_correios: contrato,
        servicos: {
          sedex: "04162",
          pac: "04669"
        }
      }),
      encrypted
    ]
  );

  await client.query("commit");
  console.log(`Correios integration configured for tenant ${tenantSlug}.`);
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

import crypto from "crypto";
import pg from "pg";

const [tenantSlug, name = "Lia Flow Agent", scopesArg] = process.argv.slice(2);

if (!tenantSlug) {
  console.error("Uso: node scripts/create-agent-api-key.mjs <tenant-slug> [nome] [scopes_csv]");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL não configurada.");
  process.exit(1);
}

const defaultScopes = [
  "products:read",
  "pricing:calculate",
  "quotes:create",
  "quotes:read",
  "quotes:public_link",
  "quotes:pdf",
  "quotes:whatsapp",
  "shipping:quote"
];
const scopes = scopesArg ? scopesArg.split(",").map((item) => item.trim()).filter(Boolean) : defaultScopes;

const prefix = crypto.randomBytes(5).toString("hex");
const secret = crypto.randomBytes(24).toString("base64url");
const token = `pp_agent_live_${prefix}_${secret}`;
const hash = crypto.createHash("sha256").update(token).digest("hex");

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: resolveSsl(databaseUrl)
});

await client.connect();
try {
  const tenant = await client.query(
    `
      select id
      from tenants
      where slug = $1
      limit 1
    `,
    [tenantSlug]
  );
  if (!tenant.rows[0]) throw new Error(`Tenant não encontrado: ${tenantSlug}`);

  const owner = await client.query(
    `
      select tm.user_id
      from tenant_members tm
      join roles r on r.id = tm.role_id and r.key = 'owner'
      where tm.tenant_id = $1
        and tm.status = 'active'
      order by tm.created_at asc
      limit 1
    `,
    [tenant.rows[0].id]
  );

  const result = await client.query(
    `
      insert into agent_api_keys (
        tenant_id,
        name,
        key_prefix,
        key_hash,
        scopes,
        created_by
      )
      values ($1, $2, $3, $4, $5, $6)
      returning id
    `,
    [tenant.rows[0].id, name, prefix, hash, scopes, owner.rows[0]?.user_id ?? null]
  );

  console.log("Agent API key criada.");
  console.log(`ID: ${result.rows[0].id}`);
  console.log(`Tenant: ${tenantSlug}`);
  console.log(`Nome: ${name}`);
  console.log(`Scopes: ${scopes.join(",")}`);
  console.log("");
  console.log("Copie o token agora. Ele não será exibido novamente:");
  console.log(token);
} finally {
  await client.end();
}

function resolveSsl(url) {
  if (process.env.DATABASE_SSL === "false") return undefined;
  if (process.env.DATABASE_SSL === "true") return { rejectUnauthorized: false };
  try {
    const host = new URL(url).hostname;
    return host.includes("supabase") ? { rejectUnauthorized: false } : undefined;
  } catch {
    return undefined;
  }
}

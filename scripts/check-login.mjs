import bcrypt from "bcryptjs";
import pg from "pg";

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error("Usage: npm run check:login -- email@example.com 'password'");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not loaded. Check your .env file.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: resolveSslConfig(databaseUrl, process.env.DATABASE_SSL ?? "auto")
});

await client.connect();

try {
  const userResult = await client.query(
    `
      select
        u.id,
        u.email,
        u.name,
        u.password_hash,
        u.status,
        count(tm.id)::int as memberships
      from app_users u
      left join tenant_members tm on tm.user_id = u.id and tm.status = 'active'
      where lower(u.email) = lower($1)
      group by u.id, u.email, u.name, u.password_hash, u.status
      limit 1
    `,
    [email]
  );

  const user = userResult.rows[0];
  if (!user) {
    console.log("User not found for this email.");
    process.exit(2);
  }

  console.log(`User found: ${user.email}`);
  console.log(`User status: ${user.status}`);
  console.log(`Active memberships: ${user.memberships}`);

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  console.log(`Password matches hash: ${passwordOk ? "yes" : "no"}`);

  if (user.status !== "active") process.exit(3);
  if (Number(user.memberships) < 1) process.exit(4);
  if (!passwordOk) process.exit(5);

  console.log("Login prerequisites look OK.");
} finally {
  await client.end();
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

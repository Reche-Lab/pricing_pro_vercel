import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
const connectionString = process.env.COMMERCE_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "Set COMMERCE_TEST_DATABASE_URL to an empty local commerce_test_* database.",
  );
const url = new URL(connectionString);
const database = url.pathname.slice(1);
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !/^commerce_test_[a-z0-9_]+$/.test(database)
)
  throw new Error("Only isolated local commerce_test_* databases are allowed.");
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
  await admin.query(`create database "${database}"`);
  for (const role of ["anon", "authenticated"]) {
    if (
      !(await admin.query("select 1 from pg_roles where rolname=$1", [role]))
        .rowCount
    )
      await admin.query(`create role ${role}`);
  }
} finally {
  await admin.end();
}
const client = new pg.Client({ connectionString });
await client.connect();
try {
  for (const name of (
    await readdir(new URL("../supabase/migrations/", import.meta.url))
  )
    .filter((name) => /^\d.*\.sql$/.test(name))
    .sort()) {
    await client.query(
      await readFile(
        new URL(`../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
    console.log(`Applied ${name}`);
  }
} finally {
  await client.end();
}

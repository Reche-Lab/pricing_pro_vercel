// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const connectionString = process.env.COMMERCE_SLUG_TEST_DATABASE_URL;
describe.skipIf(!connectionString)("product URL migration in an empty isolated PostgreSQL database", () => {
  let pool: pg.Pool, migration: string;
  const tenant = randomUUID(), other = randomUUID();
  const insert = (name: string, tenantId = tenant, variantId = randomUUID()) => pool.query("insert into commerce_products(tenant_id,variant_id,snapshot) values($1,$2,$3) returning *", [tenantId, variantId, JSON.stringify({ name })]);
  beforeAll(async () => {
    const url = new URL(connectionString!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/^\/commerce_test_slugs_[a-z0-9_]+$/.test(url.pathname)) throw new Error("Only an empty local commerce_test_slugs_* database is allowed.");
    pool = new pg.Pool({ connectionString, max: 3 });
    if ((await pool.query("select to_regclass('public.commerce_products') as existing")).rows[0].existing) throw new Error("The slug test requires a new empty database.");
    for (const role of ["anon", "authenticated"]) if (!(await pool.query("select 1 from pg_roles where rolname=$1", [role])).rowCount) await pool.query(`create role ${role}`);
    await pool.query("create table commerce_products(id uuid primary key default gen_random_uuid(), tenant_id uuid not null, variant_id uuid not null, snapshot jsonb not null, active boolean not null default true, unique(tenant_id,variant_id))");
    await insert("Botton - 3,5 cm"); await insert("Botton - 3,5 cm"); await insert("Botton - 3,5 cm", other);
    migration = await readFile(new URL("../../../supabase/migrations/0080_commerce_product_slugs.sql", import.meta.url), "utf8");
    await pool.query(migration);
  });
  afterAll(async () => { await pool?.end(); });
  it("backfills old products, handles homonyms and isolates tenants", async () => {
    expect((await pool.query("select slug from commerce_products where tenant_id=$1 order by slug", [tenant])).rows.map(row => row.slug)).toEqual(["botton-3-5-cm", "botton-3-5-cm-2"]);
    expect((await pool.query("select slug from commerce_products where tenant_id=$1", [other])).rows[0].slug).toBe("botton-3-5-cm");
  });
  it("normalizes Portuguese accents, decimals and punctuation; empty/non-Latin names remain valid", async () => {
    for (const [name, expected] of [["Ímã de geladeira · 5,5 cm", "ima-de-geladeira-5-5-cm"], ["Espelho 3.5 cm", "espelho-3-5-cm"], ["ÍMÃ".normalize("NFD"), "ima"], ["🚀", "produto"], ["日本語", "produto-2"]]) expect((await insert(name)).rows[0].slug).toBe(expected);
    const long = (await insert("A".repeat(200))).rows[0].slug;
    expect(long).toHaveLength(120);
  });
  it("keeps the original slug on rename and republish, without changing IDs or snapshots", async () => {
    const original = (await insert("Nome original")).rows[0];
    const updated = (await pool.query("insert into commerce_products(tenant_id,variant_id,snapshot) values($1,$2,$3) on conflict(tenant_id,variant_id) do update set snapshot=excluded.snapshot returning *", [tenant, original.variant_id, { name: "Outro nome" }])).rows[0];
    expect(updated.slug).toBe("nome-original"); expect(updated.id).toBe(original.id); expect(updated.snapshot).toEqual({ name: "Outro nome" });
  });
  it("reserves inactive product URLs and UUID legacy paths", async () => {
    const original = (await insert("Indisponível")).rows[0];
    await pool.query("update commerce_products set active=false where id=$1", [original.id]);
    expect((await insert("Indisponível")).rows[0].slug).toBe("indisponivel-2");
    const uuid = randomUUID(); expect((await insert(uuid)).rows[0].slug).toBe(`produto-${uuid}`);
  });
  it("allocates unique URLs under concurrent publication", async () => {
    const rows = await Promise.all(Array.from({ length: 3 }, () => insert("Concorrente")));
    expect(rows.map(result => result.rows[0].slug).sort()).toEqual(["concorrente", "concorrente-2", "concorrente-3"]);
  });
  it("enforces DB uniqueness/format and is safe to reapply", async () => {
    await expect(pool.query("insert into commerce_products(tenant_id,variant_id,snapshot,slug) values($1,$2,'{}','botton-3-5-cm')", [tenant, randomUUID()])).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query("insert into commerce_products(tenant_id,variant_id,snapshot,slug) values($1,$2,'{}','../bad')", [tenant, randomUUID()])).rejects.toMatchObject({ code: "23514" });
    const before = (await pool.query("select id,slug from commerce_products order by id")).rows;
    await pool.query(migration);
    expect((await pool.query("select id,slug from commerce_products order by id")).rows).toEqual(before);
  });
});

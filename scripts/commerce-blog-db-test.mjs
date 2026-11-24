import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { build } from "esbuild";

// This intentionally accepts only a disposable local Unix-socket cluster, never DATABASE_URL.
const socket = process.env.BLOG_TEST_PG_SOCKET;
if (!socket || !/^\/tmp\/pricing-blog-pg\.[a-zA-Z0-9]+$/.test(socket)) throw new Error("An isolated /tmp/pricing-blog-pg.* PostgreSQL socket is required.");
const pool = new pg.Pool({ host: socket, port: 55486, user: "codex_blog", database: "postgres", max: 3 });
globalThis.__blogTestPool = pool;
try {
  await pool.query(`create role anon; create role authenticated;
    create table tenants(id uuid primary key,slug text,name text);
    create table app_users(id uuid primary key);
    create table commerce_stores(tenant_id uuid primary key references tenants(id),settings jsonb);
    create table audit_logs(id bigserial primary key,tenant_id uuid,actor_user_id uuid,action text,entity_type text,metadata jsonb);`);
  const migration = await readFile("supabase/migrations/0086_commerce_blog.sql", "utf8");
  await pool.query(migration); await pool.query(migration);
  const first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222", actor = "33333333-3333-4333-8333-333333333333";
  await pool.query("insert into tenants values($1,'ground-shop','Ground Shop'),($2,'another-shop','Another Shop')", [first, second]);
  await pool.query("insert into app_users values($1)", [actor]);
  await pool.query("insert into commerce_stores values($1,'{}'),($2,'{}')", [first, second]);
  const bundle = await build({
    entryPoints: ["src/repositories/commerce-blog.ts"], bundle: true, platform: "node", format: "cjs", write: false,
    plugins: [{ name: "isolated-database", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/db\/client$/ }, () => ({ path: "db", namespace: "fixture" }));
      builder.onResolve({ filter: /^\.\/commerce$/ }, args => args.importer.endsWith("commerce-blog.ts") ? { path: "transaction", namespace: "fixture" } : null);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "db" ? "export const getPool=()=>globalThis.__blogTestPool;" : "export async function commerceTransaction(callback){const client=await globalThis.__blogTestPool.connect();try{await client.query('begin');const result=await callback(client);await client.query('commit');return result;}catch(error){await client.query('rollback');throw error;}finally{client.release();}}", loader: "js" }));
    } }],
  });
  const compiled = resolve(socket, "repository.cjs"); await writeFile(compiled, bundle.outputFiles[0].contents);
  const { readBlogAdmin, readPublicBlog, saveBlog } = createRequire(import.meta.url)(compiled);
  const initial = await readBlogAdmin(first, "ground-shop", "Ground Shop"); assert.equal(initial.posts.length, 8);
  const seed = initial.posts[0].article;
  const { slug, published, updated, ...content } = seed;
  const command = { action: "article", slug, revision: 0, status: "published", content: { ...content, title: "Título editado no banco", image: "https://media.example.test/cover.webp" } };
  await saveBlog(actor, first, "ground-shop", "Ground Shop", command);
  const persisted = await readBlogAdmin(first, "ground-shop", "Ground Shop");
  assert.equal(persisted.posts[0].article.title, command.content.title); assert.equal(persisted.posts[0].revision, 1);
  assert.equal(Date.parse(persisted.posts[0].article.published), Date.parse(seed.published));
  assert.equal((await readBlogAdmin(second, "another-shop", "Another Shop")).posts.length, 0);
  const races = await Promise.allSettled([1, 2].map(n => saveBlog(actor, first, "ground-shop", "Ground Shop", { ...command, revision: 1, content: { ...content, title: `Concorrência ${n}` } })));
  assert.equal(races.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(races.find(r => r.status === "rejected").reason.status, 409);
  await saveBlog(actor, first, "ground-shop", "Ground Shop", { ...command, revision: 2, status: "draft" });
  assert.equal((await readPublicBlog(first, "ground-shop", "Ground Shop")).articles.length, 7);
  assert.equal((await readPublicBlog(first, "ground-shop", "Ground Shop", true)).articles.length, 8);
  await saveBlog(actor, first, "ground-shop", "Ground Shop", { ...command, revision: 3, status: "archived" });
  assert.equal((await readPublicBlog(first, "ground-shop", "Ground Shop", true)).articles.length, 7);
  await saveBlog(actor, first, "ground-shop", "Ground Shop", { action: "settings", revision: 0, settings: { ...initial.settings, enabled: false, title: "Título do blog atualizado" } });
  await assert.rejects(saveBlog(actor, first, "ground-shop", "Ground Shop", { action: "settings", revision: 0, settings: initial.settings }), e => e.status === 409);
  await saveBlog(actor, first, "ground-shop", "Ground Shop", { action: "settings", revision: 1, settings: { ...initial.settings, title: "Título da segunda revisão" } });
  assert.equal((await readBlogAdmin(first, "ground-shop", "Ground Shop")).revision, 2);
  await saveBlog(actor, second, "another-shop", "Another Shop", { ...command, slug: "artigo-proprio", status: "draft" });
  assert.equal((await readPublicBlog(second, "another-shop", "Another Shop")).articles.length, 0);
  assert.equal((await readPublicBlog(second, "another-shop", "Another Shop", true)).articles.length, 1);
  const client = await pool.connect();
  try { await client.query("set role authenticated"); await assert.rejects(client.query("select * from commerce_blog_posts"), e => e.code === "42501"); }
  finally { await client.query("reset role"); client.release(); }
  assert.equal(Number((await pool.query("select count(*) from audit_logs")).rows[0].count), 7);
  console.log("Blog PostgreSQL verified: idempotent migration, typed SQL, real persistence, preserved publication date, revisions, concurrent conflict, draft/archive suppression, tenant isolation, custom draft and denied direct access. Disposable local cluster only.");
} finally { delete globalThis.__blogTestPool; await pool.end(); }

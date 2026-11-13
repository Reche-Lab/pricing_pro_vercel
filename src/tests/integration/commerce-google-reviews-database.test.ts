// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db/client";
import { loadGoogleReviews, safeGoogleReviews, saveGoogleReviews, markGoogleReviewsTested, toggleGoogleReviews, removeGoogleReviewsKey, reserveGoogleReviewsRequest } from "@/repositories/commerce-google-reviews";
const url = process.env.COMMERCE_TEST_DATABASE_URL;
describe.skipIf(!url)("isolated Google reviews persistence", () => {
  let tenant: string, other: string, actor: string;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_")) throw new Error("Isolated local test DB required.");
    process.env.DATABASE_URL = url; process.env.DATABASE_SSL = "false";
    tenant = (await getPool().query("insert into tenants(name,slug) values('Google test',$1) returning id", [`google-${randomUUID()}`])).rows[0].id;
    other = (await getPool().query("insert into tenants(name,slug) values('Other Google test',$1) returning id", [`google-${randomUUID()}`])).rows[0].id;
    for (const id of [tenant, other]) await getPool().query("insert into commerce_stores(tenant_id) values($1)", [id]);
    actor = (await getPool().query("insert into app_users(email,name,password_hash,status) values($1,'Operator','not-password','active') returning id", [`google-${randomUUID()}@example.test`])).rows[0].id;
  });
  afterAll(async () => {
    if (tenant) {
      await getPool().query("delete from audit_logs where tenant_id=any($1::uuid[])", [[tenant, other]]);
      await getPool().query("delete from commerce_stores where tenant_id=any($1::uuid[])", [[tenant, other]]);
    }
    if (tenant) await getPool().query("delete from tenants where id=any($1::uuid[])", [[tenant, other]]);
    if (actor) await getPool().query("delete from app_users where id=$1", [actor]);
    await getPool().end(); globalThis.__pricingPool = undefined;
  });
  it("encrypts the key, never returns it and isolates tenants", async () => {
    const secret = "private-google-api-key-123456789";
    const saved = await saveGoogleReviews(actor, tenant, { placeId: "ChIJtest123456789", title: "Avaliações", apiKey: secret, dailyLimit: 3, revision: 0 });
    const row = (await loadGoogleReviews(tenant))!;
    expect(saved.hasKey).toBe(true); expect(saved.enabled).toBe(false); expect(row.api_key_encrypted).not.toContain(secret);
    expect(JSON.stringify(saved)).not.toContain(row.api_key_encrypted!); expect(JSON.stringify(saved)).not.toContain(secret);
    expect(await loadGoogleReviews(other)).toBeNull();
    await expect(toggleGoogleReviews(actor, tenant, saved.revision, true)).rejects.toMatchObject({ status: 409 });
  });
  it("requires a test, preserves blank keys and invalidates changed credentials", async () => {
    let row = (await loadGoogleReviews(tenant))!; await markGoogleReviewsTested(actor, tenant, row.revision); await toggleGoogleReviews(actor, tenant, row.revision, true);
    const secret = row.api_key_encrypted, safe = safeGoogleReviews(row);
    let saved = await saveGoogleReviews(actor, tenant, { placeId: safe.placeId, dailyLimit: safe.dailyLimit, revision: safe.revision, title: "Opiniões", apiKey: "" });
    expect(saved.enabled).toBe(true); expect(saved.tested).toBe(true); expect((await loadGoogleReviews(tenant))!.api_key_encrypted).toBe(secret);
    await expect(removeGoogleReviewsKey(actor, tenant, row.revision)).rejects.toMatchObject({ status: 409 });
    saved = await saveGoogleReviews(actor, tenant, { placeId: "ChIJother12345678", title: "Opiniões", apiKey: "", dailyLimit: 3, revision: saved.revision });
    expect(saved.enabled).toBe(false); expect(saved.tested).toBe(false);
    row = (await loadGoogleReviews(tenant))!; await markGoogleReviewsTested(actor, tenant, row.revision); await toggleGoogleReviews(actor, tenant, row.revision, true);
  });
  it("enforces an atomic daily cap even with concurrent requests", async () => {
    const row = (await loadGoogleReviews(tenant))!;
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => reserveGoogleReviewsRequest(row, true)));
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(3); expect((await loadGoogleReviews(tenant))!.used_today).toBe(3);
    expect((await loadGoogleReviews(other))).toBeNull();
    const result = await removeGoogleReviewsKey(actor, tenant, row.revision); expect(result.hasKey).toBe(false); expect(result.enabled).toBe(false);
  });
  it("denies direct access by public roles and stores no review content", async () => {
    for (const role of ["anon", "authenticated"]) for (const table of ["commerce_google_review_connections", "commerce_google_review_usage"]) {
      const client = await getPool().connect(); try { await client.query("begin"); await client.query(`set local role ${role}`); await expect(client.query(`select * from ${table}`)).rejects.toMatchObject({ code: "42501" }); } finally { await client.query("rollback"); client.release(); }
    }
    const actions = (await getPool().query("select action,metadata from audit_logs where tenant_id=$1", [tenant])).rows;
    expect(actions.some(row => row.action === "commerce.google_reviews.test")).toBe(true); expect(JSON.stringify(actions)).not.toContain("private-google-api-key");
  });
});

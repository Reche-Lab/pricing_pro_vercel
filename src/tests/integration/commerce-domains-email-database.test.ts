// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db/client";
import { requestStoreDomains, getStoreDomain, saveDomainOperatorConfig, storeDomainCheck, approveStoreDomain } from "@/repositories/commerce-domain-setup";
import { saveStoreEmail, getStoreEmailSettings, loadStoreEmailConnection, markStoreEmailTested, setStoreEmailEnabled } from "@/repositories/commerce-store-email";
import { inspectDomainDns } from "@/services/commerce/domain-dns";
import type { StoreEmailInput } from "@/domain/commerce/store-email";
import type { DomainSetup } from "@/domain/commerce/domain-setup";
const url = process.env.COMMERCE_TEST_DATABASE_URL;
describe.skipIf(!url)("isolated domain and email persistence", () => {
  let tenant: string, other: string, actor: string, domain: DomainSetup;
  const hostname = `store-${randomUUID()}.example.com`;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_")) throw new Error("Only isolated local commerce databases are allowed.");
    process.env.DATABASE_URL = url; process.env.DATABASE_SSL = "false"; process.env.COMMERCE_CUSTOM_DOMAINS = "{}";
    const pool = getPool();
    tenant = (await pool.query("insert into tenants(name,slug) values('Domain test',$1) returning id", [`domains-${randomUUID()}`])).rows[0].id;
    other = (await pool.query("insert into tenants(name,slug) values('Other domain test',$1) returning id", [`domains-other-${randomUUID()}`])).rows[0].id;
    for (const id of [tenant, other]) await pool.query("insert into commerce_stores(tenant_id) values($1)", [id]);
    actor = (await pool.query("insert into app_users(email,name,password_hash,status,is_super_admin) values($1,'Operator','not-a-password','active',true) returning id", [`domain-${randomUUID()}@example.test`])).rows[0].id;
  });
  afterAll(async () => { await getPool().end(); globalThis.__pricingPool = undefined; });
  it("reserves root/www together and never grants access by merely requesting a domain", async () => {
    const rows = await requestStoreDomains(actor, tenant, { hostname, provider: "Registro.br", includeWww: true });
    expect(rows).toHaveLength(2); domain = rows.find(row => row.hostname === hostname)!;
    expect(domain.approved_at).toBeNull(); expect(domain.authorized).toBe(false);
    expect(domain.verification_token).toMatch(/^[a-f0-9]{64}$/);
    await expect(requestStoreDomains(actor, other, { hostname, provider: "", includeWww: false })).rejects.toMatchObject({ status: 409 });
    await expect(getStoreDomain(domain.id, other)).rejects.toMatchObject({ status: 404 });
  });
  it("requires checked proof and exact operator configuration before approval", async () => {
    await expect(approveStoreDomain(actor, domain.id, domain.revision)).rejects.toMatchObject({ status: 409 });
    domain = await saveDomainOperatorConfig(actor, domain, { revision: domain.revision, records: [{ type: "A", name: "@", value: "8.8.8.8", ttl: 300 }], note: "Local test only", vercelAdded: true, httpsConfirmed: true });
    const check = await inspectDomainDns(domain, async type => type === "TXT" ? [`pricing-pro=${domain.verification_token}`] : ["8.8.8.8"]);
    domain = await storeDomainCheck(actor, domain, check);
    domain = await approveStoreDomain(actor, domain.id, domain.revision);
    expect(domain.approved_at).not.toBeNull(); expect(domain.authorized).toBe(false);
  });
  it("invalidates proof/approval when operator settings change and rejects stale edits", async () => {
    const revision = domain.revision;
    domain = await saveDomainOperatorConfig(actor, domain, { revision, records: [{ type: "A", name: "@", value: "1.1.1.1", ttl: 300 }], note: "Changed", vercelAdded: true, httpsConfirmed: true });
    expect(domain.approved_at).toBeNull(); expect(domain.last_check).toBeNull();
    await expect(approveStoreDomain(actor, domain.id, domain.revision)).rejects.toMatchObject({ status: 409 });
    await expect(saveDomainOperatorConfig(actor, domain, { revision, records: [], note: "", vercelAdded: false, httpsConfirmed: false })).rejects.toMatchObject({ status: 409 });
  });
  it("encrypts the password, returns only safe settings and preserves blank password updates", async () => {
    const input: StoreEmailInput = { host: "smtp.gmail.com", port: 587, username: "loja@example.com", fromEmail: "loja@example.com", fromName: "Ground Shop", replyTo: "", password: "private-integration-password", revision: 0 };
    let settings = await saveStoreEmail(actor, tenant, input);
    expect(settings.enabled).toBe(false); expect(settings.hasPassword).toBe(true);
    const secret = (await loadStoreEmailConnection(tenant))!.password_encrypted;
    expect(secret).not.toContain(input.password); expect(JSON.stringify(settings)).not.toContain(secret); expect(JSON.stringify(settings)).not.toContain(input.password);
    expect((await getStoreEmailSettings(other)).configured).toBe(false);
    await expect(setStoreEmailEnabled(actor, tenant, settings.revision, true)).rejects.toMatchObject({ status: 409 });
    await markStoreEmailTested(actor, tenant, settings.revision);
    settings = await setStoreEmailEnabled(actor, tenant, settings.revision, true);
    expect(settings.enabled).toBe(true);
    settings = await saveStoreEmail(actor, tenant, { ...input, password: "", revision: settings.revision });
    expect(settings.enabled).toBe(true); expect((await loadStoreEmailConnection(tenant))!.password_encrypted).toBe(secret);
    const oldRevision = settings.revision;
    settings = await saveStoreEmail(actor, tenant, { ...input, fromName: "New name", password: "", revision: oldRevision });
    expect(settings.enabled).toBe(false); expect(settings.tested).toBe(false);
    await expect(markStoreEmailTested(actor, tenant, oldRevision)).rejects.toMatchObject({ status: 409 });
    await expect(setStoreEmailEnabled(actor, tenant, settings.revision, true)).rejects.toMatchObject({ status: 409 });
  });
  it("denies raw SQL access to SMTP secrets and domain data for public roles", async () => {
    for (const role of ["anon", "authenticated"]) for (const table of ["commerce_email_connections", "commerce_domain_requests"]) {
      const client = await getPool().connect();
      try { await client.query("begin"); await client.query(`set local role ${role}`); await expect(client.query(`select * from ${table}`)).rejects.toMatchObject({ code: "42501" }); }
      finally { await client.query("rollback"); client.release(); }
    }
    const actions = (await getPool().query("select action,metadata from audit_logs where tenant_id=$1", [tenant])).rows;
    expect(actions.some(row => row.action === "commerce.domain.approve")).toBe(true);
    expect(actions.some(row => row.action === "commerce.email.test")).toBe(true);
    expect(JSON.stringify(actions)).not.toContain("private-integration-password");
  });
});

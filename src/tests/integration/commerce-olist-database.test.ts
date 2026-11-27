// @vitest-environment node
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { getPool } from "@/lib/db/client";
import { encryptTenantSecret, decryptTenantSecret } from "@/lib/crypto/secrets";
import { getCurrentSession } from "@/lib/auth/session";
import { getCommerceOlistJob, queueCommerceOlistOrder, saveCommerceOlistSettings } from "@/repositories/commerce-olist";
import { processCommerceOlistOrder } from "@/services/commerce/olist-worker";
import { commerceOlistSettingsSchema } from "@/domain/commerce/olist";
import { POST as action, GET as read } from "@/app/api/commerce/admin/orders/[orderId]/olist/route";
import { POST as changeOrder } from "@/app/api/commerce/admin/orders/[orderId]/route";
import { GET as cron } from "@/app/api/cron/commerce-olist/route";
import { testCommerceBilling } from "../fixtures/commerce-checkout";

vi.mock("@/lib/auth/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@/services/commerce/olist-schedule", () => ({ scheduleCommerceOlist: vi.fn() }));
const url = process.env.COMMERCE_TEST_DATABASE_URL;
describe.skipIf(!url)("commerce Olist durable workflow in isolated Postgres", () => {
  let actor: string;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/commerce_test_")) throw new Error("An isolated local database is required.");
    process.env.DATABASE_URL = url; process.env.DATABASE_SSL = "false"; process.env.COMMERCE_ENABLED = "true";
    actor = (await getPool().query("insert into app_users(email,name,password_hash,status) values($1,'Olist tester','fake','active') returning id", [`olist-${randomUUID()}@example.test`])).rows[0].id;
  });
  afterAll(async () => { await getPool().end(); globalThis.__pricingPool = undefined; });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  async function fixture(input: { configured?: boolean; enabled?: boolean; environment?: string; paid?: boolean } = {}) {
    const pool = getPool();
    const tenantId = (await pool.query("insert into tenants(name,slug) values('Olist store test',$1) returning id", [`olist-${randomUUID()}`])).rows[0].id;
    await pool.query("insert into tenant_members(tenant_id,user_id,role_id,status) select $1,$2,id,'active' from roles where key='owner'", [tenantId, actor]);
    await pool.query("insert into commerce_stores(tenant_id,enabled) values($1,true)", [tenantId]);
    const productId = (await pool.query("insert into products(tenant_id,name,slug,category) values($1,'Botton','botton','Teste') returning id", [tenantId])).rows[0].id;
    const variantId = (await pool.query("insert into product_variants(tenant_id,product_id,name,sku,external_olist_product_id,height_cm,width_cm,length_cm,unit_weight_kg) values($1,$2,'35 mm','1bot35per','777',0.5,3.5,3.5,0.01) returning id", [tenantId, productId])).rows[0].id;
    await pool.query("insert into packaging_boxes(tenant_id,name,height_cm,width_cm,length_cm,weight_kg) values($1,'Caixa',10,15,20,0.1)", [tenantId]);
    const customerId = (await pool.query("insert into commerce_customers(tenant_id,email,name) values($1,'buyer@example.test','Comprador') returning id", [tenantId])).rows[0].id;
    const sessionId = (await pool.query("insert into commerce_sessions(tenant_id,customer_id,token_hash) values($1,$2,$3) returning id", [tenantId, customerId, randomUUID()])).rows[0].id;
    const commerceProductId = randomUUID(), lineId = randomUUID();
    const snapshot = { billing: { ...testCommerceBilling, personType: "F" }, customer: { name: "Comprador", email: "buyer@example.test" }, delivery: "delivery", address: { ...testCommerceBilling, attention: "Maria", email: undefined },
      shippingOption: { id: "melhor_envio:1", name: "Correios - PAC", priceCents: 500 },
      items: [{ id: lineId, productId: commerceProductId, quantity: 3, unitCents: 800, totalCents: 2390, artworkDiscountCents: 10, artworkName: "Arte escolar", name: "Botton" }],
      products: [{ id: commerceProductId, variantId, name: "Botton", personalized: false }], lines: [{ id: lineId, productId: commerceProductId, quantity: 3, artworkId: null, artworkName: "Arte escolar" }], terms: "Test", storeRevision: 1 };
    const orderId = (await pool.query("insert into commerce_orders(tenant_id,customer_id,session_id,cart_revision,snapshot,subtotal_cents,shipping_cents,total_cents,provider,payment_environment) values($1,$2,$3,0,$4,2390,500,2890,'manual',$5) returning id", [tenantId, customerId, sessionId, JSON.stringify(snapshot), input.environment || "production"])).rows[0].id;
    if (input.configured !== false) await pool.query("insert into integration_connections(tenant_id,provider,status,settings,credentials_encrypted) values($1,'olist','active',$2,$3)", [tenantId, JSON.stringify({ api_base_url: "https://api.tiny.com.br/public-api/v3", app_base_url: "https://accounts.tiny.com.br", melhor_envio_forma_envio_id: "400", pac_forma_frete_id: "401" }), encryptTenantSecret({ accessToken: "fake-access", refreshToken: "fake-refresh", clientId: "fake-client", clientSecret: "fake-secret" })]);
    await pool.query("insert into olist_payment_options(tenant_id,kind,external_id,name) values($1,'receiving_method','101','Recebido na loja')", [tenantId]);
    await saveCommerceOlistSettings(tenantId, actor, commerceOlistSettingsSchema.parse({ enabled: input.enabled ?? input.configured !== false, manualReceivingId: "101" }));
    if (input.paid !== false) await pool.query("update commerce_orders set payment_status='paid' where tenant_id=$1 and id=$2", [tenantId, orderId]);
    return { tenantId, orderId, snapshot, variantId };
  }
  function provider(options: { existingContact?: boolean; hideContact?: boolean; wrappedList?: boolean; detailDocument?: string; contactName?: string | null; contactEnums?: { regimeTributario?: unknown; estadoCivil?: unknown; sexo?: unknown }; failDetailOnce?: boolean; duplicateContacts?: boolean; inactiveDetail?: boolean; onDetail?: () => Promise<void>; frozenInvoiceEmail?: boolean; ignoreEmailUpdate?: boolean; loseEmailUpdateOnce?: boolean; rejectEmailUpdate?: boolean; invoiceEmailFromContact?: boolean } = {}) {
    let contact = Boolean(options.existingContact), detailFailed = false, externalOrder: Record<string, unknown> | null = null, invoice = false, authorized = false, expedition = false;
    let loseOrder = false, loseWithoutCreating = false, authInvalid = false, emailMismatch = false, rejectInvoice = false, pendingAuthorization = false;
    let contactEmail = testCommerceBilling.email, contactNfeEmail = "", emailUpdateLost = false;
    const calls: { path: string; method: string; body: Record<string, unknown> }[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (!["api.tiny.com.br", "accounts.tiny.com.br"].includes(url.hostname)) throw new Error("Unexpected outbound host");
      const path = url.pathname.replace("/public-api/v3", ""), method = init?.method || "GET";
      const body = init?.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : {};
      calls.push({ path, method, body });
      if (authInvalid) return Response.json(url.hostname === "accounts.tiny.com.br" ? { error: "invalid_grant" } : {}, { status: url.hostname === "accounts.tiny.com.br" ? 400 : 401 });
      if (path === "/contatos" && method === "GET") {
        if (options.duplicateContacts) return Response.json({ itens: url.searchParams.get("cpfCnpj")?.includes(".") ? [{ id: 11, nome: "Cadastro antigo", cpfCnpj: testCommerceBilling.document }, { id: 12, nome: "Cadastro principal", cpfCnpj: testCommerceBilling.document, email: testCommerceBilling.email }] : [] });
        const data = { itens: contact && !options.hideContact ? [{ id: 11, cpfCnpj: testCommerceBilling.document }] : [] };
        return Response.json(options.wrappedList ? { data } : data);
      }
      if ((path === "/contatos/11" || path === "/contatos/12") && method === "GET") {
        await options.onDetail?.();
        if (options.failDetailOnce && !detailFailed) { detailFailed = true; return Response.json({ mensagem: "Indisponível" }, { status: 503 }); }
        return Response.json({ id: path.endsWith("/12") ? 12 : 11, nome: options.contactName === undefined ? "Cliente Olist" : options.contactName, codigo: "CLI-11", tipoPessoa: "F", cpfCnpj: options.detailDocument ?? testCommerceBilling.document, situacao: options.inactiveDetail ? "I" : "B", email: contactEmail, emailNfe: contactNfeEmail,
          endereco: { endereco: "Rua do ERP", numero: "12", municipio: "São Paulo", uf: "SP" }, vendedor: { id: 5, nome: "Vendedor" }, tipos: [{ id: 2, descricao: "Cliente" }], dataCriacao: "2020-01-01", ...options.contactEnums });
      }
      if ((path === "/contatos/11" || path === "/contatos/12") && method === "PUT") {
        if (typeof body.nome !== "string" || !body.nome.trim()) return Response.json({ mensagem: "Ocorreram erros de validação", detalhes: [{ campo: "nome", mensagem: "Este valor não deve ser vazio" }] }, { status: 400 });
        for (const [field, allowed] of [["regimeTributario", [1, 2, 3, 4]], ["estadoCivil", [1, 2, 3, 4, 5]], ["sexo", ["masculino", "feminino"]]] as const)
          if (body[field] != null && !(allowed as readonly unknown[]).includes(body[field])) return Response.json({ mensagem: "Enum inválido", detalhes: [{ campo: field, mensagem: "Valor não permitido" }] }, { status: 400 });
        if (options.rejectEmailUpdate) return Response.json({ mensagem: "Não foi possível alterar previous@example.test", detalhes: [{ campo: "codigo", mensagem: "O campo é obrigatório" }] }, { status: 400 });
        if (!options.ignoreEmailUpdate) { contactEmail = body.email as string; contactNfeEmail = body.emailNfe as string; if (!options.frozenInvoiceEmail) emailMismatch = false; }
        if (options.loseEmailUpdateOnce && !emailUpdateLost) { emailUpdateLost = true; throw new Error("Connection lost after contact email update"); }
        return new Response(null, { status: 204 });
      }
      if (path === "/contatos" && method === "POST") {
        if (contact) return Response.json({ mensagem: "Contato já cadastrado", detalhes: [{ campo: "cpfCnpj", mensagem: "Contato já existe" }, { campo: "idContatoExistente", mensagem: "11" }] }, { status: 409 });
        contact = true; return Response.json({ id: 11 }, { status: 201 });
      }
      if (path === "/pedidos" && method === "GET") return Response.json({ itens: externalOrder ? [{ id: 22 }] : [] });
      if (path === "/pedidos/22" && method === "GET") return Response.json({ id: 22, ecommerce: externalOrder?.ecommerce, cliente: { id: externalOrder?.idContato ?? 11 }, valor: 28.9 });
      if (path === "/pedidos" && method === "POST") { if (!loseWithoutCreating) externalOrder = body; if (loseOrder || loseWithoutCreating) throw new Error("Simulated connection lost after submission"); return Response.json({ id: 22 }, { status: 201 }); }
      if (path.endsWith("/despacho")) return Response.json({});
      if (path === "/notas" && method === "GET") return Response.json({ itens: invoice ? [{ id: 33, numero: 7, serie: "1" }] : [] });
      if (path === "/pedidos/22/gerar-nota-fiscal") { invoice = true; return Response.json({ id: 33, numero: 7, serie: "1" }); }
      if (path === "/notas/33" && method === "GET") return Response.json({ id: 33, numero: 7, serie: "1", valor: 28.9, cliente: { cpfCnpj: testCommerceBilling.document, email: emailMismatch ? options.invoiceEmailFromContact ? contactNfeEmail || contactEmail : "different@example.test" : testCommerceBilling.email }, situacao: rejectInvoice ? 5 : authorized ? 6 : 1, linkAcesso: authorized ? "https://erp.tiny.com.br/doc/nota-test" : undefined });
      if (path === "/notas/33/emitir") { authorized = !pendingAuthorization; return Response.json({ id: 33, situacao: authorized ? 6 : 4 }); }
      if (path === "/notas/33/link") return Response.json({ link: "https://erp.tiny.com.br/doc/nota-test" });
      if (path === "/expedicao" && method === "GET") return Response.json({ itens: expedition ? [{ id: 44 }] : [] });
      if (path === "/expedicao" && method === "POST") { expedition = true; return Response.json({ id: 44 }); }
      throw new Error(`Unexpected mocked ERP request ${method} ${path}`);
    });
    vi.stubGlobal("fetch", fetcher);
    return { calls, setLose: (value: boolean, absent = false) => { loseOrder = value; loseWithoutCreating = absent; }, setAuthInvalid: (value: boolean) => { authInvalid = value; }, setEmailMismatch: () => { emailMismatch = true; contactEmail = "previous@example.test"; contactNfeEmail = "fiscal-previous@example.test"; }, changeFiscalEmail: () => { contactNfeEmail = "changed@example.test"; }, clearInvoiceEmailMismatch: () => { emailMismatch = false; }, setReject: () => { rejectInvoice = true; }, setPending: () => { pendingAuthorization = true; }, authorize: () => { authorized = true; }, writes: (path: string) => calls.filter(call => call.method === "POST" && call.path === path) };
  }
  function login(tenantId: string) {
    vi.stubEnv("APP_URL", "https://panel.example.test");
    vi.mocked(getCurrentSession).mockResolvedValue({ userId: actor, tenantId, email: "olist@example.test", role: "owner" });
  }
  function customerAction(orderId: string, operation: "customer_lookup" | "customer_link", customerId?: string) {
    return action(new Request(`https://panel.example.test/api/commerce/admin/orders/${orderId}/olist`, { method: "POST", headers: { origin: "https://panel.example.test" }, body: JSON.stringify({ action: operation, note: "Cadastro principal conferido pela equipe", ...(customerId ? { customerId } : {}) }) }), { params: Promise.resolve({ orderId }) });
  }
  function emailAction(orderId: string, operation: "email_review" | "email_update" | "email_use_olist", extra: Record<string, unknown> = {}) {
    return action(new Request(`https://panel.example.test/api/commerce/admin/orders/${orderId}/olist`, { method: "POST", headers: { origin: "https://panel.example.test" }, body: JSON.stringify({ action: operation, note: "E-mail de faturamento informado pelo cliente confirmado", ...extra }) }), { params: Promise.resolve({ orderId }) });
  }
  async function blockedEmailOrder(options: Parameters<typeof provider>[0] = {}) {
    const data = await fixture(), api = provider(options);
    await processCommerceOlistOrder(data.tenantId, data.orderId); await productionReady(data.tenantId, data.orderId);
    await processCommerceOlistOrder(data.tenantId, data.orderId, 2);
    expect((await getCommerceOlistJob(data.tenantId, data.orderId))?.invoice_id).toBe("33");
    api.setEmailMismatch(); await processCommerceOlistOrder(data.tenantId, data.orderId, 1);
    expect(await getCommerceOlistJob(data.tenantId, data.orderId)).toMatchObject({ status: "blocked", error_code: "olist_email_update_required", attempt_stage: null, authorization_requested_at: null });
    return { ...data, api };
  }
  it("keeps the ERP recipients by explicit durable consent when updating the contact is rejected, without another PUT or invoice", async () => {
    const { tenantId, orderId, api } = await blockedEmailOrder({ rejectEmailUpdate: true, frozenInvoiceEmail: true });
    const before = (await (await emailAction(orderId, "email_review")).json()).emailReview;
    const log = vi.spyOn(console, "error");
    try {
      const rejected = await emailAction(orderId, "email_update", { reviewToken: before.reviewToken, confirmEmailUpdate: true });
      expect(rejected.status).toBe(409); expect((await rejected.json()).error).toContain("codigo");
      const diagnostic = log.mock.calls.find(call => call[0] === "Commerce Olist email update failed.")?.[1];
      expect(diagnostic).toMatchObject({ phase: "update_contact_emails", method: "PUT", path: "/contatos/11", status: 400, validationFields: ["codigo"] });
      expect(JSON.stringify(diagnostic)).not.toContain("previous@example.test"); expect(diagnostic.providerMessage).toContain("[email]");
    } finally { log.mockRestore(); }
    expect((await emailAction(orderId, "email_use_olist", { reviewToken: before.reviewToken })).status).toBe(400);
    expect((await emailAction(orderId, "email_use_olist", { reviewToken: "0".repeat(64), confirmOlistEmail: true })).status).toBe(409);
    const approved = await emailAction(orderId, "email_use_olist", { reviewToken: before.reviewToken, confirmOlistEmail: true });
    expect(await approved.json()).toMatchObject({ recipientSource: "olist", resumed: true });
    const audit = (await getPool().query("select metadata from commerce_order_events where tenant_id=$1 and order_id=$2 and type='olist.email_recipient_approved'", [tenantId, orderId])).rows[0].metadata;
    expect(audit.actor).toBe(actor); expect(JSON.stringify(audit)).not.toContain("@example.test");
    expect(decryptTenantSecret(audit.consent_encrypted)).toMatchObject({ invoiceId: "33", orderId, tenantId, recipients: before.olistRecipients, actorId: actor });
    await processCommerceOlistOrder(tenantId, orderId, 6); await processCommerceOlistOrder(tenantId, orderId, 6);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ invoice_id: "33", invoice_status: 6, status: "done" });
    expect(api.writes("/notas/33/emitir").map(call => call.body)).toEqual([{ enviarEmail: true }]);
    expect(api.calls.filter(call => call.method === "PUT" && call.path === "/contatos/11")).toHaveLength(1);
    expect(api.writes("/pedidos/22/gerar-nota-fiscal")).toHaveLength(1);
  });
  it("blocks an incomplete ERP contact before PUT and still allows explicit use of its existing emails", async () => {
    const { tenantId, orderId, api } = await blockedEmailOrder({ contactName: null });
    const before = (await (await emailAction(orderId, "email_review")).json()).emailReview;
    const rejected = await emailAction(orderId, "email_update", { reviewToken: before.reviewToken, confirmEmailUpdate: true });
    expect(rejected.status).toBe(409); expect((await rejected.json()).error).toContain("campos: nome");
    expect(api.calls.filter(call => call.method === "PUT" && call.path.startsWith("/contatos/"))).toHaveLength(0);
    expect((await getPool().query("select id from commerce_order_events where tenant_id=$1 and order_id=$2 and type='olist.email_update_requested'", [tenantId, orderId])).rowCount).toBe(0);
    expect((await emailAction(orderId, "email_use_olist", { reviewToken: before.reviewToken, confirmOlistEmail: true })).status).toBe(200);
    await processCommerceOlistOrder(tenantId, orderId, 6);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ invoice_id: "33", invoice_status: 6, status: "done" });
    expect(api.writes("/pedidos/22/gerar-nota-fiscal")).toHaveLength(1);
  });
  it.each([
    { regimeTributario: "", estadoCivil: "", sexo: "" },
    { regimeTributario: 0, estadoCivil: "0", sexo: " " },
    { regimeTributario: "1", estadoCivil: "2", sexo: "F" },
  ])("updates contact emails and resumes the same invoice for legacy optional enums %j", async contactEnums => {
    const { tenantId, orderId, api } = await blockedEmailOrder({ contactEnums });
    const before = (await (await emailAction(orderId, "email_review")).json()).emailReview;
    const response = await emailAction(orderId, "email_update", { reviewToken: before.reviewToken, confirmEmailUpdate: true });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ resumed: true });
    const updates = api.calls.filter(call => call.method === "PUT" && call.path === "/contatos/11");
    expect(updates).toHaveLength(1);
    if (contactEnums.regimeTributario === "1") expect(updates[0].body).toMatchObject({ regimeTributario: 1, estadoCivil: 2, sexo: "feminino" });
    else for (const field of ["regimeTributario", "estadoCivil", "sexo"]) expect(updates[0].body).not.toHaveProperty(field);
    expect(updates[0].body).toMatchObject({ nome: "Cliente Olist", email: testCommerceBilling.email, emailNfe: testCommerceBilling.email });
    await processCommerceOlistOrder(tenantId, orderId, 6);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ invoice_id: "33", invoice_status: 6, status: "done" });
    expect(api.writes("/pedidos/22/gerar-nota-fiscal")).toHaveLength(1);
    expect(api.writes("/notas/33/emitir")).toHaveLength(1);
  });
  it("diagnoses local classification errors without blaming the last invoice GET or logging personal data", async () => {
    const { orderId, api } = await blockedEmailOrder({ contactEnums: { sexo: "private-unknown-value" } });
    const before = (await (await emailAction(orderId, "email_review")).json()).emailReview;
    const log = vi.spyOn(console, "error");
    try {
      const response = await emailAction(orderId, "email_update", { reviewToken: before.reviewToken, confirmEmailUpdate: true });
      expect(response.status).toBe(409);
      const diagnostic = log.mock.calls.find(call => call[0] === "Commerce Olist email update failed.")?.[1];
      expect(diagnostic).toMatchObject({ phase: "prepare_contact_update", failureSource: "local", errorCode: "olist_contact_update_invalid", validationFields: ["sexo"], validationIssues: [{ field: "sexo", inputType: "string", reason: "invalid_enum_value" }] });
      expect(diagnostic.method).toBeUndefined(); expect(diagnostic.path).toBeUndefined();
      expect(JSON.stringify(diagnostic)).not.toMatch(/private-unknown-value|@example.test/);
      expect(api.calls.filter(call => call.method === "PUT" && call.path.startsWith("/contatos/"))).toHaveLength(0);
    } finally { log.mockRestore(); }
  });
  it("requires fresh approval if an ERP recipient changes before fiscal emission", async () => {
    const { tenantId, orderId, api } = await blockedEmailOrder();
    const before = (await (await emailAction(orderId, "email_review")).json()).emailReview;
    expect((await emailAction(orderId, "email_use_olist", { reviewToken: before.reviewToken, confirmOlistEmail: true })).status).toBe(200);
    api.changeFiscalEmail(); await processCommerceOlistOrder(tenantId, orderId, 6);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ status: "blocked", error_code: "olist_email_update_required", authorization_requested_at: null });
    expect(api.writes("/notas/33/emitir")).toHaveLength(0);
    const fresh = (await (await emailAction(orderId, "email_review")).json()).emailReview;
    expect((await emailAction(orderId, "email_use_olist", { reviewToken: fresh.reviewToken, confirmOlistEmail: true })).status).toBe(200);
    await processCommerceOlistOrder(tenantId, orderId, 6); expect(api.writes("/notas/33/emitir")).toHaveLength(1);
    expect(api.calls.filter(call => call.method === "PUT" && call.path === "/contatos/11")).toHaveLength(0);
  });
  it("binds a prospective ERP email approval atomically to the first generated invoice", async () => {
    const { tenantId, orderId } = await fixture(), api = provider({ invoiceEmailFromContact: true });
    await processCommerceOlistOrder(tenantId, orderId); await productionReady(tenantId, orderId);
    api.setEmailMismatch(); await processCommerceOlistOrder(tenantId, orderId, 6);
    const before = (await (await emailAction(orderId, "email_review")).json()).emailReview; expect(before.invoiceId).toBeNull();
    expect((await emailAction(orderId, "email_use_olist", { reviewToken: before.reviewToken, confirmOlistEmail: true })).status).toBe(200);
    await processCommerceOlistOrder(tenantId, orderId, 6);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ invoice_id: "33", invoice_status: 6, status: "done" });
    const bound = (await getPool().query("select metadata from commerce_order_events where tenant_id=$1 and order_id=$2 and type='olist.email_recipient_bound'", [tenantId, orderId])).rows[0].metadata;
    expect(decryptTenantSecret(bound.consent_encrypted)).toMatchObject({ invoiceId: "33", orderId, tenantId });
    expect(api.calls.filter(call => call.method === "PUT" && call.path === "/contatos/11")).toHaveLength(0);
    expect(api.writes("/pedidos/22/gerar-nota-fiscal")).toHaveLength(1); expect(api.writes("/notas/33/emitir")).toHaveLength(1);
  });
  it("preserves the ERP contact including required name, changes the consented emails and resumes the existing invoice exactly once", async () => {
    const { tenantId, orderId, api } = await blockedEmailOrder();
    const reviewed = await emailAction(orderId, "email_review"); expect(reviewed.status).toBe(200);
    const { emailReview } = await reviewed.json();
    expect(emailReview).toMatchObject({ targetEmail: testCommerceBilling.email, contactEmail: "previous@example.test", invoiceId: "33", invoiceMatches: false });
    expect(api.calls.filter(call => call.method === "PUT" && call.path === "/contatos/11")).toHaveLength(0);
    expect((await emailAction(orderId, "email_update", { reviewToken: emailReview.reviewToken })).status).toBe(400);
    const updated = await emailAction(orderId, "email_update", { reviewToken: emailReview.reviewToken, confirmEmailUpdate: true });
    expect(updated.status).toBe(200); expect(await updated.json()).toMatchObject({ resumed: true, emailReview: { contactMatches: true, invoiceMatches: true } });
    expect(api.calls.filter(call => call.method === "PUT" && call.path === "/contatos/11").map(call => call.body)).toEqual([{
      nome: "Cliente Olist", codigo: "CLI-11", tipoPessoa: "F", cpfCnpj: testCommerceBilling.document, situacao: "B",
      endereco: { endereco: "Rua do ERP", numero: "12", municipio: "São Paulo", uf: "SP" }, vendedor: { id: 5 }, tipos: [2],
      email: testCommerceBilling.email, emailNfe: testCommerceBilling.email,
    }]);
    expect(emailReview).not.toHaveProperty("contact"); expect(emailReview).not.toHaveProperty("endereco");
    const audit = (await getPool().query("select metadata from commerce_order_events where tenant_id=$1 and order_id=$2 and type='olist.email_update_requested'", [tenantId, orderId])).rows[0].metadata;
    expect(audit.actor).toBe(actor); expect(JSON.stringify(audit)).not.toContain("previous@example.test");
    expect(decryptTenantSecret(audit.emails_encrypted)).toMatchObject({ previousEmail: "previous@example.test", targetEmail: testCommerceBilling.email });
    await processCommerceOlistOrder(tenantId, orderId, 6); await processCommerceOlistOrder(tenantId, orderId, 6);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ invoice_id: "33", invoice_status: 6, expedition_id: "44", status: "done" });
    expect(api.writes("/pedidos/22/gerar-nota-fiscal")).toHaveLength(1); expect(api.writes("/notas/33/emitir")).toHaveLength(1);
    expect(api.calls.some(call => call.method === "PUT" && call.path === "/notas/33")).toBe(false);
  });
  it("keeps issuance blocked if the existing invoice retains its old address, then resumes after that same invoice is corrected", async () => {
    const { tenantId, orderId, api } = await blockedEmailOrder({ frozenInvoiceEmail: true });
    const before = (await (await emailAction(orderId, "email_review")).json()).emailReview;
    const update = await emailAction(orderId, "email_update", { reviewToken: before.reviewToken, confirmEmailUpdate: true });
    expect(await update.json()).toMatchObject({ resumed: false, emailReview: { contactMatches: true, invoiceMatches: false } });
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ status: "blocked", error_code: "olist_invoice_email_required", invoice_id: "33" });
    await processCommerceOlistOrder(tenantId, orderId, 6); expect(api.writes("/notas/33/emitir")).toHaveLength(0);
    api.clearInvoiceEmailMismatch();
    const after = (await (await emailAction(orderId, "email_review")).json()).emailReview;
    expect((await (await emailAction(orderId, "email_update", { reviewToken: after.reviewToken, confirmEmailUpdate: true })).json()).resumed).toBe(true);
    await processCommerceOlistOrder(tenantId, orderId, 6);
    expect(api.writes("/pedidos/22/gerar-nota-fiscal")).toHaveLength(1); expect(api.writes("/notas/33/emitir")).toHaveLength(1);
    expect(api.calls.filter(call => call.method === "PUT" && call.path === "/contatos/11")).toHaveLength(1);
  });
  it("rejects stale email confirmation and safely reconciles a lost update response without repeating the PUT", async () => {
    const { tenantId, orderId, api } = await blockedEmailOrder({ loseEmailUpdateOnce: true });
    const first = (await (await emailAction(orderId, "email_review")).json()).emailReview;
    expect((await emailAction(orderId, "email_update", { reviewToken: "0".repeat(64), confirmEmailUpdate: true })).status).toBe(409);
    const lost = await emailAction(orderId, "email_update", { reviewToken: first.reviewToken, confirmEmailUpdate: true }); expect(lost.status).toBe(503);
    expect((await getCommerceOlistJob(tenantId, orderId))?.status).toBe("blocked");
    const fresh = (await (await emailAction(orderId, "email_review")).json()).emailReview;
    expect(fresh).toMatchObject({ contactMatches: true, invoiceMatches: true });
    expect((await (await emailAction(orderId, "email_update", { reviewToken: fresh.reviewToken, confirmEmailUpdate: true })).json()).resumed).toBe(true);
    expect(api.calls.filter(call => call.method === "PUT" && call.path === "/contatos/11")).toHaveLength(1);
    await processCommerceOlistOrder(tenantId, orderId, 6); expect(api.writes("/notas/33/emitir")).toHaveLength(1);
  });
  it("does not release an invoice if the provider ignores the email change or if confirmation is forged", async () => {
    const { tenantId, orderId, api } = await blockedEmailOrder({ ignoreEmailUpdate: true });
    const before = (await (await emailAction(orderId, "email_review")).json()).emailReview;
    expect((await emailAction(orderId, "email_update", { reviewToken: before.reviewToken, confirmEmailUpdate: true, targetEmail: "attacker@example.test" })).status).toBe(400);
    const response = await emailAction(orderId, "email_update", { reviewToken: before.reviewToken, confirmEmailUpdate: true });
    expect(await response.json()).toMatchObject({ resumed: false, emailReview: { contactMatches: false } });
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ status: "blocked", invoice_id: "33", authorization_requested_at: null });
    await processCommerceOlistOrder(tenantId, orderId, 6);
    expect(api.writes("/notas/33/emitir")).toHaveLength(0);
  });
  it("checks email before first invoice generation and never changes an authorized or another tenant's document", async () => {
    const { tenantId, orderId } = await fixture(), api = provider();
    await processCommerceOlistOrder(tenantId, orderId); await productionReady(tenantId, orderId);
    api.setEmailMismatch(); await processCommerceOlistOrder(tenantId, orderId, 6);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ invoice_id: null, error_code: "olist_email_update_required", status: "blocked" });
    expect(api.writes("/pedidos/22/gerar-nota-fiscal")).toHaveLength(0);
    const before = (await (await emailAction(orderId, "email_review")).json()).emailReview; expect(before.invoiceId).toBeNull();
    const other = await fixture(); login(other.tenantId);
    expect((await emailAction(orderId, "email_review")).status).toBe(404);
    expect((await emailAction(orderId, "email_update", { reviewToken: before.reviewToken, confirmEmailUpdate: true })).status).toBe(404);
    login(tenantId); expect((await emailAction(orderId, "email_update", { reviewToken: before.reviewToken, confirmEmailUpdate: true })).status).toBe(200);
    await processCommerceOlistOrder(tenantId, orderId, 6);
    expect(api.writes("/pedidos/22/gerar-nota-fiscal")).toHaveLength(1);
    expect((await emailAction(orderId, "email_review")).status).toBe(409);
    expect((await emailAction(orderId, "email_update", { reviewToken: before.reviewToken, confirmEmailUpdate: true })).status).toBe(409);
  });
  it("surfaces two exact document matches without an uncertain mutation and lets the team resume all stages with a verified choice", async () => {
    const { tenantId, orderId } = await fixture(), api = provider({ duplicateContacts: true }); login(tenantId);
    const log = vi.spyOn(console, "error");
    try {
      await processCommerceOlistOrder(tenantId, orderId);
      expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ status: "review", error_code: "olist_customer_ambiguous", attempt_stage: null, customer_id: null, sales_order_id: null, last_error: expect.stringContaining("mais de um contato") });
      expect(log).toHaveBeenCalledWith("Commerce Olist stage failed.", expect.objectContaining({ uncertainMutation: false, httpStatus: 409 }));
    } finally { log.mockRestore(); }
    expect(api.writes("/contatos")).toHaveLength(0);
    const choices = await customerAction(orderId, "customer_lookup"); expect(choices.status).toBe(200);
    expect((await choices.json()).customers).toEqual([expect.objectContaining({ id: "11", name: "Cadastro antigo" }), expect.objectContaining({ id: "12", name: "Cadastro principal" })]);
    await productionReady(tenantId, orderId);
    const link = await customerAction(orderId, "customer_link", "12"); expect(link.status).toBe(200);
    expect((await getCommerceOlistJob(tenantId, orderId))?.customer_id).toBe("12");
    expect((await getPool().query("select external_id,create_attempted from commerce_olist_customers where tenant_id=$1", [tenantId])).rows).toEqual([{ external_id: "12", create_attempted: false }]);
    expect((await getPool().query("select metadata from commerce_order_events where tenant_id=$1 and order_id=$2 and type='olist.customer_linked'", [tenantId, orderId])).rows[0].metadata).toMatchObject({ actor, customer_id: "12", note: "Cadastro principal conferido pela equipe" });
    await processCommerceOlistOrder(tenantId, orderId, 6);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ customer_id: "12", sales_order_id: "22", invoice_status: 6, expedition_id: "44", status: "done" });
    await processCommerceOlistOrder(tenantId, orderId, 6);
    expect(api.writes("/contatos")).toHaveLength(0);
    expect(api.writes("/pedidos")[0].body.idContato).toBe(12);
    for (const path of ["/pedidos", "/pedidos/22/gerar-nota-fiscal", "/notas/33/emitir", "/expedicao"]) expect(api.writes(path)).toHaveLength(1);
    expect((await customerAction(orderId, "customer_link", "11")).status).toBe(409);
  });
  it("refuses a changed document or inactive ERP contact and never clears the original review state", async () => {
    for (const invalid of [{ detailDocument: "11144477735" }, { inactiveDetail: true }]) {
      const { tenantId, orderId } = await fixture(), api = provider({ duplicateContacts: true, ...invalid }); login(tenantId);
      await processCommerceOlistOrder(tenantId, orderId);
      expect((await customerAction(orderId, "customer_link", "12")).status).toBe(409);
      expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ customer_id: null, status: "review" });
      expect(api.writes("/pedidos")).toHaveLength(0);
      expect((await getPool().query("select * from commerce_olist_leases where lock_key like $1", [`%${tenantId}%`])).rowCount).toBe(0);
    }
  });
  it("rejects cross-tenant review, active worker locks and conflicting durable customer mappings", async () => {
    const { tenantId, orderId } = await fixture(), api = provider({ duplicateContacts: true }); login(tenantId);
    await processCommerceOlistOrder(tenantId, orderId);
    const other = await fixture(); login(other.tenantId);
    expect((await customerAction(orderId, "customer_lookup")).status).toBe(404);
    expect((await customerAction(orderId, "customer_link", "12")).status).toBe(404);
    login(tenantId);
    const lock = `commerce-olist:${tenantId}:${orderId}`;
    await getPool().query("insert into commerce_olist_leases(lock_key,token,expires_at) values($1,$2,now()+interval '1 minute')", [lock, randomUUID()]);
    expect((await customerAction(orderId, "customer_link", "12")).status).toBe(409);
    await getPool().query("delete from commerce_olist_leases where lock_key=$1", [lock]);
    const hash = createHash("sha256").update(`${tenantId}:${testCommerceBilling.document.replace(/\D/g, "")}`).digest("hex");
    await getPool().query("insert into commerce_olist_customers(tenant_id,document_hash,external_id) values($1,$2,'99')", [tenantId, hash]);
    expect((await customerAction(orderId, "customer_link", "12")).status).toBe(409);
    expect((await getPool().query("select external_id from commerce_olist_customers where tenant_id=$1", [tenantId])).rows[0].external_id).toBe("99");
    expect(api.writes("/pedidos")).toHaveLength(0);
    expect((await getCommerceOlistJob(tenantId, orderId))?.customer_id).toBeNull();
  });
  it("rechecks payment after the ERP verification and rolls back a link if the order was refunded concurrently", async () => {
    const { tenantId, orderId } = await fixture(); login(tenantId);
    provider({ duplicateContacts: true, onDetail: async () => { await getPool().query("update commerce_orders set payment_status='refunded' where tenant_id=$1 and id=$2", [tenantId, orderId]); } });
    await processCommerceOlistOrder(tenantId, orderId);
    expect((await customerAction(orderId, "customer_link", "12")).status).toBe(409);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ customer_id: null, status: "stopped" });
    expect((await getPool().query("select * from commerce_olist_customers where tenant_id=$1", [tenantId])).rowCount).toBe(0);
    expect((await getPool().query("select * from commerce_order_events where tenant_id=$1 and order_id=$2 and type='olist.customer_linked'", [tenantId, orderId])).rowCount).toBe(0);
  });
  async function productionReady(tenantId: string, orderId: string) {
    login(tenantId);
    await getPool().query("update commerce_orders set fulfillment_status='production' where tenant_id=$1 and id=$2", [tenantId, orderId]);
    return action(new Request(`https://panel.example.test/api/commerce/admin/orders/${orderId}/olist`, { method: "POST", headers: { origin: "https://panel.example.test" }, body: JSON.stringify({ action: "production_ready", note: "Produção e embalagem conferidas" }) }), { params: Promise.resolve({ orderId }) });
  }
  it("does not queue tenants without Olist, disabled settings, pending payments or sandbox orders", async () => {
    for (const options of [{ configured: false }, { enabled: false }, { paid: false }, { environment: "test" }]) {
      const { tenantId, orderId } = await fixture(options);
      expect(await getCommerceOlistJob(tenantId, orderId)).toBeNull();
    }
  });
  it("commits the outbox with payment, creates exact-valued customer/order once and waits for production", async () => {
    const { tenantId, orderId } = await fixture(), api = provider();
    expect((await getCommerceOlistJob(tenantId, orderId))?.status).toBe("pending");
    await Promise.all([processCommerceOlistOrder(tenantId, orderId), processCommerceOlistOrder(tenantId, orderId)]);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ customer_id: "11", sales_order_id: "22", status: "waiting", invoice_id: null });
    expect(api.writes("/contatos")).toHaveLength(1); expect(api.writes("/pedidos")).toHaveLength(1);
    expect(api.writes("/pedidos")[0].body).toMatchObject({ idContato: 11, valorFrete: 5, valorDesconto: 0.1, enderecoEntrega: { nomeDestinatario: testCommerceBilling.name, complemento: "A/C: Maria" }, pagamento: { formaRecebimento: { id: 101 } } });
    expect(api.writes("/pedidos/22/gerar-nota-fiscal")).toHaveLength(0);
    await processCommerceOlistOrder(tenantId, orderId); expect(api.writes("/pedidos")).toHaveLength(1);
  });
  it("links an existing billing customer without posting a duplicate, including wrapped lists", async () => {
    const { tenantId, orderId } = await fixture(), api = provider({ existingContact: true, wrappedList: true });
    await processCommerceOlistOrder(tenantId, orderId);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ customer_id: "11", sales_order_id: "22", status: "waiting" });
    expect(api.writes("/contatos")).toHaveLength(0);
    expect(api.writes("/pedidos")).toHaveLength(1);
  });
  it("recovers a 409 by verifying the existing contact, persists the link and completes the fiscal workflow once", async () => {
    const { tenantId, orderId } = await fixture(), api = provider({ existingContact: true, hideContact: true });
    await processCommerceOlistOrder(tenantId, orderId);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ customer_id: "11", sales_order_id: "22", status: "waiting", attempt_stage: null, last_error: null });
    expect(api.calls.some(call => call.path === "/contatos/11" && call.method === "GET")).toBe(true);
    expect((await getPool().query("select external_id,create_attempted from commerce_olist_customers where tenant_id=$1", [tenantId])).rows).toEqual([{ external_id: "11", create_attempted: false }]);
    expect((await productionReady(tenantId, orderId)).status).toBe(200);
    await processCommerceOlistOrder(tenantId, orderId, 6);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ invoice_id: "33", invoice_status: 6, expedition_id: "44", status: "done" });
    await processCommerceOlistOrder(tenantId, orderId, 6);
    for (const path of ["/contatos", "/pedidos", "/pedidos/22/gerar-nota-fiscal", "/notas/33/emitir", "/expedicao"]) expect(api.writes(path)).toHaveLength(1);
  });
  it("does not link a duplicate-contact ID belonging to a different billing document", async () => {
    const { tenantId, orderId } = await fixture(), api = provider({ existingContact: true, hideContact: true, detailDocument: "11144477735" });
    await processCommerceOlistOrder(tenantId, orderId);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ customer_id: null, sales_order_id: null, status: "review", error_code: "olist_review_required" });
    expect(api.writes("/pedidos")).toHaveLength(0);
    expect((await getPool().query("select external_id from commerce_olist_customers where tenant_id=$1", [tenantId])).rows[0].external_id).toBeNull();
  });
  it("retries a read failure after a definitively rejected creation without marking the mutation uncertain", async () => {
    const { tenantId, orderId } = await fixture(), api = provider({ existingContact: true, hideContact: true, failDetailOnce: true });
    await processCommerceOlistOrder(tenantId, orderId);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ status: "pending", attempt_stage: null, error_code: "olist_temporarily_unavailable" });
    await queueCommerceOlistOrder(tenantId, orderId, actor);
    await processCommerceOlistOrder(tenantId, orderId);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ customer_id: "11", sales_order_id: "22", status: "waiting" });
    expect(api.writes("/pedidos")).toHaveLength(1);
  });
  it("only invoices after production completion and authorizes with email before real ERP dispatch", async () => {
    const { tenantId, orderId } = await fixture(), api = provider();
    await processCommerceOlistOrder(tenantId, orderId);
    const response = await productionReady(tenantId, orderId);
    expect(response.status).toBe(200);
    await processCommerceOlistOrder(tenantId, orderId, 6);
    const job = await getCommerceOlistJob(tenantId, orderId);
    expect(job).toMatchObject({ invoice_id: "33", invoice_status: 6, expedition_id: "44", status: "done" });
    expect(job?.email_requested_at).toBeTruthy();
    expect(job?.package_snapshot?.grossWeightKg).toBeGreaterThan(0);
    expect(api.writes("/notas/33/emitir")[0].body).toEqual({ enviarEmail: true });
    expect(api.writes("/expedicao")[0].body).toEqual({ idsNotasFiscais: [33] });
    const shipping = api.calls.findIndex(call => call.path === "/pedidos/22/despacho" && call.method === "PUT");
    const fiscal = api.calls.findIndex(call => call.path === "/pedidos/22/gerar-nota-fiscal");
    expect(shipping).toBeGreaterThan(0); expect(shipping).toBeLessThan(fiscal);
    expect(api.calls[shipping].body).toMatchObject({ pesoBruto: expect.any(Number), volumes: 1, formaEnvio: { id: 400 } });
    await processCommerceOlistOrder(tenantId, orderId); expect(api.writes("/notas/33/emitir")).toHaveLength(1);
  });
  it("polls authorization rather than equating HTTP 200 with fiscal approval or resending email", async () => {
    const { tenantId, orderId } = await fixture(), api = provider(); api.setPending();
    await processCommerceOlistOrder(tenantId, orderId); await productionReady(tenantId, orderId); await processCommerceOlistOrder(tenantId, orderId, 6);
    expect((await getCommerceOlistJob(tenantId, orderId))?.invoice_status).toBe(4); expect(api.writes("/expedicao")).toHaveLength(0);
    api.authorize(); await getPool().query("update commerce_olist_orders set next_attempt_at=now() where tenant_id=$1 and order_id=$2", [tenantId, orderId]);
    await processCommerceOlistOrder(tenantId, orderId, 6);
    expect((await getCommerceOlistJob(tenantId, orderId))?.expedition_id).toBe("44"); expect(api.writes("/notas/33/emitir")).toHaveLength(1);
  });
  it("reconciles an uncertain external order without creating another one", async () => {
    const { tenantId, orderId } = await fixture(), api = provider(); api.setLose(true);
    await processCommerceOlistOrder(tenantId, orderId);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ status: "review", attempt_stage: "sales_order" });
    api.setLose(false); await queueCommerceOlistOrder(tenantId, orderId, actor); await processCommerceOlistOrder(tenantId, orderId);
    expect((await getCommerceOlistJob(tenantId, orderId))?.sales_order_id).toBe("22"); expect(api.writes("/pedidos")).toHaveLength(1);
  });
  it("never blindly recreates a mutation with an unknown result", async () => {
    const { tenantId, orderId } = await fixture(), api = provider(); api.setLose(true, true);
    await processCommerceOlistOrder(tenantId, orderId); api.setLose(false);
    await queueCommerceOlistOrder(tenantId, orderId, actor); await processCommerceOlistOrder(tenantId, orderId);
    expect((await getCommerceOlistJob(tenantId, orderId))?.status).toBe("review"); expect(api.writes("/pedidos")).toHaveLength(1);
  });
  it("keeps progress and a reconnectable state on invalid_grant", async () => {
    const { tenantId, orderId } = await fixture(), api = provider(); api.setAuthInvalid(true);
    await processCommerceOlistOrder(tenantId, orderId);
    expect(await getCommerceOlistJob(tenantId, orderId)).toMatchObject({ status: "blocked", error_code: "olist_oauth_invalid", sales_order_id: null });
    api.setAuthInvalid(false); await queueCommerceOlistOrder(tenantId, orderId, actor); await processCommerceOlistOrder(tenantId, orderId);
    expect((await getCommerceOlistJob(tenantId, orderId))?.sales_order_id).toBe("22");
  });
  it("serializes the same billing document across concurrent purchases without duplicating the contact", async () => {
    const { tenantId, orderId } = await fixture(), api = provider();
    const otherId = (await getPool().query(`insert into commerce_orders(tenant_id,customer_id,session_id,cart_revision,snapshot,subtotal_cents,shipping_cents,total_cents,provider,payment_environment)
      select tenant_id,customer_id,session_id,1,snapshot,subtotal_cents,shipping_cents,total_cents,provider,payment_environment from commerce_orders where tenant_id=$1 and id=$2 returning id`, [tenantId, orderId])).rows[0].id;
    await getPool().query("update commerce_orders set payment_status='paid' where tenant_id=$1 and id=$2", [tenantId, otherId]);
    await Promise.all([processCommerceOlistOrder(tenantId, orderId, 1), processCommerceOlistOrder(tenantId, otherId, 1)]);
    await queueCommerceOlistOrder(tenantId, otherId, actor); await processCommerceOlistOrder(tenantId, otherId, 1);
    expect(api.writes("/contatos")).toHaveLength(1);
    expect((await getPool().query("select count(*)::int as count from commerce_olist_customers where tenant_id=$1 and external_id='11'", [tenantId])).rows[0].count).toBe(1);
    expect((await getPool().query("select count(*)::int as count from commerce_olist_leases where lock_key like $1", [`%${tenantId}%`])).rows[0].count).toBe(0);
  });
  it("does not authorize with a divergent email and never sends rejected notes to dispatch", async () => {
    for (const scenario of ["email", "rejected"]) {
      const { tenantId, orderId } = await fixture(), api = provider();
      await processCommerceOlistOrder(tenantId, orderId); await productionReady(tenantId, orderId);
      if (scenario === "email") api.setEmailMismatch(); else api.setReject();
      await processCommerceOlistOrder(tenantId, orderId, 6);
      expect(["blocked", "review"]).toContain((await getCommerceOlistJob(tenantId, orderId))?.status);
      expect(api.writes("/notas/33/emitir")).toHaveLength(0); expect(api.writes("/expedicao")).toHaveLength(0);
    }
  });
  it("isolates API reads, configuration IDs and stops processing after refunds", async () => {
    const first = await fixture(), other = await fixture(), api = provider();
    login(other.tenantId);
    expect((await read(new Request("https://panel.example.test"), { params: Promise.resolve({ orderId: first.orderId }) })).status).toBe(404);
    await expect(saveCommerceOlistSettings(other.tenantId, actor, commerceOlistSettingsSchema.parse({ enabled: true, manualReceivingId: "999999" }))).rejects.toThrow("deste tenant");
    await getPool().query("update commerce_orders set payment_status='refunded' where tenant_id=$1 and id=$2", [first.tenantId, first.orderId]);
    expect((await getCommerceOlistJob(first.tenantId, first.orderId))?.status).toBe("stopped");
    await processCommerceOlistOrder(first.tenantId, first.orderId); expect(api.calls).toHaveLength(0);
    const client = await getPool().connect();
    try { await client.query("set role anon"); await expect(client.query("select * from commerce_olist_orders")).rejects.toMatchObject({ code: "42501" }); } finally { await client.query("reset role"); client.release(); }
  });
  it("protects cron with a strong server-only secret", async () => {
    vi.stubEnv("CRON_SECRET", "a-very-long-local-cron-secret-for-tests");
    expect((await cron(new Request("https://panel.example.test/api/cron/commerce-olist"))).status).toBe(401);
  });
  it("blocks shipment before fiscal release but leaves manual workflow available when Olist is explicitly disabled", async () => {
    const { tenantId, orderId } = await fixture(); login(tenantId);
    await getPool().query("update commerce_orders set fulfillment_status='production' where tenant_id=$1 and id=$2", [tenantId, orderId]);
    const request = () => new Request(`https://panel.example.test/api/commerce/admin/orders/${orderId}`, { method: "POST", headers: { origin: "https://panel.example.test" }, body: JSON.stringify({ action: "shipped", note: "Pedido conferido para entrega" }) });
    const params = { params: Promise.resolve({ orderId }) };
    expect((await changeOrder(request(), params)).status).toBe(409);
    await getPool().query("update integration_connections set status='disabled' where tenant_id=$1 and provider='olist'", [tenantId]);
    expect((await changeOrder(request(), params)).status).toBe(200);
    await expect(saveCommerceOlistSettings(tenantId, actor, commerceOlistSettingsSchema.parse({ enabled: false, manualReceivingId: "999999" }))).resolves.toBeUndefined();
  });
});

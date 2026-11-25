// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db/client";
import { sendStoreEmail } from "@/services/email/store-email";
import { processCommerceOrderNotifications } from "@/services/commerce/order-notifications";
import { scheduleCommerceOrderNotifications } from "@/services/commerce/order-notification-schedule";
import { after } from "next/server";

vi.mock("@/lib/db/client", () => ({ getPool: vi.fn() }));
vi.mock("@/services/email/store-email", () => ({ sendStoreEmail: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const tenantId = "10000000-0000-4000-8000-000000000001";
const orderId = "20000000-0000-4000-8000-000000000002";
const job = {
  id: "30000000-0000-4000-8000-000000000003", tenant_id: tenantId, order_id: orderId,
  event_type: "shipping.posted", event_key: "fulfillment.shipped", claim_token: "40000000-0000-4000-8000-000000000004", attempts: 1,
};
const liveState = {
  payment_environment: "production", payment_status: "paid", fulfillment_status: "shipped",
  cancelled_at: null, deleted_at: null, store_enabled: true, tenant_status: "active", slug: "ground-shop",
  store_name: "Loja & Companhia", customer_name: "Cliente <img src=x onerror=alert(1)>", customer_email: "current@example.com",
  shipment_status: "posted", service_name: 'Correios <b>SEDEX</b>', tracking_code: 'AB"<123>&',
  tracking_url: "https://tracking.example.com/?code=123&service=sedex", proof_ready: true, delivery: "delivery", tracking_parcels: [],
};
const query = vi.fn();
let jobs: typeof job[];
let state: Record<string, unknown> | undefined;
let leaseOwned: boolean;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("COMMERCE_ENABLED", "true");
  vi.stubEnv("APP_URL", "https://app.example.com/untrusted-path");
  vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", "");
  jobs = [{ ...job }]; state = { ...liveState }; leaseOwned = true;
  query.mockReset();
  query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("with candidate")) return { rows: jobs.splice(0, 1) };
    if (sql.startsWith("select o.payment_environment")) return { rows: state ? [state] : [] };
    if (sql.startsWith("update commerce_order_notifications set claim_expires_at")) return { rows: [], rowCount: leaseOwned ? 1 : 0 };
    return { rows: [], rowCount: 1 };
  });
  vi.mocked(getPool).mockReturnValue({ query } as never);
  vi.mocked(sendStoreEmail).mockResolvedValue({ sent: true, provider: "smtp", message: "accepted" });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function settlements() {
  return query.mock.calls.filter(([sql]) => sql.startsWith("update commerce_order_notifications set status=$4"));
}
function trackingKey(code: string) {
  return `shipping.tracking_available:${createHash("md5").update(code.trim().toUpperCase()).digest("hex")}`;
}

describe("transactional order email delivery", () => {
  it("includes the frozen receipt, store identity, destination and original estimate without exposing tax IDs", async () => {
    jobs[0].event_type = "payment.paid";
    Object.assign(state!, {
      logo_url: "https://cdn.example.com/store-logo.png", accent: "#26bfe8", contact_email: "loja@example.com", contact_phone: "+55 11 99999-0000",
      created_at: "2026-11-25T12:30:00Z", subtotal_cents: 13500, shipping_cents: 2000, total_cents: 15500, artwork_discount_cents: 1500,
      order_items: [{ name: "Botton <3,5 cm>", quantity: 50, unitCents: 300, totalCents: 13500, artworkDiscountCents: 1500, artworkName: "Campanha & Evento" }],
      delivery_address: { name: "Destinatária", street: "Rua A", number: "123", complement: "Sala 2", district: "Centro", city: "São Paulo", state: "SP", postalCode: "01001000", attention: "Equipe de eventos", document: "12345678901", email: "private@example.com" },
      production: { productionDays: 3, transportDays: 2, deliveryDate: "2026-12-02" },
    });
    await processCommerceOrderNotifications();
    const { text, html } = vi.mocked(sendStoreEmail).mock.calls[0][1];
    expect(html).toContain('src="https://cdn.example.com/store-logo.png"');
    expect(html).toContain("Campanha &amp; Evento"); expect(text).toContain("50 un. × R$ 3,00 = R$ 150,00");
    expect(text).toContain("Produtos: R$ 150,00"); expect(text).toContain("Desconto por arte pronta: −R$ 15,00");
    expect(text).toContain("Entrega: R$ 20,00"); expect(text).toContain("Total do pedido: R$ 155,00");
    expect(text).toContain("25/11/2026, 09:30"); expect(text).toContain("Pagamento: Confirmado");
    expect(text).toContain("Rua A, 123 · Sala 2"); expect(text).toContain("Aos cuidados de: Equipe de eventos");
    expect(text).toContain("Produção: 3 dias úteis"); expect(text).toContain("Transporte: 2 dias úteis");
    expect(text).toContain("Previsão registrada na compra:"); expect(text).toContain("aprovação das artes");
    expect(text).toContain("Atendimento: loja@example.com");
    expect(`${html}${text}`).not.toContain("12345678901"); expect(`${html}${text}`).not.toContain("private@example.com");
    expect(html).not.toContain("Rastrear entrega");
  });

  it.each([{ total_cents: 999 }, { shipping_cents: null }, { order_items: [] }, { order_items: [{ name: "Bad", quantity: 0 }] }, { artwork_discount_cents: "invalid" }, { artwork_discount_cents: 50 }, { order_items: [{ name: "Wrong subtotal", quantity: 1, unitCents: 101, totalCents: 101 }] }])("omits incomplete/corrupt receipts instead of inventing prices: %j", async patch => {
    Object.assign(state!, { subtotal_cents: 100, shipping_cents: 50, total_cents: 150, order_items: [{ name: "Botton", quantity: 1, unitCents: 100, totalCents: 100 }] }, patch);
    await processCommerceOrderNotifications();
    const { text } = vi.mocked(sendStoreEmail).mock.calls[0][1];
    expect(text).not.toContain("Resumo do pedido"); expect(text).toContain("Pedido: #20000000");
  });

  it("does not let an invalid historical estimate prevent notification delivery", async () => {
    state!.production = { productionDays: 3, transportDays: 2, deliveryDate: "2026-99-99" };
    await processCommerceOrderNotifications();
    expect(sendStoreEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendStoreEmail).mock.calls[0][1].text).not.toContain("2026-99-99");
    expect(settlements()[0][1][3]).toBe("sent");
  });

  it("confirms actual pickup without incorrectly announcing readiness or carrier shipment", async () => {
    jobs[0].event_type = "fulfillment.shipped";
    Object.assign(state!, { delivery: "pickup", pickup_address: "Rua da Loja, 10" });
    await processCommerceOrderNotifications();
    const { text, subject } = vi.mocked(sendStoreEmail).mock.calls[0][1];
    expect(subject).toContain("Retirada confirmada"); expect(text).toContain("retirada do seu pedido foi registrada");
    expect(text).toContain("Rua da Loja, 10"); expect(text).not.toContain("Pedido pronto para retirada"); expect(text).not.toContain("Código de rastreio");
  });

  it("re-reads tenant-scoped live state, escapes HTML, and sends through the store sender", async () => {
    expect(await processCommerceOrderNotifications(tenantId, 5, orderId)).toBe(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("c.tenant_id=o.tenant_id and c.id=o.customer_id"), [tenantId, job.id, job.claim_token]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("join commerce_order_shipments"), [tenantId, job.id, job.claim_token]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("s.settings->>'name'"), [tenantId, job.id, job.claim_token]);
    expect(sendStoreEmail).toHaveBeenCalledWith(tenantId, expect.objectContaining({
      to: "current@example.com", subject: "Pedido enviado - Pedido #20000000 - Loja & Companhia",
      messageId: `<commerce-order-${job.id}@commerce-notifications.invalid>`,
    }));
    const input = vi.mocked(sendStoreEmail).mock.calls[0][1];
    expect(input.text).toContain("Pedido #20000000");
    expect(input.html).toContain("Pedido #20000000");
    expect(input.text).toContain(`https://app.example.com/loja/ground-shop/pedidos/${orderId}`);
    expect(input.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(input.html).toContain("Correios &lt;b&gt;SEDEX&lt;/b&gt;");
    expect(input.html).toContain("AB&quot;&lt;123&gt;&amp;");
    expect(input.html).toContain("https://tracking.example.com/?code=123&amp;service=sedex");
    expect(input.html).not.toContain("<img");
    expect(settlements()[0][1]).toEqual([tenantId, job.id, job.claim_token, "sent", null]);
  });

  it("uses only operator-authorized custom domains, not store-requested domains or request headers", async () => {
    vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", JSON.stringify({ "shop.example.com": "ground-shop" }));
    state!.requested_domain = "evil.example.com";
    await processCommerceOrderNotifications();
    const input = vi.mocked(sendStoreEmail).mock.calls[0][1];
    expect(input.text).toContain(`https://shop.example.com/pedidos/${orderId}`);
    expect(input.text).not.toContain("evil.example.com");
    expect(input.text).not.toContain("/loja/");
  });

  it.each(["http://tracker.example.com", "javascript:alert(1)", "https://user:password@tracking.example.com", "//tracking.example.com", "not-a-url"])("omits unsafe tracking URL %s", async trackingUrl => {
    state!.tracking_url = trackingUrl;
    await processCommerceOrderNotifications();
    const input = vi.mocked(sendStoreEmail).mock.calls[0][1];
    expect(input.text).not.toContain(trackingUrl);
    expect(input.html).not.toContain("Rastrear entrega");
    expect(input.text).toContain("Código de rastreio:");
  });

  it.each([
    { payment_environment: "test" }, { cancelled_at: "2026-11-01" }, { deleted_at: "2026-11-01" },
    { store_enabled: false }, { tenant_status: "suspended" }, { payment_status: "refunded" },
    { fulfillment_status: "completed" }, { shipment_status: "delivered" },
  ])("suppresses no-longer-eligible orders: %j", async patch => {
    Object.assign(state!, patch);
    await processCommerceOrderNotifications();
    expect(sendStoreEmail).not.toHaveBeenCalled();
    expect(settlements()[0][1][3]).toBe("skipped");
  });

  it("suppresses missing orders rather than using an outbox recipient snapshot", async () => {
    state = undefined;
    await processCommerceOrderNotifications();
    expect(sendStoreEmail).not.toHaveBeenCalled();
    expect(settlements()[0][1][3]).toBe("skipped");
  });

  it.each(["bad-email", "victim@example.com\r\nBcc: other@example.com", "one@example.com,two@example.com"])("fails invalid recipients without sending: %s", async email => {
    state!.customer_email = email;
    await processCommerceOrderNotifications();
    expect(sendStoreEmail).not.toHaveBeenCalled();
    expect(settlements()[0][1].slice(3)).toEqual(["failed", "invalid_recipient"]);
  });

  it.each([
    ["order.created", {}, true], ["payment.paid", { payment_status: "pending" }, false],
    ["payment.refunded", { payment_status: "refunded" }, true], ["payment.refunded", {}, false],
    ["fulfillment.production", { fulfillment_status: "production" }, true], ["fulfillment.production", {}, false],
    ["artwork.publish", { proof_ready: true }, true], ["artwork.publish", { proof_ready: false }, false],
    ["shipping.delivered", { shipment_status: "delivered" }, true], ["shipping.delivered", {}, false],
    ["fulfillment.completed", { fulfillment_status: "completed" }, true],
    ["shipping.exception", { shipment_status: "exception" }, true], ["shipping.exception", {}, false],
    ["shipping.tracking_available", {}, true],
    ["shipping.tracking_available", { tracking_code: null, tracking_url: "http://unsafe.example.com" }, false],
    ["olist.invoice_authorize", {}, false],
  ] as [string, Record<string, unknown>, boolean][])("checks the current state for %s (%j)", async (type, patch, sends) => {
    jobs[0].event_type = type; Object.assign(state!, patch);
    if (type === "shipping.tracking_available") jobs[0].event_key = trackingKey(liveState.tracking_code);
    await processCommerceOrderNotifications();
    expect(sendStoreEmail).toHaveBeenCalledTimes(sends ? 1 : 0);
  });

  it("does not put shipping details in payment or artwork emails", async () => {
    jobs[0].event_type = "artwork.publish";
    await processCommerceOrderNotifications();
    expect(vi.mocked(sendStoreEmail).mock.calls[0][1].html).not.toContain("Rastrear entrega");
    expect(vi.mocked(sendStoreEmail).mock.calls[0][1].text).not.toContain(liveState.tracking_code);
  });

  it.each([
    ["order.created", "próximas"], ["payment.refunded", "instituição"],
    ["fulfillment.production", "produção"], ["artwork.publish", "aprovação"],
    ["shipping.exception", "ocorrência"], ["shipping.tracking_available", "disponível"],
  ])("preserves Portuguese accents in %s", async (type, word) => {
    jobs[0].event_type = type;
    jobs[0].event_key = trackingKey(liveState.tracking_code);
    if (type === "payment.refunded") state!.payment_status = "refunded";
    if (type === "fulfillment.production") state!.fulfillment_status = "production";
    if (type === "shipping.exception") state!.shipment_status = "exception";
    await processCommerceOrderNotifications();
    const input = vi.mocked(sendStoreEmail).mock.calls[0][1];
    expect(input.text).toContain("Olá,"); expect(input.html).toContain("Olá,");
    expect(`${input.subject}\n${input.text}`).toContain(word); expect(input.html).toContain(word);
    expect(input.text).not.toMatch(/\b(proximas|instituicao|producao|aprovacao|ocorrencia|disponivel|Ola|Codigo)\b/);
  });

  it.each(["pickup", "delivery"])("uses the right completed milestone for %s", async delivery => {
    jobs[0].event_type = "fulfillment.completed";
    Object.assign(state!, { delivery, fulfillment_status: "completed", shipment_status: "delivered" });
    await processCommerceOrderNotifications();
    const input = vi.mocked(sendStoreEmail).mock.calls[0][1];
    expect(input.subject).toContain(delivery === "pickup" ? "Pedido concluído" : "Pedido entregue");
    expect(input.text).toContain(delivery === "pickup" ? "retirado na loja" : "entrega do seu pedido foi concluída");
    if (delivery === "pickup") expect(input.html).not.toContain("Rastrear entrega");
  });

  it("shows all current parcel codes once in shipment emails, escaping each parcel URL", async () => {
    Object.assign(state!, { tracking_code: "CODE1", tracking_url: "https://tracker.example.com/one", tracking_parcels: [
      { code: "CODE1", url: "https://tracker.example.com/one" },
      { code: "CODE2", url: "https://tracker.example.com/two?a=1&b=2" },
      { code: "CODE3", url: "http://unsafe.example.com" },
    ] });
    await processCommerceOrderNotifications();
    const input = vi.mocked(sendStoreEmail).mock.calls[0][1];
    expect(input.text.match(/Código de rastreio: CODE1/g)).toHaveLength(1);
    expect(input.text).toContain("Código de rastreio: CODE2");
    expect(input.text).toContain("Código de rastreio: CODE3");
    expect(input.html).toContain("two?a=1&amp;b=2"); expect(input.text).not.toContain("http://unsafe");
  });

  it("sends a code-scoped tracking notification only for its still-persisted parcel", async () => {
    jobs[0].event_type = "shipping.tracking_available"; jobs[0].event_key = trackingKey(" code2 ");
    Object.assign(state!, { tracking_code: "CODE1", tracking_url: "https://tracker.example.com/one", tracking_parcels: [
      { code: "CODE1", url: "https://tracker.example.com/one" }, { code: "CODE2", url: "https://tracker.example.com/two" },
    ] });
    await processCommerceOrderNotifications();
    const input = vi.mocked(sendStoreEmail).mock.calls[0][1];
    expect(input.text).toContain("Código de rastreio: CODE2");
    expect(input.text).not.toContain("CODE1"); expect(input.text).not.toContain("tracker.example.com/one");
    jobs = [{ ...job, event_type: "shipping.tracking_available", event_key: trackingKey("REMOVED") }];
    await processCommerceOrderNotifications();
    expect(sendStoreEmail).toHaveBeenCalledOnce();
    expect(settlements()[1][1].slice(3)).toEqual(["skipped", "superseded"]);
  });

  it("accepts the retry route's failed-to-pending reset and clears old failure metadata on claim", async () => {
    jobs[0].attempts = 5;
    vi.mocked(sendStoreEmail).mockResolvedValueOnce({ sent: false, provider: "smtp", message: "failure" });
    await processCommerceOrderNotifications();
    expect(settlements()[0][1][3]).toBe("failed");
    jobs = [{ ...job, attempts: 1, claim_token: "reset-claim" }];
    await processCommerceOrderNotifications();
    expect(settlements()[1][1]).toEqual([tenantId, job.id, "reset-claim", "sent", null]);
    const claims = query.mock.calls.filter(([sql]) => sql.startsWith("with candidate"));
    expect(claims[0][0]).toContain("last_error_code=null");
    const [first, second] = vi.mocked(sendStoreEmail).mock.calls;
    expect(first[1]).toHaveProperty("messageId", (second[1] as typeof second[1] & { messageId: string }).messageId);
  });

  it("requires a safe canonical URL and retries configuration failures", async () => {
    vi.stubEnv("APP_URL", "http://app.example.com");
    await processCommerceOrderNotifications();
    expect(sendStoreEmail).not.toHaveBeenCalled();
    expect(settlements()[0][1].slice(3)).toEqual(["pending", "store_url_unavailable"]);
  });

  it("renews and fences the claim before SMTP; a lost lease never sends", async () => {
    leaseOwned = false;
    await processCommerceOrderNotifications();
    expect(sendStoreEmail).not.toHaveBeenCalled(); expect(settlements()).toHaveLength(0);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("claim_expires_at>now() returning id"), [tenantId, job.id, job.claim_token]);
  });

  it.each([1, 5])("retries only below the attempt limit (attempt %s) with SQL backoff", async attempts => {
    jobs[0].attempts = attempts;
    vi.mocked(sendStoreEmail).mockResolvedValue({ sent: false, provider: "smtp", message: "private SMTP response current@example.com" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await processCommerceOrderNotifications();
    expect(settlements()[0][1].slice(3)).toEqual([attempts === 5 ? "failed" : "pending", "smtp_unavailable"]);
    expect(settlements()[0][0]).toContain("60*power(2,attempts-1)");
    expect(JSON.stringify([query.mock.calls, log.mock.calls])).not.toContain("private SMTP response");
  });

  it("handles thrown transport errors without logging PII or storing raw error messages", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendStoreEmail).mockRejectedValue(new Error("private SMTP response current@example.com"));
    await processCommerceOrderNotifications();
    expect(settlements()[0][1].slice(3)).toEqual(["pending", "smtp_unavailable"]);
    expect(JSON.stringify([query.mock.calls, log.mock.calls])).not.toContain("private SMTP response");
  });

  it("keeps Message-ID stable across retries and does not reschedule a failed DB acknowledgment as an SMTP failure", async () => {
    await processCommerceOrderNotifications();
    const first = vi.mocked(sendStoreEmail).mock.calls[0][1];
    jobs = [{ ...job, attempts: 2, claim_token: "new-token" }];
    const normal = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.startsWith("update commerce_order_notifications set status=$4")) throw new Error("DB unavailable after acceptance");
      return normal(sql, params);
    });
    await expect(processCommerceOrderNotifications()).rejects.toThrow("DB unavailable after acceptance");
    const second = vi.mocked(sendStoreEmail).mock.calls[1][1];
    expect(second).toHaveProperty("messageId", (first as typeof first & { messageId: string }).messageId);
    expect(settlements()).toHaveLength(2);
    expect(settlements()[1][1][3]).toBe("sent");
  });

  it("claims with SKIP LOCKED and recovers expired leases, including an exhausted final attempt", async () => {
    await processCommerceOrderNotifications(tenantId, 1, orderId);
    expect(query.mock.calls[0][0]).toContain("status='sending' and claim_expires_at<=now()");
    expect(query.mock.calls[0][1]).toEqual([tenantId, orderId, 5]);
    const claim = query.mock.calls.find(([sql]) => sql.startsWith("with candidate"))!;
    expect(claim[0]).toContain("limit 1 for update skip locked");
    expect(claim[0]).toContain("attempts=n.attempts+1");
    expect(claim[0]).toContain("claim_expires_at<=now()");
    expect(claim[1]).toEqual([tenantId, orderId, expect.any(String), 5]);
    expect(settlements()[0][0]).toContain("claim_token=$3 and status='sending'");
  });

  it("bounds work and does not claim a waiting batch during SMTP", async () => {
    jobs = Array.from({ length: 15 }, () => ({ ...job }));
    await processCommerceOrderNotifications(tenantId, 999);
    expect(sendStoreEmail).toHaveBeenCalledTimes(10);
    expect(jobs).toHaveLength(5);
  });

  it("stops claiming after the invocation time budget", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(46000);
    jobs = [{ ...job }, { ...job }];
    expect(await processCommerceOrderNotifications()).toBe(1);
    expect(jobs).toHaveLength(1);
  });

  it("does no database work when disabled or when an order lacks tenant scope", async () => {
    await expect(processCommerceOrderNotifications(undefined, 5, orderId)).rejects.toThrow("requires tenantId");
    expect(getPool).not.toHaveBeenCalled();
    vi.stubEnv("COMMERCE_ENABLED", "false");
    expect(await processCommerceOrderNotifications()).toBe(0);
    expect(getPool).not.toHaveBeenCalled();
  });
});

describe("post-response notification scheduling", () => {
  it("runs the tenant/order-scoped bounded worker in Next after", async () => {
    scheduleCommerceOrderNotifications(tenantId, orderId);
    expect(getPool).not.toHaveBeenCalled(); expect(after).toHaveBeenCalledOnce();
    const callback = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
    await callback();
    expect(query.mock.calls[0][1]).toEqual([tenantId, orderId, 5]);
  });

  it("leaves the outbox intact outside a Next request lifetime", () => {
    vi.mocked(after).mockImplementationOnce(() => { throw new Error("No request scope"); });
    expect(() => scheduleCommerceOrderNotifications(tenantId)).not.toThrow();
    expect(getPool).not.toHaveBeenCalled();
  });

  it("logs only identifiers when background work fails", async () => {
    query.mockRejectedValue(new Error("secret current@example.com"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    scheduleCommerceOrderNotifications(tenantId);
    await (vi.mocked(after).mock.calls[0][0] as () => Promise<void>)();
    expect(log).toHaveBeenCalledWith("Commerce order notifications deferred.", { tenantId, orderId: undefined });
    expect(JSON.stringify(log.mock.calls)).not.toContain("current@example.com");
  });

  it("does not register callbacks when commerce is disabled", () => {
    vi.stubEnv("COMMERCE_ENABLED", "false"); scheduleCommerceOrderNotifications(tenantId);
    expect(after).not.toHaveBeenCalled();
  });
});

describe("notification outbox migration contract", () => {
  const sql = readFileSync("supabase/migrations/0084_commerce_order_notifications.sql", "utf8");
  it("denies browser writes, scopes diagnostics and enforces tenant/order event uniqueness", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on commerce_order_notifications from public,anon,authenticated");
    expect(sql).toContain("tenant_id=current_tenant_id() and current_user_has_permission('settings:manage')");
    expect(sql).toContain("unique(tenant_id,order_id,event_key)");
    expect(sql).toContain("foreign key(tenant_id,order_id) references commerce_orders(tenant_id,id)");
  });
  it("enqueues only allowlisted buyer milestones and deduplicates fulfillment/shipping in both directions", () => {
    expect(sql).toContain("after insert or update on commerce_orders");
    expect(sql).toContain("after insert on commerce_order_events");
    expect(sql).toContain("new.payment_environment <> 'production'");
    expect(sql).toContain("new.cancelled_at is not null or new.deleted_at is not null");
    expect(sql).toContain("when 'shipping.posted' then 'fulfillment.shipped'");
    expect(sql).toContain("when 'shipping.delivered' then 'fulfillment.completed'");
    expect(sql).toContain("on conflict(tenant_id,order_id,event_key) do nothing");
    expect(sql).toContain("lower(new.metadata->>'lineId')");
    expect(sql).toContain("md5(tracking_code_value)");
    expect(sql).toContain("select distinct upper(btrim(code))");
    expect(sql).toContain("new.metadata->'trackingCodes'");
    expect(sql).toContain("commerce_order_shipment_parcels p");
    expect(sql).not.toContain("'olist.");
    expect(sql).not.toContain("security definer");
  });
});

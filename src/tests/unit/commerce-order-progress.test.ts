import { describe, expect, it } from "vitest";
import { orderProgress, type OrderOlistProgress } from "@/domain/commerce/order-progress";
import type { CommerceOlistJob } from "@/domain/commerce/olist";

const order = { payment_status: "paid", payment_environment: "production" as const, fulfillment_status: "production", provider: "manual", required_artworks: 1, prepared_artworks: 1, approved_artworks: 1 };
const job = { status: "waiting", customer_id: "11", sales_order_id: "22", production_completed_at: null, invoice_id: null, invoice_status: null } as CommerceOlistJob;
const olist: OrderOlistProgress = { configured: true, enabled: true, autoInvoice: true, autoDispatch: true, job };
const input = { order, olist, shipping: null, pickup: false, melhorEnvio: true };
describe("guided order progress", () => {
  it("offers production only after payment and artwork approval", () => {
    expect(orderProgress({ ...input, order: { ...order, fulfillment_status: "received" } })).toMatchObject({ owner: "production", title: "Tudo pronto para produzir" });
    expect(orderProgress({ ...input, order: { ...order, approved_artworks: 0 } })).toMatchObject({ owner: "artworks", stage: "artworks" });
    expect(orderProgress({ ...input, order: { ...order, payment_status: "pending", provider: "mercado_pago" } }).owner).toBeNull();
    expect(orderProgress({ ...input, order: { ...order, payment_status: "pending" } }).owner).toBe("production");
  });
  it("requires explicit production completion and waits for asynchronous fiscal authorization", () => {
    expect(orderProgress(input)).toMatchObject({ owner: "olist", olistAction: "production_ready" });
    const pending = { ...olist, job: { ...job, production_completed_at: "now", status: "pending" as const } };
    expect(orderProgress({ ...input, olist: pending })).toMatchObject({ owner: null, stage: "fiscal", title: "Preparando a nota fiscal" });
    expect(orderProgress({ ...input, olist: { ...pending, job: { ...pending.job, invoice_id: "33" } } })).toMatchObject({ title: "Aguardando autorização da NF-e", owner: null });
  });
  it("requires expedition where enabled, but not for pickup", () => {
    const ready = { ...olist, job: { ...job, production_completed_at: "now", invoice_id: "33", invoice_status: 6, status: "pending" as const } };
    expect(orderProgress({ ...input, olist: ready }).title).toBe("Preparando a expedição no Olist");
    expect(orderProgress({ ...input, olist: ready, pickup: true })).toMatchObject({ title: "Pedido pronto para retirada", owner: "production" });
    expect(orderProgress({ ...input, olist: ready, pickup: true }).steps.some(step => step.label === "Envio")).toBe(false);
  });
  it("does not confuse label purchase/generation with postage", () => {
    const ready = { ...olist, job: { ...job, production_completed_at: "now", invoice_status: 6, expedition_id: "44" } };
    const base = { ...input, olist: ready };
    expect(orderProgress({ ...base, shipping: { shipping: { status: "cart", label_url: null, last_error: null } } })).toMatchObject({ owner: "shipping", title: "Confira e compre a etiqueta" });
    expect(orderProgress({ ...base, shipping: { shipping: { status: "purchased", label_url: null, last_error: null } } })).toMatchObject({ owner: "shipping", title: "Etiqueta comprada" });
    const label = orderProgress({ ...base, shipping: { shipping: { status: "label_ready", label_url: "https://label.test", last_error: null } } });
    expect(label.owner).toBe("production");
    expect(label.description).toContain("não confirma a postagem");
    expect(label.steps.find(step => step.key === "shipping")?.done).toBe(false);
  });
  it("offers recovery for actionable ERP failures without discarding progress", () => {
    expect(orderProgress({ ...input, olist: { ...olist, job: { ...job, status: "blocked", error_code: "olist_oauth_invalid" } } })).toMatchObject({ owner: "olist", olistAction: "reconnect" });
    expect(orderProgress({ ...input, olist: { ...olist, job: { ...job, status: "review" } } })).toMatchObject({ owner: "olist", olistAction: "retry" });
  });
  it("keeps ERP optional, with no fiscal step or forced OAuth for unconfigured tenants", () => {
    const manual = { ...input, olist: { ...olist, configured: false }, melhorEnvio: false };
    expect(orderProgress(manual)).toMatchObject({ owner: "production", title: "Pedido pronto para envio" });
    expect(orderProgress(manual).steps.some(step => step.key === "fiscal")).toBe(false);
    expect(orderProgress({ ...input, olist: { ...olist, autoInvoice: false }, shipping: { shipping: null, fiscal: { productionReady: true } } }).stage).toBe("shipping");
  });
  it.each([{ cancelled_at: "now" }, { payment_status: "refunded" }, { payment_environment: "test" as const }])("never offers operational actions for stopped or test orders", change => {
    expect(orderProgress({ ...input, order: { ...order, ...change } }).owner).toBeNull();
  });
});

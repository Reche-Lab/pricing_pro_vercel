import { describe, expect, it } from "vitest";
import { commerceOlistSettingsSchema, nextCommerceOlistStage, buildCommerceOlistOrder, buildCommerceOlistCustomer, commerceOlistShippingBlock, type CommerceOlistJob } from "@/domain/commerce/olist";
import type { CommerceOrder } from "@/repositories/commerce";
import { testCommerceBilling } from "../fixtures/commerce-checkout";

const job = { customer_id: null, sales_order_id: null, invoice_id: null, invoice_status: null, email_requested_at: null, expedition_id: null, production_completed_at: null } as unknown as CommerceOlistJob;
const order = { id: "a1111111-1111-4111-8111-111111111111", tenant_id: "t", payment_status: "paid", payment_environment: "production", total_cents: 2890, shipping_cents: 500, subtotal_cents: 2390, provider: "manual", created_at: "2026-11-10T12:00:00Z", snapshot: { billing: testCommerceBilling, customer: { name: "Login diferente", email: "login@example.test" }, delivery: "pickup", address: null, items: [{ id: "i", productId: "p", quantity: 3, unitCents: 800, totalCents: 2390, artworkDiscountCents: 10, name: "Botton", artworkName: "Minha arte" }], products: [{ id: "p", variantId: "v" }] } } as unknown as CommerceOrder;
describe("commerce Olist automation policy", () => {
  it("starts disabled and does not emit before paid production and production completion", () => {
    const settings = commerceOlistSettingsSchema.parse({});
    expect(settings.enabled).toBe(false);
    expect(nextCommerceOlistStage(order, job, settings)).toBeNull();
    const active = { ...settings, enabled: true };
    expect(nextCommerceOlistStage({ ...order, payment_status: "pending" }, job, active)).toBeNull();
    expect(nextCommerceOlistStage({ ...order, payment_environment: "test" }, job, active)).toBeNull();
    expect(nextCommerceOlistStage({ ...order, deleted_at: new Date() }, job, active)).toBeNull();
    expect(nextCommerceOlistStage(order, job, active)).toBe("customer");
    expect(nextCommerceOlistStage(order, { ...job, customer_id: "1" }, active)).toBe("sales_order");
    expect(nextCommerceOlistStage(order, { ...job, customer_id: "1", sales_order_id: "2" }, active)).toBeNull();
    expect(nextCommerceOlistStage(order, { ...job, customer_id: "1", sales_order_id: "2", production_completed_at: "now" }, active)).toBe("invoice_create");
  });
  it("requires confirmed fiscal authorization before dispatch and skips pickup", () => {
    const settings = { ...commerceOlistSettingsSchema.parse({}), enabled: true };
    const issued = { ...job, customer_id: "1", sales_order_id: "2", invoice_id: "3", production_completed_at: "now", authorization_requested_at: "now", email_requested_at: "now", shipping_synced_at: "now" };
    expect(nextCommerceOlistStage(order, issued, settings)).toBe("invoice_status");
    expect(nextCommerceOlistStage(order, { ...issued, invoice_status: 6 }, settings)).toBeNull();
    expect(nextCommerceOlistStage({ ...order, snapshot: { ...order.snapshot, delivery: "delivery" } }, { ...issued, invoice_status: 6 }, settings)).toBe("dispatch");
    expect(nextCommerceOlistStage(order, { ...issued, invoice_status: 5 }, settings)).toBe("invoice_status");
  });
  it("uses frozen totals, actual billing identity and explicit Olist IDs, never numeric SKU fallback", () => {
    const settings = commerceOlistSettingsSchema.parse({ manualReceivingId: "123" });
    const payload = buildCommerceOlistOrder(order, "22", [{ variant_id: "v", external_id: "777", sku: "999" }], settings, {});
    expect(payload.idContato).toBe(22);
    expect(payload.valorFrete).toBe(5);
    expect(payload.valorDesconto).toBe(0.1);
    expect(payload.itens[0]).toMatchObject({ produto: { id: 777 }, quantidade: 3, valorUnitario: 8, infoAdicional: expect.stringContaining("Minha arte") });
    expect(payload.pagamento.parcelas[0].valor).toBe(28.9);
    expect(payload.ecommerce.numeroPedidoEcommerce).toBe(order.id);
    expect(payload.enderecoEntrega).toBeUndefined();
    expect(() => buildCommerceOlistOrder(order, "22", [{ variant_id: "v", external_id: null, sku: "999" }], settings, {})).toThrow(/ID Olist/);
  });
  it("requires explicit payment mapping rather than silently selecting another receiving method", () => {
    expect(() => buildCommerceOlistOrder(order, "22", [{ variant_id: "v", external_id: "777", sku: null }], commerceOlistSettingsSchema.parse({}), {})).toThrow(/recebimento/);
  });
  it("identifies billing customers independently from the buyer login and respects the ERP code limit", () => {
    const first = buildCommerceOlistCustomer(order);
    const anotherBuyer = buildCommerceOlistCustomer({ ...order, customer_id: "another-buyer" });
    expect(first.codigo).toBe(anotherBuyer.codigo);
    expect(first.nome).toBe(testCommerceBilling.name);
    expect(first.codigo.length).toBeLessThanOrEqual(15);
    expect(buildCommerceOlistCustomer({ ...order, snapshot: { ...order.snapshot, billing: { ...order.snapshot.billing!, document: "11222333000181" } } }).codigo.length).toBe(15);
  });
  it("guides shipping through production completion, authorization and dispatch without changing stores without Olist", () => {
    const settings = commerceOlistSettingsSchema.parse({ enabled: true });
    expect(commerceOlistShippingBlock(settings, null, false)).toMatch(/Conclua a produção/);
    expect(commerceOlistShippingBlock(settings, { ...job, production_completed_at: "now", invoice_status: 6 }, false)).toMatch(/expedição/);
    expect(commerceOlistShippingBlock(settings, { ...job, production_completed_at: "now", invoice_status: 6 }, true)).toBeNull();
    expect(commerceOlistShippingBlock({ ...settings, enabled: false }, null, false)).toBeNull();
  });
});

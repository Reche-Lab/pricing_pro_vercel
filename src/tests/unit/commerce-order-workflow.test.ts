import { describe, expect, it } from "vitest";
import { orderProductionState, orderEventLabel } from "@/domain/commerce/order-workflow";

describe("commerce production workflow", () => {
  const base = { payment_status: "paid", fulfillment_status: "received", required_artworks: 2, prepared_artworks: 2, approved_artworks: 2 };
  it("requires payment and approval of every artwork, not just one", () => {
    expect(orderProductionState(base).printable).toBe(true);
    expect(orderProductionState({ ...base, payment_status: "pending" }).printable).toBe(false);
    expect(orderProductionState({ ...base, prepared_artworks: 1, approved_artworks: 1 }).key).toBe("preparation");
    expect(orderProductionState({ ...base, approved_artworks: 1 }).key).toBe("approval");
    expect(orderProductionState({ ...base, payment_status: "refunded" }).key).toBe("refunded");
  });
  it("handles non-personalized orders and completed production without suggesting edits", () => {
    expect(orderProductionState({ ...base, required_artworks: 0 }).key).toBe("ready");
    expect(orderProductionState({ ...base, required_artworks: 0 }).printable).toBe(false);
    expect(orderProductionState({ ...base, fulfillment_status: "production" }).editable).toBe(false);
    expect(orderProductionState({ ...base, fulfillment_status: "completed" }).key).toBe("completed");
  });
  it("humanizes events without displaying raw integration names", () => {
    expect(orderEventLabel("artwork.source")).toBe("Arte ajustada pela equipe");
    expect(orderEventLabel("artwork.approve")).toBe("Arte aprovada pelo cliente");
    expect(orderEventLabel("order.created")).toBe("Compra recebida");
    expect(orderEventLabel("unknown.event")).toBe("Pedido atualizado");
  });
});

import { describe, expect, it } from "vitest";
import {
  assertOrderDeletionConfirmation,
  orderDeletionConfirmation,
  orderDeletionSchema,
} from "@/domain/commerce/order-deletion";
const id = "11111111-2222-4333-8444-555555555555";
describe("safe store order deletion", () => {
  it("requires an intentional confirmation bound to the actual order", () => {
    expect(orderDeletionConfirmation(id)).toBe("EXCLUIR 11111111");
    expect(() =>
      assertOrderDeletionConfirmation(id, " excluir 11111111 "),
    ).not.toThrow();
    for (const confirmation of ["", "excluir", "EXCLUIR 22222222"])
      expect(() => assertOrderDeletionConfirmation(id, confirmation)).toThrow();
  });
  it("requires a meaningful reason and rejects client-supplied tenant or actor", () => {
    const input = {
      confirmation: "EXCLUIR 11111111",
      reason: "Pedido duplicado",
    };
    expect(orderDeletionSchema.safeParse(input).success).toBe(true);
    expect(
      orderDeletionSchema.safeParse({ ...input, reason: "   " }).success,
    ).toBe(false);
    expect(
      orderDeletionSchema.safeParse({ ...input, reason: "a".repeat(501) })
        .success,
    ).toBe(false);
    expect(
      orderDeletionSchema.safeParse({ ...input, tenantId: id }).success,
    ).toBe(false);
    expect(
      orderDeletionSchema.safeParse({ ...input, actorId: id }).success,
    ).toBe(false);
  });
});

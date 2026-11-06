import { describe, expect, it } from "vitest";
import { checkoutSchema } from "@/domain/commerce/schemas";
import { resolveCheckoutDelivery } from "@/domain/commerce/checkout";
import { testCommerceBilling } from "../fixtures/commerce-checkout";
const input = { revision: 1, expectedTotalCents: 1000, billing: testCommerceBilling, delivery: "delivery" as const, deliveryAddressSameAsBilling: true, address: null, provider: "manual" as const, acceptedTerms: true as const };
describe("checkout billing and delivery", () => {
  it("requires complete and valid billing even for pickup", () => {
    expect(checkoutSchema.safeParse({ ...input, delivery: "pickup", billing: undefined }).success).toBe(false);
    for (const patch of [{ document: "" }, { document: "...." }, { document: "11111111111" }, { email: "invalid" }, { postalCode: "123" }]) {
      expect(checkoutSchema.safeParse({ ...input, delivery: "pickup", billing: { ...testCommerceBilling, ...patch } }).success).toBe(false);
    }
  });
  it("normalizes fiscal identification and derives the delivery address on the server", () => {
    const validated = checkoutSchema.parse({ ...input, billing: { ...testCommerceBilling, document: "529.982.247-25" } });
    expect(validated.billing.document).toBe("52998224725");
    expect(resolveCheckoutDelivery(validated)).toEqual({ ...testCommerceBilling, email: undefined, attention: "" });
    expect(resolveCheckoutDelivery(validated)).not.toHaveProperty("email");
  });
  it("ignores a conflicting copied address and keeps a distinct recipient when requested", () => {
    const address = { ...testCommerceBilling, name: "Outra pessoa", street: "Rua da entrega", attention: "Recepção" };
    const { email: _email, ...destination } = address;
    expect(_email).toBe("fiscal@example.test");
    expect(resolveCheckoutDelivery(checkoutSchema.parse({ ...input, address: destination }))?.street).toBe(testCommerceBilling.street);
    const validated = checkoutSchema.parse({ ...input, address: destination, deliveryAddressSameAsBilling: false });
    expect(resolveCheckoutDelivery(validated)).toEqual(destination);
    expect(validated.billing.name).toBe("Cliente de teste");
    expect(checkoutSchema.safeParse({ ...input, deliveryAddressSameAsBilling: false }).success).toBe(false);
  });
  it("does not persist unused delivery details for pickup", () => {
    const validated = checkoutSchema.parse({ ...input, delivery: "pickup" });
    expect(resolveCheckoutDelivery(validated)).toBeNull();
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { paymentEnvironment } from "@/domain/commerce/payment-settings";
import { validateProviderOrder } from "@/domain/commerce/transparent-payment";
import { orderProductionState } from "@/domain/commerce/order-workflow";
describe("payment environment boundaries", () => {
  it("keeps legacy records in production without inferring an environment from token prefixes", () => {
    expect(paymentEnvironment(undefined)).toBe("production");
    expect(paymentEnvironment("APP_USR-token")).toBe("production");
    expect(paymentEnvironment("test")).toBe("test");
  });
  it("never releases simulated paid orders to the real production queue", () => {
    const state = orderProductionState({ payment_environment: "test", payment_status: "paid", fulfillment_status: "received", required_artworks: 1, prepared_artworks: 1, approved_artworks: 1 });
    expect(state.key).toBe("test"); expect(state.printable).toBe(false);
  });
  it("rejects provider responses from the opposite environment", () => {
    const id = "674663df-1a12-4217-a05a-2475fd98ff7e";
    const response = { id: "ORD01J49MMW3SSBK5PSV3DFR32959", user_id: "123", country_code: "BRA", external_reference: id, total_amount: "50.00", total_paid_amount: "50.00", live_mode: true, status: "processed", status_detail: "accredited", transactions: { payments: [{ amount: "50.00", status: "processed", status_detail: "accredited", payment_method: { id: "pix", type: "bank_transfer" } }] } };
    const expected = { id, sellerId: "123", totalCents: 5000, method: "pix" as const, environment: "test" as const };
    expect(() => validateProviderOrder(response, expected)).toThrow("ambiente");
    expect(validateProviderOrder({ ...response, live_mode: false }, expected).status).toBe("paid");
  });
});

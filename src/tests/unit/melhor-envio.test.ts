import { describe, expect, it } from "vitest";
import { buildMelhorEnvioAuthUrl, buildMelhorEnvioQuotePayload } from "@/services/melhor-envio/melhor-envio";

describe("melhor envio adapter", () => {
  it("builds OAuth authorization URL", () => {
    const url = buildMelhorEnvioAuthUrl(
      {
        app_base_url: "https://sandbox.melhorenvio.com.br",
        redirect_uri: "https://app.local/api/callback"
      },
      {
        clientId: "client-id"
      },
      "state-123"
    );

    expect(url).toContain("https://sandbox.melhorenvio.com.br/oauth/authorize");
    expect(url).toContain("client_id=client-id");
    expect(url).toContain("state=state-123");
  });

  it("builds quote payload from selected packaging", () => {
    const payload = buildMelhorEnvioQuotePayload(
      {
        originPostalCode: "11696-208",
        destinationPostalCode: "01001-000",
        declaredValue: 120,
        serviceIds: ["1", "2"],
        packaging: {
          capacity: 100,
          boxesNeeded: 2,
          netWeightKg: 1,
          grossWeightKg: 1.4,
          grossWeightPerBoxKg: 0.7,
          box: {
            id: "box-1",
            name: "4x11x17",
            heightCm: 4,
            widthCm: 11,
            lengthCm: 17,
            weightKg: 0.1,
            capacities: {}
          }
        }
      },
      {}
    );

    expect(payload.from.postal_code).toBe("11696208");
    expect(payload.to.postal_code).toBe("01001000");
    expect(payload.services).toBe("1,2");
    expect(payload.products[0]).toMatchObject({
      width: 11,
      height: 4,
      length: 17,
      weight: 0.7,
      insurance_value: 120,
      quantity: 2
    });
  });
});

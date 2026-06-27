import { describe, expect, it } from "vitest";
import { buildCorreiosPayload, normalizeCorreiosResponse } from "@/services/correios/correios";

describe("correios adapter", () => {
  it("builds a Correios payload from selected packaging", () => {
    const payload = buildCorreiosPayload(
      {
        service: "sedex",
        originPostalCode: "11696-208",
        destinationPostalCode: "01001-000",
        declaredValue: 100,
        packaging: {
          capacity: 100,
          boxesNeeded: 2,
          netWeightKg: 1,
          grossWeightKg: 1.2,
          grossWeightPerBoxKg: 0.6,
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
      {
        contrato_correios: "123",
        servicos: { sedex: "04162", pac: "04669" }
      }
    );

    expect(payload.parametrosProduto).toHaveLength(2);
    expect(payload.parametrosProduto[0]).toMatchObject({
      coProduto: "04162",
      nuContrato: "123",
      cepOrigem: "11696208",
      cepDestino: "01001000",
      psObjeto: "600",
      comprimento: "17",
      largura: "11",
      altura: "4",
      vlDeclarado: "100"
    });
  });

  it("normalizes Correios money strings", () => {
    expect(
      normalizeCorreiosResponse([
        { pcFinal: "12,34" },
        { pcFinal: "1.234,56" }
      ]).totalFrete
    ).toBeCloseTo(1246.9);
  });
});

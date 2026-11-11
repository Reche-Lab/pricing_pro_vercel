import { describe, expect, it } from "vitest";
import { sortShippingOptions } from "@/domain/commerce/shipping-options";

describe("shipping service priority", () => {
  it("sorts known deadlines first, breaking ties by price without mutating the input", () => {
    const options = [
      { id: "unknown", name: "Sem prazo", priceCents: 1 },
      { id: "pac", name: "PAC", priceCents: 1000, transitDays: 6 },
      { id: "sedex", name: "SEDEX", priceCents: 2500, transitDays: 2 },
      { id: "express", name: "Expresso", priceCents: 2000, transitDays: 2 },
      { id: "pickup", name: "Retirada", priceCents: 0, transitDays: 0 },
    ];
    expect(sortShippingOptions(options).map(option => option.id)).toEqual(["express", "sedex", "pac", "unknown"]);
    expect(options[0].id).toBe("unknown");
  });
  it("accepts same-day delivery and falls back to price when no valid deadline is available", () => {
    expect(sortShippingOptions([
      { id: "invalid", name: "Inválido", priceCents: 200, transitDays: -1 },
      { id: "unknown", name: "Sem prazo", priceCents: 100, transitDays: null },
      { id: "today", name: "Hoje", priceCents: 1000, transitDays: 0 },
    ]).map(option => option.id)).toEqual(["today", "unknown", "invalid"]);
  });
});

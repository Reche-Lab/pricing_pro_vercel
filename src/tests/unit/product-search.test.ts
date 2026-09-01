import { describe, expect, it } from "vitest";
import {
  normalizeProductAliases,
  normalizeProductSearchTerm,
  productSearchRequiresClarification,
  rankProductCandidates
} from "@/domain/products/product-search";

describe("product search normalization", () => {
  it.each([
    ["Botton 3,5 cm", "botton 35mm"],
    ["boton 3.5cm", "boton 35mm"],
    ["Broche 35 mm", "broche 35mm"],
    ["boton 3.5", "boton 35mm"],
    ["Ímã de geladeira", "ima de geladeira"]
  ])("normalizes %s", (input, expected) => {
    expect(normalizeProductSearchTerm(input)).toBe(expected);
  });

  it("deduplicates aliases by their normalized representation", () => {
    expect(normalizeProductAliases([
      { alias: "Boton 3,5 cm", source: "manual" },
      { alias: "boton 35mm", source: "ai" },
      { alias: "Broche 35 mm", source: "ai" }
    ])).toEqual([
      { alias: "Boton 3,5 cm", normalizedAlias: "boton 35mm", source: "manual" },
      { alias: "Broche 35 mm", normalizedAlias: "broche 35mm", source: "ai" }
    ]);
  });
});

describe("product search ranking", () => {
  const products = [
    {
      product_id: "product-1",
      product_name: "Botton",
      product_slug: "botton",
      product_category: "Botons personalizados",
      product_description: null,
      variant_id: "variant-35",
      variant_name: "3,5 cm",
      variant_description: null,
      sku: "BOT-35",
      unit_weight_kg: "0.01",
      height_cm: "0.5",
      width_cm: "3.5",
      length_cm: "3.5",
      print_width_mm: "35",
      print_height_mm: "35",
      aliases: [{ alias: "Broche 35 mm", normalizedAlias: "broche 35mm", source: "manual" as const }]
    },
    {
      product_id: "product-2",
      product_name: "Botton",
      product_slug: "botton",
      product_category: "Botons personalizados",
      product_description: null,
      variant_id: "variant-45",
      variant_name: "4,5 cm",
      variant_description: null,
      sku: "BOT-45",
      unit_weight_kg: "0.02",
      height_cm: "0.5",
      width_cm: "4.5",
      length_cm: "4.5",
      print_width_mm: "45",
      print_height_mm: "45",
      aliases: []
    }
  ];

  it("finds a product by a normalized alias", () => {
    const [match] = rankProductCandidates(products, "broche 3,5 cm");
    expect(match.variant_id).toBe("variant-35");
    expect(match.matchedBy).toBe("alias");
    expect(match.matchedAlias).toBe("Broche 35 mm");
    expect(match.confidence).toBe(1);
  });

  it("uses dimensions and tolerates a common spelling variation", () => {
    const [match] = rankProductCandidates(products, "boton 35mm");
    expect(match.variant_id).toBe("variant-35");
    expect(match.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("prioritizes an exact SKU", () => {
    const [match] = rankProductCandidates(products, "bot-45");
    expect(match.variant_id).toBe("variant-45");
    expect(match.matchedBy).toBe("sku");
    expect(match.confidence).toBe(1);
  });

  it("does not request clarification for an exact alias", () => {
    const matches = rankProductCandidates(products, "broche 35mm");
    expect(productSearchRequiresClarification(matches)).toBe(false);
  });

  it("requests clarification when similarly ranked variants lack a size", () => {
    const matches = rankProductCandidates(products, "boton");
    expect(productSearchRequiresClarification(matches)).toBe(true);
  });
});

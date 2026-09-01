import { describe, expect, it } from "vitest";
import {
  buildProductAliasPrompt,
  parseProductAliasSuggestions
} from "@/services/openrouter/product-alias-agent";

describe("OpenRouter product alias suggestions", () => {
  it("limits the model to aliases for the configured product", () => {
    const prompt = buildProductAliasPrompt({
      productName: "Botton",
      variantName: "3,5 cm",
      category: "Personalizados",
      sku: "BOT-35"
    });
    expect(prompt).toContain("Não inclua o SKU");
    expect(prompt).toContain("Produto: Botton");
    expect(prompt).toContain("Variante: 3,5 cm");
    expect(prompt).toContain("variações de medida em cm e mm");
  });

  it("parses, normalizes and removes existing suggestions", () => {
    const suggestions = parseProductAliasSuggestions(
      '{"aliases":["Boton 3,5 cm","boton 35 mm","Broche 35mm"]}',
      ["Boton 35mm"]
    );
    expect(suggestions).toEqual(["Broche 35mm"]);
  });
});

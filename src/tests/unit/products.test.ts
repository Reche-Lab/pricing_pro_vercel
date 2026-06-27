import { describe, expect, it } from "vitest";
import { createProductSlug } from "@/domain/products/products";

describe("products domain", () => {
  it("creates stable product slugs", () => {
    expect(createProductSlug("Ímã de Geladeira Premium")).toBe("ima-de-geladeira-premium");
    expect(createProductSlug("  Abridor / Garrafa  ")).toBe("abridor-garrafa");
  });
});

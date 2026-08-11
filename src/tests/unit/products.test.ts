import { describe, expect, it } from "vitest";
import { createProductSlug, isProductDeletionConfirmation } from "@/domain/products/products";

describe("products domain", () => {
  it("creates stable product slugs", () => {
    expect(createProductSlug("Ímã de Geladeira Premium")).toBe("ima-de-geladeira-premium");
    expect(createProductSlug("  Abridor / Garrafa  ")).toBe("abridor-garrafa");
  });

  it("requires the explicit deletion confirmation word", () => {
    expect(isProductDeletionConfirmation("excluir")).toBe(true);
    expect(isProductDeletionConfirmation(" EXCLUIR ")).toBe(true);
    expect(isProductDeletionConfirmation("confirmar")).toBe(false);
    expect(isProductDeletionConfirmation(null)).toBe(false);
  });
});

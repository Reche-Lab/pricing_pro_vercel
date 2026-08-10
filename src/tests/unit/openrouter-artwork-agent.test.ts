import { describe, expect, it } from "vitest";
import { buildArtworkGenerationPrompt, buildArtworkSuggestionPrompt } from "@/services/openrouter/artwork-agent";

describe("OpenRouter artwork prompts", () => {
  it("instructs the model to preserve an existing reference during edits", () => {
    const prompt = buildArtworkGenerationPrompt({
      prompt: "Troque apenas o fundo por azul.",
      diameterMm: 45,
      referenceDataUrl: "data:image/png;base64,reference"
    });

    expect(prompt).toContain("Use a imagem de referência como base");
    expect(prompt).toContain("Preserve composição, identidade, textos e elementos");
    expect(prompt).toContain("Troque apenas o fundo por azul");
  });

  it("distinguishes a new creation from an image refinement", () => {
    const prompt = buildArtworkSuggestionPrompt({
      brief: "Tema espacial para uma festa infantil.",
      product: "Botton 4,5 cm",
      diameterMm: 45
    });

    expect(prompt).toContain("não há imagem de referência");
    expect(prompt).toContain("Botton 4,5 cm");
  });

  it("describes non-circular formats and their physical proportions", () => {
    const prompt = buildArtworkGenerationPrompt({
      prompt: "Crie uma placa de identificação.",
      geometry: { shape: "rectangle", widthMm: 80, heightMm: 50, cornerStyle: "rounded", cornerRadiusMm: 5, rotationDegrees: 0, allowPrintRotation: true }
    });
    expect(prompt).toContain("Formato geométrico: retangular");
    expect(prompt).toContain("Tamanho final de corte: 80 mm de largura por 50 mm de altura");
    expect(prompt).toContain("Cantos arredondados com raio de 5 mm");
    expect(prompt).toContain("respeitando exatamente a proporção");
  });
});

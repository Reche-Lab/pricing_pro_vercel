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
});

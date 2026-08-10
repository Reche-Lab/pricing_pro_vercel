import { describe, expect, it } from "vitest";
import { ARTWORK_AI_GENERATION_LIMIT, getArtworkAiAttemptsRemaining } from "@/domain/artwork/ai-generation-limit";

describe("artwork AI generation limit", () => {
  it("allows three generations per quote item", () => {
    expect(ARTWORK_AI_GENERATION_LIMIT).toBe(3);
    expect(getArtworkAiAttemptsRemaining(0)).toBe(3);
    expect(getArtworkAiAttemptsRemaining(1)).toBe(2);
    expect(getArtworkAiAttemptsRemaining(3)).toBe(0);
  });

  it("never returns negative remaining attempts", () => {
    expect(getArtworkAiAttemptsRemaining(9)).toBe(0);
  });
});

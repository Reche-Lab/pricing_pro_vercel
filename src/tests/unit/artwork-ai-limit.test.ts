import { describe, expect, it } from "vitest";
import {
  DEFAULT_ARTWORK_AI_GENERATION_LIMIT,
  MAX_ARTWORK_AI_GENERATION_LIMIT,
  getArtworkAiAttemptsRemaining,
  normalizeArtworkAiGenerationLimit
} from "@/domain/artwork/ai-generation-limit";

describe("artwork AI generation limit", () => {
  it("uses three generations as the tenant default", () => {
    expect(DEFAULT_ARTWORK_AI_GENERATION_LIMIT).toBe(3);
    expect(getArtworkAiAttemptsRemaining(0)).toBe(3);
    expect(getArtworkAiAttemptsRemaining(1)).toBe(2);
    expect(getArtworkAiAttemptsRemaining(3)).toBe(0);
  });

  it("calculates remaining attempts using each tenant limit", () => {
    expect(getArtworkAiAttemptsRemaining(2, 8)).toBe(6);
    expect(getArtworkAiAttemptsRemaining(0, 0)).toBe(0);
    expect(getArtworkAiAttemptsRemaining(9, 4)).toBe(0);
  });

  it("normalizes invalid tenant limits", () => {
    expect(normalizeArtworkAiGenerationLimit(undefined)).toBe(3);
    expect(normalizeArtworkAiGenerationLimit(-2)).toBe(0);
    expect(normalizeArtworkAiGenerationLimit(4.9)).toBe(4);
    expect(normalizeArtworkAiGenerationLimit(999)).toBe(MAX_ARTWORK_AI_GENERATION_LIMIT);
  });
});

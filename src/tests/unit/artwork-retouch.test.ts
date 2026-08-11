import { describe, expect, it } from "vitest";
import { createRetouchedArtworkFileName, sampledRgbToHex } from "@/domain/artwork/retouch";

describe("artwork retouch", () => {
  it("creates a safe and traceable file name without replacing the original extension", () => {
    expect(createRetouchedArtworkFileName("Arte São João.final.PNG", 123456))
      .toBe("Arte-Sao-Joao-final-retoque-123456.webp");
  });

  it("converts a sampled canvas color to a bounded hexadecimal color", () => {
    expect(sampledRgbToHex(12, 128, 255)).toBe("#0c80ff");
    expect(sampledRgbToHex(-10, 260, 15.7)).toBe("#00ff10");
  });
});

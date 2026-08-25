import { describe, expect, it } from "vitest";
import { isValidCompetence, shiftCompetence } from "@/domain/finance/competence";

describe("financial competence", () => {
  it("accepts only complete month values", () => {
    expect(isValidCompetence("2026-08")).toBe(true);
    expect(isValidCompetence("")).toBe(false);
    expect(isValidCompetence("2026-")).toBe(false);
    expect(isValidCompetence("2026-13")).toBe(false);
  });

  it("moves across year boundaries", () => {
    expect(shiftCompetence("2026-01", -1)).toBe("2025-12");
    expect(shiftCompetence("2026-12", 1)).toBe("2027-01");
  });
});

import { describe, expect, it } from "vitest";
import { formatRemainingTime } from "@/components/quotes/PublicQuoteExpiryCountdown";

describe("public quote expiry countdown", () => {
  it("formats days, hours, minutes and seconds", () => {
    expect(formatRemainingTime(((2 * 24 + 3) * 60 * 60 + 4 * 60 + 5) * 1000)).toBe("2d 03h 04min 05s");
  });

  it("does not return negative time", () => {
    expect(formatRemainingTime(-1000)).toBe("00h 00min 00s");
  });
});

import { describe, expect, it } from "vitest";
import { getPublicArtworkReviewProgress } from "@/domain/quotes/public-artwork-review";

describe("public artwork review", () => {
  it("requires approval only for personalized items when they are identified", () => {
    const progress = getPublicArtworkReviewProgress([
      { artworkName: "Arte A", artworks: [{ approvalStatus: "approved" }] },
      { artworkName: "Arte B", artworks: [{ approvalStatus: "pending" }] },
      { artworkName: null, artworks: [] }
    ]);
    expect(progress).toEqual({ required: 2, approved: 1 });
  });

  it("allows artwork review for every item when no customization was previously identified", () => {
    const progress = getPublicArtworkReviewProgress([{ artworks: [] }, { artworks: [] }]);
    expect(progress).toEqual({ required: 2, approved: 0 });
  });
});

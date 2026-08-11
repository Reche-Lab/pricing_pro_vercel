import { describe, expect, it } from "vitest";
import { sortActiveArtworkVersions } from "@/domain/artwork/versions";

describe("artwork versions", () => {
  it("keeps an active retouch in the position of its original artwork", () => {
    const result = sortActiveArtworkVersions([
      { id: "original-a", is_active: false },
      { id: "art-b", is_active: true },
      { id: "art-c", is_active: true },
      { id: "retouch-a", parent_artwork_id: "original-a", is_active: true }
    ]);
    expect(result.map((artwork) => artwork.id)).toEqual(["retouch-a", "art-b", "art-c"]);
  });

  it("keeps successive retouches anchored to the first original", () => {
    const result = sortActiveArtworkVersions([
      { id: "original", is_active: false },
      { id: "other", is_active: true },
      { id: "retouch-1", parent_artwork_id: "original", is_active: false },
      { id: "retouch-2", parent_artwork_id: "retouch-1", is_active: true }
    ]);
    expect(result.map((artwork) => artwork.id)).toEqual(["retouch-2", "other"]);
  });
});

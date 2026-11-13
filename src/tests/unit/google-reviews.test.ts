import { describe, expect, it } from "vitest";
import { googleReviewsSaveSchema, normalizeGoogleReviews, googleMapsPlaceUrl } from "@/domain/commerce/google-reviews";
const place = "ChIJtest123456789";
const review = { name: "places/test/reviews/one", rating: 4, originalText: { text: "Ótimo atendimento!", languageCode: "pt" }, text: { text: "Translated" }, authorAttribution: { displayName: "Cliente", uri: "https://www.google.com/maps/contrib/123", photoUri: "https://lh3.googleusercontent.com/avatar" }, googleMapsUri: "https://www.google.com/maps/reviews/123", publishTime: "2026-11-10T12:00:00Z" };
describe("Google reviews content and configuration", () => {
  it("accepts only bounded Place IDs and never arbitrary remote endpoints or tenant arguments", () => {
    const input = { placeId: `places/${place}`, title: "Avaliações no Google", dailyLimit: 50, apiKey: "test-key-123456789012345", revision: 0 };
    expect(googleReviewsSaveSchema.parse(input).placeId).toBe(place);
    expect(googleReviewsSaveSchema.safeParse({ ...input, placeId: "https://localhost/private" }).success).toBe(false);
    expect(googleReviewsSaveSchema.safeParse({ ...input, tenantId: "other" }).success).toBe(false);
    expect(googleReviewsSaveSchema.safeParse({ ...input, dailyLimit: 1001 }).success).toBe(false);
    expect(googleMapsPlaceUrl(place)).toContain(encodeURIComponent(place));
  });
  it("preserves Google's relevance order, original text and author/source attribution without filtering low ratings", () => {
    const result = normalizeGoogleReviews({ id: place, displayName: { text: "Loja" }, rating: 4.7, userRatingCount: 42, reviews: [{ ...review, rating: 1 }, review] }, place);
    expect(result.reviews.map(item => item.rating)).toEqual([1, 4]);
    expect(result.reviews[0]).toMatchObject({ text: "Ótimo atendimento!", author: "Cliente", sourceUrl: review.googleMapsUri });
    expect(JSON.stringify(result)).not.toContain("Translated");
  });
  it("limits to five reviews, rejects mismatched places and strips unsafe URLs/HTML execution paths", () => {
    const result = normalizeGoogleReviews({ id: place, rating: 5, userRatingCount: 9, reviews: Array(8).fill(review) }, place);
    expect(result.reviews).toHaveLength(5);
    const unsafe = normalizeGoogleReviews({ id: place, reviews: [{ ...review, authorAttribution: { ...review.authorAttribution, photoUri: "https://evil.example/avatar", uri: "javascript:alert(1)" } }, { ...review, googleMapsUri: "https://evil.example/review" }] }, place);
    expect(unsafe.reviews).toHaveLength(1);
    expect(unsafe.reviews[0].avatarUrl).toBe(""); expect(unsafe.reviews[0].authorUrl).toBe("");
    expect(() => normalizeGoogleReviews({ id: "other" }, place)).toThrow();
  });
});

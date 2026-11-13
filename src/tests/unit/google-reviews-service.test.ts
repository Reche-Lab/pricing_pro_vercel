// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGoogleReviews, GOOGLE_REVIEWS_FIELDS } from "@/services/commerce/google-reviews";
import { loadGoogleReviews, reserveGoogleReviewsRequest, type GoogleReviewsConnection } from "@/repositories/commerce-google-reviews";
import { encryptTenantSecret } from "@/lib/crypto/secrets";
vi.mock("@/repositories/commerce-google-reviews", () => ({ loadGoogleReviews: vi.fn(), reserveGoogleReviewsRequest: vi.fn() }));
const secret = "private-google-api-key-never-return";
let row: GoogleReviewsConnection;
beforeEach(() => {
  vi.clearAllMocks(); row = { tenant_id: "tenant-a", place_id: "ChIJtest123456789", title: "Avaliações", api_key_encrypted: encryptTenantSecret({ apiKey: secret }), daily_limit: 50, enabled: true, revision: 1, tested_revision: 1, tested_at: "2026-11-13T12:00:00Z", used_today: 0 };
  vi.mocked(loadGoogleReviews).mockResolvedValue(row); vi.mocked(reserveGoogleReviewsRequest).mockResolvedValue(undefined);
});
describe("server-only Google reviews transport", () => {
  it("uses a fixed Google endpoint, minimal fields, server credential and no cache", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ id: row.place_id, displayName: { text: "Loja" }, rating: 4.7, userRatingCount: 8 }));
    const data = await fetchGoogleReviews(row, { request });
    expect(request).toHaveBeenCalledWith(`https://places.googleapis.com/v1/places/${row.place_id}?languageCode=pt-BR`, expect.objectContaining({ headers: { "X-Goog-Api-Key": secret, "X-Goog-FieldMask": GOOGLE_REVIEWS_FIELDS }, redirect: "error", cache: "no-store" }));
    expect(data.rating).toBe(4.7); expect(JSON.stringify(data)).not.toContain(secret);
    expect(reserveGoogleReviewsRequest).toHaveBeenCalledWith(row, true);
  });
  it("does not call Google when disabled or over budget", async () => {
    const request = vi.fn(); await expect(fetchGoogleReviews({ ...row, enabled: false }, { request })).rejects.toMatchObject({ status: 404 });
    vi.mocked(reserveGoogleReviewsRequest).mockRejectedValue(new Error("Daily quota"));
    await expect(fetchGoogleReviews(row, { request })).rejects.toThrow("Daily quota"); expect(request).not.toHaveBeenCalled();
  });
  it.each([403, 404, 429, 500])("humanizes HTTP %s without leaking Google's raw response", async status => {
    const request = vi.fn().mockResolvedValue(Response.json({ error: { message: secret } }, { status }));
    const error = await fetchGoogleReviews(row, { request }).catch(error => error);
    expect(error.status).toBe(502); expect(error.message).not.toContain(secret); expect(error.message).not.toContain("status");
  });
  it("hides transport error details and rejects changes during an in-flight request", async () => {
    const request = vi.fn().mockRejectedValue(new Error(`API key ${secret}`));
    await expect(fetchGoogleReviews(row, { request })).rejects.toMatchObject({ code: "google_connection_failed" });
    request.mockResolvedValue(Response.json({ id: row.place_id })); vi.mocked(loadGoogleReviews).mockResolvedValue({ ...row, revision: 2 });
    await expect(fetchGoogleReviews(row, { request })).rejects.toMatchObject({ status: 409 });
  });
  it("allows an explicit admin test before activation and rejects another place's response", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ id: "otherPlace" }));
    await expect(fetchGoogleReviews({ ...row, enabled: false }, { request, testing: true })).rejects.toMatchObject({ code: "google_invalid_response" });
    expect(reserveGoogleReviewsRequest).toHaveBeenCalledWith(expect.anything(), false);
  });
});

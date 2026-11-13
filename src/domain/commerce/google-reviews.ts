import { z } from "zod";
export const GOOGLE_MAPS_TERMS = "https://maps.google.com/help/terms_maps/";
export const GOOGLE_PRIVACY = "https://policies.google.com/privacy";
export const googleReviewsSaveSchema = z.object({
  placeId: z.string().trim().transform(value => value.replace(/^places\//, "")).pipe(z.string().min(8).max(255).regex(/^[A-Za-z0-9_-]+$/, "Informe somente o Place ID da empresa, não uma URL.")),
  title: z.string().trim().min(2).max(100), dailyLimit: z.number().int().min(1).max(1000),
  apiKey: z.string().trim().max(256).regex(/^[A-Za-z0-9_-]*$/, "Confira a chave de API.").optional().default(""), revision: z.number().int().nonnegative(),
}).strict();
export type GoogleReviewsInput = z.infer<typeof googleReviewsSaveSchema>;
export type GoogleReview = { id: string; rating: number; text: string; author: string; authorUrl: string; avatarUrl: string; sourceUrl: string; publishTime: string; relativeTime: string };
export type GoogleReviewsData = { name: string; rating: number | null; total: number; sourceUrl: string; reviews: GoogleReview[]; attributions?: { name: string; url: string }[] };
export type GoogleReviewsSettings = { configured: boolean; hasKey: boolean; placeId: string; title: string; dailyLimit: number; usedToday: number; revision: number; enabled: boolean; tested: boolean; testedAt: string | null };
export function googleMapsPlaceUrl(placeId: string) { return `https://www.google.com/maps/search/?api=1&query=Google+Maps&query_place_id=${encodeURIComponent(placeId)}`; }
function googleUrl(value: unknown, avatar = false) {
  if (typeof value !== "string" || value.length > 4096) return "";
  try {
    const url = new URL(value), host = url.hostname;
    const allowed = avatar ? host.endsWith(".googleusercontent.com") || host.endsWith(".ggpht.com") || host === "maps.gstatic.com" : ["google.com", "google.com.br", "maps.app.goo.gl"].some(domain => host === domain || host.endsWith(`.${domain}`));
    return url.protocol === "https:" && !url.username && !url.password && allowed ? url.href : "";
  } catch { return ""; }
}
const localized = z.object({ text: z.string().max(20000) });
const reviewSchema = z.object({
  name: z.string().max(1000), rating: z.number().min(1).max(5), text: localized.optional(), originalText: localized.optional(),
  authorAttribution: z.object({ displayName: z.string().min(1).max(300), uri: z.string().optional(), photoUri: z.string().optional() }),
  googleMapsUri: z.string(), publishTime: z.string().datetime().optional(), relativePublishTimeDescription: z.string().max(200).optional(),
});
export function normalizeGoogleReviews(raw: unknown, expectedPlace: string): GoogleReviewsData {
  const place = z.object({ id: z.literal(expectedPlace), displayName: z.object({ text: z.string().max(500) }).optional(), rating: z.number().min(1).max(5).optional(), userRatingCount: z.number().int().nonnegative().optional(), googleMapsUri: z.string().optional(), reviews: z.array(z.unknown()).max(100).optional(), attributions: z.array(z.object({ provider: z.string().max(300), providerUri: z.string().url().max(4096) })).max(100).optional() }).parse(raw);
  const reviews = (place.reviews ?? []).slice(0, 5).flatMap(value => {
    const result = reviewSchema.safeParse(value);
    if (!result.success) return [];
    const review = result.data, sourceUrl = googleUrl(review.googleMapsUri);
    if (!sourceUrl) return [];
    return [{ id: review.name, rating: review.rating, text: review.originalText?.text ?? review.text?.text ?? "", author: review.authorAttribution.displayName, authorUrl: googleUrl(review.authorAttribution.uri), avatarUrl: googleUrl(review.authorAttribution.photoUri, true), sourceUrl, publishTime: review.publishTime ?? "", relativeTime: review.relativePublishTimeDescription ?? "" }];
  });
  const attributions = (place.attributions ?? []).flatMap(item => { const url = new URL(item.providerUri); return url.protocol === "https:" && !url.username && !url.password ? [{ name: item.provider, url: url.href }] : []; });
  return { name: place.displayName?.text ?? "", rating: place.rating ?? null, total: place.userRatingCount ?? 0, sourceUrl: googleUrl(place.googleMapsUri) || googleMapsPlaceUrl(expectedPlace), reviews, attributions };
}

export type PublicArtworkReviewItem = {
  artworkName?: string | null;
  artworks?: Array<{ approvalStatus?: string | null }>;
};

export function getPublicArtworkReviewProgress(items: PublicArtworkReviewItem[]) {
  const explicitlyRequired = items.filter((item) => item.artworkName || item.artworks?.length);
  const reviewedItems = explicitlyRequired.length ? explicitlyRequired : items;
  return {
    required: reviewedItems.length,
    approved: reviewedItems.filter((item) => item.artworks?.some((artwork) => artwork.approvalStatus === "approved")).length
  };
}

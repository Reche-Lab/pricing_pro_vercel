export const MAX_ARTWORK_PDF_BYTES = 4 * 1024 * 1024;
export const MAX_ARTWORK_PDF_PAGES = 100;
export const MAX_ARTWORKS_PER_ITEM = 100;

export function suggestedPdfArtworkName(pageNumber: number, text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const cleaned = compact.replace(/bot(?:t)?on redondo\s*\d+\s*mm/ig, "").trim();
  return (cleaned || `Arte da página ${pageNumber}`).slice(0, 100);
}

export function looksLikeArtworkTemplate(text: string) {
  return /bot(?:t)?on\s+redondo|gabarito|template|molde/i.test(text);
}

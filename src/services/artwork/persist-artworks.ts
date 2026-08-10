import { listInlineQuoteArtworks, moveArtworkToStorage } from "@/repositories/artwork-production";
import { artworkStorageConfigured, decodeDataUrl, uploadArtworkObject } from "@/services/storage/artwork-storage";

export async function persistQuoteArtworksToStorage(userId: string, tenantId: string, quoteId: string) {
  if (!artworkStorageConfigured()) return;
  const artworks = await listInlineQuoteArtworks(userId, tenantId, quoteId);
  for (const artwork of artworks) {
    try {
      const decoded = decodeDataUrl(artwork.data_url);
      const path = `${tenantId}/quotes/${quoteId}/items/${artwork.quote_item_id}/original/${artwork.id}-${safeFileName(artwork.file_name)}`;
      const stored = await uploadArtworkObject({ path, contentType: artwork.mime_type, bytes: decoded.bytes });
      if (stored) await moveArtworkToStorage(userId, tenantId, artwork.id, stored);
    } catch (error) {
      console.error("Quote artwork Storage migration failed; database fallback retained.", {
        quoteId, artworkId: artwork.id, message: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  }
}

function safeFileName(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

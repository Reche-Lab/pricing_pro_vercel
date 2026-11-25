export type QuotePdfArtworkVariant = "product" | "original" | "edited" | "cropped";

export type QuotePdfArtworkAssetSource = {
  id: string;
  parent_artwork_id?: string | null;
  data_url: string | null;
  storage_path: string | null;
  prepared_data_url?: string | null;
  prepared_storage_path?: string | null;
  prepared_file_name?: string | null;
  file_name: string;
  mime_type: string;
  approval_status?: string;
};

export type QuotePdfArtworkAsset = {
  dataUrl: string | null;
  storagePath: string | null;
  fileName: string;
  mimeType: string;
  requestedVariant: QuotePdfArtworkVariant;
  effectiveVariant: QuotePdfArtworkVariant;
};

export function resolveQuotePdfArtworkAsset(
  active: QuotePdfArtworkAssetSource,
  allArtworks: QuotePdfArtworkAssetSource[],
  variant: QuotePdfArtworkVariant = "original"
): QuotePdfArtworkAsset {
  if (variant === "product") {
    if (active.approval_status === "approved" && (active.prepared_data_url || active.prepared_storage_path)) {
      return { dataUrl: active.prepared_data_url ?? null, storagePath: active.prepared_storage_path ?? null,
        fileName: active.prepared_file_name || preparedFileName(active.file_name), mimeType: "image/png",
        requestedVariant: variant, effectiveVariant: "product" };
    }
    return fromOriginal(active, allArtworks, variant);
  }
  if (variant === "cropped" && (active.prepared_data_url || active.prepared_storage_path)) {
    return {
      dataUrl: active.prepared_data_url ?? null,
      storagePath: active.prepared_storage_path ?? null,
      fileName: active.prepared_file_name || preparedFileName(active.file_name),
      mimeType: "image/png",
      requestedVariant: variant,
      effectiveVariant: "cropped"
    };
  }

  if (variant === "edited" && active.parent_artwork_id) {
    return fromArtwork(active, variant, "edited");
  }

  if (variant === "original") {
    return fromOriginal(active, allArtworks, variant);
  }

  const fallback = active.parent_artwork_id ? "edited" : "original";
  return fromArtwork(active, variant, fallback);
}

export function quotePdfArtworkVariantLabel(variant: QuotePdfArtworkVariant) {
  if (variant === "product") return "Produto com arte aprovada";
  if (variant === "edited") return "Editada";
  if (variant === "cropped") return "Recortada";
  return "Original";
}

function findRootArtwork(active: QuotePdfArtworkAssetSource, allArtworks: QuotePdfArtworkAssetSource[]) {
  const byId = new Map(allArtworks.map((artwork) => [artwork.id, artwork]));
  const visited = new Set<string>();
  let current = active;
  while (current.parent_artwork_id && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = byId.get(current.parent_artwork_id);
    if (!parent) return null;
    current = parent;
  }
  return current.parent_artwork_id ? null : current;
}

function fromOriginal(active: QuotePdfArtworkAssetSource, all: QuotePdfArtworkAssetSource[], variant: QuotePdfArtworkVariant): QuotePdfArtworkAsset {
  const original = findRootArtwork(active, all);
  return original ? fromArtwork(original, variant, "original") : {
    dataUrl: null, storagePath: null, fileName: active.file_name, mimeType: active.mime_type,
    requestedVariant: variant, effectiveVariant: "original",
  };
}

function fromArtwork(
  artwork: QuotePdfArtworkAssetSource,
  requestedVariant: QuotePdfArtworkVariant,
  effectiveVariant: QuotePdfArtworkVariant
): QuotePdfArtworkAsset {
  return {
    dataUrl: artwork.data_url,
    storagePath: artwork.storage_path,
    fileName: artwork.file_name,
    mimeType: artwork.mime_type,
    requestedVariant,
    effectiveVariant
  };
}

function preparedFileName(fileName: string) {
  return `${fileName.replace(/\.[^.]+$/, "")}-recortada.png`;
}

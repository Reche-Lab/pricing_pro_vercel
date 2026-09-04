import { describe, expect, it } from "vitest";
import { resolveQuotePdfArtworkAsset } from "@/domain/quotes/pdf-artwork";

const original = artwork({ id: "original", data_url: "data:image/png;base64,original", file_name: "original.png" });
const edited = artwork({
  id: "edited", parent_artwork_id: "original", data_url: "data:image/png;base64,edited",
  storage_path: "edited.png", file_name: "editada.png", prepared_data_url: "data:image/png;base64,cropped",
  prepared_storage_path: "cropped.png", prepared_file_name: "recortada.png"
});

describe("quote PDF artwork selection", () => {
  it("uses the root artwork by default even when a retouched version is active", () => {
    expect(resolveQuotePdfArtworkAsset(edited, [original, edited])).toMatchObject({
      dataUrl: original.data_url, fileName: "original.png", effectiveVariant: "original"
    });
  });

  it("uses the active retouched artwork when edited is selected", () => {
    expect(resolveQuotePdfArtworkAsset(edited, [original, edited], "edited")).toMatchObject({
      dataUrl: edited.data_url, fileName: "editada.png", effectiveVariant: "edited"
    });
  });

  it("uses the prepared image when cropped is selected", () => {
    expect(resolveQuotePdfArtworkAsset(edited, [original, edited], "cropped")).toMatchObject({
      dataUrl: edited.prepared_data_url, storagePath: "cropped.png", fileName: "recortada.png",
      mimeType: "image/png", effectiveVariant: "cropped"
    });
  });

  it("falls back to the edited version when cropping is unavailable", () => {
    const withoutCrop = artwork({ ...edited, prepared_data_url: null, prepared_storage_path: null });
    expect(resolveQuotePdfArtworkAsset(withoutCrop, [original, withoutCrop], "cropped")).toMatchObject({
      requestedVariant: "cropped", effectiveVariant: "edited", dataUrl: edited.data_url
    });
  });
});

function artwork(override: Partial<ReturnType<typeof artworkBase>>) {
  return { ...artworkBase(), ...override };
}
function artworkBase() {
  return {
    id: "artwork", parent_artwork_id: null as string | null, data_url: null as string | null,
    storage_path: null as string | null, prepared_data_url: null as string | null,
    prepared_storage_path: null as string | null, prepared_file_name: null as string | null,
    file_name: "arte.png", mime_type: "image/png"
  };
}

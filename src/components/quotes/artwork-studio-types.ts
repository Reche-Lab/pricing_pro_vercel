import type { PrintGeometry, PrintMargins } from "@/domain/artwork/geometry";
import type { ArtworkFrame } from "@/domain/artwork/framing";

export type ArtworkStudioStep = "retouch" | "crop" | "review";
export type ArtworkStudioCrop = ArtworkFrame;
export type ArtworkPreviewCallbacks = { onReady: () => void; onError: (message: string) => void };
export type ArtworkStudioAsset = {
  id: string;
  name: string;
  fileName: string;
  sourceUrl: string;
  preparedUrl?: string;
  draftUrl?: string;
  geometry: PrintGeometry | null;
  margins: PrintMargins;
  crop: ArtworkStudioCrop;
  approved: boolean;
  notes?: string;
};

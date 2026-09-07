import type { PrintGeometry, PrintMargins } from "@/domain/artwork/geometry";

export type ArtworkStudioStep = "retouch" | "crop" | "review";
export type ArtworkStudioCrop = {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationDegrees: number;
};
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

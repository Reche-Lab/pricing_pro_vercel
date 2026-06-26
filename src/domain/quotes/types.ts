import type { QuoteCalculationResult } from "@/domain/pricing/types";

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "cancelled";

export type QuoteSnapshotInput = {
  request: unknown;
  product: unknown;
  platform: unknown;
  calculation: QuoteCalculationResult;
};

export type QuoteCalculationSnapshot = QuoteSnapshotInput & {
  schemaVersion: 1;
  createdAt: string;
};

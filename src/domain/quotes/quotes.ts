import type { QuoteCalculationSnapshot, QuoteSnapshotInput, QuoteStatus } from "./types";

const ALLOWED_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["accepted", "rejected", "expired", "cancelled"],
  accepted: [],
  rejected: [],
  expired: [],
  cancelled: []
};

export function canTransitionQuoteStatus(from: QuoteStatus, to: QuoteStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function createQuoteCalculationSnapshot(input: QuoteSnapshotInput): QuoteCalculationSnapshot {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    ...input
  };
}

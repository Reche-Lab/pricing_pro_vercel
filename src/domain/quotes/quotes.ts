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

export function isQuoteAdministrativeEditingOpen(input: {
  editReopenedAt?: string | null;
  editRelockedAt?: string | null;
}) {
  if (!input.editReopenedAt) return false;
  if (!input.editRelockedAt) return true;
  return new Date(input.editReopenedAt).getTime() > new Date(input.editRelockedAt).getTime();
}

export function createQuoteCalculationSnapshot(input: QuoteSnapshotInput): QuoteCalculationSnapshot {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    ...input
  };
}

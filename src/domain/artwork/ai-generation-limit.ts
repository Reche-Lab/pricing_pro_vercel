export const DEFAULT_ARTWORK_AI_GENERATION_LIMIT = 3;
export const MAX_ARTWORK_AI_GENERATION_LIMIT = 100;

export function normalizeArtworkAiGenerationLimit(limit: number | null | undefined) {
  const normalized = Math.floor(Number(limit));
  if (!Number.isFinite(normalized)) return DEFAULT_ARTWORK_AI_GENERATION_LIMIT;
  return Math.min(MAX_ARTWORK_AI_GENERATION_LIMIT, Math.max(0, normalized));
}

export function getArtworkAiAttemptsRemaining(
  attemptsUsed: number | null | undefined,
  limit: number | null | undefined = DEFAULT_ARTWORK_AI_GENERATION_LIMIT
) {
  const normalized = Math.max(0, Math.floor(Number(attemptsUsed) || 0));
  return Math.max(0, normalizeArtworkAiGenerationLimit(limit) - normalized);
}

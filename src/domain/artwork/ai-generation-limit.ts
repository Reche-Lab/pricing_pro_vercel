export const ARTWORK_AI_GENERATION_LIMIT = 3;

export function getArtworkAiAttemptsRemaining(attemptsUsed: number | null | undefined) {
  const normalized = Math.max(0, Math.floor(Number(attemptsUsed) || 0));
  return Math.max(0, ARTWORK_AI_GENERATION_LIMIT - normalized);
}

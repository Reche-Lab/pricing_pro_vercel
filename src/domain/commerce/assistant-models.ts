export const ASSISTANT_PRIMARY_MODEL = "openai/gpt-4.1-mini";
export const ASSISTANT_FALLBACK_MODEL = "google/gemini-3.1-flash-lite";
export const DEFAULT_ASSISTANT_MODELS = [ASSISTANT_PRIMARY_MODEL, ASSISTANT_FALLBACK_MODEL] as const;

export function assistantModelAllowlist(value?: string) {
  if (!value?.trim()) return [...DEFAULT_ASSISTANT_MODELS];
  return [...new Set(value.split(",").map(model => model.trim()).filter(model => /^[\w./:-]{3,150}$/.test(model)))];
}
export function assistantFallbackModel(primary: string, allowed: readonly string[]) {
  return primary === ASSISTANT_PRIMARY_MODEL && allowed.includes(ASSISTANT_PRIMARY_MODEL) && allowed.includes(ASSISTANT_FALLBACK_MODEL)
    ? ASSISTANT_FALLBACK_MODEL : undefined;
}

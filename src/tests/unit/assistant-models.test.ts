import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantModelAllowlist, assistantFallbackModel, ASSISTANT_PRIMARY_MODEL, ASSISTANT_FALLBACK_MODEL } from "@/domain/commerce/assistant-models";
import { assistantModels, defaultAssistantLimits } from "@/repositories/commerce-assistant";
afterEach(() => vi.unstubAllEnvs());
describe("assistant model routing policy", () => {
  it("defaults to GPT with Gemini available, independently of the creative assistant model", () => {
    vi.stubEnv("OPENROUTER_ASSISTANT_MODELS", ""); vi.stubEnv("OPENROUTER_TEXT_MODEL", "other/creative-model");
    expect(assistantModels()).toEqual([ASSISTANT_PRIMARY_MODEL, ASSISTANT_FALLBACK_MODEL]);
    expect(defaultAssistantLimits().model).toBe(ASSISTANT_PRIMARY_MODEL);
  });
  it("keeps GPT the default when the permitted list is reordered", () => {
    vi.stubEnv("OPENROUTER_ASSISTANT_MODELS", `${ASSISTANT_FALLBACK_MODEL},${ASSISTANT_PRIMARY_MODEL}`);
    expect(defaultAssistantLimits().model).toBe(ASSISTANT_PRIMARY_MODEL);
  });
  it("respects explicit exclusions, never loops, and leaves custom primary models unchanged", () => {
    expect(assistantFallbackModel(ASSISTANT_PRIMARY_MODEL, assistantModelAllowlist())).toBe(ASSISTANT_FALLBACK_MODEL);
    expect(assistantFallbackModel(ASSISTANT_PRIMARY_MODEL, [ASSISTANT_PRIMARY_MODEL])).toBeUndefined();
    expect(assistantFallbackModel(ASSISTANT_FALLBACK_MODEL, assistantModelAllowlist())).toBeUndefined();
    expect(assistantFallbackModel("custom/model", assistantModelAllowlist())).toBeUndefined();
    expect(assistantModelAllowlist("openai/gpt-4.1-mini, invalid model,openai/gpt-4.1-mini")).toEqual([ASSISTANT_PRIMARY_MODEL]);
  });
});

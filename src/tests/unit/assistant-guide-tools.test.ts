// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeAssistantTool, type AssistantToolContext } from "@/services/commerce/assistant-tools";
import { commerceProducts, publicCommerceProduct } from "@/repositories/commerce";
import { requireAssistantConversation } from "@/repositories/commerce-assistant";
import { assistantSettingsSchema } from "@/domain/commerce/assistant";
import { CommerceError } from "@/domain/commerce/commerce";
import { storeSettingsSchema } from "@/domain/commerce/schemas";

vi.mock("@/repositories/commerce", () => ({ commerceProducts: vi.fn(), publicCommerceProduct: vi.fn() }));
vi.mock("@/repositories/commerce-assistant", () => ({ requireAssistantConversation: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getPool: () => ({ query: vi.fn(async () => ({ rows: [] })) }) }));
const product = { id: "00000000-0000-4000-8000-000000000001", variantId: "00000000-0000-4000-8000-000000000002", name: "Botton", description: "Personalizado", category: "Bottons", imageUrl: "", minQuantity: 1, maxQuantity: 1000, maxArtworks: 10, personalized: true, geometry: { shape: "circle", widthMm: 35, heightMm: 35 }, artworkOptions: { allowTeamPreparation: true, discountFixedCents: 500, maxDiscountPercent: 10 } };
function context(): AssistantToolContext {
  const settings = storeSettingsSchema.parse({ name: "Loja", description: "", logoUrl: "", bannerUrl: "", accent: "#047857", contactEmail: "loja@example.test", contactPhone: "", pickupEnabled: false, pickupAddress: "", deliveryEnabled: false, deliveryCents: 0, deliveryDescription: "", terms: "" });
  return { store: { tenant_id: "tenant", slug: "test", enabled: true, status: "published", revision: 1, platform_id: "platform", settings, art_library_enabled: false }, session: { id: "session", tenant_id: "tenant", customer_id: null, revision: 0, cart: [] }, conversationId: "conversation", config: { tenant_id: "tenant", enabled: true, revision: 1, tested_revision: 1, tested_at: null, settings: assistantSettingsSchema.parse({}) } };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAssistantConversation).mockResolvedValue({} as never);
  vi.mocked(commerceProducts).mockResolvedValue([product] as never);
  vi.mocked(publicCommerceProduct).mockReturnValue({ ...product, unitCents: 500 } as never);
});
describe("assistant guide tools", () => {
  it("reads only the current tenant catalog and reports actual eligible benefits without modifying the cart", async () => {
    const ctx = context();
    const result = await executeAssistantTool(ctx, "store_guide", { topic: "artwork" });
    expect(requireAssistantConversation).toHaveBeenCalledWith("tenant", ctx.session, "conversation");
    expect(commerceProducts).toHaveBeenCalledWith("tenant");
    expect(result).toMatchObject({ result: { benefitRequiresCustomerPreparationAndApproval: true, quoteWithoutPurchase: true }, card: { kind: "guide", guide: { features: { personalized: true, library: false, studio: false }, benefits: [{ productId: product.id, percent: 10, limitPerArtworkCents: 500 }] } } });
    expect(ctx.session.cart).toEqual([]);
    vi.mocked(commerceProducts).mockResolvedValue([{ ...product, artworkOptions: { ...product.artworkOptions, discountFixedCents: 0 } }] as never);
    expect(await executeAssistantTool(ctx, "store_guide", { topic: "artwork" })).toMatchObject({ card: { guide: { benefits: [] } } });
  });
  it("includes official product benefit metadata in search results but not internal pricing or geometry", async () => {
    const result = await executeAssistantTool(context(), "search_products", { query: "Botton" });
    expect(result).toMatchObject({ result: { products: [{ artworkBenefit: { percent: 10, limitPerArtworkCents: 500 } }] }, card: { kind: "products", products: [{ artworkBenefit: { percent: 10, limitPerArtworkCents: 500 } }] } });
    expect(JSON.stringify(result.result)).not.toMatch(/geometry|mockup|curve|unitCents/);
  });
  it("supports readonly admin previews and does not fetch the catalog for a policy guide", async () => {
    await executeAssistantTool(context(), "store_guide", { topic: "shopping" }, { adminPreview: true });
    expect(requireAssistantConversation).not.toHaveBeenCalled();
    expect(commerceProducts).toHaveBeenCalledTimes(1);
    expect(await executeAssistantTool(context(), "store_guide", { topic: "policies" })).toMatchObject({ card: { kind: "guide", topic: "policies" } });
    expect(commerceProducts).toHaveBeenCalledTimes(1);
  });
  it("checks conversation ownership before reading another tenant's catalog", async () => {
    vi.mocked(requireAssistantConversation).mockRejectedValue(new CommerceError("Conversa não encontrada.", 404));
    await expect(executeAssistantTool(context(), "store_guide", { topic: "artwork" })).rejects.toMatchObject({ status: 404 });
    expect(commerceProducts).not.toHaveBeenCalled();
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { previewCarrierDelivery } from "@/services/commerce/preview-delivery";
import { getIntegrationConnection, decryptIntegrationCredentials } from "@/repositories/integrations";
import { estimatePackaging } from "@/repositories/packaging";
import { getTenantShippingProfile } from "@/repositories/tenant-settings";
import { melhorEnvioRequest } from "@/services/melhor-envio/melhor-envio";
vi.mock("@/repositories/integrations", () => ({ getIntegrationConnection: vi.fn(), decryptIntegrationCredentials: vi.fn() }));
vi.mock("@/repositories/packaging", () => ({ estimatePackaging: vi.fn() }));
vi.mock("@/repositories/tenant-settings", () => ({ getTenantShippingProfile: vi.fn() }));
vi.mock("@/services/melhor-envio/melhor-envio", async original => ({ ...await original<object>(), melhorEnvioRequest: vi.fn() }));
const product = { id: "published", variantId: "variant", name: "Botton", minQuantity: 1, maxQuantity: 100, maxArtworks: 2, pricingRule: "total", curve: { mode: "step", points: [{ quantity: 1, unitPrice: 10 }] }, platform: { commissionRate: 0, fixedFee: 0, sellerShippingCost: 0, sellerShippingThreshold: 0 } };
const lines = [{ id: "a", productId: "published", quantity: 3, artworkName: "Arte A", artworkId: null }, { id: "b", productId: "published", quantity: 2, artworkName: "Arte B", artworkId: null }];
const packaging = { box: { widthCm: 12, heightCm: 5, lengthCm: 20 }, boxesNeeded: 2, grossWeightPerBoxKg: .4, netWeightKg: .6 };
const call = () => previewCarrierDelivery("user", "tenant", "12345678", lines, [product] as never);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getIntegrationConnection).mockResolvedValue({ status: "active", settings: { services: ["1", "2"] }, credentials_encrypted: "encrypted" } as never);
  vi.mocked(decryptIntegrationCredentials).mockReturnValue({ accessToken: "secret" });
  vi.mocked(getTenantShippingProfile).mockResolvedValue({ postal_code: "87654-321" } as never);
  vi.mocked(estimatePackaging).mockResolvedValue(packaging as never);
  vi.mocked(melhorEnvioRequest).mockResolvedValue([{ id: 1, name: "PAC", company: { name: "Correios" }, price: "20.00", custom_price: "18.50", delivery_time: 6, custom_delivery_time: 5 }, { id: 2, error: "Indisponível" }]);
});
describe("preview tenant carrier quote", () => {
  it("uses tenant context, combined quantities, dimensions, weight and the server-priced insurance", async () => {
    const result = await call();
    expect(getIntegrationConnection).toHaveBeenCalledWith("user", "tenant", "melhor_envio");
    expect(estimatePackaging).toHaveBeenCalledWith("user", "tenant", { items: [{ productVariantId: "variant", quantity: 5 }] });
    expect(melhorEnvioRequest).toHaveBeenCalledWith(expect.objectContaining({ path: "/me/shipment/calculate", method: "POST", body: {
      from: { postal_code: "87654321" }, to: { postal_code: "12345678" }, services: "1,2",
      volumes: [{ width: 12, height: 5, length: 20, weight: .4, insurance: 25 }, { width: 12, height: 5, length: 20, weight: .4, insurance: 25 }],
      options: { receipt: false, own_hand: false },
    } }));
    expect(result?.options).toEqual([{ id: "melhor_envio:1", name: "Correios - PAC", priceCents: 1850, description: "Melhor Envio · Prazo estimado: 5 dias úteis" }]);
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("does not invent a tariff without a configured carrier", async () => {
    vi.mocked(getIntegrationConnection).mockResolvedValue(null);
    expect(await call()).toBeNull();
    expect(melhorEnvioRequest).not.toHaveBeenCalled();
  });
  it("keeps exact insurance cents across packages, accepts zero tariffs and ignores invalid prices", async () => {
    vi.mocked(melhorEnvioRequest).mockResolvedValue([{ id: 1, name: "PAC", price: "invalid" }, { id: 2, name: "SEDEX", custom_price: "0", price: 20, custom_delivery_time: 0 }]);
    await previewCarrierDelivery("user", "tenant", "12345678", lines, [{ ...product, curve: { mode: "step", points: [{ quantity: 1, unitPrice: 10.01 }] } }] as never);
    const body = vi.mocked(melhorEnvioRequest).mock.calls[0][0].body as { volumes: { insurance: number }[] };
    expect(body.volumes.map(volume => Math.round(volume.insurance * 100))).toEqual([2503, 2502]);
    expect((await call())?.options).toHaveLength(1);
    expect((await call())?.options[0].priceCents).toBe(0);
  });
  it("reports missing credentials, origin, packaging and a provider with no valid service", async () => {
    vi.mocked(getTenantShippingProfile).mockResolvedValue({ postal_code: "" } as never);
    await expect(call()).rejects.toThrow("CEP de origem");
    vi.mocked(getTenantShippingProfile).mockResolvedValue({ postal_code: "12345678" } as never);
    vi.mocked(estimatePackaging).mockResolvedValue(null);
    await expect(call()).rejects.toThrow("embalagem");
    vi.mocked(estimatePackaging).mockResolvedValue(packaging as never);
    vi.mocked(decryptIntegrationCredentials).mockReturnValue({});
    await expect(call()).rejects.toThrow("Reconecte");
    vi.mocked(decryptIntegrationCredentials).mockReturnValue({ accessToken: "secret" });
    vi.mocked(melhorEnvioRequest).mockResolvedValue([{ id: 1, error: "Não atende" }]);
    await expect(call()).rejects.toThrow("serviços disponíveis");
  });
});

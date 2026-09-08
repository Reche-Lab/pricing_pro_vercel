import { calculateCart, CommerceError } from "@/domain/commerce/commerce";
import type { CartLine } from "@/domain/commerce/schemas";
import type { CommerceProduct } from "@/repositories/commerce";
import { decryptIntegrationCredentials, getIntegrationConnection } from "@/repositories/integrations";
import { estimatePackaging } from "@/repositories/packaging";
import { getTenantShippingProfile } from "@/repositories/tenant-settings";
import { melhorEnvioRequest, MelhorEnvioRequestError } from "@/services/melhor-envio/melhor-envio";
import type { MelhorEnvioCredentials, MelhorEnvioSettings } from "@/services/melhor-envio/types";

// Only invoked after admin preview authorization; never impersonate an owner for public buyers.
export async function previewCarrierDelivery(userId: string, tenantId: string, postalCode: string, lines: CartLine[], products: CommerceProduct[]) {
  const connection = await getIntegrationConnection(userId, tenantId, "melhor_envio");
  if (!connection || connection.status === "disabled") return null;
  if (connection.status !== "active") throw new CommerceError("Reconecte o Melhor Envio em Configurações > Melhor Envio.", 409);
  const tenant = await getTenantShippingProfile(userId, tenantId);
  const origin = tenant?.postal_code?.replace(/\D/g, "") ?? "";
  if (!/^\d{8}$/.test(origin) || origin === "00000000")
    throw new CommerceError("Cadastre o CEP de origem em Configurações > Geral > Dados do tenant e remetente.", 409);
  let credentials: MelhorEnvioCredentials;
  try { credentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(connection); }
  catch { throw new CommerceError("Reconecte o Melhor Envio: as credenciais não estão disponíveis.", 409); }
  if (!credentials.accessToken) throw new CommerceError("Reconecte o Melhor Envio antes de consultar o frete.", 409);

  const priced = calculateCart(lines, products);
  const quantities = new Map<string, number>();
  for (const line of lines) {
    const product = products.find(candidate => candidate.id === line.productId);
    if (!product?.variantId) throw new CommerceError("Vincule o produto da loja a um produto cadastrado para calcular a embalagem.", 409);
    quantities.set(product.variantId, (quantities.get(product.variantId) ?? 0) + line.quantity);
  }
  let packaging;
  try {
    packaging = await estimatePackaging(userId, tenantId, {
      items: [...quantities].map(([productVariantId, quantity]) => ({ productVariantId, quantity })),
    });
  } catch (error) {
    if (error instanceof Error && ["At least one product item is required.", "Product variant not found.", "Product dimensions are required for intelligent packaging."].includes(error.message))
      throw new CommerceError("Confira as dimensões e o peso do produto e cadastre uma embalagem compatível em Embalagens.", 409);
    throw error;
  }
  if (!packaging) throw new CommerceError("Nenhuma embalagem compatível. Cadastre uma caixa que comporte essa quantidade.", 409);
  const count = packaging.boxesNeeded;
  if (!Number.isInteger(count) || count < 1 || count > 50)
    throw new CommerceError("A consulta do preview suporta até 50 volumes. Ajuste a quantidade ou as embalagens.", 409);
  if (![packaging.box.widthCm, packaging.box.heightCm, packaging.box.lengthCm, packaging.grossWeightPerBoxKg, packaging.netWeightKg].every(value => Number.isFinite(value) && value > 0))
    throw new CommerceError("Confira as dimensões da caixa e os pesos cadastrados no produto e na embalagem.", 409);
  const settings = connection.settings as MelhorEnvioSettings;
  // Distribute insurance in cents so multiple packages do not multiply the order's declared value.
  const volumes = Array.from({ length: count }, (_, index) => ({
    width: packaging.box.widthCm, height: packaging.box.heightCm, length: packaging.box.lengthCm,
    weight: packaging.grossWeightPerBoxKg,
    insurance: (Math.floor(priced.totalCents / count) + (index < priced.totalCents % count ? 1 : 0)) / 100,
  }));
  let response: unknown;
  try {
    response = await melhorEnvioRequest({ method: "POST", path: "/me/shipment/calculate", settings, credentials,
      signal: AbortSignal.timeout(15000),
      body: { from: { postal_code: origin }, to: { postal_code: postalCode }, volumes,
        options: { receipt: false, own_hand: false }, services: settings.services?.length ? settings.services.join(",") : undefined },
    });
  } catch (error) {
    if (error instanceof MelhorEnvioRequestError && [401, 403].includes(error.status))
      throw new CommerceError("O Melhor Envio recusou o acesso. Revise a conexão e a permissão de cotação em Configurações > Melhor Envio.", 409);
    throw new CommerceError("Não foi possível obter a cotação no Melhor Envio. Confira os dados de envio e tente novamente.", 502);
  }
  const options = Array.isArray(response) ? response.flatMap(row => {
    if (!row || typeof row !== "object" || row.error || !row.id) return [];
    const amount = numeric(row.custom_price) ?? numeric(row.price);
    if (amount === null || amount < 0 || amount > 1000000) return [];
    const days = numeric(row.custom_delivery_time) ?? numeric(row.delivery_time);
    const company = typeof row.company?.name === "string" ? row.company.name : "Melhor Envio";
    const name = typeof row.name === "string" ? row.name : "Frete";
    return [{ id: `melhor_envio:${String(row.id)}`, name: `${company} - ${name}`, priceCents: Math.round(amount * 100),
      description: `Melhor Envio${days !== null && days >= 0 ? ` · Prazo estimado: ${days} ${days === 1 ? "dia útil" : "dias úteis"}` : ""}` }];
  }).sort((a, b) => a.priceCents - b.priceCents) : [];
  if (!options.length) throw new CommerceError("O Melhor Envio não retornou serviços disponíveis para este CEP e embalagem. Confira também os serviços habilitados na integração.", 409);
  return { options };
}

function numeric(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(typeof value === "string" ? value.replace(",", ".") : value);
  return Number.isFinite(number) ? number : null;
}

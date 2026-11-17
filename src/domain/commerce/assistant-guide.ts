import type { AssistantArtworkBenefit, AssistantGuide, AssistantSettings } from "./assistant";
import type { CommerceProduct, CommerceStore } from "@/repositories/commerce";

export function assistantArtworkBenefit(product: Pick<CommerceProduct, "personalized" | "geometry" | "artworkOptions">): AssistantArtworkBenefit | undefined {
  const options = product.artworkOptions;
  if (!product.personalized || !product.geometry || !options || !(options.discountFixedCents > 0) || !(options.maxDiscountPercent > 0)) return;
  return { percent: options.maxDiscountPercent, limitPerArtworkCents: options.discountFixedCents };
}

export function assistantStoreGuide(store: CommerceStore, settings: AssistantSettings, products: readonly CommerceProduct[]): AssistantGuide {
  const editable = products.filter(product => product.personalized && product.geometry);
  const benefits = products.flatMap(product => {
    const benefit = assistantArtworkBenefit(product);
    return benefit ? [{ productId: product.id, ...(product.slug ? { slug: product.slug } : {}), name: product.name, ...benefit }] : [];
  });
  return {
    features: {
      quotes: settings.allowQuotes, orders: settings.allowOrders,
      personalized: editable.length > 0,
      studio: store.settings.experience?.style === "studio" && editable.some(product => Boolean(product.artworkOptions?.mockup)),
      library: Boolean(store.art_library_enabled),
      teamPreparation: editable.some(product => product.artworkOptions?.allowTeamPreparation),
      pickup: Boolean(store.settings.pickupEnabled),
      delivery: Boolean(store.settings.deliveryEnabled || store.settings.carrierEnabled),
    },
    benefits: benefits.slice(0, 6), moreBenefits: benefits.length > 6,
  };
}

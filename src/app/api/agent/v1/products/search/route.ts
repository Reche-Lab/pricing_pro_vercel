import { productSearchRequiresClarification } from "@/domain/products/product-search";
import { logAgentAudit, searchAgentProductMatches } from "@/repositories/agent";
import { withAgentAuthGet } from "../../_shared";

export async function GET(request: Request) {
  return withAgentAuthGet(request, "products:read", async (context, currentRequest) => {
    const url = new URL(currentRequest.url);
    const query = url.searchParams.get("q") ?? "";
    const limit = safeInteger(url.searchParams.get("limit"), 10, 1, 50);
    const offset = safeInteger(url.searchParams.get("offset"), 0, 0, 100_000);
    const category = url.searchParams.get("category");
    const result = await searchAgentProductMatches(context, query, { limit, offset, category });
    const requiresClarification = query.trim() ? productSearchRequiresClarification(result.products) : false;
    await logAgentAudit(context, "agent.products.search", {
      query,
      category,
      offset,
      limit,
      resultCount: result.products.length,
      total: result.total,
      requiresClarification
    });

    return {
      body: {
        ok: true,
        query,
        requiresClarification,
        products: result.products.map((product) => ({
          productId: product.product_id,
          productName: product.product_name,
          productSlug: product.product_slug,
          category: product.product_category,
          description: product.variant_description ?? product.product_description,
          variantId: product.variant_id,
          variantName: product.variant_name,
          sku: product.sku,
          searchAliases: (product.aliases ?? []).map((alias) => alias.alias),
          match: {
            confidence: product.confidence,
            matchedBy: product.matchedBy,
            matchedAlias: product.matchedAlias
          },
          dimensions: {
            heightCm: numberOrNull(product.height_cm),
            widthCm: numberOrNull(product.width_cm),
            lengthCm: numberOrNull(product.length_cm)
          },
          unitWeightKg: numberOrNull(product.unit_weight_kg)
        })),
        pagination: {
          offset,
          limit,
          count: result.products.length,
          total: result.total,
          hasMore: offset + result.products.length < result.total,
          nextOffset: offset + result.products.length < result.total ? offset + result.products.length : null
        }
      }
    };
  });
}

function safeInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

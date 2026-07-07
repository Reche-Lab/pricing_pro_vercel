import { logAgentAudit, searchAgentProducts } from "@/repositories/agent";
import { withAgentAuthGet } from "../../_shared";

export async function GET(request: Request) {
  return withAgentAuthGet(request, "products:read", async (context, currentRequest) => {
    const url = new URL(currentRequest.url);
    const query = url.searchParams.get("q") ?? "";
    const limit = Math.max(1, Math.min(25, Number(url.searchParams.get("limit") ?? 10)));
    const products = await searchAgentProducts(context, query, limit);
    await logAgentAudit(context, "agent.products.search", { query, resultCount: products.length });

    return {
      body: {
        ok: true,
        products: products.map((product) => ({
          productId: product.product_id,
          productName: product.product_name,
          productSlug: product.product_slug,
          category: product.product_category,
          description: product.variant_description ?? product.product_description,
          variantId: product.variant_id,
          variantName: product.variant_name,
          sku: product.sku,
          dimensions: {
            heightCm: numberOrNull(product.height_cm),
            widthCm: numberOrNull(product.width_cm),
            lengthCm: numberOrNull(product.length_cm)
          },
          unitWeightKg: numberOrNull(product.unit_weight_kg)
        }))
      }
    };
  });
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

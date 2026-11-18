import { randomUUID } from "node:crypto";
import { getCommerceStore } from "@/repositories/commerce";
import { storeWebManifest } from "@/services/commerce/store-branding";
import { commerceSiteOrigin } from "@/services/commerce/store-seo";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const store = await getCommerceStore(slug, true);
    if (!store) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    return new Response(JSON.stringify(storeWebManifest(slug, store.settings, commerceSiteOrigin())), { headers: {
      "content-type": "application/manifest+json; charset=utf-8", "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=300, s-maxage=300",
    } });
  } catch {
    const debugId = randomUUID();
    console.error("Commerce store manifest unavailable.", { debugId, slug });
    return new Response(null, { status: 503, headers: { "cache-control": "no-store", "x-debug-id": debugId } });
  }
}

import { randomUUID } from "node:crypto";
import { getCommerceStore } from "@/repositories/commerce";
import { renderStoreIcon } from "@/services/commerce/store-icon";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const store = await getCommerceStore(slug, true);
    const bytes = store ? await renderStoreIcon(store.tenant_id, store.settings) : null;
    if (!bytes) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    return new Response(new Uint8Array(bytes), { headers: {
      "content-type": "image/png", "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=300, s-maxage=300",
    } });
  } catch {
    const debugId = randomUUID();
    console.error("Commerce store icon unavailable.", { debugId, slug });
    return new Response(null, { status: 503, headers: { "cache-control": "no-store", "x-debug-id": debugId } });
  }
}

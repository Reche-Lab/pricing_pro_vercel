import { getCommerceStore } from "@/repositories/commerce";
import { commerceStoreUrl } from "@/domain/commerce/domains";
import { storeRobotsText } from "@/domain/commerce/robots";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getCommerceStore(slug);
  if (!store) return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain" } });
  return new Response(storeRobotsText(commerceStoreUrl(slug)), { headers: { "content-type": "text/plain; charset=utf-8" } });
}

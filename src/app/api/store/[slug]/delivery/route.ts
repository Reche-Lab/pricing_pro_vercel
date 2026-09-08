import { productDelivery } from "@/services/commerce/product-delivery";
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return productDelivery(request, (await params).slug);
}

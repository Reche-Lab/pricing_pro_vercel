import { checkoutDelivery } from "@/services/commerce/checkout-delivery";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return checkoutDelivery(request, (await params).slug);
}

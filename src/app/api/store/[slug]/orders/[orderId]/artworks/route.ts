import { commerceProofRequest } from "@/services/commerce/order-artwork-http";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; orderId: string }> }) { return commerceProofRequest(request, await params, false); }
export const POST = GET;

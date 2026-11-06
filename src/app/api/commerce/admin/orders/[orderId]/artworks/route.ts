import { commerceProofRequest } from "@/services/commerce/order-artwork-http";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) { return commerceProofRequest(request, await params, true); }
export const POST = GET;

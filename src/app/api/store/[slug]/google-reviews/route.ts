import { googleReviewsHttp } from "@/services/commerce/google-reviews-http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };
export async function GET(request: Request, { params }: Context) { return googleReviewsHttp(request, (await params).slug); }
export async function POST(request: Request, { params }: Context) { return googleReviewsHttp(request, (await params).slug); }

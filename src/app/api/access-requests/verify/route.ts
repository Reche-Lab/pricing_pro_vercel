import { NextResponse } from "next/server";
import { z } from "zod";
import { hashAccessRequestToken } from "@/domain/access-requests/tokens";
import { verifyAccessRequestEmail } from "@/repositories/access-requests";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";

const schema = z.object({ token: z.string().min(30) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Link de confirmação inválido." }, { status: 400 });
  const rateLimit = await enforcePublicRateLimit(request, parsed.data.token, {
    action: "tenant_access_request.verify",
    limit: 5,
    windowSeconds: 3600
  });
  if (rateLimit) return rateLimit;
  const accessRequest = await verifyAccessRequestEmail(hashAccessRequestToken(parsed.data.token));
  if (!accessRequest) {
    return NextResponse.json({ ok: false, error: "Este link é inválido, expirou ou já foi utilizado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

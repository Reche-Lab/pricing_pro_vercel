import { NextResponse } from "next/server";
import { z } from "zod";
import { hashAccessRequestToken } from "@/domain/access-requests/tokens";
import { getAccessRequestByPublicToken, submitAccessRequestAdditionalInfo } from "@/repositories/access-requests";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!z.string().min(30).safeParse(token).success) return NextResponse.json({ ok: false }, { status: 404 });
  const accessRequest = await getAccessRequestByPublicToken(hashAccessRequestToken(token));
  if (!accessRequest) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({
    ok: true,
    request: {
      companyName: accessRequest.company_name,
      status: accessRequest.status,
      reviewNotes: accessRequest.review_notes,
      rejectionReason: accessRequest.rejection_reason,
      createdAt: accessRequest.created_at,
      updatedAt: accessRequest.updated_at
    }
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const rateLimit = await enforcePublicRateLimit(request, token, {
    action: "tenant_access_request.additional_info",
    limit: 5,
    windowSeconds: 3600
  });
  if (rateLimit) return rateLimit;
  const parsed = z.object({ message: z.string().trim().min(5).max(1500) }).safeParse(await request.json().catch(() => null));
  if (!z.string().min(30).safeParse(token).success || !parsed.success) {
    return NextResponse.json({ ok: false, error: "Informe os dados solicitados." }, { status: 400 });
  }
  const updated = await submitAccessRequestAdditionalInfo({
    publicTokenHash: hashAccessRequestToken(token),
    message: parsed.data.message
  });
  if (!updated) return NextResponse.json({ ok: false, error: "Esta solicitação não está aguardando informações." }, { status: 409 });
  return NextResponse.json({ ok: true });
}

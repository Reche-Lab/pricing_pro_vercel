import { z } from "zod";
import { getStoreDomain, storeDomainCheck } from "@/repositories/commerce-domain-setup";
import { inspectDomainDns } from "@/services/commerce/domain-dns";
import { CommerceError } from "@/domain/commerce/commerce";
import { requireCommerceAdmin, checkCommerceOrigin, commerceJson, commerceFailure } from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
export async function POST(request: Request, { params }: { params: Promise<{ domainId: string }> }) {
  try {
    checkCommerceOrigin(request); const { session } = await requireCommerceAdmin();
    const { domainId } = await params;
    if (!z.string().uuid().safeParse(domainId).success) throw new CommerceError("Domínio inválido.");
    const blocked = await enforcePublicRateLimit(request, session.tenantId, { action: "commerce.domain.check", limit: 12, windowSeconds: 600 }); if (blocked) return blocked;
    const row = await getStoreDomain(domainId, session.tenantId);
    return commerceJson({ domain: await storeDomainCheck(session.userId, row, await inspectDomainDns(row)) });
  } catch (error) { return commerceFailure(error, "admin.domains.check"); }
}

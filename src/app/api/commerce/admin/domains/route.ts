import { domainRequestSchema } from "@/domain/commerce/domain-setup";
import { listStoreDomains, requestStoreDomains } from "@/repositories/commerce-domain-setup";
import { requireCommerceAdmin, checkCommerceOrigin, readCommerceBody, commerceJson, commerceFailure } from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
export async function GET() {
  try { const { session } = await requireCommerceAdmin(); return commerceJson({ domains: await listStoreDomains(session.tenantId) }); }
  catch (error) { return commerceFailure(error, "admin.domains.read"); }
}
export async function POST(request: Request) {
  try {
    checkCommerceOrigin(request); const { session } = await requireCommerceAdmin();
    const blocked = await enforcePublicRateLimit(request, session.tenantId, { action: "commerce.domain.request", limit: 10, windowSeconds: 600 }); if (blocked) return blocked;
    const input = await readCommerceBody(request, domainRequestSchema, 4096);
    return commerceJson({ domains: await requestStoreDomains(session.userId, session.tenantId, input), message: "Solicitação registrada. O DNS e o domínio ainda não foram alterados." });
  } catch (error) { return commerceFailure(error, "admin.domains.request"); }
}

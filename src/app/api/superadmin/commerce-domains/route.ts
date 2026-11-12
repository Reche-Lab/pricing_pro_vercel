import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { isSuperAdmin } from "@/repositories/superadmin";
import { listStoreDomains, getStoreDomain, saveDomainOperatorConfig, approveStoreDomain, storeDomainCheck } from "@/repositories/commerce-domain-setup";
import { dnsRecordSchema } from "@/domain/commerce/domain-setup";
import { CommerceError } from "@/domain/commerce/commerce";
import { checkCommerceOrigin, commerceJson, commerceFailure, readCommerceBody } from "@/services/commerce/http";
import { inspectDomainDns } from "@/services/commerce/domain-dns";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
async function operator() {
  const session = await getCurrentSession();
  if (!session) throw new CommerceError("Entre na conta administrativa.", 401);
  if (!(await isSuperAdmin(session.userId))) throw new CommerceError("Somente o superadmin pode autorizar domínios.", 403);
  return session;
}
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: z.string().uuid(), revision: z.number().int().positive(), records: z.array(dnsRecordSchema).max(10), note: z.string().trim().max(1500), vercelAdded: z.boolean(), httpsConfirmed: z.boolean() }).strict(),
  z.object({ action: z.literal("approve"), id: z.string().uuid(), revision: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("check"), id: z.string().uuid() }).strict(),
]);
export async function GET() {
  try { await operator(); return commerceJson({ domains: await listStoreDomains() }); }
  catch (error) { return commerceFailure(error, "superadmin.domains.read"); }
}
export async function POST(request: Request) {
  try {
    checkCommerceOrigin(request); const session = await operator();
    const input = await readCommerceBody(request, schema, 24000);
    const row = await getStoreDomain(input.id);
    const blocked = await enforcePublicRateLimit(request, row.tenant_id, { action: `commerce.operator.domain.${input.action}`, limit: 15, windowSeconds: 600 }); if (blocked) return blocked;
    const domain = input.action === "save" ? await saveDomainOperatorConfig(session.userId, row, input)
      : input.action === "approve" ? await approveStoreDomain(session.userId, row.id, input.revision)
      : await storeDomainCheck(session.userId, row, await inspectDomainDns(row));
    return commerceJson({ domain, message: input.action === "approve" ? "Autorização registrada. Configure COMMERCE_CUSTOM_DOMAINS no deploy para ativar o vínculo." : input.action === "save" ? "Registros salvos. Consulte o DNS novamente antes de autorizar." : "Consulta DNS concluída. Confira cada resultado." });
  } catch (error) { return commerceFailure(error, "superadmin.domains.action"); }
}

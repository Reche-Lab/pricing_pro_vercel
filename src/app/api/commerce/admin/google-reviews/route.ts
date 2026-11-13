import { z } from "zod";
import { googleReviewsSaveSchema } from "@/domain/commerce/google-reviews";
import { CommerceError } from "@/domain/commerce/commerce";
import { loadGoogleReviews, safeGoogleReviews, saveGoogleReviews, markGoogleReviewsTested, toggleGoogleReviews, removeGoogleReviewsKey } from "@/repositories/commerce-google-reviews";
import { fetchGoogleReviews } from "@/services/commerce/google-reviews";
import { requireCommerceAdmin, checkCommerceOrigin, commerceJson, commerceFailure, readCommerceBody } from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
export const dynamic = "force-dynamic";
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test"), revision: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("toggle"), revision: z.number().int().positive(), enabled: z.boolean(), confirmPlace: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("remove_key"), revision: z.number().int().positive(), confirmation: z.literal("REMOVER") }).strict(),
]);
function failed(error: unknown, operation: string) {
  if (error && typeof error === "object" && "code" in error && error.code === "42P01") return commerceFailure(new CommerceError("Aplique a migration 0078_commerce_google_reviews.sql antes de configurar as avaliações.", 503), operation);
  return commerceFailure(error, operation);
}
export async function GET() {
  try { const { session } = await requireCommerceAdmin(); return commerceJson({ settings: safeGoogleReviews(await loadGoogleReviews(session.tenantId)) }); }
  catch (error) { return failed(error, "admin.google_reviews.read"); }
}
export async function PUT(request: Request) {
  try {
    checkCommerceOrigin(request); const { session } = await requireCommerceAdmin();
    const blocked = await enforcePublicRateLimit(request, session.tenantId, { action: "commerce.google_reviews.save", limit: 20, windowSeconds: 600 }); if (blocked) return blocked;
    const settings = await saveGoogleReviews(session.userId, session.tenantId, await readCommerceBody(request, googleReviewsSaveSchema, 4096));
    return commerceJson({ settings, message: settings.tested ? "Configuração salva." : "Configuração salva. Teste a conexão e confirme o perfil antes de ativar." });
  } catch (error) { return failed(error, "admin.google_reviews.save"); }
}
export async function POST(request: Request) {
  try {
    checkCommerceOrigin(request); const { session } = await requireCommerceAdmin();
    const input = await readCommerceBody(request, actionSchema, 2048);
    const blocked = await enforcePublicRateLimit(request, session.tenantId, { action: `commerce.google_reviews.${input.action}`, limit: input.action === "test" ? 5 : 20, windowSeconds: 600 }); if (blocked) return blocked;
    if (input.action === "toggle") {
      if (input.enabled && !input.confirmPlace) throw new CommerceError("Confirme que o perfil testado representa esta loja antes de ativar.");
      return commerceJson({ settings: await toggleGoogleReviews(session.userId, session.tenantId, input.revision, input.enabled), message: input.enabled ? "Avaliações ativadas na página inicial." : "Seção de avaliações desativada." });
    }
    if (input.action === "remove_key") return commerceJson({ settings: await removeGoogleReviewsKey(session.userId, session.tenantId, input.revision), message: "Credencial removida e seção desativada." });
    const row = await loadGoogleReviews(session.tenantId);
    if (!row || row.revision !== input.revision) throw new CommerceError("Salve a configuração atual antes de testar.", 409);
    const data = await fetchGoogleReviews(row, { testing: true, signal: request.signal });
    await markGoogleReviewsTested(session.userId, session.tenantId, row.revision);
    return commerceJson({ settings: safeGoogleReviews(await loadGoogleReviews(session.tenantId)), preview: data, message: "Conexão confirmada. Confira se este é o perfil correto da loja. O teste consumiu uma consulta." });
  } catch (error) { return failed(error, "admin.google_reviews.action"); }
}

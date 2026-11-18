import { analyticsReportQuerySchema, analyticsSettingsSchema } from "@/domain/commerce/analytics";
import { CommerceError } from "@/domain/commerce/commerce";
import { commerceAnalyticsReport, loadCommerceAnalyticsSettings, saveCommerceAnalyticsSettings } from "@/repositories/commerce-analytics";
import { checkCommerceOrigin, commerceFailure, commerceJson, readCommerceBody, requireCommerceAdmin } from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";

export const dynamic = "force-dynamic";
function failure(error: unknown) {
  if (error && typeof error === "object" && "code" in error && ["42703", "42P01"].includes(String(error.code))) return commerceFailure(new CommerceError("Aplique a migration 0081_commerce_analytics.sql para habilitar as métricas da loja.", 503), "analytics.admin");
  return commerceFailure(error, "analytics.admin");
}
export async function GET(request: Request) {
  try {
    const { session } = await requireCommerceAdmin();
    const parsed = analyticsReportQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new CommerceError("Selecione um período e ambiente válidos.");
    return commerceJson({ settings: await loadCommerceAnalyticsSettings(session.tenantId), report: await commerceAnalyticsReport(session.tenantId, parsed.data) });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceAdmin();
    const blocked = await enforcePublicRateLimit(request, session.tenantId, { action: "commerce.analytics.save", limit: 20, windowSeconds: 600 });
    if (blocked) return blocked;
    return commerceJson({ settings: await saveCommerceAnalyticsSettings(session.tenantId, session.userId, await readCommerceBody(request, analyticsSettingsSchema, 4096)) });
  } catch (error) { return failure(error); }
}

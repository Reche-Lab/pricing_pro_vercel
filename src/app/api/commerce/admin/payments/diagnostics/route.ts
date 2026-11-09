import { z } from "zod";
import { paymentEnvironmentSchema } from "@/domain/commerce/payment-settings";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { diagnosePaymentConnection } from "@/services/commerce/payment-connection-diagnostics";
import { checkCommerceOrigin, requireCommerceAdmin, readCommerceBody, commerceJson, commerceFailure } from "@/services/commerce/http";

const schema = z.object({ environment: paymentEnvironmentSchema }).strict();
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceAdmin();
    const input = await readCommerceBody(request, schema, 1024);
    const blocked = await enforcePublicRateLimit(request, session.tenantId, { action: "commerce.payments.diagnose", limit: 6, windowSeconds: 60 });
    if (blocked) return blocked;
    return commerceJson(await diagnosePaymentConnection(session.tenantId, input.environment));
  } catch (error) {
    return commerceFailure(error, "payments.diagnose");
  }
}

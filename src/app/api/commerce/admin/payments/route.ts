import { z } from "zod";
import { savePaymentConnection } from "@/services/commerce/payments";
import {
  requireCommerceAdmin,
  checkCommerceOrigin,
  readCommerceBody,
  commerceJson,
  commerceFailure,
} from "@/services/commerce/http";
const schema = z
  .object({
    manualEnabled: z.boolean(),
    manualInstructions: z.string().trim().max(2000),
    mpEnabled: z.boolean(),
    accessToken: z.string().trim().max(500).optional(),
    webhookSecret: z.string().trim().max(500).optional(),
  })
  .strict();
export async function PUT(request: Request) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceAdmin();
    await savePaymentConnection(
      session.tenantId,
      session.userId,
      await readCommerceBody(request, schema),
    );
    return commerceJson({ ok: true });
  } catch (error) {
    return commerceFailure(error, "payments.configure");
  }
}

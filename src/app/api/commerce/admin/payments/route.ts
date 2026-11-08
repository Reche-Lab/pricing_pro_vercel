import { z } from "zod";
import { savePaymentConnection } from "@/services/commerce/payments";
import { commercePaymentSettingsSchema } from "@/domain/commerce/payment-settings";
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
    publicKey: z.string().trim().max(200).regex(/^(?:APP_USR-[a-zA-Z0-9-]+|TEST-[a-zA-Z0-9-]+)?$/).optional(),
    transparentEnabled: z.boolean().optional(),
    checkoutSettings: commercePaymentSettingsSchema.optional(),
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

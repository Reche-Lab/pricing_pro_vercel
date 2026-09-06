import { z } from "zod";
import { cookies } from "next/headers";
import { getPool } from "@/lib/db/client";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import {
  buyerContext,
  buyerCookieName,
  checkCommerceOrigin,
  commerceFailure,
  commerceJson,
  readCommerceBody,
  setBuyerCookie,
} from "@/services/commerce/http";
import {
  requestBuyerCode,
  verifyBuyerCode,
} from "@/services/commerce/buyer-auth";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("request"),
      email: z.string().trim().email().max(254),
      name: z.string().trim().min(2).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("verify"),
      challengeId: z.string().uuid(),
      code: z.string().regex(/^\d{6}$/),
    })
    .strict(),
  z.object({ action: z.literal("logout") }).strict(),
]);
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    checkCommerceOrigin(request);
    const { slug } = await params;
    const blocked = await enforcePublicRateLimit(request, "commerce", {
      action: "buyer.auth",
      limit: 12,
      windowSeconds: 600,
    });
    if (blocked) return blocked;
    const { store, session } = await buyerContext(slug, false, true);
    const input = await readCommerceBody(request, schema);
    if (input.action === "request")
      return commerceJson(
        await requestBuyerCode(
          store,
          session,
          input.email.toLowerCase(),
          input.name,
        ),
      );
    if (input.action === "verify") {
      await setBuyerCookie(
        store.tenant_id,
        await verifyBuyerCode(store, session, input.challengeId, input.code),
      );
      return commerceJson({ ok: true });
    }
    await getPool().query(
      "update commerce_sessions set expires_at=now() where tenant_id=$1 and id=$2",
      [store.tenant_id, session.id],
    );
    (await cookies()).delete(buyerCookieName(store.tenant_id));
    return commerceJson({ ok: true });
  } catch (error) {
    return commerceFailure(error, "buyer.auth");
  }
}

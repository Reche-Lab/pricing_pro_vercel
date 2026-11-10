import { timingSafeEqual } from "node:crypto";
import { commerceFailure, commerceJson } from "@/services/commerce/http";
import { CommerceError } from "@/domain/commerce/commerce";
import { processCommerceOlistQueue } from "@/services/commerce/olist-worker";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET ?? "";
    const received = request.headers.get("authorization") ?? "";
    const expected = `Bearer ${secret}`;
    if (secret.length < 32 || Buffer.byteLength(received) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) throw new CommerceError("Acesso não autorizado.", 401);
    const count = await processCommerceOlistQueue(undefined, 1);
    return commerceJson({ ok: true, processed: count });
  } catch (error) { return commerceFailure(error, "olist.cron"); }
}

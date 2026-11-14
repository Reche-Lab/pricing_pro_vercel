import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { getCommerceStore, findBuyerSession } from "@/repositories/commerce";
import { cookies } from "next/headers";
import { assistantConfig, assistantAudit, assistantLimits } from "@/repositories/commerce-assistant";
import { readAssistantDocument } from "@/services/commerce/assistant-documents";
import { buyerCookieName, commerceFailure } from "@/services/commerce/http";
import { CommerceError } from "@/domain/commerce/commerce";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; documentId: string }> }) {
  try {
    const { slug, documentId } = await params; z.string().uuid().parse(documentId);
    const store = await getCommerceStore(slug), config = store ? await assistantConfig(store.tenant_id) : null;
    if (!store || !config?.enabled) throw new CommerceError("Documento indisponível.", 404);
    if (!(await assistantLimits(store.tenant_id)).allowed) throw new CommerceError("Documento indisponível.", 404);
    const blocked = await enforcePublicRateLimit(request, store.tenant_id, { action: "assistant.document.read", limit: 15, windowSeconds: 600 }); if (blocked) return blocked;
    const doc = (await getPool().query("select id,visibility,storage_path,file_name from commerce_assistant_documents where tenant_id=$1 and id=$2 and active", [store.tenant_id, documentId])).rows[0];
    if (!doc) throw new CommerceError("Documento não encontrado.", 404);
    if (doc.visibility === "identified") {
      const session = await findBuyerSession(store.tenant_id, (await cookies()).get(buyerCookieName(store.tenant_id))?.value);
      if (!session?.customer_id) throw new CommerceError("Entre na sua conta da loja para baixar este documento.", 401);
    }
    const bytes = await readAssistantDocument(doc.storage_path);
    await assistantAudit(getPool(), store.tenant_id, null, "document.read", { documentId });
    return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${doc.file_name.replace(/[\r\n"\\]/g, "_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox", "x-robots-tag": "noindex, nofollow" } });
  } catch (error) { return commerceFailure(error, "assistant.document.read"); }
}

import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { CommerceError } from "@/domain/commerce/commerce";
import { requireCommerceAdmin, commerceFailure } from "@/services/commerce/http";
import { readAssistantDocument } from "@/services/commerce/assistant-documents";
export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { session } = await requireCommerceAdmin(), { documentId } = await params; z.string().uuid().parse(documentId);
    const row = (await getPool().query("select storage_path,file_name from commerce_assistant_documents where tenant_id=$1 and id=$2 and active", [session.tenantId, documentId])).rows[0];
    if (!row) throw new CommerceError("Documento não encontrado.", 404);
    return new Response(Buffer.from(await readAssistantDocument(row.storage_path)), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${row.file_name.replace(/[\r\n"\\]/g, "_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox" } });
  } catch (error) { return commerceFailure(error, "assistant.admin.document.read"); }
}

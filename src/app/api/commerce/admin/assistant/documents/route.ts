import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { CommerceError } from "@/domain/commerce/commerce";
import { assistantAudit, assistantDocuments } from "@/repositories/commerce-assistant";
import { uploadAssistantDocument, deleteAssistantDocumentObject } from "@/services/commerce/assistant-documents";
import { checkCommerceOrigin, requireCommerceAdmin, readCommerceBody, commerceJson, commerceFailure } from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { commerceTransaction } from "@/repositories/commerce";
export async function POST(request: Request) {
  try {
    checkCommerceOrigin(request); const { session } = await requireCommerceAdmin();
    const blocked = await enforcePublicRateLimit(request, session.tenantId, { action: "assistant.document.upload", limit: 10, windowSeconds: 600 }); if (blocked) return blocked;
    const input = await readCommerceBody(request, z.object({ label: z.string().trim().min(2).max(100), fileName: z.string().trim().min(1).max(150), visibility: z.enum(["public", "identified"]), approved: z.literal(true), base64: z.string().min(1).max(2796204).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).strict(), 2900000);
    if ((await assistantDocuments(session.tenantId)).length >= 20) throw new CommerceError("Remova um documento antes de acrescentar outro. Limite: 20 arquivos.");
    const id = randomUUID(), path = `${session.tenantId}/${id}.pdf`, size = await uploadAssistantDocument(path, input.base64);
    try {
      await commerceTransaction(async client => {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1::text,32789))", [session.tenantId]);
        const count = (await client.query("select count(*)::int as count from commerce_assistant_documents where tenant_id=$1 and active", [session.tenantId])).rows[0].count;
        if (count >= 20) throw new CommerceError("Limite de 20 documentos ativos atingido. Remova um antes de acrescentar outro.", 409);
        await client.query("insert into commerce_assistant_documents(id,tenant_id,label,file_name,storage_path,file_size,visibility,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)", [id, session.tenantId, input.label, input.fileName.replace(/[\r\n"/\\]/g, "_").replace(/[^\w.()\- ]/g, "_").slice(0, 120), path, size, input.visibility, session.userId]);
        await assistantAudit(client, session.tenantId, session.userId, "document.upload", { documentId: id, visibility: input.visibility });
      });
    } catch (error) { await deleteAssistantDocumentObject(path).catch(() => {}); throw error; }
    return commerceJson({ documents: await assistantDocuments(session.tenantId, true), message: "Documento oficial salvo. Apenas arquivos aprovados pelo administrador são compartilhados." });
  } catch (error) { return commerceFailure(error, "assistant.document.upload"); }
}
export async function DELETE(request: Request) {
  try {
    checkCommerceOrigin(request); const { session } = await requireCommerceAdmin();
    const { id, confirmation } = await readCommerceBody(request, z.object({ id: z.string().uuid(), confirmation: z.literal("EXCLUIR") }).strict());
    if (!confirmation) throw new CommerceError("Confirme a exclusão.");
    const row = (await getPool().query("update commerce_assistant_documents set active=false where tenant_id=$1 and id=$2 returning storage_path", [session.tenantId, id])).rows[0];
    if (!row) throw new CommerceError("Documento não encontrado.", 404);
    await deleteAssistantDocumentObject(row.storage_path);
    await getPool().query("delete from commerce_assistant_documents where tenant_id=$1 and id=$2", [session.tenantId, id]);
    await assistantAudit(getPool(), session.tenantId, session.userId, "document.delete", { documentId: id });
    return commerceJson({ documents: await assistantDocuments(session.tenantId, true), message: "Documento removido." });
  } catch (error) { return commerceFailure(error, "assistant.document.delete"); }
}

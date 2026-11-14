import { PDFDocument } from "pdf-lib";
import { getServerEnv } from "@/lib/env/server";
import { CommerceError } from "@/domain/commerce/commerce";
const bucket = "commerce-assistant-documents";
function storage(path: string) {
  const env = getServerEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new CommerceError("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para os documentos privados.", 503);
  return { url: `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } };
}
export async function uploadAssistantDocument(path: string, base64: string) {
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 2097152 || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new CommerceError("Envie um PDF de até 2 MB.");
  try { const pdf = await PDFDocument.load(bytes); if (pdf.getPageCount() > 20 || !pdf.getPageCount()) throw new Error(); }
  catch { throw new CommerceError("PDF inválido, protegido ou com mais de 20 páginas."); }
  const target = storage(path);
  const response = await fetch(target.url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(12000), headers: { ...target.headers, "content-type": "application/pdf", "x-upsert": "false" }, body: bytes });
  if (!response.ok) throw new CommerceError("Não foi possível salvar o documento privado. Confira o bucket commerce-assistant-documents e a configuração do Supabase.", 503);
  return bytes.length;
}
export async function readAssistantDocument(path: string) {
  const target = storage(path);
  const response = await fetch(target.url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000), headers: target.headers });
  if (!response.ok || Number(response.headers.get("content-length")) > 2097152) throw new CommerceError("Documento indisponível. Fale com a equipe da loja.", 404);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 2097152) throw new CommerceError("Documento fora do limite.", 413);
  return bytes;
}
export async function deleteAssistantDocumentObject(path: string) {
  const target = storage(path);
  const response = await fetch(target.url, { method: "DELETE", redirect: "error", signal: AbortSignal.timeout(12000), headers: target.headers });
  if (!response.ok && response.status !== 404) throw new CommerceError("Não foi possível remover o arquivo do Storage. Ele já está indisponível para clientes; tente excluir novamente.", 503);
}

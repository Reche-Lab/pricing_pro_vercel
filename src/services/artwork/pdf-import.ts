import { PDFDocument } from "pdf-lib";
import { MAX_ARTWORK_PDF_BYTES, MAX_ARTWORK_PDF_PAGES } from "@/domain/artwork/pdf-import";
import { decodeDataUrl } from "@/services/storage/artwork-storage";

export async function validateArtworkPdf(input: { dataUrl: string; declaredSize: number; declaredPageCount: number }) {
  const decoded = decodeDataUrl(input.dataUrl);
  if (decoded.contentType !== "application/pdf") throw new Error("O arquivo enviado não é um PDF válido.");
  if (decoded.bytes.length !== input.declaredSize || decoded.bytes.length > MAX_ARTWORK_PDF_BYTES) throw new Error("O PDF deve ter no máximo 4 MB.");
  if (String.fromCharCode(...decoded.bytes.slice(0, 5)) !== "%PDF-") throw new Error("O conteúdo enviado não possui uma assinatura PDF válida.");
  let pdf: PDFDocument;
  try { pdf = await PDFDocument.load(decoded.bytes, { ignoreEncryption: false, updateMetadata: false }); }
  catch { throw new Error("O PDF está protegido, corrompido ou não pode ser processado."); }
  const pageCount = pdf.getPageCount();
  if (pageCount < 1 || pageCount > MAX_ARTWORK_PDF_PAGES || pageCount !== input.declaredPageCount) throw new Error("A quantidade de páginas declarada não corresponde ao PDF ou excede 100 páginas.");
  return { bytes: decoded.bytes, pageCount };
}

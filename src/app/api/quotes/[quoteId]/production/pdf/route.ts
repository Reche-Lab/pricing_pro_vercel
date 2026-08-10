import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getArtworkProductionData, recordArtworkPrintJob, resolveArtworkDiameterMm } from "@/repositories/artwork-production";
import { generatePrintPdf, resolveArtworkProductionQuantities } from "@/services/artwork/imposition";
import { resolveDrawCutLines } from "@/services/artwork/production";
import { loadArtworkDataUrl, uploadArtworkObject } from "@/services/storage/artwork-storage";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const quoteId = z.string().uuid().safeParse((await context.params).quoteId);
  if (!quoteId.success) return NextResponse.json({ ok: false, error: "Orçamento inválido." }, { status: 400 });
  try {
    const production = await getArtworkProductionData(session.userId, session.tenantId, quoteId.data);
    if (!production) return NextResponse.json({ ok: false, error: "Orçamento não encontrado." }, { status: 404 });
    const approved = production.artworks.filter((artwork) => artwork.approval_status === "approved" && (artwork.prepared_data_url || artwork.prepared_storage_path));
    const coveredItems = new Set(approved.map((artwork) => artwork.quote_item_id));
    if (production.items.some((item) => !coveredItems.has(item.id))) {
      throw new Error("Prepare e aprove uma arte para cada item do orçamento.");
    }
    const quantities = resolveArtworkProductionQuantities(production.items, approved);
    const printArtworks = await Promise.all(approved.map(async (artwork) => {
      const diameterMm = resolveArtworkDiameterMm(artwork);
      if (!diameterMm) throw new Error(`Defina o diâmetro de impressão de ${artwork.item_description}.`);
      return {
        id: artwork.id,
        label: artwork.artwork_name || artwork.file_name,
        quantity: quantities.get(artwork.id) ?? 0,
        diameterMm,
        preparedDataUrl: await loadArtworkDataUrl(artwork.prepared_data_url, artwork.prepared_storage_path)
      };
    }));
    const searchParams = new URL(request.url).searchParams;
    const effectiveProfile = {
      ...production.profile,
      drawCutLines: resolveDrawCutLines(production.profile.drawCutLines, searchParams.get("cutLines"))
    };
    const { bytes, plan } = await generatePrintPdf(printArtworks, effectiveProfile);
    const preview = searchParams.get("preview") === "1";
    if (!preview) {
      const storagePath = await uploadArtworkObject({
        path: `${session.tenantId}/quotes/${quoteId.data}/print-jobs/producao-${Date.now()}.pdf`,
        contentType: "application/pdf",
        bytes
      });
      await recordArtworkPrintJob({
        userId: session.userId,
        tenantId: session.tenantId,
        quoteId: quoteId.data,
        pageCount: plan.pageCount,
        copyCount: plan.copyCount,
        profile: effectiveProfile,
        artworks: printArtworks.map((artwork) => ({ id: artwork.id, quantity: artwork.quantity, diameterMm: artwork.diameterMm })),
        storagePath
      });
    }
    console.info("Artwork production PDF generated.", { quoteId: quoteId.data, pageCount: plan.pageCount, copyCount: plan.copyCount, drawCutLines: effectiveProfile.drawCutLines });
    return new NextResponse(Buffer.from(bytes), {
      headers: { "content-type": "application/pdf", "content-disposition": `${preview ? "inline" : "attachment"}; filename="producao-${quoteId.data.slice(0, 8)}.pdf"`, "x-production-pages": String(plan.pageCount), "x-production-copies": String(plan.copyCount), "x-production-cut-lines": effectiveProfile.drawCutLines ? "1" : "0" }
    });
  } catch (error) {
    console.error("Artwork production PDF failed.", { quoteId: quoteId.data, message: error instanceof Error ? error.message : "Erro desconhecido" });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível gerar o PDF." }, { status: 422 });
  }
}

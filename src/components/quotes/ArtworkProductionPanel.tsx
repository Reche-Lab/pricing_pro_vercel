"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Download, Eye, FileText, ImageIcon, Paintbrush, Printer, Scissors, Upload, WandSparkles, X } from "lucide-react";
import { ArtworkCropEditor } from "@/components/quotes/ArtworkCropEditor";
import { ArtworkPdfPreview } from "@/components/quotes/ArtworkPdfPreview";
import { ArtworkRetouchEditor, type RetouchedArtworkFile } from "@/components/quotes/ArtworkRetouchEditor";
import { PdfArtworkImportModal } from "@/components/quotes/PdfArtworkImportModal";
import { getArtworkAiAttemptsRemaining, normalizeArtworkAiGenerationLimit } from "@/domain/artwork/ai-generation-limit";
import { geometryLabel, resolvePrintGeometry, resolvePrintMargins, type PrintGeometry } from "@/domain/artwork/geometry";
import { sortActiveArtworkVersions } from "@/domain/artwork/versions";
import type { QuoteItemArtworkRow, QuoteItemRow } from "@/repositories/quotes";

type ArtworkEntry = { item: QuoteItemRow; artwork: QuoteItemArtworkRow };

export function ArtworkProductionPanel({ quoteId, items, readOnly = false }: { quoteId: string; items: QuoteItemRow[]; readOnly?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [brief, setBrief] = useState("");
  const [aiItemId, setAiItemId] = useState(items[0]?.id ?? "");
  const [aiReferenceArtworkId, setAiReferenceArtworkId] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [editing, setEditing] = useState<ArtworkEntry | null>(null);
  const [retouching, setRetouching] = useState<ArtworkEntry | null>(null);
  const [pdfImportItem, setPdfImportItem] = useState<QuoteItemRow | null>(null);
  const [versionPreview, setVersionPreview] = useState<{ active: ArtworkEntry; previous: ArtworkEntry } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [drawCutLines, setDrawCutLines] = useState(true);
  const printProfileLoaded = useRef(false);
  const allArtworks = useMemo(() => items.flatMap((item) => (item.artworks ?? []).map((artwork) => ({ item, artwork }))), [items]);
  const artworks = useMemo(() => sortActiveArtworkEntries(allArtworks), [allArtworks]);
  const aiItem = items.find((item) => item.id === aiItemId) ?? items[0];
  const aiItemArtworks = artworks.filter((entry) => entry.item.id === aiItem?.id);
  const aiReference = aiItemArtworks.find((entry) => entry.artwork.id === aiReferenceArtworkId) ?? null;
  const aiGenerationLimit = normalizeArtworkAiGenerationLimit(aiItem?.artwork_ai_generation_limit);
  const aiAttemptsRemaining = getArtworkAiAttemptsRemaining(aiItem?.artwork_ai_attempts, aiGenerationLimit);
  const [quantities, setQuantities] = useState<Record<string, number>>(() => initialQuantities(items));

  useEffect(() => setQuantities(initialQuantities(items)), [items]);
  const approvedCount = artworks.filter(({ artwork }) => artwork.approval_status === "approved").length;
  const allocation = items.map((item) => {
    const approved = artworks.filter((entry) => entry.item.id === item.id && entry.artwork.approval_status === "approved");
    return { itemId: item.id, expected: item.quantity, allocated: approved.reduce((sum, entry) => sum + (quantities[entry.artwork.id] || 0), 0), approved: approved.length };
  });
  const readyToPrint = allocation.length > 0 && allocation.every((entry) => entry.approved > 0 && entry.allocated === entry.expected);

  async function runAction(key: string, url: string, body: unknown) {
    setBusy(key); setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível concluir a operação.");
      setMessage("Operação concluída.");
      router.refresh();
      return data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
      return null;
    } finally { setBusy(""); }
  }

  async function loadProduction() {
    const response = await fetch(`/api/quotes/${quoteId}/production`, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (response.ok) {
      setPrintJobs(data?.printJobs ?? []);
      if (!printProfileLoaded.current && typeof data?.profile?.drawCutLines === "boolean") {
        setDrawCutLines(data.profile.drawCutLines);
        printProfileLoaded.current = true;
      }
    }
  }

  async function downloadPdf() {
    setBusy("pdf-download"); setMessage("");
    try {
      const response = await fetch(`/api/quotes/${quoteId}/production/pdf?cutLines=${drawCutLines ? "1" : "0"}`);
      if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.error ?? "Não foi possível gerar o PDF."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `producao-${quoteId.slice(0, 8)}.pdf`; link.click(); URL.revokeObjectURL(url);
      setMessage(`PDF gerado: ${response.headers.get("x-production-pages") ?? "-"} página(s), ${response.headers.get("x-production-copies") ?? "-"} cópias.`);
      await loadProduction();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível gerar o PDF."); }
    finally { setBusy(""); }
  }

  async function markPrinted(jobId: string) {
    setBusy(`printed-${jobId}`);
    const response = await fetch(`/api/quotes/${quoteId}/production/jobs/${jobId}`, { method: "PATCH" });
    const data = await response.json().catch(() => null);
    setMessage(response.ok ? "Lote marcado como impresso." : data?.error ?? "Não foi possível atualizar o lote.");
    setBusy(""); await loadProduction();
  }

  async function approve(entry: ArtworkEntry, status: "approved" | "rejected") {
    if (readOnly) return;
    await runAction(`approval-${entry.artwork.id}`, `/api/quotes/${quoteId}/items/${entry.item.id}/artworks/${entry.artwork.id}/approval`, {
      status,
      productionQuantity: quantities[entry.artwork.id] || entry.item.quantity
    });
  }

  async function requestAi(action: "suggest" | "generate") {
    const item = aiItem;
    const reference = aiReference;
    if (!item || brief.trim().length < 10) { setMessage("Selecione um item e descreva o pedido em pelo menos 10 caracteres."); return; }
    const geometry = reference ? inferGeometry(item, reference.artwork) : resolvePrintGeometry(item);
    const data = await runAction(`ai-${action}`, `/api/quotes/${quoteId}/items/${item.id}/artworks/ai`, { action, brief, artworkId: reference?.artwork.id, geometry, product: item.description });
    if (!data && action === "generate") router.refresh();
    if (data?.suggestions) {
      setSuggestions(data.suggestions);
      setMessage(reference ? "Sugestões criadas com base na arte selecionada." : "Sugestões criadas a partir do briefing.");
    }
    if (data?.artwork?.id) {
      setAiReferenceArtworkId(data.artwork.id);
      setSuggestions(null);
      setMessage("Nova versão criada sem alterar a arte original. Ela já está selecionada para o próximo refinamento.");
    }
  }

  async function uploadAiReference(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !aiItem) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setMessage("Use uma imagem PNG, JPEG ou WebP com até 3 MB.");
      return;
    }
    setBusy("ai-upload");
    setMessage("");
    try {
      const dataUrl = await fileToDataUrl(file);
      const response = await fetch(`/api/quotes/${quoteId}/items/${aiItem.id}/artworks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artworkName: "Referência do assistente",
          artworkFile: { fileName: file.name, mimeType: file.type, fileSize: file.size, dataUrl }
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível enviar a imagem de referência.");
      setAiReferenceArtworkId(data.artwork.id);
      setSuggestions(null);
      setMessage("Imagem enviada e selecionada como base. Descreva abaixo o que deve ser alterado.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar a imagem de referência.");
    } finally {
      setBusy("");
    }
  }

  async function saveRetouchedArtwork(file: RetouchedArtworkFile) {
    if (!retouching) return;
    const response = await fetch(`/api/quotes/${quoteId}/items/${retouching.item.id}/artworks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        artworkName: `${retouching.artwork.artwork_name || retouching.artwork.file_name} · retoque`,
        sourceKind: "retouch",
        parentArtworkId: retouching.artwork.id,
        productionQuantity: quantities[retouching.artwork.id] || retouching.artwork.production_quantity || retouching.item.quantity,
        artworkFile: file
      })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? "Não foi possível salvar a versão retocada.");
    setRetouching(null);
    setMessage("Retoque salvo como versão ativa. A original permanece disponível no histórico para consulta ou restauração.");
    router.refresh();
  }

  async function restorePreviousVersion() {
    if (!versionPreview) return;
    setBusy(`restore-${versionPreview.active.artwork.id}`); setMessage("");
    const response = await fetch(`/api/quotes/${quoteId}/items/${versionPreview.active.item.id}/artworks/${versionPreview.active.artwork.id}/restore`, { method: "POST" });
    const data = await response.json().catch(() => null); setBusy("");
    if (!response.ok) { setMessage(data?.error ?? "Não foi possível restaurar a arte original."); return; }
    setVersionPreview(null); setMessage("Arte original restaurada. A versão retocada foi descartada."); router.refresh();
  }

  return (
    <section className="border-t border-zinc-800 bg-zinc-950/30">
      <button className="focus-ring flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-zinc-900/60" type="button" onClick={() => { const next = !open; setOpen(next); if (next) void loadProduction(); }}>
        <span className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cyan-400/10 text-cyan-300"><Printer size={17} /></span><span><span className="block text-sm font-semibold text-white">Produção de artes</span><span className="block text-xs text-zinc-500">{artworks.length ? `${approvedCount} arte(s) aprovada(s) · ${readyToPrint ? "pronto para montar" : "distribuição pendente"}` : "Nenhuma arte anexada"}</span></span></span>
        {open ? <ChevronUp className="text-zinc-500" size={17} /> : <ChevronDown className="text-zinc-500" size={17} />}
      </button>

      {open ? <div className="grid gap-4 border-t border-zinc-800 p-4">
        {items.map((item) => {
          const itemArtworks = artworks.filter((entry) => entry.item.id === item.id);
          const itemAllocation = allocation.find((entry) => entry.itemId === item.id);
          return <section className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/70" key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2"><div><p className="text-sm font-medium text-white">{item.description}</p><p className="text-xs text-zinc-500">Pedido: {item.quantity} unidades</p></div><div className="flex flex-wrap items-center gap-2">{!readOnly ? <button className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan-700/70 px-2.5 text-xs font-medium text-cyan-200 hover:bg-cyan-950/50" type="button" onClick={() => setPdfImportItem(item)}><FileText size={13} /> Importar PDF</button> : null}<span className={`rounded px-2 py-1 text-xs ${itemAllocation?.allocated === item.quantity && itemAllocation.approved ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{itemAllocation?.allocated ?? 0} de {item.quantity} distribuídas</span></div></div>
            <div className="grid gap-3 p-3">
              {itemArtworks.length === 0 ? <p className="text-sm text-zinc-500">Adicione uma imagem pelo botão Editar ou gere uma nova arte com o assistente.</p> : itemArtworks.map((entry) => { const previous = entry.artwork.parent_artwork_id ? allArtworks.find((candidate) => candidate.artwork.id === entry.artwork.parent_artwork_id) ?? null : null; const original = findOriginalEntry(entry, allArtworks); return <ArtworkRow
                busy={busy}
                geometry={inferGeometry(item, entry.artwork)}
                entry={entry}
                key={entry.artwork.id}
                quantity={quantities[entry.artwork.id] || 1}
                quoteId={quoteId}
                onApprove={approve}
                onEdit={setEditing}
                onRetouch={setRetouching}
                original={original.artwork.id === entry.artwork.id ? null : original}
                previous={previous}
                onVersionPreview={(previous) => setVersionPreview({ active: entry, previous })}
                onQuantity={(quantity) => setQuantities((current) => ({ ...current, [entry.artwork.id]: quantity }))}
                readOnly={readOnly}
              />; })}
            </div>
          </section>;
        })}

        {items.length && !readOnly ? <details className="overflow-hidden rounded-md border border-violet-900/60 bg-violet-950/20">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-violet-100 hover:bg-violet-950/30"><span className="inline-flex items-center gap-2"><WandSparkles size={15} /> Assistente criativo via OpenRouter</span></summary>
          <div className="grid gap-4 border-t border-violet-900/40 p-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <label><span className="mb-1 block text-xs font-medium text-zinc-400">1. Produto que receberá a arte</span><select className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" value={aiItemId} onChange={(event) => { setAiItemId(event.target.value); setAiReferenceArtworkId(""); setSuggestions(null); }}>{items.map((item) => <option key={item.id} value={item.id}>{item.description} · {item.quantity} un.</option>)}</select></label>
              <label><span className="mb-1 block text-xs font-medium text-zinc-400">2. Arte usada como base</span><select className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" value={aiReferenceArtworkId} onChange={(event) => { setAiReferenceArtworkId(event.target.value); setSuggestions(null); }}><option value="">Criar do zero, sem imagem de referência</option>{aiItemArtworks.map(({ artwork }) => <option key={artwork.id} value={artwork.id}>{artwork.artwork_name || artwork.file_name}{artwork.source_kind === "openrouter" ? " · versão criada por IA" : ""}</option>)}</select></label>
            </div>

            <div className={`rounded-md border px-3 py-2 text-xs ${aiAttemptsRemaining ? "border-violet-900/60 bg-violet-950/30 text-violet-200" : "border-amber-900/60 bg-amber-950/30 text-amber-200"}`}><div className="flex flex-wrap items-center justify-between gap-2"><span>Limite de geração deste produto</span><strong>{aiGenerationLimit === 0 ? "Geração por IA desativada" : `${aiAttemptsRemaining} de ${aiGenerationLimit} gerações restantes`}</strong></div><p className="mt-1 text-[11px] opacity-75">Sugestões, uploads e reenquadramentos não consomem tentativas.</p></div>

            <div className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-950/70 p-3 sm:grid-cols-[96px_minmax(0,1fr)]">
              {aiReference ? <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={aiReference.artwork.artwork_name || aiReference.artwork.file_name} className="h-24 w-24 rounded-md border border-zinc-700 object-cover" src={artworkImageUrl(quoteId, aiReference, "original")} />
                <div className="min-w-0 self-center"><p className="break-words text-sm font-medium text-white">{aiReference.artwork.artwork_name || aiReference.artwork.file_name}</p><p className="mt-1 text-xs leading-5 text-zinc-400">Esta imagem será usada como base. O assistente preservará o que não for solicitado e criará uma versão separada.</p><p className="mt-1 text-[11px] text-violet-300">{aiReference.artwork.source_kind === "openrouter" ? "Versão gerada anteriormente, pronta para novo refinamento." : "Arquivo original selecionado como referência."}</p></div>
              </> : <div className="sm:col-span-2"><p className="text-sm font-medium text-zinc-200">Sem imagem de referência</p><p className="mt-1 text-xs leading-5 text-zinc-500">O assistente criará uma arte nova somente a partir da descrição. Você também pode enviar uma imagem para melhorar ou alterar.</p></div>}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-md border border-violet-800 px-3 py-2 text-xs font-medium text-violet-200 hover:bg-violet-950/50"><Upload size={14} /> {busy === "ai-upload" ? "Enviando..." : "Enviar imagem como base"}<input accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={Boolean(busy)} type="file" onChange={uploadAiReference} /></label>
              <p className="text-xs text-zinc-500">PNG, JPEG ou WebP, até 3 MB. O arquivo também ficará salvo nas artes deste item.</p>
            </div>

            <label><span className="mb-1 block text-xs font-medium text-zinc-400">3. O que você deseja criar ou alterar?</span><textarea className="focus-ring min-h-28 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-6 text-white" maxLength={3000} placeholder={aiReference ? "Ex.: mantenha o logotipo e a composição; troque o fundo por azul, aumente o título e remova o telefone..." : "Descreva tema, texto, cores, público e referências do cliente..."} value={brief} onChange={(event) => setBrief(event.target.value)} /></label>
            <div className="flex flex-wrap gap-2"><button className="focus-ring rounded-md border border-violet-700 px-3 py-2 text-xs font-medium text-violet-200 hover:bg-violet-950 disabled:opacity-50" disabled={Boolean(busy)} type="button" onClick={() => requestAi("suggest")}>{busy === "ai-suggest" ? "Analisando..." : aiReference ? "Sugerir melhorias" : "Sugerir direção"}</button><button className="focus-ring rounded-md bg-violet-400 px-3 py-2 text-xs font-semibold text-violet-950 hover:bg-violet-300 disabled:opacity-50" disabled={Boolean(busy) || aiAttemptsRemaining === 0} type="button" onClick={() => requestAi("generate")}>{busy === "ai-generate" ? "Gerando..." : aiAttemptsRemaining === 0 ? "Limite de gerações atingido" : aiReference ? "Gerar alteração como nova versão" : "Gerar nova arte"}</button></div>
            {suggestions ? <SuggestionResult suggestions={suggestions} /> : null}
          </div>
        </details> : null}

        {printJobs.length ? <details className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3"><summary className="cursor-pointer text-sm font-medium text-zinc-300">Histórico de produção · {printJobs.length} lote(s)</summary><div className="mt-3 grid gap-2">{printJobs.map((job) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs" key={job.id}><div><p className="font-medium text-zinc-200">{job.page_count} página(s) · {job.copy_count} cópias</p><p className="text-zinc-500">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(job.created_at))}</p></div>{job.status === "printed" ? <span className="inline-flex items-center gap-1 rounded bg-emerald-400/10 px-2 py-1 text-emerald-300"><Check size={13} /> Impresso</span> : <button className="focus-ring rounded-md border border-zinc-700 px-3 py-2 text-zinc-300 hover:bg-zinc-900 disabled:opacity-50" disabled={Boolean(busy)} type="button" onClick={() => markPrinted(job.id)}>Marcar como impresso</button>}</div>)}</div></details> : null}
        {message ? <p className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">{message}</p> : null}
        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-zinc-800 pt-4"><div><p className="text-xs text-zinc-500">A soma das artes aprovadas deve corresponder à quantidade de cada item.</p><button aria-pressed={drawCutLines} className={`focus-ring mt-3 inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors ${drawCutLines ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200" : "border-zinc-700 bg-zinc-950 text-zinc-400 hover:bg-zinc-900"}`} type="button" onClick={() => setDrawCutLines((current) => !current)}><Scissors size={14} /> Linhas de corte <span className={`rounded px-1.5 py-0.5 text-[10px] ${drawCutLines ? "bg-cyan-400 text-cyan-950" : "bg-zinc-800 text-zinc-400"}`}>{drawCutLines ? "Incluídas" : "Removidas"}</span></button></div><div className="flex flex-wrap gap-2"><button className={`focus-ring inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${readyToPrint ? "border-zinc-700 text-zinc-200 hover:bg-zinc-900" : "cursor-not-allowed border-zinc-800 text-zinc-600"}`} disabled={!readyToPrint} type="button" onClick={() => setPreviewOpen(true)}><Eye size={16} /> Visualizar folhas</button><button className={`focus-ring inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${readyToPrint ? "bg-amber-400 text-zinc-950 hover:bg-amber-300" : "cursor-not-allowed bg-zinc-800 text-zinc-500"}`} disabled={!readyToPrint || Boolean(busy)} type="button" onClick={downloadPdf}><Download size={16} /> {busy === "pdf-download" ? "Gerando..." : "Baixar PDF"}</button></div></div>
      </div> : null}

      {editing && inferGeometry(editing.item, editing.artwork) ? <ArtworkCropEditor artwork={editing.artwork} geometry={inferGeometry(editing.item, editing.artwork) as PrintGeometry} {...inferMargins(editing.item, editing.artwork)} imageUrl={artworkImageUrl(quoteId, editing, "original")} itemId={editing.item.id} quoteId={quoteId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setMessage("Arte preparada. Confira a qualidade e aprove a versão."); router.refresh(); }} /> : null}
      {retouching ? <ArtworkRetouchEditor
        artworkName={retouching.artwork.artwork_name || retouching.artwork.file_name}
        bleedMm={inferMargins(retouching.item, retouching.artwork).bleedMm}
        draftUrl={`/api/quotes/${quoteId}/items/${retouching.item.id}/artworks/${retouching.artwork.id}/retouch-draft`}
        fileName={retouching.artwork.file_name}
        geometry={inferGeometry(retouching.item, retouching.artwork)}
        imageUrl={artworkImageUrl(quoteId, retouching, "original")}
        safeMarginMm={inferMargins(retouching.item, retouching.artwork).safeMarginMm}
        onClose={() => setRetouching(null)}
        onSave={saveRetouchedArtwork}
      /> : null}
      {previewOpen ? <ArtworkPdfPreview drawCutLines={drawCutLines} quoteId={quoteId} onClose={() => setPreviewOpen(false)} /> : null}
      {pdfImportItem ? <PdfArtworkImportModal importBaseUrl={`/api/quotes/${quoteId}/items/${pdfImportItem.id}/artworks/pdf-imports`} itemDescription={pdfImportItem.description} itemQuantity={pdfImportItem.quantity} onClose={() => setPdfImportItem(null)} onImported={(count) => { setPdfImportItem(null); setMessage(`${count} arte(s) importada(s) do PDF. Agora você pode reenquadrar e aprovar cada versão.`); router.refresh(); }} /> : null}
      {versionPreview ? <ArtworkVersionModal active={versionPreview.active} previous={versionPreview.previous} busy={busy === `restore-${versionPreview.active.artwork.id}`} quoteId={quoteId} readOnly={readOnly} onClose={() => setVersionPreview(null)} onRestore={restorePreviousVersion} /> : null}
    </section>
  );
}

function ArtworkRow({ entry, quoteId, geometry, quantity, busy, readOnly, original, previous, onQuantity, onEdit, onRetouch, onVersionPreview, onApprove }: { entry: ArtworkEntry; quoteId: string; geometry: PrintGeometry | null; quantity: number; busy: string; readOnly: boolean; original: ArtworkEntry | null; previous: ArtworkEntry | null; onQuantity: (quantity: number) => void; onEdit: (entry: ArtworkEntry) => void; onRetouch: (entry: ArtworkEntry) => void; onVersionPreview: (previous: ArtworkEntry) => void; onApprove: (entry: ArtworkEntry, status: "approved" | "rejected") => void }) {
  const prepared = Boolean(entry.artwork.prepared_data_url || entry.artwork.prepared_storage_path);
  const approved = entry.artwork.approval_status === "approved";
  const margins = inferMargins(entry.item, entry.artwork);
  return <article className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/40">
    <div className="flex min-w-0 items-start gap-3 p-3 sm:gap-4 sm:p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={entry.artwork.artwork_name ?? entry.artwork.file_name} className="h-16 w-16 shrink-0 rounded-md border border-zinc-700 bg-white object-contain sm:h-20 sm:w-20" src={artworkImageUrl(quoteId, entry, prepared ? "prepared" : "original")} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 break-words text-sm font-semibold leading-5 text-white">{entry.artwork.artwork_name || entry.artwork.file_name}</p>
          <span className={`shrink-0 rounded px-2 py-1 text-[11px] font-medium ${approved ? "bg-emerald-400/10 text-emerald-300" : prepared ? "bg-cyan-400/10 text-cyan-200" : "bg-zinc-800 text-zinc-400"}`}>{approved ? "Aprovada" : prepared ? "Preparada" : "Pendente"}</span>
        </div>
        {entry.artwork.artwork_name ? <p className="mt-1 break-all text-[11px] text-zinc-600">{entry.artwork.file_name}</p> : null}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>{geometry ? geometryLabel(geometry) : "Geometria pendente"}</span>
          <span>Sangria {formatMm(margins.bleedMm)} · segurança {formatMm(margins.safeMarginMm)}</span>
          <span>{entry.artwork.source_kind === "openrouter" ? "Gerada por IA" : entry.artwork.source_kind === "retouch" ? "Retoque manual" : entry.artwork.source_kind === "pdf_page" ? `Página ${entry.artwork.source_pdf_page ?? "-"} do PDF` : "Arquivo enviado"}</span>
          {entry.artwork.dpi ? <span>{entry.artwork.dpi} DPI</span> : null}
        </div>
        <p className={`mt-2 break-words text-xs leading-5 ${entry.artwork.quality_status === "warning" ? "text-amber-300" : prepared ? "text-emerald-300" : "text-zinc-500"}`}>{entry.artwork.preparation_notes || "Aguardando enquadramento e preparação técnica."}</p>
      </div>
    </div>

    <div className="grid gap-3 border-t border-zinc-800 bg-zinc-950/50 p-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
      <label className="w-full sm:w-36 sm:shrink-0"><span className="mb-1 block text-xs font-medium text-zinc-400">Cópias desta arte</span><input className="focus-ring h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm tabular-nums disabled:opacity-50" disabled={readOnly} min="1" type="number" value={quantity} onChange={(event) => onQuantity(Math.max(1, Number(event.target.value) || 1))} /></label>
      <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2">
        <ArtworkDownloadMenu entry={entry} original={original} prepared={prepared} quoteId={quoteId} />
        {previous ? <button className="focus-ring inline-flex h-9 flex-1 basis-[130px] items-center justify-center gap-2 rounded-md border border-violet-800/70 px-3 text-xs text-violet-200 hover:bg-violet-950/50" type="button" onClick={() => onVersionPreview(previous)}><Eye size={14} /> Ver original</button> : null}
        <button className="focus-ring inline-flex h-9 flex-1 basis-[110px] items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-50" disabled={readOnly || Boolean(busy)} type="button" onClick={() => onRetouch(entry)}><Paintbrush size={14} /> Retocar</button>
        <button className="focus-ring inline-flex h-9 flex-1 basis-[130px] items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-50" disabled={readOnly || !geometry || Boolean(busy)} type="button" onClick={() => onEdit(entry)}><ImageIcon size={14} /> {prepared ? "Reenquadrar" : "Enquadrar"}</button>
        {approved ? <>
          <button className="focus-ring inline-flex h-9 flex-1 basis-[110px] items-center justify-center gap-2 rounded-md bg-emerald-400/15 px-3 text-xs font-medium text-emerald-200 disabled:opacity-50" disabled={readOnly || Boolean(busy)} type="button" onClick={() => onApprove(entry, "approved")}><Check size={14} /> Atualizar</button>
          <button className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md border border-zinc-700 text-zinc-400 hover:border-red-900 hover:text-red-300 disabled:opacity-50" disabled={readOnly} title="Remover aprovação" type="button" onClick={() => onApprove(entry, "rejected")}><X size={14} /></button>
        </> : <button className="focus-ring inline-flex h-9 flex-1 basis-[110px] items-center justify-center gap-2 rounded-md bg-cyan-400 px-3 text-xs font-medium text-cyan-950 disabled:opacity-50" disabled={readOnly || !prepared || Boolean(busy)} type="button" onClick={() => onApprove(entry, "approved")}><Check size={14} /> Aprovar</button>}
      </div>
    </div>
  </article>;
}

function ArtworkVersionModal({ active, previous, quoteId, busy, readOnly, onClose, onRestore }: { active: ArtworkEntry; previous: ArtworkEntry; quoteId: string; busy: boolean; readOnly: boolean; onClose: () => void; onRestore: () => void }) {
  return <div className="fixed inset-0 z-[110] grid place-items-center overflow-hidden bg-black/80 p-0 backdrop-blur-sm sm:p-3" role="dialog" aria-modal="true"><div className="flex h-dvh w-full max-w-4xl flex-col overflow-hidden border border-violet-400/25 bg-zinc-950 shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-lg"><header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4"><div className="min-w-0"><p className="text-base font-semibold text-white">Histórico da arte</p><p className="mt-1 text-xs text-zinc-400">A versão retocada está ativa. A original está guardada somente para consulta e restauração.</p></div><button className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-800" type="button" onClick={onClose}><X size={18} /></button></header><div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 sm:p-5 md:grid-cols-2"><VersionImage entry={active} label="Versão ativa" quoteId={quoteId} /><VersionImage entry={previous} label="Versão original" quoteId={quoteId} /></div><footer className="grid shrink-0 gap-3 border-t border-zinc-800 bg-zinc-900/40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:px-5 sm:py-4"><p className="max-w-xl text-xs leading-5 text-zinc-500">Restaurar excluirá a versão retocada e reativará esta versão original, incluindo seu enquadramento e aprovação anteriores.</p><div className="grid grid-cols-2 gap-2 sm:flex"><button className="focus-ring min-h-10 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 sm:px-4" type="button" onClick={onClose}>Manter retoque</button><button className="focus-ring min-h-10 rounded-md bg-amber-400 px-3 py-2 text-center text-sm font-semibold text-zinc-950 disabled:opacity-40 sm:px-4" disabled={readOnly || busy} type="button" onClick={onRestore}>{busy ? "Restaurando..." : "Descartar e restaurar"}</button></div></footer></div></div>;
}

function VersionImage({ entry, label, quoteId }: { entry: ArtworkEntry; label: string; quoteId: string }) {
  return <article className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/50"><div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2"><span className="text-xs font-semibold text-zinc-200">{label}</span>{entry.artwork.is_active !== false ? <span className="rounded bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-300">Em uso</span> : <span className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400">Histórico</span>}</div><div className="aspect-square bg-white p-2">{/* eslint-disable-next-line @next/next/no-img-element */}<img alt={entry.artwork.artwork_name || entry.artwork.file_name} className="h-full w-full object-contain" src={artworkImageUrl(quoteId, entry, "original")} /></div><div className="p-3"><p className="break-words text-sm font-medium text-white">{entry.artwork.artwork_name || entry.artwork.file_name}</p><p className="mt-1 break-all text-[11px] text-zinc-500">{entry.artwork.file_name}</p><a className="focus-ring mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-800" href={artworkDownloadUrl(quoteId, entry, "original")}><Download size={14} /> Baixar esta versão</a></div></article>;
}

function ArtworkDownloadMenu({ entry, original, prepared, quoteId }: { entry: ArtworkEntry; original: ArtworkEntry | null; prepared: boolean; quoteId: string }) {
  return <details className="group flex-1 basis-[150px]"><summary className="focus-ring flex h-9 cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-900"><Download size={14} /> Baixar versões</summary><div className="mt-1 grid gap-1 rounded-md border border-zinc-700 bg-zinc-950 p-1.5"><DownloadLink href={artworkDownloadUrl(quoteId, entry, "original")} label={entry.artwork.source_kind === "retouch" ? "Arte retocada" : "Arte original"} />{original ? <DownloadLink href={artworkDownloadUrl(quoteId, original, "original")} label="Arte original enviada" /> : null}{prepared ? <DownloadLink href={artworkDownloadUrl(quoteId, entry, "prepared")} label="Arte preparada e recortada" /> : null}</div></details>;
}
function DownloadLink({ href, label }: { href: string; label: string }) { return <a className="focus-ring flex min-h-9 items-center gap-2 rounded px-2.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white" href={href}><Download size={13} /> {label}</a>; }

type Suggestions = { concept: string; composition: string; palette: string[]; typography: string; productionWarnings: string[]; generationPrompt: string };
type PrintJob = { id: string; status: "generated" | "printed" | "cancelled"; page_count: number; copy_count: number; created_at: string };
function SuggestionResult({ suggestions }: { suggestions: Suggestions }) { return <div className="grid gap-2 rounded-md bg-zinc-950/80 p-3 text-xs text-zinc-300"><p><strong className="text-white">Conceito:</strong> {suggestions.concept}</p><p><strong className="text-white">Composição:</strong> {suggestions.composition}</p><p><strong className="text-white">Paleta:</strong> {suggestions.palette.join(", ")}</p><p><strong className="text-white">Tipografia:</strong> {suggestions.typography}</p>{suggestions.productionWarnings.length ? <p className="text-amber-200"><strong>Cuidados:</strong> {suggestions.productionWarnings.join(" · ")}</p> : null}</div>; }
function inferGeometry(item: QuoteItemRow, artwork: QuoteItemArtworkRow) { return resolvePrintGeometry({ ...item, ...artwork }); }
function inferMargins(item: QuoteItemRow, artwork: QuoteItemArtworkRow) { return resolvePrintMargins({ ...item, ...artwork }); }
function formatMm(value: number) { return `${Number(value.toFixed(2)).toLocaleString("pt-BR")} mm`; }
function initialQuantities(items: QuoteItemRow[]) { const result: Record<string, number> = {}; for (const item of items) { const arts = (item.artworks ?? []).filter((artwork) => artwork.is_active !== false); for (const artwork of arts) result[artwork.id] = artwork.production_quantity ?? (arts.length === 1 ? item.quantity : Math.max(1, Math.floor(item.quantity / arts.length))); } return result; }
function artworkImageUrl(quoteId: string, entry: ArtworkEntry, kind: "original" | "prepared") { const inline = kind === "prepared" ? entry.artwork.prepared_data_url : entry.artwork.data_url; return inline || `/api/quotes/${quoteId}/items/${entry.item.id}/artworks/${entry.artwork.id}/file?kind=${kind}`; }
function artworkDownloadUrl(quoteId: string, entry: ArtworkEntry, kind: "original" | "prepared") { return `/api/quotes/${quoteId}/items/${entry.item.id}/artworks/${entry.artwork.id}/file?kind=${kind}&download=1`; }
function findOriginalEntry(entry: ArtworkEntry, all: ArtworkEntry[]) { let current = entry; const visited = new Set<string>(); while (current.artwork.parent_artwork_id && !visited.has(current.artwork.id)) { visited.add(current.artwork.id); const parent = all.find((candidate) => candidate.artwork.id === current.artwork.parent_artwork_id); if (!parent) break; current = parent; } return current; }
function sortActiveArtworkEntries(all: ArtworkEntry[]) {
  const entries = new Map(all.map((entry) => [entry.artwork.id, entry]));
  return sortActiveArtworkVersions(all.map((entry) => entry.artwork)).map((artwork) => entries.get(artwork.id) as ArtworkEntry);
}
function fileToDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível ler a imagem.")); reader.onerror = () => reject(new Error("Não foi possível ler a imagem.")); reader.readAsDataURL(file); }); }

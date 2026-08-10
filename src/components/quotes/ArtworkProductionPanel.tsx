"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Download, Eye, ImageIcon, Printer, Scissors, Upload, WandSparkles, X } from "lucide-react";
import { ArtworkCropEditor } from "@/components/quotes/ArtworkCropEditor";
import { ArtworkPdfPreview } from "@/components/quotes/ArtworkPdfPreview";
import { getArtworkAiAttemptsRemaining, normalizeArtworkAiGenerationLimit } from "@/domain/artwork/ai-generation-limit";
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [drawCutLines, setDrawCutLines] = useState(true);
  const printProfileLoaded = useRef(false);
  const artworks = useMemo(() => items.flatMap((item) => (item.artworks ?? []).map((artwork) => ({ item, artwork }))), [items]);
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
    const diameterMm = inferDiameter(item, reference?.artwork.target_diameter_mm);
    const data = await runAction(`ai-${action}`, `/api/quotes/${quoteId}/items/${item.id}/artworks/ai`, { action, brief, artworkId: reference?.artwork.id, diameterMm, product: item.description });
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2"><div><p className="text-sm font-medium text-white">{item.description}</p><p className="text-xs text-zinc-500">Pedido: {item.quantity} unidades</p></div><span className={`rounded px-2 py-1 text-xs ${itemAllocation?.allocated === item.quantity && itemAllocation.approved ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{itemAllocation?.allocated ?? 0} de {item.quantity} distribuídas</span></div>
            <div className="grid gap-3 p-3">
              {itemArtworks.length === 0 ? <p className="text-sm text-zinc-500">Adicione uma imagem pelo botão Editar ou gere uma nova arte com o assistente.</p> : itemArtworks.map((entry) => <ArtworkRow
                busy={busy}
                diameter={inferDiameter(item, entry.artwork.target_diameter_mm)}
                entry={entry}
                key={entry.artwork.id}
                quantity={quantities[entry.artwork.id] || 1}
                quoteId={quoteId}
                onApprove={approve}
                onEdit={setEditing}
                onQuantity={(quantity) => setQuantities((current) => ({ ...current, [entry.artwork.id]: quantity }))}
                readOnly={readOnly}
              />)}
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

      {editing ? <ArtworkCropEditor artwork={editing.artwork} diameterMm={inferDiameter(editing.item, editing.artwork.target_diameter_mm) || 0} imageUrl={artworkImageUrl(quoteId, editing, "original")} itemId={editing.item.id} quoteId={quoteId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setMessage("Arte preparada. Confira a qualidade e aprove a versão."); router.refresh(); }} /> : null}
      {previewOpen ? <ArtworkPdfPreview drawCutLines={drawCutLines} quoteId={quoteId} onClose={() => setPreviewOpen(false)} /> : null}
    </section>
  );
}

function ArtworkRow({ entry, quoteId, diameter, quantity, busy, readOnly, onQuantity, onEdit, onApprove }: { entry: ArtworkEntry; quoteId: string; diameter: number | null; quantity: number; busy: string; readOnly: boolean; onQuantity: (quantity: number) => void; onEdit: (entry: ArtworkEntry) => void; onApprove: (entry: ArtworkEntry, status: "approved" | "rejected") => void }) {
  const prepared = Boolean(entry.artwork.prepared_data_url || entry.artwork.prepared_storage_path);
  const approved = entry.artwork.approval_status === "approved";
  return <article className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/40">
    <div className="flex min-w-0 items-start gap-3 p-3 sm:gap-4 sm:p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={entry.artwork.artwork_name ?? entry.artwork.file_name} className="h-16 w-16 shrink-0 rounded-full border border-zinc-700 object-cover sm:h-20 sm:w-20" src={artworkImageUrl(quoteId, entry, prepared ? "prepared" : "original")} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 break-words text-sm font-semibold leading-5 text-white">{entry.artwork.artwork_name || entry.artwork.file_name}</p>
          <span className={`shrink-0 rounded px-2 py-1 text-[11px] font-medium ${approved ? "bg-emerald-400/10 text-emerald-300" : prepared ? "bg-cyan-400/10 text-cyan-200" : "bg-zinc-800 text-zinc-400"}`}>{approved ? "Aprovada" : prepared ? "Preparada" : "Pendente"}</span>
        </div>
        {entry.artwork.artwork_name ? <p className="mt-1 break-all text-[11px] text-zinc-600">{entry.artwork.file_name}</p> : null}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>{diameter ? `${diameter} mm` : "Diâmetro pendente"}</span>
          <span>{entry.artwork.source_kind === "openrouter" ? "Gerada por IA" : "Arquivo enviado"}</span>
          {entry.artwork.dpi ? <span>{entry.artwork.dpi} DPI</span> : null}
        </div>
        <p className={`mt-2 break-words text-xs leading-5 ${entry.artwork.quality_status === "warning" ? "text-amber-300" : prepared ? "text-emerald-300" : "text-zinc-500"}`}>{entry.artwork.preparation_notes || "Aguardando enquadramento e preparação técnica."}</p>
      </div>
    </div>

    <div className="flex flex-wrap items-end justify-between gap-3 border-t border-zinc-800 bg-zinc-950/50 p-3">
      <label className="w-36 shrink-0"><span className="mb-1 block text-xs font-medium text-zinc-400">Cópias desta arte</span><input className="focus-ring h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm tabular-nums disabled:opacity-50" disabled={readOnly} min="1" type="number" value={quantity} onChange={(event) => onQuantity(Math.max(1, Number(event.target.value) || 1))} /></label>
      <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2">
        <button className="focus-ring inline-flex h-9 flex-1 basis-[130px] items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-50" disabled={readOnly || !diameter || Boolean(busy)} type="button" onClick={() => onEdit(entry)}><ImageIcon size={14} /> {prepared ? "Reenquadrar" : "Enquadrar"}</button>
        {approved ? <>
          <button className="focus-ring inline-flex h-9 flex-1 basis-[110px] items-center justify-center gap-2 rounded-md bg-emerald-400/15 px-3 text-xs font-medium text-emerald-200 disabled:opacity-50" disabled={readOnly || Boolean(busy)} type="button" onClick={() => onApprove(entry, "approved")}><Check size={14} /> Atualizar</button>
          <button className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md border border-zinc-700 text-zinc-400 hover:border-red-900 hover:text-red-300 disabled:opacity-50" disabled={readOnly} title="Remover aprovação" type="button" onClick={() => onApprove(entry, "rejected")}><X size={14} /></button>
        </> : <button className="focus-ring inline-flex h-9 flex-1 basis-[110px] items-center justify-center gap-2 rounded-md bg-cyan-400 px-3 text-xs font-medium text-cyan-950 disabled:opacity-50" disabled={readOnly || !prepared || Boolean(busy)} type="button" onClick={() => onApprove(entry, "approved")}><Check size={14} /> Aprovar</button>}
      </div>
    </div>
  </article>;
}

type Suggestions = { concept: string; composition: string; palette: string[]; typography: string; productionWarnings: string[]; generationPrompt: string };
type PrintJob = { id: string; status: "generated" | "printed" | "cancelled"; page_count: number; copy_count: number; created_at: string };
function SuggestionResult({ suggestions }: { suggestions: Suggestions }) { return <div className="grid gap-2 rounded-md bg-zinc-950/80 p-3 text-xs text-zinc-300"><p><strong className="text-white">Conceito:</strong> {suggestions.concept}</p><p><strong className="text-white">Composição:</strong> {suggestions.composition}</p><p><strong className="text-white">Paleta:</strong> {suggestions.palette.join(", ")}</p><p><strong className="text-white">Tipografia:</strong> {suggestions.typography}</p>{suggestions.productionWarnings.length ? <p className="text-amber-200"><strong>Cuidados:</strong> {suggestions.productionWarnings.join(" · ")}</p> : null}</div>; }
function inferDiameter(item: QuoteItemRow, preparedDiameter?: string | null) { const explicit = Number(preparedDiameter || item.print_diameter_mm || 0); if (explicit > 0) return explicit; const cm = Math.max(Number(item.width_cm || 0), Number(item.length_cm || 0)); return cm > 0 ? cm * 10 : null; }
function initialQuantities(items: QuoteItemRow[]) { const result: Record<string, number> = {}; for (const item of items) { const arts = item.artworks ?? []; for (const artwork of arts) result[artwork.id] = artwork.production_quantity ?? (arts.length === 1 ? item.quantity : Math.max(1, Math.floor(item.quantity / arts.length))); } return result; }
function artworkImageUrl(quoteId: string, entry: ArtworkEntry, kind: "original" | "prepared") { const inline = kind === "prepared" ? entry.artwork.prepared_data_url : entry.artwork.data_url; return inline || `/api/quotes/${quoteId}/items/${entry.item.id}/artworks/${entry.artwork.id}/file?kind=${kind}`; }
function fileToDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível ler a imagem.")); reader.onerror = () => reject(new Error("Não foi possível ler a imagem.")); reader.readAsDataURL(file); }); }

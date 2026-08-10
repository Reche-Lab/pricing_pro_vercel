"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageIcon, Loader2, Sparkles, Upload, WandSparkles } from "lucide-react";
import { ArtworkCropEditor } from "@/components/quotes/ArtworkCropEditor";
import { getArtworkAiAttemptsRemaining, normalizeArtworkAiGenerationLimit } from "@/domain/artwork/ai-generation-limit";
import { resolvePrintGeometry, type PrintGeometry } from "@/domain/artwork/geometry";
import { getPublicArtworkReviewProgress } from "@/domain/quotes/public-artwork-review";
import type { QuoteItemArtworkRow, QuoteItemRow } from "@/repositories/quotes";

type Entry = { item: QuoteItemRow; artwork: QuoteItemArtworkRow };
type Suggestions = { concept: string; composition: string; palette: string[]; typography: string; productionWarnings: string[] };

export function PublicArtworkStudio({ token, quoteId, items, disabled }: { token: string; quoteId: string; items: QuoteItemRow[]; disabled: boolean }) {
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [referenceId, setReferenceId] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const item = items.find((candidate) => candidate.id === itemId) ?? items[0];
  const itemArtworks = item?.artworks ?? [];
  const reference = itemArtworks.find((artwork) => artwork.id === referenceId) ?? null;
  const aiGenerationLimit = normalizeArtworkAiGenerationLimit(item?.artwork_ai_generation_limit);
  const attemptsRemaining = getArtworkAiAttemptsRemaining(item?.artwork_ai_attempts, aiGenerationLimit);
  const progress = useMemo(() => getPublicArtworkReviewProgress(items.map((candidate) => ({
    artworkName: candidate.artwork_name,
    artworks: candidate.artworks?.map((artwork) => ({ approvalStatus: artwork.approval_status }))
  }))), [items]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !item) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setMessage("Use PNG, JPEG ou WebP com até 3 MB."); return;
    }
    setBusy("upload"); setMessage("");
    try {
      const response = await fetch(`/api/public/quotes/${token}/items/${item.id}/artworks`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ artworkName: "Referência enviada pelo cliente", artworkFile: { fileName: file.name, mimeType: file.type, fileSize: file.size, dataUrl: await fileToDataUrl(file) } })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível enviar a imagem.");
      setReferenceId(data.artwork.id);
      setMessage("Imagem adicionada. Você pode reenquadrá-la ou usá-la como base no assistente.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível enviar a imagem."); }
    finally { setBusy(""); }
  }

  async function runAssistant(action: "suggest" | "generate") {
    if (!item || brief.trim().length < 10) { setMessage("Descreva o que deseja criar ou alterar em pelo menos 10 caracteres."); return; }
    setBusy(action); setMessage("");
    try {
      const response = await fetch(`/api/public/quotes/${token}/items/${item.id}/artworks/ai`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, brief, artworkId: reference?.id ?? null })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível executar o assistente.");
      if (data.suggestions) { setSuggestions(data.suggestions); setMessage("Sugestões prontas para sua revisão."); }
      if (data.artwork?.id) {
        setReferenceId(data.artwork.id); setSuggestions(null);
        setMessage("Nova versão criada. Reenquadre e aprove quando estiver satisfeito.");
        router.refresh();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível executar o assistente."); if (action === "generate") router.refresh(); }
    finally { setBusy(""); }
  }

  async function approve(artwork: QuoteItemArtworkRow) {
    if (!item) return;
    setBusy(`approve-${artwork.id}`); setMessage("");
    const response = await fetch(`/api/public/quotes/${token}/items/${item.id}/artworks/${artwork.id}/approval`, { method: "POST" });
    const data = await response.json().catch(() => null);
    setBusy("");
    if (!response.ok) { setMessage(data?.error ?? "Não foi possível aprovar esta arte."); return; }
    setMessage("Arte selecionada e aprovada para este produto.");
    router.refresh();
  }

  if (!item) return null;
  return <section className="mt-5 scroll-mt-6 overflow-hidden rounded-lg border border-violet-400/20 bg-zinc-900/70" id="public-artwork-studio">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
      <div><p className="inline-flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="text-violet-300" size={17} /> Estúdio de aprovação das artes</p><p className="mt-1 text-xs leading-5 text-zinc-400">Escolha, ajuste ou crie uma versão para cada produto antes de aceitar o orçamento.</p></div>
      <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${progress.approved === progress.required ? "bg-emerald-400/10 text-emerald-300" : "bg-violet-400/10 text-violet-200"}`}>{progress.approved} de {progress.required} produto(s) aprovados</span>
    </div>

    <div className="grid gap-5 p-5">
      <div className="flex gap-2 overflow-x-auto pb-1">{items.map((candidate, index) => {
        const approved = candidate.artworks?.some((artwork) => artwork.approval_status === "approved");
        return <button className={`focus-ring min-w-fit rounded-md border px-3 py-2 text-left text-xs transition-colors ${candidate.id === item.id ? "border-violet-400 bg-violet-400/10 text-white" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`} key={candidate.id} type="button" onClick={() => { setItemId(candidate.id); setReferenceId(""); setSuggestions(null); setMessage(""); }}><span className="flex items-center gap-2"><span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${approved ? "bg-emerald-400 text-emerald-950" : "bg-zinc-800 text-zinc-400"}`}>{approved ? <Check size={12} /> : index + 1}</span>{candidate.description}</span></button>;
      })}</div>

      <div><h2 className="text-base font-semibold text-white">{item.description}</h2><p className="mt-1 text-xs text-zinc-500">{item.quantity} unidade(s) · selecione uma versão abaixo</p></div>

      {itemArtworks.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{itemArtworks.map((artwork) => {
        const prepared = Boolean(artwork.prepared_data_url || artwork.prepared_storage_path);
        const approved = artwork.approval_status === "approved";
        const geometry = inferGeometry(item, artwork);
        const entry = { item, artwork };
        return <article className={`overflow-hidden rounded-md border ${approved ? "border-emerald-400/60 bg-emerald-400/5" : referenceId === artwork.id ? "border-violet-400/70 bg-violet-400/5" : "border-zinc-800 bg-zinc-950/60"}`} key={artwork.id}>
          <button className="relative block aspect-square w-full overflow-hidden bg-white" type="button" onClick={() => setReferenceId(artwork.id)}>
            <img alt={artwork.artwork_name || artwork.file_name} className="h-full w-full object-contain" src={publicArtworkUrl(token, artwork.id, prepared)} />
            {approved ? <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-emerald-400 px-2 py-1 text-[11px] font-semibold text-emerald-950"><Check size={12} /> Aprovada</span> : null}
          </button>
          <div className="grid gap-3 p-3"><div><p className="truncate text-sm font-medium text-white">{artwork.artwork_name || artwork.file_name}</p><p className="mt-1 text-xs text-zinc-500">{prepared ? "Enquadramento preparado" : "Aguardando reenquadramento"}{artwork.source_kind === "openrouter" ? " · criada por IA" : ""}</p></div>
            {!disabled ? <div className="grid grid-cols-2 gap-2"><button className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40" disabled={!geometry} title={geometry ? "Ajustar enquadramento" : "Geometria de impressão não configurada"} type="button" onClick={() => setEditing(entry)}><ImageIcon size={13} /> Reenquadrar</button><button className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-400 px-2 py-2 text-xs font-semibold text-emerald-950 disabled:opacity-40" disabled={!prepared || Boolean(busy)} type="button" onClick={() => approve(artwork)}>{busy === `approve-${artwork.id}` ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />} {approved ? "Aprovada" : "Aprovar"}</button></div> : null}
          </div>
        </article>;
      })}</div> : <div className="rounded-md border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">Ainda não há uma arte para este produto. Envie uma referência ou peça uma criação ao assistente.</div>}

      {!disabled ? <details className="overflow-hidden rounded-md border border-violet-900/60 bg-violet-950/20" open={!itemArtworks.length}>
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-violet-100"><span className="inline-flex items-center gap-2"><WandSparkles size={15} /> Criar ou solicitar alterações</span></summary>
        <div className="grid gap-4 border-t border-violet-900/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs text-zinc-400">Arte usada como base</span><select className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" value={referenceId} onChange={(event) => setReferenceId(event.target.value)}><option value="">Criar do zero</option>{itemArtworks.map((artwork) => <option key={artwork.id} value={artwork.id}>{artwork.artwork_name || artwork.file_name}</option>)}</select></label><div><span className="mb-1 block text-xs text-zinc-400">Enviar uma referência</span><label className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"><Upload size={14} /> {busy === "upload" ? "Enviando..." : "Escolher imagem"}<input accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={Boolean(busy)} type="file" onChange={upload} /></label></div></div>
          <div className={`rounded-md border px-3 py-2 text-xs ${attemptsRemaining ? "border-violet-900/60 bg-violet-950/30 text-violet-200" : "border-amber-900/60 bg-amber-950/30 text-amber-200"}`}><div className="flex flex-wrap items-center justify-between gap-2"><span>Gerações disponíveis para este produto</span><strong>{aiGenerationLimit === 0 ? "Geração por IA indisponível" : `${attemptsRemaining} de ${aiGenerationLimit} restantes`}</strong></div><p className="mt-1 text-[11px] opacity-75">Sugestões, uploads e reenquadramentos continuam disponíveis sem consumir tentativas.</p></div>
          <label><span className="mb-1 block text-xs text-zinc-400">Descreva a criação ou as mudanças desejadas</span><textarea className="focus-ring min-h-28 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-6 text-white" maxLength={3000} placeholder={reference ? "Ex.: mantenha os textos e troque somente o fundo por azul..." : "Ex.: crie uma arte alegre para aniversário com o nome Marina..."} value={brief} onChange={(event) => setBrief(event.target.value)} /></label>
          <div className="flex flex-wrap gap-2"><button className="focus-ring rounded-md border border-violet-700 px-3 py-2 text-xs font-medium text-violet-200 disabled:opacity-50" disabled={Boolean(busy)} type="button" onClick={() => runAssistant("suggest")}>{busy === "suggest" ? "Analisando..." : reference ? "Sugerir melhorias" : "Sugerir direção"}</button><button className="focus-ring inline-flex items-center gap-2 rounded-md bg-violet-400 px-3 py-2 text-xs font-semibold text-violet-950 disabled:opacity-50" disabled={Boolean(busy) || attemptsRemaining === 0} type="button" onClick={() => runAssistant("generate")}>{busy === "generate" ? <Loader2 className="animate-spin" size={13} /> : <WandSparkles size={13} />}{attemptsRemaining === 0 ? "Limite de gerações atingido" : reference ? "Gerar alteração" : "Criar nova arte"}</button></div>
          {suggestions ? <div className="grid gap-2 rounded-md bg-zinc-950/80 p-3 text-xs leading-5 text-zinc-300"><p><strong className="text-white">Conceito:</strong> {suggestions.concept}</p><p><strong className="text-white">Composição:</strong> {suggestions.composition}</p><p><strong className="text-white">Paleta:</strong> {suggestions.palette.join(", ")}</p><p><strong className="text-white">Tipografia:</strong> {suggestions.typography}</p>{suggestions.productionWarnings.length ? <p className="text-amber-200"><strong>Cuidados:</strong> {suggestions.productionWarnings.join(" · ")}</p> : null}</div> : null}
        </div>
      </details> : null}
      {message ? <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">{message}</p> : null}
    </div>

    {editing && inferGeometry(editing.item, editing.artwork) ? <ArtworkCropEditor artwork={editing.artwork} geometry={inferGeometry(editing.item, editing.artwork) as PrintGeometry} imageUrl={publicArtworkUrl(token, editing.artwork.id, false)} itemId={editing.item.id} quoteId={quoteId} prepareUrl={`/api/public/quotes/${token}/items/${editing.item.id}/artworks/${editing.artwork.id}/prepare`} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setMessage("Enquadramento salvo. Agora você pode aprovar esta versão."); router.refresh(); }} /> : null}
  </section>;
}

function publicArtworkUrl(token: string, artworkId: string, prepared: boolean) { return `/api/public/quotes/${token}/artworks/${artworkId}${prepared ? "?kind=prepared" : ""}`; }
function inferGeometry(item: QuoteItemRow, artwork: QuoteItemArtworkRow) { return resolvePrintGeometry({ ...item, ...artwork }); }
function fileToDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível ler a imagem.")); reader.onerror = () => reject(new Error("Não foi possível ler a imagem.")); reader.readAsDataURL(file); }); }

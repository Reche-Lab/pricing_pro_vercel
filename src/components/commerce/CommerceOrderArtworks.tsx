"use client";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { CheckCircle2, Eye, ImagePlus, Loader2, Paintbrush, RefreshCw } from "lucide-react";
import type { CommerceProofView } from "@/services/commerce/order-artworks";
import type { ArtworkStudioAsset } from "@/components/quotes/artwork-studio-types";
import { StoreProductMockup } from "./StoreProductMockup";
import { storeRequest } from "./store-http";
const Studio = dynamic(() => import("../quotes/ArtworkGuidedStudio").then(m => m.ArtworkGuidedStudio), { ssr: false });

export function CommerceOrderArtworks({ endpoint, admin = false }: { endpoint: string; admin?: boolean }) {
  const [open, setOpen] = useState(admin), [proofs, setProofs] = useState<CommerceProofView[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [editable, setEditable] = useState(false), [selected, setSelected] = useState<CommerceProofView | null>(null);
  const current = useRef<CommerceProofView | null>(null);
  const [note, setNote] = useState("Preparação da arte enviada pelo cliente.");
  const [confirm, setConfirm] = useState<CommerceProofView | null>(null);
  const [expandedProof, setExpandedProof] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const confirming = Boolean(confirm);
  useEffect(() => {
    if (!confirming) return;
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, [confirming]);
  async function refresh() { const data = await storeRequest(endpoint); setProofs(data.proofs); setEditable(Boolean(data.editable)); if (admin) { window.dispatchEvent(new Event("commerce:orders-updated")); window.dispatchEvent(new Event("commerce:artworks-updated")); } }
  useEffect(() => {
    if (!open) return;
    let active = true; setBusy(true);
    void storeRequest(endpoint).then(data => { if (active) { setProofs(data.proofs); setEditable(Boolean(data.editable)); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [open, endpoint]);
  const url = (proof: CommerceProofView, asset: string) => `${endpoint}?lineId=${proof.lineId}&asset=${asset}&v=${proof.revision}`;
  function asset(proof: CommerceProofView): ArtworkStudioAsset {
    return { id: proof.lineId, name: proof.artworkName || proof.product.name, fileName: "arte.webp", sourceUrl: url(proof, "source"), preparedUrl: proof.prepared ? url(proof, "prepared") : undefined, geometry: proof.product.geometry, margins: proof.product.margins, crop: proof.crop ?? { scale: 1, offsetX: 0, offsetY: 0, rotationDegrees: 0 }, approved: Boolean(proof.approvedAt) };
  }
  async function mutate(action: string, fields = {}) {
    const proof = current.current;
    if (!proof) throw new Error("Selecione a arte novamente.");
    const result = await storeRequest(endpoint, "POST", { action, lineId: proof.lineId, revision: proof.revision, ...(admin ? { note } : {}), ...fields });
    current.current = { ...proof, revision: result.revision };
    await refresh();
    return current.current;
  }
  return <section className="my-5 min-w-0 border-y border-current/15 py-4">
    <button type="button" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold" aria-expanded={open} onClick={() => setOpen(!open)}><ImagePlus size={18} />{admin ? "Preparação e aprovação das artes" : "Minhas artes e aprovação"}</button>
    {open ? <div className="mt-3 grid min-w-0 gap-4">
      {admin ? editable ? <div className="space-y-2"><label className="grid gap-1 text-sm">Orientação / motivo do ajuste<input className="min-h-10 min-w-0 rounded-md border border-current/25 bg-transparent px-3" value={note} maxLength={500} onChange={e => setNote(e.target.value)} /></label><p className="text-xs leading-5 text-amber-200">Salvar um ajuste preserva o original, invalida a aprovação anterior e exige nova aprovação do cliente antes da impressão.</p></div> : <p className="text-xs text-zinc-400">Consulta das artes. A edição depende do seu perfil e fica bloqueada após o início da produção.</p> : <p className="text-sm opacity-70">Artes enviadas à equipe ficam aguardando preparação. Confira a prova e o produto antes de aprovar a impressão.</p>}
      <button title="Atualizar provas" aria-label="Atualizar provas" type="button" className="grid h-10 w-10 place-items-center rounded-md border border-current/25" disabled={busy} onClick={() => { setError(""); void refresh().catch(e => setError(e.message)); }}>{busy ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}</button>
      {proofs.map(proof => <div key={proof.lineId} className="min-w-0 border-t border-current/15 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm">{proof.product.name} · {proof.artworkName}</strong><p className="mt-1 text-xs opacity-70">{proof.quantity} un. · Versão {proof.revision} · {proof.approvedAt ? "Aprovada pelo cliente" : proof.prepared ? "Prova pronta para revisão" : "Aguardando preparação da equipe"}</p></div>{proof.approvedAt ? <CheckCircle2 size={20} className="text-emerald-500" /> : null}</div>
        {admin ? <div className="mt-3 flex min-w-0 flex-wrap items-center gap-4">
          <a href={url(proof, "source")} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md border border-zinc-800 bg-zinc-900 p-2" title="Abrir a arte atual em tamanho original">
            {/* Private image requests must carry the staff session cookie. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={`Arte de ${proof.artworkName || proof.product.name}`} src={url(proof, proof.prepared ? "prepared" : "source")} className="h-24 w-24 object-contain" loading="lazy" />
          </a>
          <div className="flex flex-col gap-3 text-xs text-emerald-300">
            <a target="_blank" rel="noopener noreferrer" href={url(proof, "source")}>Abrir arte atual</a>
            {proof.prepared ? <a target="_blank" rel="noopener noreferrer" href={url(proof, "prepared")}>Abrir arte enquadrada</a> : null}
            {proof.artworkId ? <a target="_blank" rel="noopener noreferrer" href={endpoint.replace(/\/artworks$/, "/files") + `?artworkId=${proof.artworkId}&lineId=${proof.lineId}`}>Baixar original do cliente</a> : null}
          </div>
        </div> : null}
        {proof.prepared ? <button type="button" aria-expanded={expandedProof === proof.lineId} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-current/25 px-3 text-sm" onClick={() => setExpandedProof(expandedProof === proof.lineId ? null : proof.lineId)}><Eye size={16} />{expandedProof === proof.lineId ? "Recolher prova" : "Visualizar prova"}</button> : null}
        {expandedProof === proof.lineId && proof.prepared && proof.product.geometry ? <div className="mt-3"><StoreProductMockup name={proof.product.name} sourceUrl={url(proof, "prepared")} geometry={proof.product.geometry} margins={proof.product.margins} model={proof.product.artworkOptions?.mockup} /><a className="mt-3 inline-block text-sm underline" target="_blank" rel="noopener noreferrer" href={url(proof, "prepared")}>Abrir arte exata para impressão</a>
          {!admin && !proof.approvedAt ? <button type="button" disabled={!editable || busy} className="mt-3 flex min-h-10 items-center gap-2 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-50" onClick={() => { setError(""); setConfirm(proof); }}><CheckCircle2 size={17} />Revisar e aprovar esta versão</button> : null}
        </div> : null}
        {admin && editable ? <button type="button" disabled={note.trim().length < 5 || busy} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-current/25 px-3 text-sm disabled:opacity-50" onClick={() => { current.current = proof; setSelected(proof); }}><Paintbrush size={16} />Retocar e enquadrar</button> : null}
      </div>)}
      {!busy && !proofs.length ? <p className="text-sm opacity-70">Este pedido não possui artes personalizadas.</p> : null}
      {message ? <p role="status" className="text-sm text-emerald-500">{message}</p> : null}
      {error ? <p role="alert" className="text-sm text-rose-500">{error}</p> : null}
    </div> : null}
    {selected ? <Studio initialAsset={asset(selected)} initialStep="crop" proofMode onClose={() => setSelected(null)}
      renderProductPreview={art => art.geometry && art.preparedUrl ? <StoreProductMockup name={selected.product.name} sourceUrl={art.preparedUrl} geometry={art.geometry} margins={art.margins} model={selected.product.artworkOptions?.mockup} /> : null}
      onRetouch={async (art, file) => { const p = await mutate("source", file); return { ...art, sourceUrl: url(p!, "source"), preparedUrl: undefined, approved: false, crop: { scale: 1, offsetX: 0, offsetY: 0, rotationDegrees: 0 } }; }}
      onPrepare={async (art, crop) => { const p = await mutate("prepare", crop); return { ...art, crop, approved: false, preparedUrl: url(p!, "prepared") }; }}
      onApprove={async () => { await mutate("publish"); setMessage("Prova disponível na conta do cliente para aprovação. Nenhum preço foi alterado."); }} /> : null}
    {confirm ? createPortal(<div className="fixed inset-0 z-[140] grid place-items-center overflow-y-auto bg-black/75 p-4"><div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="approve-order-art" onKeyDown={e => {
      if (e.key === "Escape" && !busy) { e.stopPropagation(); setConfirm(null); }
      if (e.key === "Tab") {
        const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }} className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 p-5 text-zinc-100 outline-none"><h2 id="approve-order-art" className="font-semibold">Aprovar arte para impressão</h2><p className="mt-3 text-sm leading-6">Confirma os textos, as cores e o enquadramento da versão {confirm.revision} de {confirm.artworkName || confirm.product.name}? A produção usará exatamente esta versão.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} className="min-h-10 rounded-md border border-zinc-700 px-3" onClick={() => setConfirm(null)}>Voltar à revisão</button><button type="button" disabled={busy} className="min-h-10 rounded-md bg-emerald-400 px-4 text-zinc-950" onClick={() => { current.current = confirm; setBusy(true); void mutate("approve").then(() => { setMessage("Arte aprovada para impressão."); setConfirm(null); }).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>{busy ? "Aprovando..." : "Confirmar aprovação"}</button></div>{error ? <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p> : null}</div></div>, document.body) : null}
  </section>;
}

"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState, type ChangeEvent } from "react";
import { Check, FileText, Loader2, Upload, X } from "lucide-react";
import { looksLikeArtworkTemplate, MAX_ARTWORK_PDF_BYTES, MAX_ARTWORK_PDF_PAGES, suggestedPdfArtworkName } from "@/domain/artwork/pdf-import";
import { EditableNumberInput } from "@/components/ui/EditableNumberInput";

type PdfPage = { number: number; thumbnail: string; text: string; name: string; selected: boolean; quantity: number };
type PdfDocument = Awaited<ReturnType<typeof import("pdfjs-dist/legacy/build/pdf.mjs")["getDocument"]>["promise"]>;

export function PdfArtworkImportModal({ importBaseUrl, itemDescription, itemQuantity, onClose, onImported }: {
  importBaseUrl: string; itemDescription: string; itemQuantity: number; onClose: () => void; onImported: (count: number) => void;
}) {
  const documentRef = useRef<PdfDocument | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const selected = pages.filter((page) => page.selected);
  const allocated = selected.reduce((sum, page) => sum + page.quantity, 0);
  const validAllocation = selected.length > 0 && allocated === itemQuantity;

  async function choosePdf(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null; event.target.value = "";
    if (!next) return;
    if (next.type !== "application/pdf" || next.size > MAX_ARTWORK_PDF_BYTES) { setError("Use um PDF com até 4 MB."); return; }
    setBusy("reading"); setError(""); setProgress("Abrindo o PDF..."); setPages([]); setFile(next);
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await next.arrayBuffer()) }).promise;
      if (pdf.numPages < 1 || pdf.numPages > MAX_ARTWORK_PDF_PAGES) throw new Error(`O PDF deve ter entre 1 e ${MAX_ARTWORK_PDF_PAGES} páginas.`);
      documentRef.current = pdf;
      const loaded: PdfPage[] = [];
      for (let number = 1; number <= pdf.numPages; number += 1) {
        setProgress(`Preparando miniatura ${number} de ${pdf.numPages}...`);
        const page = await pdf.getPage(number);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((item) => "str" in item ? item.str : "").join(" ");
        loaded.push({ number, thumbnail: await renderPage(page, 260), text, name: suggestedPdfArtworkName(number, text), selected: !looksLikeArtworkTemplate(text), quantity: 1 });
        setPages([...loaded]);
      }
      setPages(distributeQuantities(loaded, itemQuantity));
      setProgress("");
    } catch (cause) {
      documentRef.current = null; setFile(null); setPages([]);
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir o PDF.");
    } finally { setBusy(""); }
  }

  async function importPages() {
    if (!file || !documentRef.current || !validAllocation) return;
    setBusy("importing"); setError("");
    try {
      setProgress("Salvando o PDF original com acesso privado...");
      const createResponse = await fetch(importBaseUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: file.name, fileSize: file.size, pageCount: documentRef.current.numPages, dataUrl: await fileToDataUrl(file) }) });
      const createData = await createResponse.json().catch(() => null);
      if (!createResponse.ok) throw new Error(createData?.error ?? "Não foi possível iniciar a importação.");
      for (let index = 0; index < selected.length; index += 1) {
        const source = selected[index];
        setProgress(`Importando arte ${index + 1} de ${selected.length} · página ${source.number}...`);
        const pdfPage = await documentRef.current.getPage(source.number);
        const dataUrl = await renderPage(pdfPage, 1800);
        const blob = dataUrlToBlob(dataUrl);
        const response = await fetch(`${importBaseUrl}/${createData.importId}/pages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pageNumber: source.number, artworkName: source.name, productionQuantity: source.quantity, artworkFile: { fileName: `${stripExtension(file.name)}-pagina-${source.number}.webp`, mimeType: "image/webp", fileSize: blob.size, dataUrl } }) });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(`Página ${source.number}: ${data?.error ?? "não foi possível importar"}`);
      }
      setProgress(""); onImported(selected.length);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível importar as páginas."); setProgress(""); }
    finally { setBusy(""); }
  }

  function togglePage(number: number) { setPages((current) => distributeQuantities(current.map((page) => page.number === number ? { ...page, selected: !page.selected } : page), itemQuantity)); }
  function selectSuggested() { setPages((current) => distributeQuantities(current.map((page) => ({ ...page, selected: !looksLikeArtworkTemplate(page.text) })), itemQuantity)); }

  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-black/80 p-0 backdrop-blur-sm sm:p-3" role="dialog" aria-modal="true">
    <div className="flex h-dvh w-full max-w-6xl flex-col overflow-hidden border border-cyan-400/25 bg-zinc-950 shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:rounded-lg">
      <header className="flex items-start justify-between gap-4 border-b border-zinc-800 px-4 py-3 sm:px-5"><div><p className="inline-flex items-center gap-2 text-base font-semibold text-white"><FileText className="text-cyan-300" size={18} /> Importar artes de um PDF</p><p className="mt-1 text-xs leading-5 text-zinc-400">{itemDescription} · distribua exatamente {itemQuantity} cópia(s) entre as páginas escolhidas.</p></div><button className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white" disabled={Boolean(busy)} type="button" onClick={onClose}><X size={18} /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {!pages.length ? <label className="focus-ring grid min-h-60 cursor-pointer place-items-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-6 text-center hover:border-cyan-500/60 hover:bg-cyan-400/5"><span><span className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-cyan-400/10 text-cyan-300"><Upload size={22} /></span><span className="mt-3 block text-sm font-semibold text-white">Escolher PDF com uma arte por página</span><span className="mt-1 block text-xs text-zinc-500">Até 4 MB e 100 páginas. Gabaritos reconhecidos ficam desmarcados.</span>{busy === "reading" ? <span className="mt-4 inline-flex items-center gap-2 text-xs text-cyan-200"><Loader2 className="animate-spin" size={14} /> {progress}</span> : null}</span><input accept="application/pdf" className="sr-only" disabled={Boolean(busy)} type="file" onChange={choosePdf} /></label> : <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-white">{file?.name}</p><p className="mt-1 text-xs text-zinc-500">{pages.length} páginas · {selected.length} selecionadas · {allocated} de {itemQuantity} cópias</p></div><div className="flex flex-wrap gap-2"><button className="focus-ring rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800" disabled={Boolean(busy)} type="button" onClick={selectSuggested}>Selecionar artes</button><button className="focus-ring rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800" disabled={Boolean(busy)} type="button" onClick={() => setPages((current) => current.map((page) => ({ ...page, selected: false, quantity: 1 })))}>Limpar</button><label className="focus-ring cursor-pointer rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">Trocar PDF<input accept="application/pdf" className="sr-only" disabled={Boolean(busy)} type="file" onChange={choosePdf} /></label></div></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{pages.map((page) => <article className={`overflow-hidden rounded-md border ${page.selected ? "border-cyan-400/60 bg-cyan-400/5" : "border-zinc-800 bg-zinc-900/50"}`} key={page.number}>
            <button className="relative block aspect-square w-full bg-white" disabled={Boolean(busy)} type="button" onClick={() => togglePage(page.number)}><img alt={`Página ${page.number}`} className="h-full w-full object-contain" src={page.thumbnail} /><span className="absolute left-2 top-2 rounded bg-zinc-950/85 px-2 py-1 text-[11px] font-medium text-white">Página {page.number}</span><span className={`absolute right-2 top-2 grid h-6 w-6 place-items-center rounded border ${page.selected ? "border-cyan-300 bg-cyan-300 text-cyan-950" : "border-zinc-500 bg-zinc-950/75 text-transparent"}`}><Check size={14} /></span>{looksLikeArtworkTemplate(page.text) ? <span className="absolute bottom-2 left-2 rounded bg-amber-300 px-2 py-1 text-[10px] font-semibold text-amber-950">Possível gabarito</span> : null}</button>
            <div className="grid gap-2 p-3"><label><span className="mb-1 block text-[11px] text-zinc-500">Nome da arte</span><input className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-xs text-white disabled:opacity-40" disabled={!page.selected || Boolean(busy)} maxLength={120} value={page.name} onChange={(event) => setPages((current) => current.map((candidate) => candidate.number === page.number ? { ...candidate, name: event.target.value } : candidate))} /></label><label><span className="mb-1 block text-[11px] text-zinc-500">Cópias desta arte</span><EditableNumberInput className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm tabular-nums text-white disabled:opacity-40" disabled={!page.selected || Boolean(busy)} min="1" value={page.quantity} onValueChange={(value) => setPages((current) => current.map((candidate) => candidate.number === page.number ? { ...candidate, quantity: Math.max(1, value) } : candidate))} /></label></div>
          </article>)}</div>
        </>}
        {error ? <p className="mt-4 rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">{error}</p> : null}
      </div>
      {pages.length ? <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-900/50 px-4 py-3 sm:px-5"><p className={`text-xs ${validAllocation ? "text-emerald-300" : "text-amber-300"}`}>{validAllocation ? `Distribuição completa: ${allocated} cópia(s).` : `Ajuste as cópias: ${allocated} de ${itemQuantity} distribuídas.`}{progress ? ` ${progress}` : ""}</p><div className="flex gap-2"><button className="focus-ring rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800" disabled={Boolean(busy)} type="button" onClick={onClose}>Cancelar</button><button className="focus-ring inline-flex items-center gap-2 rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-cyan-950 disabled:opacity-40" disabled={!validAllocation || Boolean(busy)} type="button" onClick={importPages}>{busy === "importing" ? <Loader2 className="animate-spin" size={15} /> : <Upload size={15} />} Importar {selected.length} arte(s)</button></div></footer> : null}
    </div>
  </div>;
}

function distributeQuantities(pages: PdfPage[], total: number) {
  const chosen = pages.filter((page) => page.selected);
  if (!chosen.length || chosen.length > total) return pages.map((page) => ({ ...page, quantity: page.selected ? 1 : page.quantity }));
  const base = Math.floor(total / chosen.length); let remainder = total % chosen.length;
  return pages.map((page) => page.selected ? { ...page, quantity: base + (remainder-- > 0 ? 1 : 0) } : page);
}

async function renderPage(page: Awaited<ReturnType<PdfDocument["getPage"]>>, targetPixels: number) {
  const natural = page.getViewport({ scale: 1 }); const scale = Math.max(1, targetPixels / Math.max(natural.width, natural.height)); const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false }); if (!context) throw new Error("O navegador não conseguiu renderizar a página.");
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/webp", targetPixels > 500 ? 0.94 : 0.8);
}
function fileToDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível ler o PDF.")); reader.onerror = () => reject(new Error("Não foi possível ler o PDF.")); reader.readAsDataURL(file); }); }
function dataUrlToBlob(dataUrl: string) { const [header, content] = dataUrl.split(","); const mime = /data:([^;]+)/.exec(header)?.[1] ?? "image/webp"; const bytes = atob(content); const result = new Uint8Array(bytes.length); for (let index = 0; index < bytes.length; index += 1) result[index] = bytes.charCodeAt(index); return new Blob([result], { type: mime }); }
function stripExtension(value: string) { return value.replace(/\.[^.]+$/, ""); }

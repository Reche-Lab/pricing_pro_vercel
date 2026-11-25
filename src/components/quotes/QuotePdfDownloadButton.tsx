"use client";

import React, { useState } from "react";
import { Crop, Download, FileImage, Paintbrush, PackageCheck, X } from "lucide-react";
import type { QuotePdfArtworkVariant } from "@/domain/quotes/pdf-artwork";

type Props = {
  quoteId: string;
  artworkCount: number;
  editedCount: number;
  croppedCount: number;
};

const options: Array<{
  value: QuotePdfArtworkVariant;
  label: string;
  description: string;
  icon: typeof FileImage;
}> = [
  { value: "product", label: "Produto aprovado", description: "Produto com a arte aprovada. Sem aprovação, usa a original; sem arte, a imagem de exemplo disponível.", icon: PackageCheck },
  { value: "original", label: "Arte original", description: "Arquivo recebido antes dos retoques e do enquadramento.", icon: FileImage },
  { value: "edited", label: "Arte editada", description: "Versão ativa com os retoques manuais já aplicados.", icon: Paintbrush },
  { value: "cropped", label: "Arte recortada", description: "Imagem preparada conforme o enquadramento e a geometria do produto.", icon: Crop }
];

export function QuotePdfDownloadButton({ quoteId, artworkCount, editedCount, croppedCount }: Props) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<QuotePdfArtworkVariant>("product");
  const [view, setView] = useState<"front" | "both">("both");

  function show() {
    setVariant("product");
    setOpen(true);
  }

  function availability(value: QuotePdfArtworkVariant) {
    if (value === "edited") return editedCount;
    if (value === "cropped") return croppedCount;
    return artworkCount;
  }

  return <>
    <button className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-950/60" onClick={show} type="button">
      <Download size={15}/>Baixar PDF
    </button>
    {open ? <div aria-modal="true" className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }} role="dialog">
      <div className="max-h-[calc(100dvh-24px)] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-5 sm:py-4">
          <div><h2 className="font-semibold text-white">Gerar PDF do orçamento</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Escolha qual versão das artes será apresentada ao cliente.</p></div>
          <button aria-label="Fechar" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white" onClick={() => setOpen(false)} type="button"><X size={17}/></button>
        </header>
        <div className="grid gap-2 p-4 sm:p-5">{options.map((option) => {
          const Icon = option.icon;
          const available = availability(option.value);
          const disabled = !["original", "product"].includes(option.value) && available === 0;
          const selected = variant === option.value;
          return <button aria-pressed={selected} className={`flex min-w-0 items-start gap-3 rounded-md border p-3 text-left transition-colors ${selected ? "border-cyan-400/50 bg-cyan-400/10" : "border-zinc-800 bg-zinc-950/40 hover:bg-zinc-800/60"} ${disabled ? "cursor-not-allowed opacity-45" : ""}`} disabled={disabled} key={option.value} onClick={() => setVariant(option.value)} type="button">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${selected ? "bg-cyan-300 text-cyan-950" : "bg-zinc-800 text-zinc-400"}`}><Icon size={17}/></span>
            <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-zinc-100">{option.label}</strong>{option.value === "product" ? <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">Padrão</span> : null}</span><span className="mt-1 block text-xs leading-5 text-zinc-500">{option.description}</span>{artworkCount && option.value !== "product" ? <span className="mt-1 block text-[11px] text-zinc-600">{available} de {artworkCount} arte(s) disponíveis nesta versão{available < artworkCount && available > 0 ? "; as demais usarão a versão anterior" : ""}.</span> : null}</span>
          </button>;
        })}</div>
        {variant === "product" ? <fieldset className="mx-4 mb-4 sm:mx-5"><legend className="mb-2 text-xs text-zinc-400">Visualização do produto</legend><div className="flex gap-2">{(["front", "both"] as const).map(value => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`min-h-10 flex-1 rounded-md border px-3 py-2 text-sm ${view === value ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-zinc-700 text-zinc-400"}`}>{value === "front" ? "Somente frente" : "Frente e verso"}</button>)}</div></fieldset> : null}
        {!artworkCount ? <p className="mx-4 mb-4 rounded-md border border-zinc-700 p-3 text-xs leading-5 text-zinc-400 sm:mx-5">Sem artes anexadas. Quando disponível, a imagem de exemplo do produto será apresentada.</p> : null}
        <footer className="flex flex-col-reverse gap-2 border-t border-zinc-800 bg-zinc-950/30 p-3 sm:flex-row sm:justify-end sm:px-5 sm:py-4">
          <button className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800" onClick={() => setOpen(false)} type="button">Cancelar</button>
          <a className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300" href={`/api/quotes/${quoteId}/pdf?artwork=${variant}&view=${view}`} onClick={() => setOpen(false)}><Download size={15}/>Gerar PDF</a>
        </footer>
      </div>
    </div> : null}
  </>;
}

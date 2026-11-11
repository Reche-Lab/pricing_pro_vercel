"use client";
import React, { useState } from "react";
import { PaintBucket, Pipette, X } from "lucide-react";

export function ArtworkBackgroundControls({ value, onChange, sampling, onSample, disabled = false }: {
  value?: string | null; onChange: (color: string | null) => void; sampling: boolean; onSample: () => void; disabled?: boolean;
}) {
  const [lastColor, setLastColor] = useState(value ?? "#ffffff");
  return <fieldset disabled={disabled} className="grid min-w-0 gap-3 rounded-md border border-cyan-800/60 bg-cyan-950/15 p-3">
    <legend className="px-1 text-sm font-semibold text-cyan-100"><span className="inline-flex items-center gap-2"><PaintBucket size={15}/>Completar fundo e bordas</span></legend>
    <p className="text-xs leading-5 text-zinc-400">A cor cobre as partes transparentes até o corte, atrás da arte. Textos, desenhos e branco da imagem são preservados.</p>
    <div className="flex min-w-0 items-center gap-2">
      <label className="flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-zinc-700 px-2 text-xs text-zinc-200"><input aria-label="Cor do fundo" title="Escolher cor para completar as bordas" type="color" value={value ?? lastColor} className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0" onChange={event => { setLastColor(event.target.value); onChange(event.target.value); }}/><span className="font-mono uppercase">{value ?? lastColor}</span></label>
      <button aria-label="Capturar cor para o fundo" aria-pressed={sampling} title="Selecionar uma cor da própria imagem para completar as áreas transparentes" type="button" onClick={onSample} className={`focus-ring flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border px-2 text-xs ${sampling ? "border-cyan-400 bg-cyan-400/15 text-cyan-100" : "border-zinc-700 text-zinc-200 hover:bg-zinc-800"}`}><Pipette size={15}/>{sampling ? "Cancelar" : "Capturar cor"}</button>
    </div>
    <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs text-zinc-200"><input type="checkbox" className="accent-cyan-400" checked={Boolean(value)} onChange={event => { if (value) setLastColor(value); onChange(event.target.checked ? lastColor : null); }}/>Preencher áreas transparentes</label>
    {value ? <button aria-label="Remover cor de fundo" title="Voltar às áreas transparentes sem alterar a imagem original" type="button" onClick={() => { setLastColor(value); onChange(null); }} className="focus-ring inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800"><X size={14}/>Remover preenchimento</button> : null}
    {sampling ? <p role="status" className="text-xs text-cyan-200">Selecione uma parte colorida da arte. Áreas transparentes não fornecem uma cor.</p> : null}
  </fieldset>;
}

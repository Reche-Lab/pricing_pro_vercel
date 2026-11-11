"use client";
import React, { useState } from "react";
import { CircleDot, ImagePlus, Layers } from "lucide-react";
import { defaultArtworkOptions, defaultMockup, type CommerceArtworkOptions as Options, type ProductMockup } from "@/domain/commerce/artwork-options";
import type { PrintGeometry, PrintMargins } from "@/domain/artwork/geometry";
import { CommerceImageUpload } from "./CommerceImageUpload";
import { EditableNumberInput } from "@/components/ui/EditableNumberInput";
import { StoreProductMockup } from "./StoreProductMockup";
import { circularMockupPresets } from "@/domain/commerce/mockup-presets";
const field = "w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white";
export function CommerceArtworkOptions({ value, onChange, onBusyChange, geometry, margins }: {
  value?: Options; onChange: (value: Options) => void; onBusyChange: (busy: boolean) => void;
  geometry?: PrintGeometry | null; margins?: PrintMargins;
}) {
  const options = value ?? defaultArtworkOptions();
  const [presetId, setPresetId] = useState(() => circularMockupPresets.find(preset => preset.model.back.baseUrl === value?.mockup?.back.baseUrl)?.id ?? "botton");
  const preset = circularMockupPresets.find(item => item.id === presetId) ?? circularMockupPresets[0];
  const incompatibleGeometry = Boolean(geometry && geometry.shape !== "circle");
  const [sample, setSample] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  function update(patch: Partial<Options>) { onChange({ ...options, ...patch }); }
  function updateModel(patch: Partial<ProductMockup>) { update({ mockup: { ...(options.mockup ?? defaultMockup()), ...patch } }); }
  return <details className="min-w-0 border-t border-zinc-800 pt-3 sm:col-span-2"><summary className="cursor-pointer text-sm font-medium text-emerald-200"><Layers size={16} className="mr-2 inline" />Preparação da arte, benefício e modelo do produto</summary><div className="mt-4 grid min-w-0 gap-4">
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={options.allowTeamPreparation} onChange={e => update({ allowTeamPreparation: e.target.checked })} />Permitir comprar enviando a arte para ajuste pela equipe</label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Desconto por arte pronta (R$)<EditableNumberInput className={field} min={0} max={1000} step={0.01} value={options.discountFixedCents / 100} onValueChange={v => update({ discountFixedCents: Math.round(v * 100) })} /></label><label className="grid gap-1 text-sm">Limite do desconto no grupo (%)<EditableNumberInput className={field} min={0} max={30} step={1} value={options.maxDiscountPercent} onValueChange={v => update({ maxDiscountPercent: v })} /></label></div>
    <p className="text-xs leading-5 text-zinc-400">O benefício é aplicado uma vez por arte e produto, somente com enquadramento e aprovação válidos. Não incide no frete. Zero desativa o desconto.</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(options.mockup)} onChange={e => update({ mockup: e.target.checked ? defaultMockup() : undefined })} />Configurar máscaras de frente e verso</label>
    <div className="grid min-w-0 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label className="grid min-w-0 gap-1 text-sm">Modelo visual do produto
        <select className={`${field} min-h-10`} value={presetId} disabled={incompatibleGeometry} onChange={event => { setPresetId(event.target.value); setMessage(""); }} title="Mesma frente e borda circular, com diferentes acabamentos no verso. O diâmetro e as medidas de impressão continuam sendo os do produto.">
          {circularMockupPresets.map(item => <option key={item.id} value={item.id} title={item.finish}>{item.label}</option>)}
        </select>
      </label>
      <button type="button" disabled={incompatibleGeometry}
        title={`Aplicar acabamento ${preset.finish.toLowerCase()} sem alterar preços, descontos, diâmetro, segurança, sangria ou corte. Confira o acabamento com uma peça física.`}
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 text-sm text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => { update({ mockup: structuredClone(preset.model) }); setMessage(`Modelo ${preset.label} aplicado. Salve a loja para utilizar nos produtos.`); }}><CircleDot size={17} />Aplicar modelo {preset.label}</button>
      <a href={preset.downloadUrl} download className="text-xs text-zinc-400 underline hover:text-zinc-100 sm:col-span-2">Baixar camadas PNG</a>
    </div>
    {message ? <p role="status" className="text-xs text-emerald-300">{message}</p> : null}
    {options.mockup ? <>
      <p className="text-xs leading-5 text-zinc-400">Cada face usa imagens com o mesmo enquadramento: base do produto, máscara com área da arte opaca e restante transparente, e acabamento sobreposto. Use transparência PNG/WebP. A simulação não modifica o PDF de impressão.</p>
      {(["front", "back"] as const).map(side => <details key={side} className="border-t border-zinc-800 pt-3"><summary className="cursor-pointer text-sm">{side === "front" ? "Frente" : "Verso"}</summary><div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2">
        {([ ["baseUrl", "Base"], ["maskUrl", "Máscara de transparência"], ["overlayUrl", "Acabamento: fecho, ímã ou abridor"] ] as const).map(([key, label]) => <CommerceImageUpload key={key} purpose="product" label={`${label} · ${side === "front" ? "frente" : "verso"}`} value={options.mockup![side][key]} onBusyChange={onBusyChange} onChange={url => updateModel({ [side]: { ...options.mockup![side], [key]: url } })} />)}
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">{([ ["x", "Posição X"], ["y", "Posição Y"], ["width", "Largura"], ["height", "Altura"] ] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-xs">{label} (%)<EditableNumberInput className={field} min={key === "width" || key === "height" ? 5 : 0} max={100} step={1} value={Math.round(options.mockup![side][key] * 100)} onValueChange={v => updateModel({ [side]: { ...options.mockup![side], [key]: v / 100 } })} /></label>)}</div>
      </div></details>)}
      <label className="grid max-w-xs gap-1 text-xs">Abertura central do verso (%)<EditableNumberInput className={field} min={20} max={95} value={Math.round(options.mockup.backOpeningRatio * 100)} onValueChange={v => updateModel({ backOpeningRatio: v / 100 })}/></label>
      <p className="text-xs leading-5 text-zinc-400">A borda da frente segue sempre a sangria configurada no produto. Nos modelos circulares, o brilho sobre a arte é omitido e o acabamento central do verso é preservado.</p>
      <p className="text-xs text-zinc-400">A dobra radial é simulada para produtos circulares. Nos demais formatos, são usadas máscaras planas. Calibre com uma peça física antes de publicar.</p>
      <label className="inline-flex min-h-10 w-fit cursor-pointer items-center gap-2 rounded-md border border-zinc-700 px-3 text-sm"><ImagePlus size={16} />Arte de teste (não é publicada)<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; setError(""); if (!file.size || file.size > 3145728 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Envie uma imagem PNG, JPEG ou WebP de até 3 MB."); return; } const reader = new FileReader(); reader.onload = () => setSample(String(reader.result)); reader.onerror = () => setError("Não foi possível abrir a imagem."); reader.readAsDataURL(file); }} /></label>
      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
      {sample && geometry && margins ? <StoreProductMockup name="Calibração" sourceUrl={sample} geometry={geometry} margins={margins} model={options.mockup} /> : null}
    </> : null}
  </div></details>;
}

"use client";
import React, { useId } from "react";
import { Search, ChevronDown } from "lucide-react";
import { commerceMerchantSchema, emptyCommerceMerchant, type CommerceMerchant } from "@/domain/commerce/merchant";
import { CommerceCaption } from "./CommerceAdminControls";

export function CommerceMerchantProduct({ value, onChange }: { value?: CommerceMerchant; onChange: (value: CommerceMerchant) => void }) {
  const id = useId(), merchant = value ?? emptyCommerceMerchant();
  const update = (patch: Partial<CommerceMerchant>) => onChange({ ...merchant, ...patch });
  const result = commerceMerchantSchema.safeParse(merchant);
  return <details className="min-w-0 border-t border-zinc-700 pt-3 sm:col-span-2"><summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><Search size={16}/>Catálogo Google<span className="ml-auto text-xs text-zinc-400">{merchant.enabled ? "Selecionado" : "Não incluído"}</span><ChevronDown size={15}/></summary>
    <div className="grid min-w-0 items-start gap-4 py-3 sm:grid-cols-2">
      <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-1" checked={merchant.enabled} onChange={event => update({ enabled: event.target.checked })}/><span>Incluir no catálogo Google e confirmar disponibilidade para compra<small className="mt-1 block leading-5 text-zinc-400">Somente produtos novos, com disponibilidade e capacidade de produção confirmadas. O catálogo não implica pronta entrega; mantenha os prazos de produção atualizados. Ao desmarcar, o item sai da próxima leitura do feed.</small></span></label>
      <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-1" checked={merchant.identifiersAbsent} onChange={event => update({ identifiersAbsent: event.target.checked, ...(event.target.checked ? { gtin: "", mpn: "" } : {}) })}/><span>Este produto não possui GTIN ou MPN atribuídos<small className="mt-1 block text-zinc-400">Use somente quando esses identificadores realmente não existem. Não substitua pelo SKU interno.</small></span></label>
      {([ ["brand", "Marca", "Marca real do produto. Não preencha com a loja se ela não for a fabricante."], ["gtin", "GTIN", "Código de barras atribuído ao produto: 8, 12, 13 ou 14 dígitos."], ["mpn", "MPN do fabricante", "Código de peça atribuído pelo fabricante, não o ID interno do sistema."] ] as const).map(([key, label, help]) => key !== "brand" && merchant.identifiersAbsent ? null : <label key={key} htmlFor={`${id}-${key}`} className="grid min-w-0 self-start gap-1 text-sm"><CommerceCaption label={label} help={help}/><input id={`${id}-${key}`} className="min-h-11 min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={merchant[key]} maxLength={key === "gtin" ? 14 : 70} inputMode={key === "gtin" ? "numeric" : "text"} onChange={event => update({ [key]: event.target.value })}/></label>)}
      {!result.success ? <p className="text-xs text-amber-200 sm:col-span-2" role="status">{result.error.issues[0].message}</p> : null}
    </div>
  </details>;
}

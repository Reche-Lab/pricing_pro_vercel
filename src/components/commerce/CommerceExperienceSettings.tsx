"use client";
import React from "react";
import { LayoutTemplate, Palette } from "lucide-react";
import { defaultStoreExperience, type StoreExperience } from "@/domain/commerce/studio-experience";
import { CommerceImageUpload } from "./CommerceImageUpload";
export function CommerceExperienceSettings({ value, onChange, onBusyChange }: { value?: StoreExperience; onChange: (value: StoreExperience) => void; onBusyChange: (busy: boolean) => void }) {
  const experience = value ?? defaultStoreExperience();
  return <fieldset className="min-w-0 space-y-4 border-0 border-t border-zinc-800 pt-5" aria-label="Identidade visual da loja"><legend className="text-sm font-semibold">Identidade visual</legend>
    <div className="inline-flex rounded-md border border-zinc-700 p-1" role="group" aria-label="Estilo da loja">{([ ["classic", "Clássico", LayoutTemplate], ["studio", "Estúdio", Palette] ] as const).map(([style, label, Icon]) => <button type="button" key={style} aria-pressed={experience.style === style} className={`inline-flex min-h-11 items-center gap-2 rounded px-4 text-sm ${experience.style === style ? "bg-emerald-500/15 text-emerald-200" : "text-zinc-400 hover:bg-zinc-800"}`} onClick={() => onChange({ ...experience, style })}><Icon size={17}/>{label}</button>)}</div>
    {experience.style === "studio" ? <><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={experience.motion} onChange={event => onChange({ ...experience, motion: event.target.checked })}/>Ativar movimentos suaves<span className="sr-only">Respeita movimento reduzido, toque e abas ocultas.</span></label><CommerceImageUpload label="Foto do estúdio (opcional)" purpose="cover" value={experience.backgroundUrl} onChange={backgroundUrl => onChange({ ...experience, backgroundUrl })} onBusyChange={onBusyChange}/><p className="text-xs leading-5 text-zinc-400">Sem foto própria, a abertura usa os produtos do catálogo sobre um cenário ilustrativo. Banners cadastrados continuam nas campanhas da home. A demonstração de arte aparece para produtos personalizados com modelo de frente/verso cadastrado.</p></> : null}
    <p className="text-xs text-zinc-400">A alteração vale somente para esta loja. Salve e abra a prévia antes de publicar.</p>
  </fieldset>;
}

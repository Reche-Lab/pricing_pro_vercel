"use client";
import React from "react";
import { Globe } from "lucide-react";
import { CommerceImageUpload } from "./CommerceImageUpload";

export function CommerceBrandingFields({ name, logoUrl, faviconUrl, onLogoChange, onIconChange, onBusyChange }: {
  name: string;
  logoUrl: string;
  faviconUrl: string;
  onLogoChange: (url: string) => void;
  onIconChange: (url: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const icon = faviconUrl || logoUrl;
  return <section aria-label="Logo e ícone da loja" className="min-w-0 space-y-5 border-t border-zinc-800 pt-5 lg:col-span-2">
    <h3 className="text-sm font-semibold">Logo e ícone da loja</h3>
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <CommerceImageUpload label="Logo da loja" purpose="logo" value={logoUrl} onChange={onLogoChange} onBusyChange={onBusyChange}/>
        <p className="text-xs leading-relaxed text-zinc-400">Logo completo da marca, usado na loja e na identificação da empresa para os buscadores. Prefira uma imagem nítida de pelo menos 512 px.</p>
      </div>
      <div className="min-w-0 space-y-3">
        <CommerceImageUpload label="Ícone do navegador e Google" purpose="icon" value={faviconUrl} onChange={onIconChange} onBusyChange={onBusyChange}/>
        <p className="text-xs leading-relaxed text-zinc-400">Prefira um símbolo simples, quadrado, de 512 × 512 px, legível em tamanhos pequenos. Sem ícone separado, usaremos o logo enviado por aqui.</p>
      </div>
    </div>
    <div className="grid min-w-0 gap-5 border-t border-zinc-800 pt-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <p className="text-xs text-zinc-400">Prévia da aba do navegador</p>
        <div className="flex min-w-0 items-center gap-2 rounded-t-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm">
          {icon ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={icon} alt="Ícone na aba" width={16} height={16} className="h-4 w-4 shrink-0 object-contain"/>
          </> : <Globe size={16} className="shrink-0 text-zinc-500"/>}
          <span className="truncate">{name || "Sua loja"}</span>
        </div>
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-xs text-zinc-400">Confira a legibilidade</p>
        <div className="flex min-h-12 flex-wrap items-center gap-4" aria-label="Prévias do ícone em 16, 32 e 48 pixels">
          {[16, 32, 48].map(size => <div key={size} className="flex items-center gap-1.5">
            {icon ? <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={icon} alt={`Ícone em ${size} pixels`} width={size} height={size} style={{ width: size, height: size }} className="shrink-0 object-contain"/>
            </> : <Globe size={size} className="text-zinc-600"/>}
            <span className="text-xs text-zinc-500">{size}</span>
          </div>)}
        </div>
      </div>
    </div>
    <p className="text-xs leading-relaxed text-zinc-500">O Google decide quando e como exibir a marca; a atualização não é imediata. Um ícone próprio nos resultados de busca exige o domínio próprio da loja.</p>
  </section>;
}

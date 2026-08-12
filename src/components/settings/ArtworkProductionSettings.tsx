"use client";

import { useState } from "react";
import { Printer, Save } from "lucide-react";
import type { ArtworkProductionProfile } from "@/services/artwork/production";

export function ArtworkProductionSettings({ profile }: { profile: ArtworkProductionProfile }) {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/settings/artwork-production", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({
        pageWidthMm: Number(form.get("pageWidthMm")), pageHeightMm: Number(form.get("pageHeightMm")),
        marginMm: Number(form.get("marginMm")), bottomMarginMm: Number(form.get("bottomMarginMm")), bleedMm: Number(form.get("bleedMm")),
        safeMarginMm: Number(form.get("safeMarginMm")), gapMm: Number(form.get("gapMm")), dpi: Number(form.get("dpi")),
        layoutMode: form.get("layoutMode"), drawCutLines: form.get("drawCutLines") === "on"
      })
    });
    const data = await response.json().catch(() => null);
    setSaving(false);
    setMessage(response.ok ? "Perfil de produção salvo." : data?.error ?? "Não foi possível salvar.");
  }

  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900/70">
      <summary className="cursor-pointer list-none px-5 py-4"><span className="inline-flex items-center gap-2 font-semibold text-white"><Printer className="text-cyan-300" size={17} /> Produção de artes e impressão</span><p className="mt-1 text-sm text-zinc-500">Folha, espaçamento, resolução e margens padrão para produtos antigos.</p></summary>
      <form className="grid gap-4 border-t border-zinc-800 p-5" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input defaultValue={profile.pageWidthMm} label="Largura da folha (mm)" name="pageWidthMm" />
          <Input defaultValue={profile.pageHeightMm} label="Altura da folha (mm)" name="pageHeightMm" />
          <Input defaultValue={profile.marginMm} label="Margem superior e lateral (mm)" name="marginMm" />
          <Input defaultValue={profile.bottomMarginMm} label="Margem inferior de segurança (mm)" min="10" name="bottomMarginMm" />
          <Input defaultValue={profile.gapMm} label="Espaço entre artes (mín. 3 mm)" min="3" name="gapMm" />
          <Input defaultValue={profile.bleedMm} label="Sangria padrão (mm)" name="bleedMm" />
          <Input defaultValue={profile.safeMarginMm} label="Segurança padrão (mm)" name="safeMarginMm" />
          <Input defaultValue={profile.dpi} label="Resolução (DPI)" name="dpi" step="1" />
          <label><span className="mb-1 block text-xs font-medium text-zinc-400">Distribuição</span><select className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" defaultValue={profile.layoutMode} name="layoutMode"><option value="auto">Automática</option><option value="grid">Grade</option><option value="hex">Alternada</option></select></label>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-zinc-500">Produtos com medidas próprias usam os valores cadastrados em Produtos. Estes campos permanecem como fallback para registros antigos.</p>
        <p className="text-xs leading-5 text-zinc-500">As artes sempre começam no topo útil da folha. A margem inferior protege a saída do papel e o espaçamento nunca será menor que 3 mm.</p>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-300"><input className="accent-cyan-400" defaultChecked={profile.drawCutLines} name="drawCutLines" type="checkbox" /> Incluir linhas de corte</label>
        {message ? <p className="text-sm text-zinc-300">{message}</p> : null}
        <button className="focus-ring inline-flex w-fit items-center gap-2 rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-950 disabled:opacity-50" disabled={saving} type="submit"><Save size={15} /> {saving ? "Salvando..." : "Salvar perfil"}</button>
      </form>
    </details>
  );
}

function Input({ defaultValue, label, name, step = "0.1", min = "0" }: { defaultValue: number; label: string; name: string; step?: string; min?: string }) {
  return <label><span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span><input className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" defaultValue={defaultValue} min={min} name={name} required step={step} type="number" /></label>;
}

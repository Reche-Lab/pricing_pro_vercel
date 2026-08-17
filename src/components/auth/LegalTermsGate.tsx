"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, FileCheck2, Mail } from "lucide-react";

export function LegalTermsGate({ term }: { term: { id: string; title: string; version: string; contentHtml: string } }) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [representsCompany, setRepresentsCompany] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setLoading(true); setError("");
    const response = await fetch("/api/legal/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ termId: term.id, accepted, representsCompany }) });
    const data = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok || !data?.ok) { setError(data?.error ?? "Não foi possível registrar o aceite."); return; }
    router.push(data.next ?? "/onboarding"); router.refresh();
  }
  return <div className="mx-auto max-w-6xl overflow-hidden rounded-lg border border-amber-400/25 bg-zinc-900/90"><header className="border-b border-zinc-800 p-5 sm:p-7"><p className="text-xs font-semibold uppercase text-amber-300">Primeiro acesso · versão {term.version}</p><h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{term.title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">Leia o documento integralmente. O acesso às funções operacionais será liberado após o aceite digital.</p></header><div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_330px]"><div className="legal-terms-content max-h-[65vh] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/70 p-5 text-sm leading-6 text-zinc-300 [&_p]:mb-5 [&_strong]:text-white" dangerouslySetInnerHTML={{ __html: term.contentHtml }} /><aside className="grid content-start gap-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4"><div className="flex gap-3"><FileCheck2 className="shrink-0 text-amber-300" size={20} /><div><p className="text-sm font-semibold text-white">Registro auditável</p><p className="mt-1 text-xs leading-5 text-zinc-500">Guardaremos versão, hash do documento, data, usuário, IP e navegador.</p></div></div><div className="flex gap-3"><Mail className="shrink-0 text-sky-300" size={20} /><div><p className="text-sm font-semibold text-white">Cópia por e-mail</p><p className="mt-1 text-xs leading-5 text-zinc-500">Você receberá uma cópia do termo aceito para consulta.</p></div></div><label className="flex cursor-pointer gap-3 rounded-md border border-zinc-800 p-3 text-sm leading-5 text-zinc-300"><input className="mt-1 size-4 accent-amber-400" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} type="checkbox" /><span>Li, compreendi e concordo com os termos apresentados.</span></label><label className="flex cursor-pointer gap-3 rounded-md border border-zinc-800 p-3 text-sm leading-5 text-zinc-300"><input className="mt-1 size-4 accent-amber-400" checked={representsCompany} onChange={(e) => setRepresentsCompany(e.target.checked)} type="checkbox" /><span>Confirmo que posso aceitar este compromisso em nome da empresa que represento.</span></label>{error ? <p className="rounded-md bg-red-400/10 p-3 text-sm text-red-300">{error}</p> : null}<button className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-amber-400 px-4 py-3 font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50" disabled={!accepted || !representsCompany || loading} onClick={submit} type="button"><CheckCircle2 size={17} />{loading ? "Registrando aceite..." : "Aceitar e continuar"}</button></aside></div></div>;
}

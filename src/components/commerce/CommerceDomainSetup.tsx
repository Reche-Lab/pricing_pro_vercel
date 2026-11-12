"use client";
import React, { useEffect, useState } from "react";
import { CheckCircle2, Circle, Copy, Globe, Loader2, RefreshCw, Send } from "lucide-react";
import type { DomainSetup } from "@/domain/commerce/domain-setup";
import { storeRequest } from "./store-http";
const field = "w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-40";
export function DomainSetupDetails({ domain, onCheck, busy }: { domain: DomainSetup; onCheck: () => void; busy: boolean }) {
  const [copied, setCopied] = useState("");
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setCopied("Copiado."); } catch { setCopied("Não foi possível copiar. Selecione o valor e copie manualmente."); } }
  const records = [{ type: "TXT", name: `_pricing-pro.${domain.hostname}`, value: `pricing-pro=${domain.verification_token}`, ttl: 300 }, ...domain.expected_records];
  const dnsReady = Boolean(domain.last_check?.records.length && domain.last_check.records.length === domain.expected_records.length && domain.last_check.records.every(record => record.matched));
  const stages = [["Vercel", Boolean(domain.vercel_added_at)], ["Propriedade TXT", Boolean(domain.last_check?.ownership)], ["Apontamento DNS", dnsReady], ["HTTPS confirmado pelo operador", Boolean(domain.https_confirmed_at)], ["Autorização do superadmin", Boolean(domain.approved_at)], ["Vínculo no deploy", domain.authorized]] as const;
  return <div className="min-w-0 space-y-4">
    <p className="text-xs text-zinc-400">Provedor DNS informado: {domain.dns_provider || "Não informado"}.</p>
    <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label={`Etapas de ${domain.hostname}`}>{stages.map(([label, done]) => <li key={label} className={`inline-flex items-center gap-1.5 text-xs ${done ? "text-emerald-300" : "text-zinc-400"}`}>{done ? <CheckCircle2 size={14}/> : <Circle size={14}/>} {label}<span className="sr-only">: {done ? "concluído" : "pendente"}</span></li>)}</ul>
    <p className="text-xs leading-5 text-zinc-400">Adicione os registros abaixo no seu provedor DNS. O TXT confirma a propriedade para a plataforma e não substitui uma eventual verificação exigida pela Vercel. Preserve MX, SPF, DKIM e demais registros de e-mail.</p>
    <div className="divide-y divide-zinc-800 border-y border-zinc-800" aria-label="Registros DNS esperados">{records.map((record, index) => {
      const checked = index === 0 ? domain.last_check ? { matched: domain.last_check.ownership, found: domain.last_check.ownershipFound } : null : domain.last_check?.records[index - 1];
      return <div key={`${record.type}:${record.name}:${record.value}`} className="grid min-w-0 gap-3 py-3 sm:grid-cols-[60px_minmax(0,1fr)_minmax(0,1.4fr)]"><strong className="text-xs text-zinc-300">{record.type}<small className="mt-1 block font-normal text-zinc-500">TTL {record.ttl}s</small></strong><div className="min-w-0"><small className="text-zinc-500">Nome</small><code className="block break-all text-xs text-zinc-200">{record.name}</code></div><div className="min-w-0"><small className="text-zinc-500">Valor esperado</small><div className="flex min-w-0 items-start gap-2"><code className="min-w-0 flex-1 break-all text-xs text-zinc-200">{record.value}</code><button type="button" title="Copiar valor DNS" aria-label={`Copiar ${record.type} ${record.name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded border border-zinc-700 hover:bg-zinc-800" onClick={() => void copy(record.value)}><Copy size={14}/></button></div><p className={`mt-2 text-xs ${checked?.matched ? "text-emerald-300" : "text-amber-200"}`}>{checked ? checked.matched ? "Registro encontrado" : "Ainda não corresponde ao esperado" : "Ainda não consultado"}</p>{checked ? <p className="mt-1 break-all text-xs text-zinc-500">Encontrado: {checked.found.join(" · ") || "Nenhum valor retornado"}</p> : null}</div></div>;
    })}</div>
    {!domain.expected_records.length ? <p className="text-sm text-amber-200">A administração ainda precisa cadastrar os registros exatos indicados pela Vercel.</p> : null}
    {domain.operator_note ? <p className="whitespace-pre-wrap break-words border-l-2 border-sky-500/40 pl-3 text-sm text-zinc-300">{domain.operator_note}</p> : null}
    {domain.approved_at && !domain.authorized ? <p className="text-sm text-amber-200">Autorizado no painel. Aguardando a administração configurar o vínculo no deploy da Vercel.</p> : null}
    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={onCheck}>{busy ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>}Verificar DNS agora</button><button type="button" className={button} onClick={() => void copy([domain.hostname, ...records.map(record => `${record.type} | ${record.name} | ${record.value} | TTL ${record.ttl}`)].join("\n"))}><Copy size={16}/>Copiar instruções</button></div>
    {copied ? <p role="status" className="text-xs text-zinc-300">{copied}</p> : null}
    {domain.last_check ? <p className="text-xs text-zinc-500">Última consulta: {new Date(domain.last_check.checkedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. DNS pode demorar a propagar. HTTPS e inclusão no projeto são confirmações manuais do operador, não testes de disponibilidade.</p> : null}
  </div>;
}
export function CommerceDomainSetup({ hostname, onHostnameChange, disabled }: { hostname: string; onHostnameChange: (value: string) => void; disabled: boolean }) {
  const [domains, setDomains] = useState<DomainSetup[]>([]), [provider, setProvider] = useState(""), [includeWww, setIncludeWww] = useState(true);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => { let active = true; void storeRequest("/api/commerce/admin/domains").then(result => { if (active) setDomains(result.domains ?? []); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  async function check(domain: DomainSetup) {
    setBusy(domain.id); setError(""); setMessage("");
    try { const result = await storeRequest(`/api/commerce/admin/domains/${domain.id}/check`, "POST"); setDomains(current => current.map(item => item.id === domain.id ? result.domain : item)); }
    catch (error) { setError(error instanceof Error ? error.message : "Não foi possível consultar o DNS."); }
    finally { setBusy(""); }
  }
  return <div className="min-w-0 space-y-5">
    <form className="grid min-w-0 gap-4 sm:grid-cols-2" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy("request"); setError(""); setMessage("");
      try { const result = await storeRequest("/api/commerce/admin/domains", "POST", { hostname, provider, includeWww }); setDomains(result.domains); setMessage(result.message); }
      catch (error) { setError(error instanceof Error ? error.message : "Não foi possível registrar o domínio."); }
      finally { setBusy(""); }
    }}><label className="grid gap-1 text-sm">Domínio desejado<input className={field} value={hostname} onChange={event => onHostnameChange(event.target.value.trim().toLowerCase())} placeholder="groundshop.com.br" required maxLength={253} disabled={disabled || Boolean(busy)}/></label><label className="grid gap-1 text-sm">Provedor DNS (opcional)<input className={field} value={provider} onChange={event => setProvider(event.target.value)} placeholder="Registro.br, Cloudflare…" maxLength={100} disabled={disabled || Boolean(busy)}/></label><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={includeWww} onChange={event => setIncludeWww(event.target.checked)} disabled={disabled || Boolean(busy)}/>Solicitar também a versão com www</label><button className={`${button} justify-self-start sm:col-span-2`} disabled={disabled || Boolean(busy)}>{busy === "request" ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>}Solicitar configuração do domínio</button></form>
    {error ? <p role="alert" className="break-words text-sm text-rose-300">{error}</p> : null}{message ? <p role="status" className="text-sm text-emerald-300">{message}</p> : null}
    {loading ? <p role="status" className="text-sm text-zinc-400">Carregando solicitações…</p> : domains.length ? <div className="space-y-3">{domains.map(domain => <details key={domain.id} className="min-w-0 rounded-lg border border-zinc-800 p-4"><summary className="cursor-pointer break-all text-sm font-semibold text-zinc-100"><Globe size={16} className="mr-2 inline"/>{domain.hostname}<span className="ml-2 text-xs font-normal text-zinc-400">{domain.authorized ? "Vínculo no deploy configurado" : domain.approved_at ? "Autorizado · falta deploy" : "Em configuração"}</span></summary><div className="mt-4"><DomainSetupDetails domain={domain} busy={Boolean(busy)} onCheck={() => void check(domain)}/></div></details>)}</div> : <p className="text-sm text-zinc-400">Nenhuma solicitação registrada. A loja pode operar pela URL provisória da plataforma.</p>}
  </div>;
}

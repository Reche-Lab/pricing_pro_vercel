"use client";
import React, { useEffect, useState } from "react";
import { Copy, Globe, Loader2, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { canApproveDomain, type DomainSetup, type DnsRecord } from "@/domain/commerce/domain-setup";
import { DomainSetupDetails } from "@/components/commerce/CommerceDomainSetup";
import { EditableNumberInput } from "@/components/ui/EditableNumberInput";
import { storeRequest } from "@/components/commerce/store-http";
const field = "w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-40";
function OperatorDomain({ domain, onUpdate }: { domain: DomainSetup; onUpdate: (domain: DomainSetup) => void }) {
  const [records, setRecords] = useState<DnsRecord[]>(domain.expected_records), [note, setNote] = useState(domain.operator_note);
  const [vercelAdded, setVercelAdded] = useState(Boolean(domain.vercel_added_at)), [httpsConfirmed, setHttpsConfirmed] = useState(Boolean(domain.https_confirmed_at));
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => { setRecords(domain.expected_records); setNote(domain.operator_note); setVercelAdded(Boolean(domain.vercel_added_at)); setHttpsConfirmed(Boolean(domain.https_confirmed_at)); }, [domain]);
  const dirty = JSON.stringify(records) !== JSON.stringify(domain.expected_records) || note !== domain.operator_note || vercelAdded !== Boolean(domain.vercel_added_at) || httpsConfirmed !== Boolean(domain.https_confirmed_at);
  async function action(input: object) {
    if (busy) return; setBusy(true); setError(""); setMessage("");
    try { const result = await storeRequest("/api/superadmin/commerce-domains", "POST", { ...input, id: domain.id }); onUpdate(result.domain); setMessage(result.message); }
    catch (error) { setError(error instanceof Error ? error.message : "Não foi possível concluir."); }
    finally { setBusy(false); }
  }
  function updateRecord(index: number, patch: Partial<DnsRecord>) { setRecords(current => current.map((record, position) => position === index ? { ...record, ...patch } : record)); }
  return <article className="min-w-0 rounded-lg border border-zinc-800 p-4">
    <details><summary className="cursor-pointer break-all text-sm font-semibold"><span className="text-white">{domain.hostname}</span><span className="ml-2 font-normal text-zinc-400">{domain.tenant_name} · {domain.approved_at ? "Autorizado" : "Pendente"}</span></summary>
      <div className="mt-5 min-w-0 space-y-5">
        <DomainSetupDetails domain={domain} busy={busy || dirty} onCheck={() => void action({ action: "check" })}/>
        <form className="min-w-0 space-y-4 border-t border-zinc-800 pt-4" onSubmit={event => { event.preventDefault(); void action({ action: "save", revision: domain.revision, records, note, vercelAdded, httpsConfirmed }); }}>
          <h3 className="font-medium">Registros indicados pela Vercel</h3><p className="text-xs leading-5 text-zinc-400">Copie os valores exatos de Settings → Domains do projeto. Não presuma IPs/CNAMEs genéricos. Salvar invalida a conferência e a autorização anterior no painel, mas não altera o DNS nem remove vínculos já presentes no deploy.</p>
          <fieldset disabled={busy} className="min-w-0 space-y-4 border-0 p-0">
            {records.map((record, index) => <div key={index} className="grid min-w-0 items-end gap-3 border-b border-zinc-800 pb-4 sm:grid-cols-[100px_minmax(0,1fr)_minmax(0,1.5fr)_90px_40px]">
              <label className="grid min-w-0 gap-1 text-xs">Tipo<select className={field} value={record.type} onChange={event => updateRecord(index, { type: event.target.value as DnsRecord["type"] })}>{["A", "AAAA", "CNAME", "TXT"].map(type => <option key={type}>{type}</option>)}</select></label>
              <label className="grid min-w-0 gap-1 text-xs">Nome<input className={field} value={record.name} required maxLength={253} placeholder="@ ou www" onChange={event => updateRecord(index, { name: event.target.value })}/></label>
              <label className="grid min-w-0 gap-1 text-xs">Valor<input className={field} value={record.value} required maxLength={1024} onChange={event => updateRecord(index, { value: event.target.value })}/></label>
              <label className="grid min-w-0 gap-1 text-xs">TTL (s)<EditableNumberInput className={field} value={record.ttl} min={60} max={86400} onValueChange={ttl => updateRecord(index, { ttl })}/></label>
              <button type="button" title="Remover registro esperado" aria-label={`Remover registro ${index + 1}`} className="grid h-10 w-10 place-items-center rounded border border-zinc-700 text-rose-300" onClick={() => setRecords(current => current.filter((_, position) => position !== index))}><Trash2 size={17}/></button>
            </div>)}
            <button type="button" className={button} disabled={records.length >= 10} onClick={() => setRecords(current => [...current, { type: "A", name: "@", value: "", ttl: 300 }])}><Plus size={16}/>Adicionar registro esperado</button>
            <label className="grid min-w-0 gap-1 text-sm">Orientações para o tenant<textarea className={field} rows={3} maxLength={1500} value={note} onChange={event => setNote(event.target.value)}/></label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={vercelAdded} onChange={event => setVercelAdded(event.target.checked)}/>Confirmei que este hostname foi adicionado ao projeto correto na Vercel.</label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={httpsConfirmed} onChange={event => setHttpsConfirmed(event.target.checked)}/>Conferi na Vercel que o HTTPS deste hostname está disponível.</label>
          </fieldset>
          <button className={button} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}Salvar registros e confirmações</button>
        </form>
        {dirty ? <p className="text-xs text-amber-200">Salve as alterações antes de verificar o DNS ou autorizar.</p> : null}
        <button type="button" className={`${button} text-emerald-200`} disabled={busy || dirty || !canApproveDomain(domain) || Boolean(domain.approved_at)} title="Exige TXT de propriedade, DNS correspondente, confirmação da Vercel e HTTPS e consulta dos últimos 10 minutos" onClick={() => void action({ action: "approve", revision: domain.revision })}><ShieldCheck size={16}/>Autorizar domínio no painel</button>
        {domain.approved_at ? <div className="min-w-0 space-y-2 border-l-2 border-amber-500/40 pl-3"><strong className="text-sm">Etapa final no deploy</strong><p className="text-xs leading-5 text-zinc-400">Mescle este host em COMMERCE_CUSTOM_DOMAINS sem apagar os demais tenants, selecione o host principal pela ordem do JSON e faça redeploy. A autorização do painel sozinha não publica o host.</p><code className="block break-all text-xs text-zinc-200">{JSON.stringify({ [domain.hostname]: domain.tenant_slug })}</code><button type="button" className={button} onClick={() => void navigator.clipboard.writeText(JSON.stringify({ [domain.hostname]: domain.tenant_slug })).then(() => setMessage("Vínculo copiado. Mescle com os hosts existentes no deploy.")).catch(() => setError("Não foi possível copiar. Selecione o JSON manualmente."))}><Copy size={15}/>Copiar vínculo deste host</button></div> : null}
        {error ? <p role="alert" className="break-words text-sm text-rose-300">{error}</p> : null}{message ? <p role="status" className="text-sm text-emerald-300">{message}</p> : null}
      </div>
    </details>
  </article>;
}
export function CommerceDomainsPanel() {
  const [domains, setDomains] = useState<DomainSetup[]>([]), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; void storeRequest("/api/superadmin/commerce-domains").then(result => { if (active) setDomains(result.domains); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  return <div className="mt-4 min-w-0 space-y-4"><p className="text-sm text-zinc-400">Visão global das até 150 solicitações mais recentes, identificadas por tenant. O operador informa os registros da Vercel; o tenant consulta e copia as instruções.</p>{loading ? <p role="status" className="text-sm text-zinc-400">Carregando domínios…</p> : null}{error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}{domains.map(domain => <OperatorDomain key={domain.id} domain={domain} onUpdate={next => setDomains(current => current.map(row => row.id === next.id ? next : row))}/>)}{!loading && !error && !domains.length ? <p className="text-sm text-zinc-400">Nenhum domínio solicitado.</p> : null}</div>;
}
export function CommerceDomainsSection() {
  const [open, setOpen] = useState(false);
  return <section className="min-w-0 border-y border-zinc-800 py-5 xl:col-span-2"><details onToggle={event => setOpen(event.currentTarget.open)}><summary className="cursor-pointer font-semibold text-white"><Globe size={18} className="mr-2 inline text-emerald-300"/>Domínios das lojas e DNS</summary>{open ? <CommerceDomainsPanel/> : null}</details></section>;
}

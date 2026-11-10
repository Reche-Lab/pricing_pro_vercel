"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Link2, Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { commerceOlistSettingsSchema, type CommerceOlistSettings } from "@/domain/commerce/olist";
import { OlistReconnectBoundary } from "@/components/olist/OlistReconnectBoundary";
import { requestOlistReconnect, OLIST_CONNECTED_EVENT } from "@/lib/olist/browser-request";
import { isOlistReconnectRequired } from "@/lib/olist/oauth-errors";
import { storeRequest } from "./store-http";

type Option = { kind: string; external_id: string; name: string };
const field = "min-h-11 min-w-0 w-full self-start rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm";
const button = "focus-ring inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:opacity-40";
export function CommerceOlistSettings() {
  const [settings, setSettings] = useState<CommerceOlistSettings>(commerceOlistSettingsSchema.parse({}));
  const [configured, setConfigured] = useState(false), [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => { let cancelled = false; storeRequest("/api/commerce/admin/olist").then(data => { if (!cancelled) { setSettings(data.settings); setConfigured(data.configured); setOptions(data.options); } }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, []);
  useEffect(() => { const refresh = () => setMessage("Olist reconectado. Confira e salve as opções abaixo."); window.addEventListener(OLIST_CONNECTED_EVENT, refresh); return () => window.removeEventListener(OLIST_CONNECTED_EVENT, refresh); }, []);
  async function sync() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/olist/payment-options/sync", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await response.json();
      if (isOlistReconnectRequired(data)) { requestOlistReconnect(); throw new Error("Reconecte o Olist para sincronizar as opções."); }
      if (!response.ok || data.ok === false) throw new Error(typeof data.error === "string" ? data.error : "O Olist não concluiu a sincronização.");
      const refreshed = await storeRequest("/api/commerce/admin/olist"); setOptions(refreshed.options);
      if (data.failures?.length) { setError(data.permissionMessage || "Algumas opções não puderam ser consultadas. Confira as permissões do aplicativo Olist."); setMessage("Sincronização parcial. As opções disponíveis foram preservadas."); }
      else setMessage("Opções atualizadas. Escolha a forma correspondente a cada pagamento da loja.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível sincronizar."); }
    finally { setBusy(false); }
  }
  if (loading) return <p role="status" className="flex items-center gap-2 py-6 text-sm text-zinc-400"><Loader2 size={17} className="animate-spin"/>Carregando integração Olist…</p>;
  return <OlistReconnectBoundary><section className="min-w-0 space-y-6 py-2">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 font-semibold"><Link2 size={19} className="text-emerald-300"/>Pedidos da loja no Olist</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Cliente e pedido após o pagamento. Nota fiscal após concluir a produção. Expedição após a autorização fiscal.</p></div>{configured ? <button type="button" className={button} onClick={requestOlistReconnect} title="Autorizar novamente o acesso à conta Olist desta empresa"><RefreshCw size={16}/>Reconectar Olist</button> : <Link className={button} href="/settings?section=olist">Configurar Olist</Link>}</header>
    {error ? <p role="alert" className="break-words rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
    {message ? <p role="status" className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"><CheckCircle2 className="shrink-0" size={17}/>{message}</p> : null}
    <form onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(""); setMessage(""); try { await storeRequest("/api/commerce/admin/olist", "PUT", settings); setMessage("Automação salva. Válida para as próximas confirmações de pagamento; pedidos anteriores podem ser sincronizados individualmente."); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); } finally { setBusy(false); } }} className="min-w-0 space-y-6">
      <fieldset disabled={busy || !configured} className="grid min-w-0 gap-4 border-y border-zinc-800 py-5 md:grid-cols-2">
        {([["enabled", "Sincronizar pedidos pagos", "Ativa cliente e pedido de venda para esta loja."], ["autoInvoice", "Faturar ao concluir produção", "Gera e solicita autorização da NF-e após pagamento e conferência da produção."], ["sendInvoiceEmail", "Solicitar e-mail pelo Olist", "Envia a solicitação ao Olist com o e-mail de faturamento do cliente."], ["autoDispatch", "Criar expedição após a NF-e", "Vincula a nota autorizada à expedição. Não compra etiqueta nem marca a postagem."]] as const).map(([key, label, help]) => <label key={key} title={help} className="flex min-w-0 cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-emerald-400" checked={settings[key]} onChange={e => setSettings(s => ({ ...s, [key]: e.target.checked }))}/><span className="min-w-0"><strong className="text-sm font-medium">{label}</strong><span className="mt-1 block text-xs leading-5 text-zinc-400">{help}</span></span></label>)}
      </fieldset>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Correspondência dos recebimentos</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-400">Use formas que representem valores já recebidos. A automação não cria um novo link de cobrança nem dá baixa financeira automaticamente.</p></div><button className={button} disabled={busy || !configured} type="button" onClick={() => void sync()} title="Consultar as formas de recebimento e categorias cadastradas na conta Olist"><RefreshCw size={16}/>Sincronizar opções</button></div>
      <fieldset disabled={busy || !configured} className="grid min-w-0 items-start gap-4 sm:grid-cols-2">
        {([["pixReceivingId", "Pix da loja"], ["cardReceivingId", "Cartão da loja"], ["manualReceivingId", "Pagamento confirmado pela equipe"], ["categoryId", "Categoria financeira"]] as const).map(([key, label]) => <label key={key} className="grid min-w-0 self-start gap-2 text-sm">{label}<select className={field} value={settings[key]} onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}><option value="">{key === "categoryId" ? "Padrão do Olist" : "Selecione uma correspondência"}</option>{options.filter(option => option.kind === (key === "categoryId" ? "category" : "receiving_method")).map(option => <option key={option.external_id} value={option.external_id}>{option.name} · ID {option.external_id}</option>)}</select></label>)}
      </fieldset>
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-800 pt-5"><p className="flex max-w-2xl items-start gap-2 text-xs leading-5 text-zinc-400"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-300"/>Pedidos de teste não vão ao ERP. Falhas ficam registradas sem interromper a compra. Revise a configuração fiscal com a contabilidade.</p><button className={`${button} border-emerald-700 bg-emerald-500/10 text-emerald-200`} disabled={busy || !configured}>{busy ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}Salvar integração</button></footer>
    </form>
  </section></OlistReconnectBoundary>;
}

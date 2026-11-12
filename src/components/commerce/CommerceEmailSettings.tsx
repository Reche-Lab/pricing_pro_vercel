"use client";
import React, { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail, Save, Send, ShieldCheck } from "lucide-react";
import type { StoreEmailInput, StoreEmailSettings } from "@/domain/commerce/store-email";
import { storeRequest } from "./store-http";
const field = "w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-40";
function editable(settings: StoreEmailSettings): StoreEmailInput { return { host: settings.host, port: settings.port, username: settings.username, fromEmail: settings.fromEmail, fromName: settings.fromName, replyTo: settings.replyTo, password: "", revision: settings.revision }; }
export function CommerceEmailSettings({ storeName, contactEmail, onReadyChange }: { storeName: string; contactEmail: string; onReadyChange?: (ready: boolean) => void }) {
  const [settings, setSettings] = useState<StoreEmailSettings | null>(null), [draft, setDraft] = useState<StoreEmailInput | null>(null);
  const [recipient, setRecipient] = useState(""), [platformReady, setPlatformReady] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState("");
  function apply(next: StoreEmailSettings) { setSettings(next); setDraft(editable(next)); setConfirmed(false); }
  useEffect(() => { let active = true; void storeRequest("/api/commerce/admin/email").then(result => {
    if (!active) return; apply(result.settings); setRecipient(result.testRecipient); setPlatformReady(result.platformReady); onReadyChange?.(Boolean(result.settings.enabled || result.platformReady));
    if (!result.settings.configured) setDraft({ ...editable(result.settings), fromName: storeName, fromEmail: contactEmail });
  }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [storeName, contactEmail, onReadyChange]);
  const dirty = Boolean(settings && draft && JSON.stringify(editable(settings)) !== JSON.stringify(draft));
  function update(patch: Partial<StoreEmailInput>) { setDraft(current => current ? { ...current, ...patch } : current); }
  async function action(body: object, name: string) {
    setBusy(name); setError(""); setMessage("");
    try { const result = await storeRequest("/api/commerce/admin/email", "POST", body); apply(result.settings); onReadyChange?.(Boolean(result.settings.enabled || platformReady)); setMessage(result.message); }
    catch (error) { setError(error instanceof Error ? error.message : "Não foi possível concluir."); }
    finally { setBusy(""); }
  }
  return <section className="max-w-4xl min-w-0 space-y-5" aria-label="E-mail da empresa">
    <div><h2 className="flex items-center gap-2 font-semibold"><Mail size={19}/>E-mail da empresa para acesso à loja</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Os clientes recebem um código de acesso, não uma senha. Configure o SMTP da empresa para enviar esses códigos com sua identidade. Convites e senhas administrativas continuam no e-mail da plataforma.</p></div>
    <p className={`flex items-start gap-2 border-l-2 pl-3 text-sm ${settings?.enabled ? "border-emerald-500 text-emerald-300" : "border-zinc-700 text-zinc-400"}`}><ShieldCheck size={18} className="shrink-0"/><span className="min-w-0 break-words">{settings?.enabled ? `Remetente ativo: ${settings.fromName} <${settings.fromEmail}>` : platformReady ? "Usando o remetente padrão da plataforma até ativar o SMTP próprio." : "SMTP próprio ainda não ativo e SMTP da plataforma indisponível. Ative uma conexão antes de liberar acesso por e-mail."}</span></p>
    <ol className="flex flex-wrap gap-4 text-xs text-zinc-400"><li>1. Salvar configuração</li><li className={settings?.tested ? "text-emerald-300" : ""}>2. Enviar e conferir teste</li><li className={settings?.enabled ? "text-emerald-300" : ""}>3. Ativar remetente</li></ol>
    {draft && settings ? <>
      <form className="grid min-w-0 gap-4 sm:grid-cols-2" onSubmit={async event => {
        event.preventDefault(); if (busy) return; setBusy("save"); setError(""); setMessage("");
        try { const result = await storeRequest("/api/commerce/admin/email", "PUT", draft); apply(result.settings); onReadyChange?.(Boolean(result.settings.enabled || platformReady)); setMessage(result.message); }
        catch (error) { setError(error instanceof Error ? error.message : "Não foi possível salvar."); }
        finally { setBusy(""); }
      }}>
        <fieldset disabled={Boolean(busy)} className="grid min-w-0 gap-4 border-0 p-0 sm:col-span-2 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-sm">Servidor SMTP<input className={field} value={draft.host} required maxLength={253} placeholder="smtp.gmail.com" autoComplete="off" onChange={event => update({ host: event.target.value })}/></label>
          <label className="grid min-w-0 gap-1 text-sm">Porta e segurança<select className={field} value={draft.port} onChange={event => update({ port: Number(event.target.value) as 465 | 587 })}><option value={587}>587 · STARTTLS obrigatório</option><option value={465}>465 · TLS desde a conexão</option></select></label>
          <label className="grid min-w-0 gap-1 text-sm">Usuário SMTP<input className={field} value={draft.username} required maxLength={254} autoComplete="off" onChange={event => update({ username: event.target.value })}/></label>
          <label className="grid min-w-0 gap-1 text-sm">Senha SMTP / senha de aplicativo<input className={field} type="password" value={draft.password} required={!settings.hasPassword} maxLength={1024} autoComplete="new-password" placeholder={settings.hasPassword ? "Senha salva. Deixe vazio para manter." : "Informe a senha de aplicativo"} onChange={event => update({ password: event.target.value })}/></label>
          <label className="grid min-w-0 gap-1 text-sm">Nome do remetente<input className={field} value={draft.fromName} required maxLength={254} onChange={event => update({ fromName: event.target.value })}/></label>
          <label className="grid min-w-0 gap-1 text-sm">E-mail do remetente<input className={field} type="email" value={draft.fromEmail} required maxLength={254} placeholder="contato@groundshop.com.br" onChange={event => update({ fromEmail: event.target.value })}/></label>
          <label className="grid min-w-0 gap-1 text-sm">Responder para (opcional)<input className={field} type="email" value={draft.replyTo} maxLength={254} onChange={event => update({ replyTo: event.target.value })}/></label>
        </fieldset>
        <p className="text-xs leading-5 text-zinc-400 sm:col-span-2">Use um remetente ou alias autorizado pelo provedor SMTP. A senha é criptografada e nunca volta na resposta da API. Não é necessário fornecer a senha do registrador do domínio.</p>
        {settings.enabled && dirty ? <p className="text-sm text-amber-200 sm:col-span-2">Salvar alterações desativará o SMTP próprio até testar e ativar a nova configuração. Nesse intervalo, será usado o remetente da plataforma, se configurado.</p> : null}
        <button className={`${button} justify-self-start sm:col-span-2`} disabled={Boolean(busy)}>{busy === "save" ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} {settings.enabled && dirty ? "Salvar e desativar para novo teste" : "Salvar configuração SMTP"}</button>
      </form>
      <div className="space-y-3 border-t border-zinc-800 pt-5"><h3 className="font-medium">Teste e ativação</h3><p className="break-all text-sm text-zinc-400">O teste será enviado somente para seu e-mail administrativo: <strong className="text-zinc-200">{recipient}</strong>.</p>
        <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={Boolean(busy) || dirty || !settings.configured} title={dirty ? "Salve as alterações antes de testar" : "Enviar um e-mail de teste para sua conta administrativa"} onClick={() => void action({ action: "test", revision: settings.revision }, "test")}>{busy === "test" ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>}Enviar teste para meu e-mail</button>
          {settings.enabled ? <button type="button" className={button} disabled={Boolean(busy) || dirty} onClick={() => void action({ action: "toggle", revision: settings.revision, enabled: false }, "toggle")}>Usar remetente da plataforma</button> : null}
        </div>
        {settings.tested ? <p className="flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 size={15}/>Teste aceito pelo SMTP em {new Date(settings.testedAt!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Confira também a pasta de spam.</p> : null}
        {!settings.enabled && settings.tested ? <><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={dirty || Boolean(busy)} onChange={event => setConfirmed(event.target.checked)}/>Recebi o e-mail de teste e quero usar este remetente para os clientes.</label><button type="button" className={`${button} border-emerald-500/50 text-emerald-200`} disabled={Boolean(busy) || dirty || !confirmed} onClick={() => void action({ action: "toggle", revision: settings.revision, enabled: true, confirmReceived: confirmed }, "toggle")}>{busy === "toggle" ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}Ativar e-mail da empresa</button></> : null}
      </div>
    </> : !error ? <p role="status" className="text-sm text-zinc-400">Carregando configuração…</p> : null}
    {error ? <p role="alert" className="break-words text-sm text-rose-300">{error}</p> : null}{message ? <p role="status" className="break-words text-sm text-emerald-300">{message}</p> : null}
    <details className="border-t border-zinc-800 pt-4"><summary className="cursor-pointer text-sm">Entregabilidade e configuração do domínio de e-mail</summary><p className="mt-3 text-xs leading-6 text-zinc-400">SPF, DKIM e DMARC devem seguir as instruções do seu provedor de e-mail, não as da hospedagem da loja. Não substitua registros MX/TXT existentes ao apontar o site para a Vercel. O teste confirma a aceitação pelo SMTP, mas não garante a entrega em todas as caixas de entrada.</p></details>
  </section>;
}

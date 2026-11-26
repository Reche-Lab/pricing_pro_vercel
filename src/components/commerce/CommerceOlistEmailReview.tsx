"use client";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Mail, RefreshCw, X } from "lucide-react";
import type { CommerceOlistEmailReview as EmailReview } from "@/domain/commerce/olist";
import type { OrderOlistProgress } from "@/domain/commerce/order-progress";
import { isOlistReconnectRequired } from "@/lib/olist/oauth-errors";
import { requestOlistReconnect } from "@/lib/olist/browser-request";

const button = "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm disabled:opacity-40";
export function CommerceOlistEmailReview({ endpoint, onClose, onChecked }: { endpoint: string; onClose: () => void; onChecked: (state: OrderOlistProgress & { resumed: boolean; recipientSource?: "purchase" | "olist" }) => void }) {
  const [review, setReview] = useState<EmailReview | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [accepted, setAccepted] = useState(false), [note, setNote] = useState("");
  const [strategy, setStrategy] = useState<"purchase" | "olist">("purchase");
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef<AbortController | null>(null), submitting = useRef(false), id = useId();
  const send = useCallback(async (body: unknown, signal?: AbortSignal) => {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal });
    const result = await response.json();
    if (isOlistReconnectRequired(result)) { onClose(); requestOlistReconnect(); throw new Error("Reconecte o Olist antes de corrigir o e-mail."); }
    if (!response.ok) throw new Error(result.error || "Não foi possível conferir o e-mail de faturamento.");
    return result;
  }, [endpoint, onClose]);
  const load = useCallback(async () => {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setLoading(true); setReview(null); setError(""); setNotice(""); setAccepted(false); setStrategy("purchase");
    try { const result = await send({ action: "email_review", note: "Conferência do e-mail de faturamento solicitada pela equipe." }, controller.signal); if (!controller.signal.aborted) setReview(result.emailReview); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Não foi possível consultar."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [send]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.current?.showModal?.(); void load();
    return () => { pending.current?.abort(); document.body.style.overflow = overflow; previous?.focus(); };
  }, [load]);
  return <dialog ref={dialog} aria-labelledby={`${id}-title`} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-5 text-zinc-100 backdrop:bg-black/75" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <form className="min-w-0 space-y-4" onSubmit={async event => {
      event.preventDefault(); if (submitting.current || !review || !accepted || note.trim().length < 5 || (strategy === "olist" && !review.canUseOlistEmail)) return;
      submitting.current = true; setBusy(true); setError(""); setNotice("");
      try {
        const result = await send({ action: strategy === "olist" ? "email_use_olist" : "email_update", reviewToken: review.reviewToken, ...(strategy === "olist" ? { confirmOlistEmail: true } : { confirmEmailUpdate: true }), note });
        setReview(result.emailReview); setAccepted(false);
        if (!result.resumed) setNotice(result.emailReview.contactMatches ? "Cadastro atualizado. A nota pendente ainda mantém outro e-mail. Corrija o destinatário dessa mesma nota no Olist ou escolha manter os e-mails cadastrados, com nova confirmação. Nenhuma nota foi recriada ou emitida por esta ação." : "O Olist ainda não confirmou a atualização. Consulte novamente ou escolha manter os e-mails cadastrados.");
        onChecked(result);
      } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível atualizar o e-mail."); }
      finally { submitting.current = false; setBusy(false); }
    }}>
      <header className="flex items-start justify-between gap-3"><div><h2 id={`${id}-title`} className="flex items-center gap-2 font-semibold"><Mail size={18} className="shrink-0 text-emerald-300"/>Conferir e-mails da nota</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Confira os endereços antes de continuar. Você pode atualizar o cadastro com o e-mail da compra ou autorizar os e-mails já registrados no Olist.</p></div><button type="button" className={`${button} shrink-0`} disabled={busy} aria-label="Fechar conferência de e-mail" onClick={onClose}><X size={18}/></button></header>
      {loading ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 size={17} className="animate-spin"/>Conferindo o cadastro e a nota no Olist…</p> : null}
      {review ? <>
        <p className="break-words text-xs text-zinc-400">{review.customerName || "Cliente Olist"} · ID {review.customerId}{review.invoiceId ? ` · Nota ${review.invoiceNumber || review.invoiceId}` : ""}</p>
        <dl className="space-y-3 border-y border-zinc-800 py-4 text-sm">
          <div><dt className="text-zinc-400">Informado no faturamento da compra</dt><dd className="mt-1 break-all font-semibold text-emerald-200">{review.targetEmail}</dd></div>
          <div><dt className="text-zinc-400">E-mail atual do cadastro Olist</dt><dd className="mt-1 break-all">{review.contactEmail || "Não informado"}</dd></div>
          <div><dt className="text-zinc-400">E-mail de NF-e do cadastro Olist</dt><dd className="mt-1 break-all">{review.contactNfeEmail || "Não definido; usa o e-mail do cadastro"}</dd></div>
          {review.invoiceId ? <div><dt className="text-zinc-400">E-mail da nota pendente</dt><dd className="mt-1 break-all">{review.invoiceEmail || "Não informado"}</dd></div> : <div><dt className="text-zinc-400">Nota fiscal</dt><dd>Ainda não gerada</dd></div>}
        </dl>
        <fieldset disabled={busy} className="space-y-3 text-sm"><legend className="mb-3 font-semibold">Como deseja continuar?</legend>{([{ value: "purchase", title: "Usar o e-mail da compra", description: "Atualiza o e-mail geral e de NF-e no cadastro Olist." }, { value: "olist", title: "Manter os e-mails do Olist", description: "Autoriza o envio aos endereços abaixo, mesmo diferentes da compra. Não altera o cadastro." }] as const).map(option => <label key={option.value} className={`flex items-start gap-3 rounded-md border p-3 ${strategy === option.value ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-800"} ${option.value === "olist" && !review.canUseOlistEmail ? "opacity-50" : "cursor-pointer"}`}><input type="radio" className="mt-1 shrink-0 accent-emerald-400" name={`${id}-strategy`} value={option.value} checked={strategy === option.value} disabled={option.value === "olist" && !review.canUseOlistEmail} onChange={() => { setStrategy(option.value); setAccepted(false); setError(""); setNotice(""); }}/><span className="min-w-0"><strong className="block font-medium">{option.title}</strong><span className="mt-1 block leading-5 text-zinc-400">{option.description}</span></span></label>)}</fieldset>
        {strategy === "olist" ? <div className="border-l-2 border-emerald-500 pl-3 text-sm"><p className="font-medium text-emerald-200">Endereços autorizados nesta decisão</p><ul className="mt-2 space-y-1 break-all text-zinc-200">{(review.olistRecipients ?? []).map(email => <li key={email}>{email}</li>)}</ul><p className="mt-2 text-xs leading-5 text-zinc-400">O ERP define o envio conforme o cadastro e a nota. Se aparecerem endereços diferentes, esta confirmação autoriza os listados; nenhum outro endereço será liberado automaticamente.</p></div> : !review.canUseOlistEmail ? <p className="text-xs text-amber-200">Confira os e-mails no Olist: há um endereço ausente ou inválido para autorizar esta alternativa.</p> : null}
        {notice ? <div role="status" className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-100"><p>{notice}</p><a href="https://erp.tiny.com.br/" target="_blank" rel="noopener noreferrer" className={button}><ExternalLink size={16}/>Abrir Olist</a></div> : null}
        <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1.5 shrink-0 accent-emerald-400" disabled={busy} checked={accepted} onChange={event => setAccepted(event.target.checked)}/><span>{strategy === "olist" ? "Autorizo a emissão e o envio da nota aos e-mails do Olist listados acima, mesmo diferentes do e-mail desta compra, sem alterar o cadastro." : "Autorizo atualizar o e-mail do cadastro e de NF-e no Olist para o informado nesta compra. Entendo que isso altera o cadastro compartilhado do cliente no ERP."}</span></label>
        <label className="grid gap-2 text-sm">{strategy === "olist" ? "Motivo da decisão" : "Motivo da atualização"}<textarea required minLength={5} maxLength={500} disabled={busy} className="min-h-24 min-w-0 w-full rounded-md border border-zinc-700 bg-zinc-900 p-3 text-sm" placeholder={strategy === "olist" ? "Ex.: Cliente confirmou os endereços já cadastrados no ERP." : "Ex.: Cliente informou o e-mail atual no faturamento."} value={note} onChange={event => setNote(event.target.value)}/></label>
        <p className="text-xs leading-5 text-zinc-400">Nome, documento, endereço e valores não serão substituídos. Após confirmar o destinatário, a integração retoma a emissão e o envio configurado da nota. Notas existentes não serão canceladas nem recriadas.</p>
      </> : null}
      {error ? <p role="alert" className="break-words rounded-md bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
      <footer className="flex flex-wrap justify-end gap-2"><button type="button" className={button} disabled={loading || busy} onClick={() => void load()}><RefreshCw size={16}/>Consultar novamente</button><button type="button" className={button} disabled={busy} onClick={onClose}>Voltar</button><button className={`${button} border-emerald-600 bg-emerald-500/10 text-emerald-200`} disabled={busy || loading || !review || !accepted || note.trim().length < 5 || (strategy === "olist" && !review.canUseOlistEmail)}>{busy ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>} {strategy === "olist" ? "Manter e-mails e continuar" : "Atualizar e conferir"}</button></footer>
    </form>
  </dialog>;
}

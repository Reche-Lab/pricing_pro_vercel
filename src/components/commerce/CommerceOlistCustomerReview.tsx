"use client";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, UserRound, X } from "lucide-react";
import type { CommerceOlistCustomerChoice } from "@/domain/commerce/olist";
import type { OrderOlistProgress } from "@/domain/commerce/order-progress";
import { formatCheckoutDocument } from "@/domain/commerce/checkout";
import { isOlistReconnectRequired } from "@/lib/olist/oauth-errors";
import { requestOlistReconnect } from "@/lib/olist/browser-request";

const button = "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm disabled:opacity-40";
export function CommerceOlistCustomerReview({ endpoint, onClose, onLinked }: { endpoint: string; onClose: () => void; onLinked: (data: OrderOlistProgress) => void }) {
  const [customers, setCustomers] = useState<CommerceOlistCustomerChoice[]>([]), [selected, setSelected] = useState(""), [billingDocument, setBillingDocument] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [note, setNote] = useState("");
  const dialog = useRef<HTMLDialogElement>(null), request = useRef<AbortController | null>(null), submitting = useRef(false), id = useId();
  const send = useCallback(async (body: unknown, signal?: AbortSignal) => {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal });
    const result = await response.json();
    if (isOlistReconnectRequired(result)) { onClose(); requestOlistReconnect(); throw new Error("Reconecte o Olist para conferir os clientes."); }
    if (!response.ok) throw new Error(result.error || "Não foi possível conferir os clientes Olist.");
    return result;
  }, [endpoint, onClose]);
  const lookup = useCallback(async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(""); setSelected(""); setCustomers([]); setBillingDocument("");
    try {
      const result = await send({ action: "customer_lookup", note: "Conferência de cliente solicitada pela equipe." }, controller.signal);
      if (!controller.signal.aborted) { setCustomers(result.customers); setBillingDocument(result.billingDocument); }
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Não foi possível consultar."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [send]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.current?.showModal?.(); void lookup();
    return () => { request.current?.abort(); document.body.style.overflow = overflow; previous?.focus(); };
  }, [lookup]);
  return <dialog ref={dialog} aria-labelledby={`${id}-title`} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-5 text-zinc-100 backdrop:bg-black/75" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <form className="min-w-0 space-y-4" onSubmit={async event => {
      event.preventDefault(); if (submitting.current || !selected || note.trim().length < 5) return;
      submitting.current = true; setBusy(true); setError("");
      try { onLinked(await send({ action: "customer_link", customerId: selected, note })); }
      catch (e) { setError(e instanceof Error ? e.message : "Não foi possível vincular o cliente."); }
      finally { submitting.current = false; setBusy(false); }
    }}>
      <header className="flex items-start justify-between gap-3"><div><h2 id={`${id}-title`} className="font-semibold">Conferir cliente Olist</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Escolha o cadastro correto para este pedido. Somente contatos com o mesmo CPF/CNPJ do faturamento podem ser vinculados.</p></div><button type="button" className={`${button} shrink-0`} aria-label="Fechar conferência" disabled={busy} onClick={onClose}><X size={18}/></button></header>
      {loading ? <p role="status" className="flex items-center gap-2 text-sm text-zinc-300"><Loader2 size={17} className="animate-spin"/>Consultando cadastros no Olist…</p> : <>
        {billingDocument ? <p className="break-words text-sm text-zinc-400">CPF/CNPJ do faturamento: <strong className="text-zinc-200">{formatCheckoutDocument(billingDocument)}</strong></p> : null}
        {customers.length ? <fieldset className="space-y-2" disabled={busy}><legend className="mb-3 text-sm text-zinc-300">{customers.length} {customers.length === 1 ? "cadastro encontrado" : "cadastros encontrados"}</legend>{customers.map(customer => <label key={customer.id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${selected === customer.id ? "border-emerald-400 bg-emerald-500/10" : "border-zinc-800 hover:border-zinc-500"} ${customer.inactive ? "cursor-not-allowed opacity-50" : ""}`}>
          <input type="radio" name={`${id}-customer`} className="mt-1 shrink-0 accent-emerald-400" value={customer.id} checked={selected === customer.id} disabled={customer.inactive} onChange={() => setSelected(customer.id)}/><span className="min-w-0 space-y-1 break-words text-sm"><strong className="flex items-center gap-2"><UserRound size={16} className="shrink-0"/>{customer.name}</strong><span className="block text-xs text-zinc-400">ID Olist: {customer.id}{customer.inactive ? " · Inativo ou excluído" : ""}</span><span className="block">{formatCheckoutDocument(customer.document)}</span>{customer.email ? <span className="block break-all text-zinc-300">{customer.email}</span> : null}{customer.phone ? <span className="block text-zinc-300">{customer.phone}</span> : null}{customer.city || customer.state ? <span className="block text-zinc-400">{[customer.city, customer.state].filter(Boolean).join(" / ")}</span> : null}</span>
        </label>)}</fieldset> : !error ? <p className="rounded-md border border-amber-500/30 p-3 text-sm text-amber-100">Nenhum cadastro com este CPF/CNPJ foi encontrado. Confira o faturamento e use Conferir e retomar no painel; esta consulta não cria clientes.</p> : null}
        <button type="button" className={button} disabled={busy} onClick={() => void lookup()}><RefreshCw size={16}/>Consultar novamente</button>
      </>}
      <label className="grid gap-2 text-sm">Motivo da escolha<textarea required minLength={5} maxLength={500} disabled={busy || loading} className="min-h-24 min-w-0 w-full rounded-md border border-zinc-700 bg-zinc-900 p-3 text-sm" placeholder="Ex.: Cadastro principal confirmado com o cliente." value={note} onChange={event => setNote(event.target.value)}/></label>
      <p className="text-xs leading-5 text-zinc-400">A escolha ficará no histórico e será reutilizada para este CPF/CNPJ nesta loja. Nenhum cadastro Olist será alterado. A integração continuará da etapa pendente, respeitando as liberações de produção e faturamento.</p>
      {error ? <p role="alert" className="break-words rounded-md bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
      <footer className="flex flex-wrap justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={onClose}>Voltar</button><button className={`${button} border-emerald-600 bg-emerald-500/10 text-emerald-200`} disabled={busy || loading || !selected || note.trim().length < 5}>{busy ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}Vincular cliente e continuar</button></footer>
    </form>
  </dialog>;
}

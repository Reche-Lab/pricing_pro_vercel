"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ClipboardCheck, Copy, CreditCard, ExternalLink, FileText, Loader2, PackagePlus, Printer, RefreshCw, Truck } from "lucide-react";
import { LibraryDialog as Modal } from "./LibraryUI";
import { storeMoney } from "./store-http";
import { MelhorEnvioReconnectBoundary } from "@/components/shipping/MelhorEnvioReconnectBoundary";
import { MELHOR_ENVIO_CONNECTED_EVENT, requestMelhorEnvioReconnect } from "@/lib/melhor-envio/browser-request";
import { isMelhorEnvioReconnectRequired } from "@/lib/melhor-envio/oauth-errors";

export type CommerceOrderShippingProps = { orderId: string; canManage: boolean };
type Action = "review" | "cart" | "checkout" | "generate" | "print" | "refresh" | "retry_notifications";
type Shipping = {
  id: string; status: string; service_name: string | null;
  tracking_code: string | null; tracking_url: string | null; label_url: string | null;
  quoted_cents: number | null; purchase_cents: number | null; last_error: string | null;
  olist_tracking_error?: string | null;
  parcels: Array<{ id: string; status: string; trackingCode: string | null; trackingUrl: string | null; labelUrl: string | null }>;
};
type Review = {
  serviceName: string; contractedCents: number; currentCents: number; changed: boolean;
  recipient: { name: string; document: string; phone: string; postalCode: string; address: string; number: string; complement: string | null; district: string; city: string; state: string };
  sender: { name: string; postalCode: string };
  volumes: Array<{ width: number; height: number; length: number; weight: number }>;
  warnings?: string[];
};
type State = {
  shipping: Shipping | null;
  readiness: { eligible: boolean; reason: string | null };
  contracted: { name: string; priceCents: number } | null;
  notifications?: { pending: number; failed: number };
  fiscal?: { invoiceKey: string | null; senderStateRegister: string | null; productionReady: boolean };
};
type Result = Partial<State> & { review?: Review; error?: unknown; message?: unknown; missingFields?: unknown; ok?: boolean };
const button = "focus-ring inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40";
const field = "focus-ring min-h-10 w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100";
const statuses: Record<string, string> = { quoted: "Cotado", cart: "No carrinho", purchased: "Pago", label_ready: "Etiqueta pronta", posted: "Postado", delivered: "Entregue", exception: "Ocorrência no envio", review: "Conferência necessária", processing: "Processando" };
const missingLabels: Record<string, string> = { invoiceKey: "Chave da NF-e", invoice_key: "Chave da NF-e", senderStateRegister: "Inscrição estadual do remetente", sender_state_register: "Inscrição estadual do remetente", productionReady: "Confirmação de produção concluída", production_ready: "Confirmação de produção concluída", postalCode: "CEP", document: "CPF/CNPJ", phone: "Telefone", volumes: "Dimensões e peso dos volumes" };
function safeUrl(value: string | null | undefined) {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}

function humanError(data: Result | null, status?: number) {
  const message = typeof data?.error === "string" ? data.error : typeof data?.message === "string" ? data.message : "Não foi possível concluir a operação.";
  const missing = Array.isArray(data?.missingFields) ? data.missingFields.filter((v): v is string => typeof v === "string").map(v => missingLabels[v] ?? v) : [];
  return `${status === 401 ? "Sua sessão expirou. Entre novamente na plataforma." : status === 403 ? "Você não tem permissão para esta operação. Peça acesso ao administrador." : message}${missing.length ? ` Pendências: ${missing.join("; ")}.` : ""} Confira os dados e atualize a situação antes de continuar.`;
}

export function CommerceOrderShipping(props: CommerceOrderShippingProps) {
  return <MelhorEnvioReconnectBoundary><ShippingConsole key={`${props.orderId}:${props.canManage}`} {...props} /></MelhorEnvioReconnectBoundary>;
}

function ShippingConsole({ orderId, canManage }: CommerceOrderShippingProps) {
  const endpoint = `/api/commerce/admin/orders/${encodeURIComponent(orderId)}/shipping`;
  const [data, setData] = useState<State | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState<Action | "load" | null>(null);
  const [modal, setModal] = useState<"review" | "checkout" | "error" | null>(null);
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [invoiceKey, setInvoiceKey] = useState("");
  const [registration, setRegistration] = useState("");
  const [productionReady, setProductionReady] = useState(false);
  const fiscalDirty = useRef(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  const readRequest = useRef<() => void>(() => {});
  const shipping = data?.shipping;
  const status = shipping?.status ?? "quoted";
  const blocked = uncertain || !["quoted", "cart", "purchased", "label_ready", "posted", "delivered"].includes(status);
  const paid = ["purchased", "label_ready", "posted", "delivered"].includes(status);
  const generated = ["label_ready", "posted", "delivered"].includes(status);
  const cost = shipping?.purchase_cents;
  const contractedCost = data?.contracted?.priceCents ?? review?.contractedCents;
  const changed = cost != null && contractedCost != null && cost !== contractedCost;
  const cartChanged = !!review && review.currentCents !== review.contractedCents;

  function apply(result: Result) {
    setData(current => ({ ...current, ...result }) as State);
    if (result.fiscal && !fiscalDirty.current) {
      setInvoiceKey(result.fiscal.invoiceKey ?? "");
      setRegistration(result.fiscal.senderStateRegister ?? "");
      setProductionReady(result.fiscal.productionReady);
    }
    setAccepted(false);
  }

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const controller = new AbortController();
    async function load() {
      if (locked.current) return;
      locked.current = true; setBusy("load"); setReadError("");
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const result: Result | null = await response.json().catch(() => null);
        if (!active) return;
        if (isMelhorEnvioReconnectRequired(result)) {
          setReadError("Reconecte o Melhor Envio e atualize a situação. Nenhuma compra será repetida.");
          if (canManage) requestMelhorEnvioReconnect();
          return;
        }
        if (!response.ok || !result || !("shipping" in result) || !result.readiness) throw new Error(humanError(result, response.status));
        apply(result); setReview(null);
      } catch (caught) {
        if (active && !controller.signal.aborted) setReadError(caught instanceof Error && caught.name !== "TypeError" ? caught.message : "Não foi possível consultar o envio. Verifique a conexão e tente atualizar.");
      } finally { if (active) { locked.current = false; setBusy(null); } }
    }
    readRequest.current = () => { void load(); };
    void load();
    window.addEventListener(MELHOR_ENVIO_CONNECTED_EVENT, load);
    return () => { active = false; mounted.current = false; locked.current = false; readRequest.current = () => {}; controller.abort(); window.removeEventListener(MELHOR_ENVIO_CONNECTED_EVENT, load); };
    // Reconnection only reads state; it never replays an operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, orderId, canManage]);

  function readAgain() { readRequest.current(); }
  function editFiscal() { fiscalDirty.current = true; setReview(null); setAccepted(false); }
  function showError(value: string) { setError(value); setModal("error"); }

  async function run(action: Action) {
    if (!canManage || locked.current) return;
    if (["review", "cart"].includes(action)) {
      if (!productionReady) { showError("Confirme que a produção está concluída antes de revisar o envio."); return; }
      if (invoiceKey && !/^\d{44}$/.test(invoiceKey)) { showError("A chave da NF-e deve conter exatamente 44 dígitos. Confira o documento fiscal."); return; }
      if (registration.trim().length > 30) { showError("A inscrição estadual deve ter no máximo 30 caracteres. Informe ISENTO quando aplicável."); return; }
    }
    if (["review", "cart", "checkout", "generate"].includes(action) && blocked) return;
    if (action === "review" && status !== "quoted") return;
    if (action === "cart" && (!review || status !== "quoted" || !Number.isInteger(review.currentCents) || (cartChanged && !accepted))) return;
    if (action === "checkout" && (status !== "cart" || cost == null || !Number.isInteger(cost) || (changed && !accepted))) return;
    locked.current = true; setBusy(action); setError(""); setMessage("");
    const body = { action,
      ...(["review", "cart"].includes(action) ? { productionReady: true, ...(invoiceKey ? { invoiceKey } : {}), ...(registration.trim() ? { senderStateRegister: registration.trim() } : {}) } : {}),
      ...(action === "cart" ? { expectedCostCents: review!.currentCents, ...(cartChanged ? { acceptCostChange: true } : {}) } : {}),
      ...(action === "checkout" ? { expectedCostCents: cost, ...(changed ? { acceptCostChange: true } : {}) } : {}) };
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result: Result | null = await response.json().catch(() => null);
      if (!mounted.current) return;
      if (result && "shipping" in result) apply(result);
      if (isMelhorEnvioReconnectRequired(result)) {
        setReview(null); setModal(null); setMessage("Reconecte o Melhor Envio. Depois, confira a situação; nenhuma operação será repetida automaticamente."); requestMelhorEnvioReconnect(); return;
      }
      if (!response.ok || result?.ok === false || !result || !("shipping" in result)) throw new Error(humanError(result, response.status));
      if (action === "refresh") { setUncertain(false); setReview(null); setReadError(""); }
      if (action === "review") {
        if (!result.review) throw new Error("A revisão não retornou os dados do envio. Atualize a situação e confira novamente.");
        setReview(result.review); setModal("review");
      } else if (action === "cart") {
        // The server recalculates the cart. Never keep the old quote as the charge amount.
        setReview(result.review ?? null); setModal(null);
        setMessage("Carrinho atualizado. Confira o valor da cobrança antes de pagar.");
      } else {
        setModal(null); setAccepted(false);
        if (action === "print") setPrinted(true);
        setMessage(action === "retry_notifications" ? "Reenvio de notificações solicitado." : "Situação do envio atualizada.");
      }
    } catch (caught) {
      if (!mounted.current) return;
      if (["cart", "checkout", "generate"].includes(action)) { setUncertain(true); setReview(null); }
      showError(`${caught instanceof Error && caught.name !== "TypeError" ? caught.message : "A conexão foi interrompida e o resultado não foi confirmado."}${["cart", "checkout", "generate"].includes(action) ? " Não repita a compra. Use Atualizar envio para reconciliar o resultado." : ""}`);
    } finally { if (mounted.current) { locked.current = false; setBusy(null); } }
  }

  async function copy(code: string) {
    try { await navigator.clipboard.writeText(code); setMessage("Código de rastreamento copiado."); }
    catch { showError(`Não foi possível copiar. Selecione o código ${code} e copie manualmente.`); }
  }

  const parcels = shipping?.parcels ?? [];
  function links(label: string, trackingCode: string | null, trackingUrl: string | null, labelUrl: string | null) {
    return <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-400">{label}</span>
      {trackingCode ? <button type="button" className={`${button} break-all`} title="Copiar código de rastreamento" aria-label={`Copiar rastreamento ${trackingCode}`} onClick={() => void copy(trackingCode)}><Copy size={14} className="shrink-0" /><span className="min-w-0 break-all">{trackingCode}</span></button> : null}
      {safeUrl(trackingUrl) ? <a className={button} href={safeUrl(trackingUrl)} target="_blank" rel="noopener noreferrer" title="Abrir rastreamento"><ExternalLink size={14} />Acompanhar entrega</a> : null}
      {canManage && safeUrl(labelUrl) ? <a className={`${button} text-emerald-300`} href={safeUrl(labelUrl)} target="_blank" rel="noopener noreferrer" title="Abrir etiqueta para impressão"><Printer size={14} />Abrir etiqueta para impressão</a> : null}
    </div>;
  }

  return <section aria-label="Envio do pedido" className="min-w-0 space-y-3 border-y border-zinc-800 bg-zinc-950/40 py-4 text-zinc-200">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Truck size={18} className="text-emerald-300" />Envio · Melhor Envio</h2>
      <button type="button" className={button} disabled={!!busy} title={canManage ? "Consultar e reconciliar sem repetir compras" : "Consultar situação do envio"} aria-label="Atualizar envio" onClick={() => canManage && data ? void run("refresh") : readAgain()}><RefreshCw size={15} className={busy === "refresh" || busy === "load" ? "animate-spin" : ""} /></button>
    </header>
    {busy === "load" && !data ? <p role="status" className="text-xs">Consultando envio…</p> : null}
    {readError ? <p role="alert" className="break-words text-xs text-rose-200">{readError}</p> : null}
    {data ? <>
      <div className="flex flex-wrap justify-between gap-2 text-xs"><span className={blocked ? "text-amber-200" : "text-emerald-300"}>{statuses[status] ?? "Situação desconhecida"}</span><span className="break-words text-zinc-400">{shipping?.service_name ?? data.contracted?.name ?? "Serviço não definido"}</span></div>
      <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">{[["Contratado", data.contracted?.priceCents], ["Cotação", shipping?.quoted_cents], ["Valor da etiqueta", cost]].map(([label, value]) => <div key={String(label)} className="min-w-0"><dt className="text-zinc-500">{label}</dt><dd className="mt-1 font-medium">{typeof value === "number" ? storeMoney(value) : "Não informado"}</dd></div>)}</dl>
      {!data.readiness?.eligible && data.readiness?.reason ? <p className="break-words text-xs text-amber-200">{data.readiness.reason}</p> : null}
      {shipping?.last_error ? <p role="alert" className="break-words border-l-2 border-amber-500 pl-3 text-xs leading-5 text-amber-100">{shipping.last_error}</p> : null}
      {shipping?.olist_tracking_error ? <p className="break-words text-xs leading-5 text-amber-200">{shipping.olist_tracking_error}</p> : null}
      {blocked ? <p className="text-xs leading-5 text-amber-200">{status === "processing" ? "Operação em andamento." : "O resultado precisa ser conferido."} Atualize o envio para reconciliar a situação. Não faça uma nova compra.</p> : null}
      {!canManage ? <p className="text-xs text-zinc-500">Somente leitura</p> : <>
        <details className="border-t border-zinc-800 pt-3"><summary className="cursor-pointer text-xs font-medium">Documento fiscal e produção</summary>
          <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-xs text-zinc-400">Chave da NF-e<input className={field} inputMode="numeric" maxLength={44} value={invoiceKey} disabled={!!busy || status !== "quoted" || blocked} onChange={e => { editFiscal(); setInvoiceKey(e.target.value); }} /></label>
            <label className="grid min-w-0 gap-1 text-xs text-zinc-400">Inscrição estadual do remetente<input className={field} maxLength={30} placeholder="Inscrição estadual ou ISENTO" value={registration} disabled={!!busy || status !== "quoted" || blocked} onChange={e => { editFiscal(); setRegistration(e.target.value); }} /></label>
            <label className="flex items-start gap-2 text-xs leading-5 sm:col-span-2"><input type="checkbox" className="mt-1 shrink-0" checked={productionReady} disabled={!!busy || status !== "quoted" || blocked} onChange={e => { editFiscal(); setProductionReady(e.target.checked); }} /><span>A produção está concluída e o pedido está pronto para embalar</span></label>
          </div>
        </details>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <button type="button" className={button} title={productionReady ? "Conferir destinatário, documento fiscal, volumes e cotação" : "Produção ainda não confirmada"} disabled={!!busy || blocked || status !== "quoted" || !!review || !productionReady} onClick={() => void run("review")}><ClipboardCheck size={15} className="shrink-0" />{review || status !== "quoted" && !blocked ? <Check size={13} /> : null}Revisar envio</button>
          <button type="button" className={button} title="Recalcular e adicionar ao carrinho sem cobrar" disabled={!!busy || blocked || status !== "quoted" || !review || !data.readiness?.eligible} onClick={() => cartChanged ? setModal("review") : void run("cart")}><PackagePlus size={15} className="shrink-0" />{status !== "quoted" && !blocked ? <Check size={13} /> : null}Carrinho</button>
          <button type="button" className={button} title="Conferir e confirmar a cobrança da etiqueta" disabled={!!busy || blocked || status !== "cart" || cost == null || !data.readiness?.eligible} onClick={() => { setError(""); setAccepted(false); setModal("checkout"); }}><CreditCard size={15} className="shrink-0" />{paid ? <Check size={13} /> : null}Pagar etiqueta</button>
          <button type="button" className={button} title="Gerar etiqueta já paga" disabled={!!busy || blocked || status !== "purchased"} onClick={() => void run("generate")}><FileText size={15} className="shrink-0" />{generated ? <Check size={13} /> : null}Gerar etiqueta</button>
          <button type="button" className={button} title="Solicitar o link de impressão, sem nova compra" disabled={!!busy || !generated || printed || !!shipping?.label_url} onClick={() => void run("print")}><Printer size={15} className="shrink-0" />Imprimir etiqueta</button>
        </div>
      </>}
      {shipping ? links("Pedido", shipping.tracking_code, shipping.tracking_url, shipping.label_url) : null}
      {parcels.map((parcel, index) => <div key={parcel.id} className="space-y-1 border-t border-zinc-800 pt-2"><p className="text-xs text-zinc-500">Volume {index + 1} · {statuses[parcel.status] ?? "Em acompanhamento"}</p>{links(`Volume ${index + 1}`, parcel.trackingCode, parcel.trackingUrl, parcel.labelUrl)}</div>)}
      {data.notifications ? <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-3 text-xs"><p className="text-zinc-400">Notificações: {data.notifications.pending} pendente(s) · {data.notifications.failed} com falha</p>{canManage && data.notifications.failed > 0 ? <button type="button" className={button} disabled={!!busy} onClick={() => void run("retry_notifications")} title="Reenviar notificações com falha sem repetir a compra"><RefreshCw size={14} />Reenviar notificações</button> : null}</div> : null}
    </> : null}
    {busy && busy !== "load" ? <p role="status" className="flex items-center gap-2 text-xs"><Loader2 size={14} className="animate-spin" />Processando solicitação…</p> : null}
    {message ? <p role="status" className="break-words text-xs text-emerald-200">{message}</p> : null}
    {modal ? createPortal(<Modal title={modal === "checkout" ? "Confirmar cobrança da etiqueta" : modal === "review" ? "Revisar envio" : "Não foi possível concluir o envio"} busy={!!busy} onClose={() => { setModal(null); setAccepted(false); }}>
      <div className="min-w-0 space-y-4 text-sm text-zinc-200">
        {modal === "review" && review ? <>
          <p className="break-words font-medium">{review.serviceName} · {storeMoney(review.currentCents)}</p>
          <p className="text-xs text-zinc-400">Contratado: {storeMoney(review.contractedCents)}</p>
          {review.currentCents !== review.contractedCents ? <p className="text-xs text-amber-200">O valor da cotação difere do frete contratado.</p> : null}
          <dl className="grid min-w-0 gap-3 text-xs sm:grid-cols-2">
            <div className="min-w-0"><dt className="text-zinc-500">Destinatário</dt><dd className="mt-1 break-words leading-5">{review.recipient.name}<br />{review.recipient.document} · {review.recipient.phone}<br />{review.recipient.address}, {review.recipient.number}{review.recipient.complement ? ` · ${review.recipient.complement}` : ""}<br />{review.recipient.district} · {review.recipient.city}/{review.recipient.state}<br />CEP {review.recipient.postalCode}</dd></div>
            <div className="min-w-0"><dt className="text-zinc-500">Remetente</dt><dd className="mt-1 break-words leading-5">{review.sender.name}<br />CEP {review.sender.postalCode}</dd></div>
          </dl>
          <ul className="space-y-2 text-xs">{review.volumes.map((v, i) => <li key={i}>Volume {i + 1}: {v.width} × {v.height} × {v.length} cm · {v.weight} kg</li>)}</ul>
          {review.warnings?.map((warning, index) => <p key={index} className="break-words text-xs leading-5 text-amber-200">{warning}</p>)}
          {cartChanged && status === "quoted" ? <label className="flex items-start gap-2 text-xs text-amber-200"><input type="checkbox" className="mt-1 shrink-0" checked={accepted} disabled={!!busy} onChange={e => setAccepted(e.target.checked)} /><span>Aceito a diferença da cotação para preparar o carrinho, sem cobrança nesta etapa.</span></label> : null}
          {canManage && status === "quoted" ? <button type="button" className={button} disabled={!!busy || blocked || !data?.readiness?.eligible || (cartChanged && !accepted)} onClick={() => void run("cart")}><PackagePlus size={15} />Adicionar ao carrinho</button> : null}
        </> : null}
        {modal === "checkout" ? <>
          <p>Será cobrado <strong>{cost != null ? storeMoney(cost) : "valor não informado"}</strong> no Melhor Envio para este pedido.</p>
          <p className="text-xs text-zinc-400">Frete contratado: {contractedCost != null ? storeMoney(contractedCost) : "não informado"}. A confirmação realiza uma compra real.</p>
          {changed ? <label className="flex items-start gap-2 text-sm text-amber-200"><input type="checkbox" className="mt-1 shrink-0" checked={accepted} disabled={!!busy} onChange={e => setAccepted(e.target.checked)} /><span>Aceito a diferença de custo entre o frete contratado e a etiqueta.</span></label> : null}
          <button type="button" className={`${button} border-emerald-700 text-emerald-200`} disabled={!!busy || !canManage || blocked || cost == null || contractedCost == null || (changed && !accepted)} onClick={() => void run("checkout")}><CreditCard size={16} />Confirmar cobrança</button>
        </> : null}
        {error ? <p role="alert" className="break-words rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-100">{error}</p> : null}
        {modal === "error" ? <button type="button" className={button} disabled={!!busy} onClick={() => { setModal(null); if (canManage && data) void run("refresh"); else readAgain(); }}><RefreshCw size={15} />Atualizar envio</button> : null}
      </div>
    </Modal>, document.body) : null}
  </section>;
}

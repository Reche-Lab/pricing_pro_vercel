"use client";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Copy, CreditCard, ExternalLink, Loader2, LockKeyhole, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import type { BuyerPaymentState, DirectPayment } from "@/domain/commerce/transparent-payment";
import { cardBrickMethods, loadMercadoPago } from "./mercado-pago-sdk";
import { storeMoney, storeRequest } from "./store-http";
import styles from "./store.module.css";

export function StorePayment({ api, orderId, onConfirmed }: { api: string; orderId: string; onConfirmed: () => Promise<void> }) {
  const [state, setState] = useState<BuyerPaymentState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"pix" | "card">("pix");
  const [copied, setCopied] = useState(false);
  const sending = useRef(false);
  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;
  const endpoint = `${api}/payment/direct`;
  const accept = useCallback((next: BuyerPaymentState) => {
    setState(next);
    if (!next.settings.pix) setMode("card");
    if (next.paymentStatus !== "pending") void onConfirmedRef.current().catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    void storeRequest(`${endpoint}?orderId=${orderId}`).then(next => { if (active) accept(next); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [endpoint, orderId, accept]);
  const refresh = useCallback(async () => {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try { accept(await storeRequest(endpoint, "PATCH", { orderId })); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível atualizar o pagamento."); }
    finally { sending.current = false; setBusy(false); }
  }, [endpoint, orderId, accept]);
  async function submit(payment: DirectPayment) {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try {
      accept(await storeRequest(endpoint, "POST", { orderId, requestId: crypto.randomUUID(), payment }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar o pagamento.");
      // A transport failure is not a refusal. Recover server state before
      // showing payment controls again; the server also enforces this lock.
      try { accept(await storeRequest(`${endpoint}?orderId=${orderId}`)); }
      catch { setState(null); }
    } finally { sending.current = false; setBusy(false); }
  }
  async function wallet() {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try { const result = await storeRequest(`${api}/payment`, "POST", { orderId }); window.location.assign(result.url); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível abrir a carteira."); sending.current = false; setBusy(false); }
  }
  async function copyPix(code: string) {
    try { await navigator.clipboard.writeText(code); setCopied(true); }
    catch { setError("Selecione e copie o código Pix no campo acima."); }
  }
  const attempt = state?.attempt;
  const blocked = !!attempt && attempt.status !== "failed";
  const paid = state?.paymentStatus === "paid" || attempt?.status === "paid";
  const challenge = attempt?.result.challengeUrl;
  const challengeFrame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!blocked || paid || state?.paymentStatus !== "pending" || state.canStart === false) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 20000);
    return () => window.clearInterval(timer);
  }, [blocked, paid, state?.paymentStatus, state?.canStart, refresh]);
  useEffect(() => {
    if (!challenge) return;
    const listener = (event: MessageEvent) => {
      if (event.origin === new URL(challenge).origin && event.source === challengeFrame.current?.contentWindow && event.data?.status === "COMPLETE") void refresh();
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [challenge, refresh]);
  return <section className={styles.payment} aria-label="Pagamento do pedido" aria-busy={busy}>
    <h2 className={styles.paymentHeading}><LockKeyhole size={18}/>Pagamento seguro</h2>
    {state?.environment === "test" ? <div className={styles.testNotice}><strong>Pagamento de teste</strong><span>Não utilize cartão real nem pague o Pix em um aplicativo bancário. No Pix, o cenário de aprovação é automático.</span></div> : null}
    {error ? <p role="alert" className={styles.paymentError}>{error}</p> : null}
    {!state ? <button type="button" className={styles.secondary} disabled={busy} onClick={() => void refresh()}>{error ? <RefreshCw size={16}/> : <Loader2 size={16} className="animate-spin"/>}{error ? "Carregar pagamento" : "Carregando pagamento"}</button> : paid ? <p className={styles.paymentSuccess} role="status"><ShieldCheck size={20}/>Pagamento confirmado. Obrigado!</p> : <>
      {state.canStart === false ? <div className={styles.paymentIntro}><p>Este pedido pertence a outro ambiente de pagamento. Crie um novo pedido para testar no ambiente atual da loja.</p><button className={styles.secondary} type="button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16}/>Verificar situação deste pedido</button></div> : blocked ? <div className={styles.paymentPending}>
        <p role="status">{attempt?.result.message || "Estamos verificando seu pagamento. Aguarde e atualize a situação antes de tentar novamente."}</p>
        {attempt?.result.qrImage ? <>
          {/* Provider-generated base64 QR must not be resized by an image proxy. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.paymentQr} src={attempt.result.qrImage} width={224} height={224} alt="QR Code Pix deste pedido"/>
        </> : null}
        {attempt?.result.expiresAt ? <PixExpiry expiresAt={attempt.result.expiresAt}/> : null}
        {attempt?.result.qrCode ? <>
          <label className={styles.paymentCode}>Pix copia e cola<textarea readOnly rows={3} value={attempt.result.qrCode} onFocus={e => e.currentTarget.select()}/></label>
          <button type="button" className={styles.primary} onClick={() => void copyPix(attempt.result.qrCode!)}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Código Pix copiado" : "Copiar código Pix"}</button>
        </> : null}
        {challenge ? <div className={styles.paymentChallenge}><iframe ref={challengeFrame} title="Autenticação segura do cartão pelo banco" src={challenge} allow="payment"/><a href={challenge} target="_blank" rel="noopener noreferrer" className={styles.secondary}><ExternalLink size={16}/>Abrir verificação em outra aba</a></div> : null}
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} className={busy ? "animate-spin" : ""}/>{busy ? "Verificando…" : "Verificar pagamento"}</button>
      </div> : state.enabled && !state.hosted ? <>
        {attempt?.result.message ? <p role="status" className={styles.paymentError}>{attempt.result.message}</p> : null}
        {attempt?.result.supportReference ? <p className="min-w-0 text-xs leading-5"><span>Referência Mercado Pago: </span><code className="break-all">{attempt.result.supportReference}</code></p> : null}
        <div className={styles.paymentModes} role="group" aria-label="Forma de pagamento">
          {state.settings.pix ? <button type="button" aria-pressed={mode === "pix"} disabled={busy} onClick={() => setMode("pix")}><QrCode size={20}/><span>Pix<small>Sem sair da loja</small></span></button> : null}
          {state.settings.credit || state.settings.debit ? <button type="button" aria-pressed={mode === "card"} disabled={busy} onClick={() => setMode("card")}><CreditCard size={20}/><span>Cartão<small>{state.settings.credit ? "Crédito" : ""}{state.settings.credit && state.settings.debit ? " ou " : ""}{state.settings.debit ? "débito" : ""}</small></span></button> : null}
        </div>
        {mode === "pix" && state.settings.pix ? <div className={styles.paymentIntro}><p>Pague {storeMoney(state.amountCents)} por Pix. O QR Code fica disponível aqui e a confirmação é feita pelo Mercado Pago.</p><button type="button" className={styles.primary} disabled={busy} onClick={() => void submit({ method: "pix" })}>{busy ? <Loader2 size={17} className="animate-spin"/> : <QrCode size={17}/>}Gerar Pix</button></div> : <CardPayment key={attempt?.id ?? "initial"} state={state} onSubmit={submit}/>}
        {state.environment === "test" ? <details className={styles.paymentWallet}><summary>Dados para testar cartão</summary><p>Utilize um cartão oficial de teste. Para aprovar, preencha o titular com APRO e CPF 12345678909. Para simular recusa, use OTHE.</p><a className={styles.secondary} href="https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/test-cards" target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>Ver cartões de teste</a></details> : <details className={styles.paymentWallet}><summary>Outras opções de pagamento</summary><p>Use sua carteira Mercado Pago ou consulte as opções disponíveis no ambiente do provedor.</p><button type="button" className={styles.secondary} disabled={busy} onClick={() => void wallet()}><ExternalLink size={16}/>Pagar no Mercado Pago</button><small>Uma conta de colaborador pode não ter permissão para pagar. Prefira Pix ou cartão aqui na loja.</small></details>}
      </> : state.environment === "test" ? <p className={styles.paymentError}>O pagamento de teste está indisponível. A loja precisa revisar as credenciais de teste.</p> : <div className={styles.paymentIntro}><p>Conclua o pagamento no ambiente seguro do Mercado Pago.</p><button type="button" className={styles.primary} disabled={busy} onClick={() => void wallet()}><ExternalLink size={16}/>Abrir pagamento seguro</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => void refresh()}><RefreshCw size={16}/>Atualizar situação</button></div>}
    </>}
    <p className={styles.paymentFootnote}><ShieldCheck size={14}/>Processado pelo Mercado Pago. A loja não armazena os dados do cartão.</p>
  </section>;
}

function PixExpiry({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Date.parse(expiresAt) - Date.now()));
  useEffect(() => { const timer = setInterval(() => setRemaining(Math.max(0, Date.parse(expiresAt) - Date.now())), 1000); return () => clearInterval(timer); }, [expiresAt]);
  return <p className={styles.muted}>{remaining ? `Pix válido por ${Math.floor(remaining / 60000)}:${String(Math.floor(remaining / 1000) % 60).padStart(2, "0")}` : "Prazo do Pix encerrado. Verifique a situação antes de gerar outro."}</p>;
}

function CardPayment({ state, onSubmit }: { state: BuyerPaymentState; onSubmit: (data: DirectPayment) => Promise<void> }) {
  const id = `mp-card-${useId().replace(/[^a-z0-9]/gi, "")}`;
  const [ready, setReady] = useState(false), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const root = useRef<HTMLDivElement>(null), submitRef = useRef(onSubmit);
  const lifecycle = useRef(Promise.resolve());
  submitRef.current = onSubmit;
  useEffect(() => {
    let cancelled = false;
    let controller: { unmount: () => void | Promise<void> } | undefined;
    setReady(false); setError("");
    lifecycle.current = lifecycle.current.then(async () => {
      const SDK = await loadMercadoPago();
      if (cancelled) return;
      const sdk = new SDK(state.publicKey, { locale: "pt-BR" });
      controller = await sdk.bricks().create("cardPayment", id, {
        initialization: { amount: state.amountCents / 100, payer: state.payer },
        customization: { visual: { style: { theme: root.current?.closest('[data-theme="dark"]') ? "dark" : "default" } }, paymentMethods: cardBrickMethods(state.settings) },
        callbacks: {
          onReady: () => { if (!cancelled) setReady(true); },
          onError: () => { if (!cancelled) setError("Confira os dados do cartão. Se o formulário não carregar, tente novamente ou escolha Pix."); },
          onSubmit: async (data, additional) => {
            if (cancelled) return;
            await submitRef.current({ method: "card", token: data.token, paymentMethodId: data.payment_method_id, paymentType: additional.paymentTypeId, installments: Number(data.installments ?? 1), ...(data.payer?.identification ? { identification: data.payer.identification } : {}) });
          },
        },
      });
    }).catch(() => { if (!cancelled) setError("Não foi possível carregar o formulário seguro de cartão."); });
    return () => {
      cancelled = true;
      lifecycle.current = lifecycle.current.then(async () => { if (controller) await controller.unmount(); }).catch(() => {});
    };
  }, [id, state.publicKey, state.amountCents, state.settings, state.payer, retry]);
  return <div ref={root} className={styles.paymentCard}>
    {!ready && !error ? <p role="status"><Loader2 size={16} className="animate-spin"/>Carregando formulário seguro…</p> : null}
    {error ? <div role="alert"><p className={styles.paymentError}>{error}</p><button type="button" className={styles.secondary} onClick={() => setRetry(n => n + 1)}><RefreshCw size={16}/>Recarregar formulário</button></div> : null}
    <div id={id}/>
  </div>;
}

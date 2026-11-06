"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, MapPin, Search, Truck } from "lucide-react";
import type { cartView } from "@/repositories/commerce";
import { addressSchema, checkoutSchema, type StoreSettings } from "@/domain/commerce/schemas";
import { formatCheckoutDocument, formatCheckoutPhone } from "@/domain/commerce/checkout";
import { fetchCepAddress, formatCep, normalizeCep } from "@/lib/cep";
import { StoreOrderSummary } from "./StoreOrderSummary";
import { storeMoney, storeRequest } from "./store-http";
import styles from "./store.module.css";

type Cart = Awaited<ReturnType<typeof cartView>>;
type ContactDraft = { name: string; email: string; phone: string; document: string; postalCode: string; street: string; number: string; complement: string; district: string; city: string; state: string; attention: string };
const emptyContact = (): ContactDraft => ({ name: "", email: "", phone: "", document: "", postalCode: "", street: "", number: "", complement: "", district: "", city: "", state: "", attention: "" });
const previewBilling = { ...emptyContact(), name: "Cliente de teste", email: "cliente@example.test", phone: "11999990000", document: "52998224725", postalCode: "01001000", street: "Praça de teste", number: "100", district: "Centro", city: "São Paulo", state: "SP" };
function postalContact(d: ContactDraft) {
  const { name, phone, document, postalCode, street, number, complement, district, city, state } = d;
  return { name, phone, document, postalCode, street, number, complement, district, city, state };
}

function ContactFields({ value, onChange, billing, errors, onBusyChange }: {
  value: ContactDraft; onChange: (next: ContactDraft) => void; billing: boolean; errors: Record<string, string>; onBusyChange: (busy: boolean) => void;
}) {
  const id = useId(), latest = useRef(value), request = useRef(0), working = useRef(false);
  latest.current = value;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current++; controller.current?.abort(); }, []);
  const prefix = billing ? "billing" : "address";
  async function lookupCep() {
    if (working.current || value.postalCode.length !== 8) return;
    const snapshot = latest.current, token = ++request.current;
    const abort = new AbortController(); controller.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 10000);
    working.current = true; setBusy(true); onBusyChange(true); setError("");
    try {
      const found = await fetchCepAddress(snapshot.postalCode, abort.signal);
      if (token !== request.current || latest.current.postalCode !== snapshot.postalCode) return;
      if (!found) { setError("CEP não encontrado. Preencha o endereço manualmente."); return; }
      const next = { ...latest.current };
      for (const key of ["street", "district", "city", "state"] as const)
        if (!next[key] || next[key] === snapshot[key]) next[key] = found[key];
      onChange(next);
    } catch {
      if (token === request.current && latest.current.postalCode === snapshot.postalCode) setError("Não foi possível consultar o CEP. Preencha o endereço manualmente.");
    } finally {
      window.clearTimeout(timeout);
      if (token === request.current) { working.current = false; setBusy(false); onBusyChange(false); }
    }
  }
  function field(key: keyof ContactDraft, label: string, required = true, autoComplete?: string) {
    const message = errors[`${prefix}.${key}`];
    return <div className="min-w-0" key={key}><label htmlFor={`${id}-${key}`}>{label}
      <input id={`${id}-${key}`} name={`${prefix}.${key}`} value={key === "document" ? formatCheckoutDocument(value[key]) : key === "phone" ? formatCheckoutPhone(value[key]) : value[key]} required={required}
        autoComplete={autoComplete ? `${billing ? "billing" : "shipping"} ${autoComplete}` : undefined}
        type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
        inputMode={key === "document" ? "numeric" : undefined}
        maxLength={key === "document" ? 18 : key === "phone" ? 25 : key === "email" ? 254 : key === "number" ? 20 : key === "street" ? 150 : 100}
        aria-invalid={Boolean(message)} aria-describedby={message ? `${id}-${key}-error` : undefined}
        onChange={e => onChange({ ...value, [key]: key === "document" ? formatCheckoutDocument(e.target.value) : key === "phone" ? formatCheckoutPhone(e.target.value) : e.target.value })}/>
      </label>{message ? <small id={`${id}-${key}-error`} className="text-red-700">{message}</small> : null}
    </div>;
  }
  const documentType = value.document.replace(/\D/g, "").length;
  return <div className="grid min-w-0 gap-3 sm:grid-cols-2">
    {field("name", billing ? "Nome completo / Razão social" : "Nome do destinatário", true, "name")}
    <div className="min-w-0">{field("document", billing ? "CPF/CNPJ para faturamento" : "CPF/CNPJ do destinatário (opcional)", billing)}
      {billing && [11, 14].includes(documentType) ? <small className={styles.muted}>{documentType === 14 ? "Pessoa jurídica" : "Pessoa física"}</small> : null}
    </div>
    {billing ? field("email", "E-mail para faturamento", true, "email") : null}
    {field("phone", billing ? "Telefone com DDD" : "Telefone do destinatário com DDD", true, "tel")}
    <div className="min-w-0 sm:col-span-2">
      <div className="flex items-end gap-2"><label className="min-w-0 flex-1" htmlFor={`${id}-cep`}>CEP {billing ? "de faturamento" : "de entrega"}
        <input id={`${id}-cep`} name={`${prefix}.postalCode`} autoComplete={`${billing ? "billing" : "shipping"} postal-code`} inputMode="numeric" value={formatCep(value.postalCode)} maxLength={9} required
          aria-invalid={Boolean(errors[`${prefix}.postalCode`])} aria-describedby={errors[`${prefix}.postalCode`] ? `${id}-cep-error` : undefined}
          onChange={e => onChange({ ...value, postalCode: normalizeCep(e.target.value) })} onBlur={() => void lookupCep()}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void lookupCep(); } }}/>
      </label><button type="button" className={`${styles.secondary} min-h-11 shrink-0`} aria-label={`Buscar CEP ${billing ? "de faturamento" : "de entrega"}`} title="Consultar endereço pelo CEP" disabled={busy || value.postalCode.length !== 8} onClick={() => void lookupCep()}>
        {busy ? <Loader2 size={18} className="animate-spin"/> : <Search size={18}/>}<span className="hidden sm:inline">Buscar CEP</span>
      </button></div>
      {errors[`${prefix}.postalCode`] ? <small id={`${id}-cep-error`} className="text-red-700">{errors[`${prefix}.postalCode`]}</small> : null}
      {busy ? <p role="status" className={styles.muted}>Consultando endereço…</p> : null}
      {error ? <p role="status" className="text-sm text-amber-700">{error}</p> : null}
    </div>
    <div className="min-w-0 sm:col-span-2">{field("street", "Endereço", true, "address-line1")}</div>
    {field("number", "Número")}{field("complement", "Complemento", false, "address-line2")}
    {field("district", "Bairro")}{field("city", "Cidade", true, "address-level2")}
    <label className="min-w-0" htmlFor={`${id}-state`}>UF<select id={`${id}-state`} name={`${prefix}.state`} value={value.state} required autoComplete={`${billing ? "billing" : "shipping"} address-level1`}
      aria-invalid={Boolean(errors[`${prefix}.state`])} aria-describedby={errors[`${prefix}.state`] ? `${id}-state-error` : undefined}
      onChange={e => onChange({ ...value, state: e.target.value })}>
      <option value="">Selecione</option>{addressSchema.shape.state.options.map(state => <option key={state} value={state}>{state}</option>)}</select>
      {errors[`${prefix}.state`] ? <small id={`${id}-state-error`} className="text-red-700">{errors[`${prefix}.state`]}</small> : null}
    </label>
    {!billing ? field("attention", "Aos cuidados de (opcional)", false) : null}
  </div>;
}

export function StoreCheckout({ cart, settings, base, disabled, onSubmit, preview = false, api }: {
  cart: Cart; settings: StoreSettings; base: string; disabled: boolean; onSubmit: (input: unknown) => Promise<void>; preview?: boolean; api?: string;
}) {
  const [delivery, setDelivery] = useState(settings.pickupEnabled ? "pickup" : "delivery");
  const [provider, setProvider] = useState(cart.payments.mp_enabled ? "mercado_pago" : "manual");
  const [billing, setBilling] = useState<ContactDraft>(() => ({ ...emptyContact(), name: cart.customer?.name ?? "", email: cart.customer?.email ?? "" }));
  const [address, setAddress] = useState<ContactDraft>(emptyContact);
  const [same, setSame] = useState(true), [customEdited, setCustomEdited] = useState(false), [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({}), [error, setError] = useState("");
  const [billingCepBusy, setBillingCepBusy] = useState(false), [deliveryCepBusy, setDeliveryCepBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  type ShippingOption = { id: string; name: string; priceCents: number; description?: string; quoteId?: string };
  const [freight, setFreight] = useState<{ key: string; expiresAt: number; options: ShippingOption[] } | null>(null);
  const [serviceId, setServiceId] = useState("delivery"), [shippingBusy, setShippingBusy] = useState(false), [shippingError, setShippingError] = useState("");
  const postalCode = (same ? billing.postalCode : address.postalCode);
  const freightKey = `${postalCode}:${cart.revision}:${cart.calculation?.totalCents}`;
  const latestFreightKey = useRef(freightKey); latestFreightKey.current = freightKey;
  const quoteGeneration = useRef(0);
  useEffect(() => { quoteGeneration.current++; setShippingBusy(false); setShippingError(""); }, [freightKey]);
  useEffect(() => () => { quoteGeneration.current++; }, []);
  const selectedFreight = freight?.key === freightKey && freight.expiresAt > Date.now() ? freight.options.find(option => option.id === serviceId) : undefined;
  const requiresFreight = delivery === "delivery" && settings.carrierEnabled && serviceId !== "delivery";
  const missingFreight = delivery === "delivery" && !selectedFreight && (!settings.deliveryEnabled || requiresFreight);
  const shipping = delivery === "pickup" ? 0 : selectedFreight?.priceCents ?? (settings.deliveryEnabled && !requiresFreight ? settings.deliveryCents : 0);
  async function quoteShipping() {
    if (!api || shippingBusy || postalCode.length !== 8) return;
    const key = freightKey, generation = ++quoteGeneration.current;
    setShippingBusy(true); setShippingError(""); setFreight(null);
    try {
      const result = await storeRequest(`${api}/checkout-delivery`, "POST", { postalCode, revision: cart.revision, ...(preview ? { lines: cart.lines } : {}) });
      if (latestFreightKey.current !== key || generation !== quoteGeneration.current) return;
      const options: ShippingOption[] = result.options.filter((option: ShippingOption) => option.id !== "pickup");
      setFreight({ key, options, expiresAt: Date.now() + 900000 });
      setServiceId(options.find(option => option.id.startsWith("melhor_envio:"))?.id ?? "delivery");
      if (result.warnings?.length) setShippingError(result.warnings.join(" "));
    } catch (cause) { if (generation === quoteGeneration.current) setShippingError(cause instanceof Error ? cause.message : "Não foi possível calcular o frete."); }
    finally { if (generation === quoteGeneration.current) setShippingBusy(false); }
  }
  function changeDeliveryAddress(next: ContactDraft) { setAddress(next); setCustomEdited(true); }
  return <form ref={form} className={styles.columns} noValidate onSubmit={e => {
    e.preventDefault(); setError("");
    if (missingFreight || (selectedFreight && freight && freight.expiresAt <= Date.now())) { setError("Calcule e selecione o frete para este endereço antes de confirmar."); return; }
    const parsed = checkoutSchema.safeParse({ revision: cart.revision, expectedTotalCents: (cart.calculation?.totalCents ?? 0) + shipping,
      billing: { ...postalContact(billing), email: billing.email }, delivery, deliveryAddressSameAsBilling: same,
      ...(delivery === "delivery" && selectedFreight?.quoteId ? { shippingQuoteId: selectedFreight.quoteId } : {}),
      address: delivery === "delivery" && !same ? { ...postalContact(address), attention: address.attention } : null,
      provider, acceptedTerms: accepted,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join("."), issue.message])));
      setError("Confira os campos destacados antes de confirmar o pedido.");
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    setErrors({}); void onSubmit(parsed.data);
  }}>
    <div className={styles.form}>
      {preview ? <button type="button" className={`${styles.secondary} justify-self-start`} onClick={() => { setBilling({ ...previewBilling }); setErrors({}); setError(""); }}>Preencher dados de teste</button> : null}
      <section className="min-w-0 space-y-4" aria-labelledby="checkout-billing"><h2 id="checkout-billing" className="text-lg font-semibold">1. Dados para faturamento</h2>
        <ContactFields billing value={billing} onChange={setBilling} errors={errors} onBusyChange={setBillingCepBusy}/>
      </section>
      <section className="mt-5 min-w-0 space-y-4 border-t border-current/15 pt-5" aria-labelledby="checkout-delivery"><h2 id="checkout-delivery" className="text-lg font-semibold">2. Como deseja receber?</h2>
        {settings.pickupEnabled ? <label className="!flex items-start gap-3"><input type="radio" name="delivery" checked={delivery === "pickup"} onChange={() => { setDeliveryCepBusy(false); setDelivery("pickup"); }}/><span>Retirar pessoalmente · Grátis<small className={`${styles.muted} mt-1 block`}>{settings.pickupAddress}</small></span></label> : null}
        {settings.deliveryEnabled || settings.carrierEnabled ? <label className="!flex items-start gap-3"><input type="radio" name="delivery" checked={delivery === "delivery"} onChange={() => setDelivery("delivery")}/><span>{settings.carrierEnabled ? "Receber no endereço" : `Entrega · ${storeMoney(settings.deliveryCents)}`}<small className={`${styles.muted} mt-1 block`}>{settings.carrierEnabled ? "Frete calculado para todos os itens do carrinho." : settings.deliveryDescription}</small></span></label> : null}
        {delivery === "delivery" ? <>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2" role="group" aria-label="Endereço e destinatário da entrega">
            <button type="button" aria-pressed={same} className={`${same ? styles.primary : styles.secondary} min-h-11 !whitespace-normal !text-left`} onClick={() => { setDeliveryCepBusy(false); setSame(true); }}><Copy size={18} className="shrink-0"/>Usar dados do faturamento</button>
            <button type="button" aria-pressed={!same} className={`${!same ? styles.primary : styles.secondary} min-h-11 !whitespace-normal !text-left`} onClick={() => { if (!customEdited) setAddress({ ...billing, email: "", attention: "" }); setSame(false); }}><MapPin size={18} className="shrink-0"/>Outro destinatário ou endereço</button>
          </div>
          {same ? <address className="border-l-2 border-current/20 pl-3 text-sm not-italic leading-6" aria-label="Entrega com os dados do faturamento"><strong>{billing.name || "Destinatário do faturamento"}</strong><br/>{billing.street ? `${billing.street}${billing.number ? `, ${billing.number}` : ""}${billing.complement ? ` · ${billing.complement}` : ""}` : "Endereço de faturamento"}<br/>{[billing.district, billing.city, billing.state, formatCep(billing.postalCode)].filter(Boolean).join(" · ")}</address>
            : <ContactFields billing={false} value={address} onChange={changeDeliveryAddress} errors={errors} onBusyChange={setDeliveryCepBusy}/>}
          {errors.address ? <p role="alert" className="text-sm text-red-700">{errors.address}</p> : null}
          {settings.carrierEnabled ? <div className="min-w-0 space-y-3 border-t border-current/15 pt-4" aria-label="Frete do carrinho">
            <button type="button" className={styles.secondary} disabled={disabled || shippingBusy || postalCode.length !== 8 || !api} onClick={() => void quoteShipping()}>
              {shippingBusy ? <Loader2 size={18} className="animate-spin"/> : <Truck size={18}/>} {shippingBusy ? "Calculando…" : "Calcular frete do carrinho"}
            </button>
            {postalCode.length !== 8 ? <p className={styles.muted}>Preencha o CEP da entrega para consultar PAC, SEDEX e os demais serviços habilitados.</p> : null}
            {shippingError ? <p role="alert" className="text-sm text-amber-700">{shippingError}</p> : null}
            {settings.deliveryEnabled ? <label className="!flex items-start gap-3"><input type="radio" name="shipping-service" checked={serviceId === "delivery"} onChange={() => setServiceId("delivery")}/><span>{settings.deliveryDescription} · {storeMoney(settings.deliveryCents)}</span></label> : null}
            {freight?.key === freightKey ? freight.options.filter(option => option.id.startsWith("melhor_envio:")).map(option => <label key={option.id} className="!flex items-start gap-3"><input type="radio" name="shipping-service" checked={serviceId === option.id} onChange={() => setServiceId(option.id)}/><span>{option.name} · {storeMoney(option.priceCents)}<small className={`${styles.muted} block`}>{option.description}</small></span></label>) : null}
            {freight?.key === freightKey ? <p className={styles.muted}>Cotação válida por 15 minutos. Mudanças no carrinho ou CEP exigem novo cálculo.</p> : null}
          </div> : null}
        </> : null}
      </section>
      <section className="mt-5 min-w-0 space-y-4 border-t border-current/15 pt-5" aria-labelledby="checkout-payment"><h2 id="checkout-payment" className="text-lg font-semibold">3. Forma de pagamento</h2>
        {preview ? <p className="text-sm">Pagamento simulado · Nenhum valor será cobrado.</p> : <>
          {cart.payments.mp_enabled ? <label className="!flex items-center gap-3"><input type="radio" name="provider" checked={provider === "mercado_pago"} onChange={() => setProvider("mercado_pago")}/>Mercado Pago · Métodos disponíveis no checkout seguro</label> : null}
          {cart.payments.manual_enabled ? <label className="!flex items-center gap-3"><input type="radio" name="provider" checked={provider === "manual"} onChange={() => setProvider("manual")}/>Pagamento combinado com a loja</label> : null}
          {!cart.payments.mp_enabled && !cart.payments.manual_enabled ? <p className="text-sm text-red-700">A loja ainda não habilitou formas de pagamento.</p> : null}
          {provider === "manual" ? <p className="whitespace-pre-wrap text-sm text-zinc-500">{cart.payments.manual_instructions}</p> : null}
        </>}
      </section>
    </div>
    <aside className={styles.summary}><h2 className="mb-4 text-lg font-semibold">4. Revise seu pedido</h2>
      {cart.calculation?.items.map(item => <div className="mb-3 flex justify-between gap-3 text-sm" key={item.id}><span>{item.quantity} × {item.name}<small className="block text-zinc-500">{item.artworkName}</small></span><span>{storeMoney(item.totalCents)}</span></div>)}
      <StoreOrderSummary subtotal={cart.calculation?.totalCents ?? 0} shipping={shipping} shippingPending={Boolean(missingFreight)} artworkDiscountCents={cart.calculation?.artworkDiscountCents}/>
      {missingFreight ? <p role="status" className="mt-2 text-sm text-amber-700">Frete a calcular. O total acima ainda não inclui a entrega.</p> : null}
      <label className="my-5 flex items-start gap-3"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} required/><span>Li e aceito as <Link target="_blank" href={`${base}/condicoes`} className="underline">condições de compra</Link>.</span></label>
      {error ? <p role="alert" className="mb-3 text-sm text-red-700">{error}</p> : null}
      <button className={`${styles.primary} w-full`} disabled={disabled || shippingBusy || missingFreight || billingCepBusy || deliveryCepBusy || !accepted || !cart.calculation || (!cart.payments.mp_enabled && !cart.payments.manual_enabled)}><Check size={17}/>{preview ? "Concluir simulação" : "Confirmar pedido"}</button>
      <p className="mt-3 text-sm text-zinc-500">{preview ? "Prévia privada. Nenhum pedido real será criado." : provider === "mercado_pago" ? "Após confirmar, abra o pagamento seguro no detalhe do pedido." : "A produção começa após a confirmação do pagamento pela loja."}</p>
    </aside>
  </form>;
}

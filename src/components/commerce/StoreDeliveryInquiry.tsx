"use client";
import React, { useEffect, useRef, useState } from "react";
import { LoaderCircle, Truck } from "lucide-react";
import type { CartLine } from "@/domain/commerce/schemas";
import type { commerceDeliveryEstimate } from "@/domain/commerce/delivery";
import { formatCep } from "@/lib/cep";
import { storeMoney, storeRequest } from "./store-http";
import styles from "./store.module.css";

export function StoreDeliveryInquiry({ api, lines, disabled }: { api: string; lines: CartLine[]; disabled: boolean }) {
  const [cep, setCep] = useState("");
  const [result, setResult] = useState<ReturnType<typeof commerceDeliveryEstimate> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef({ value: 0 });
  useEffect(() => {
    const requests = generation.current;
    requests.value++;
    setResult(null); setError(""); setBusy(false);
    return () => { requests.value++; };
  }, [api, lines]);
  return <section className={styles.deliveryInquiry} aria-label="Consultar frete do produto">
    <h2><Truck size={18} aria-hidden="true" /> Calcule a entrega</h2>
    <form onSubmit={async event => {
      event.preventDefault();
      if (disabled || busy) return;
      const current = ++generation.current.value;
      setBusy(true); setError(""); setResult(null);
      try {
        const data = await storeRequest(`${api}/delivery`, "POST", { postalCode: cep, lines });
        if (current === generation.current.value) setResult(data);
      } catch (cause) {
        if (current === generation.current.value) setError(cause instanceof Error ? cause.message : "Não foi possível consultar a entrega.");
      } finally { if (current === generation.current.value) setBusy(false); }
    }}>
      <label>CEP de destino<input value={cep} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" required pattern="[0-9]{5}-[0-9]{3}" maxLength={9}
        onChange={event => { generation.current.value++; setCep(formatCep(event.target.value)); setResult(null); setError(""); setBusy(false); }} /></label>
      <button className={styles.secondary} disabled={disabled || busy || cep.length !== 9} type="submit">
        {busy ? <LoaderCircle size={17} className="animate-spin" /> : <Truck size={17} />} {busy ? "Consultando…" : "Consultar"}
      </button>
    </form>
    {error ? <p role="alert" className={styles.deliveryError}>{error}</p> : null}
    {result ? <div role="status" className={styles.deliveryResults}>
      {!result.options.length ? <p>Entrega indisponível no momento. Consulte a loja.</p> : result.options.map(option => <div key={option.id}>
        <span>{option.name}<small>{option.id === "delivery" ? "Tarifa de entrega da loja" : option.description}</small></span>
        <strong>{option.priceCents === 0 ? "Grátis" : storeMoney(option.priceCents)}</strong>
      </div>)}
    </div> : null}
    <p className={styles.muted}>Consulta para este produto. O frete final será confirmado para todo o carrinho no checkout.</p>
  </section>;
}

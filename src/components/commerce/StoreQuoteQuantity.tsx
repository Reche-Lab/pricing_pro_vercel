"use client";
import React, { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import q from "./quote.module.css";
export function StoreQuoteQuantity({ value, label, disabled, onCommit }: { value: number; label: string; disabled: boolean; onCommit: (quantity: number) => Promise<boolean> }) {
  const [draft, setDraft] = useState(String(value)), [error, setError] = useState("");
  useEffect(() => setDraft(String(value)), [value]);
  async function commit(raw = draft) {
    if (disabled || raw === String(value)) return;
    try {
      if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error("Informe uma quantidade inteira maior que zero.");
      setError(""); if (!await onCommit(Number(raw))) setDraft(String(value));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confira a quantidade."); setDraft(String(value)); }
  }
  return <div><form className={q.quantity} onSubmit={event => { event.preventDefault(); void commit(); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) void commit(); }}>
    <button type="button" disabled={disabled || Number(draft) <= 1} title="Diminuir quantidade" aria-label={`Diminuir ${label}`} onClick={() => void commit(String(Number(draft || value) - 1))}><Minus size={15}/></button>
    <input type="text" inputMode="numeric" name="quantity" pattern="[0-9]*" maxLength={5} aria-label={`Quantidade de ${label}`} value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)}/>
    <button type="button" disabled={disabled} title="Aumentar quantidade" aria-label={`Aumentar ${label}`} onClick={() => void commit(String(Number(draft || value) + 1))}><Plus size={15}/></button>
  </form>{error ? <p role="alert" className={q.error}>{error}</p> : null}</div>;
}

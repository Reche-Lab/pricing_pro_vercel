"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, CircleAlert, RefreshCw, ShoppingBag } from "lucide-react";
import type { OrderWorkspace } from "@/domain/commerce/order-workflow";
import { orderProductionState } from "@/domain/commerce/order-workflow";

export function CommerceOrderAlerts() {
  const [enabled, setEnabled] = useState(false), [open, setOpen] = useState(false);
  const [data, setData] = useState<OrderWorkspace | null>(null), [error, setError] = useState("");
  const wrapper = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/me", { cache: "no-store", signal: controller.signal }).then(r => r.ok ? r.json() : null)
      .then(me => { if (!controller.signal.aborted) setEnabled(Boolean(me?.commerce?.read)); }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let loading = false;
    async function refresh() {
      if (document.hidden || loading) return;
      loading = true;
      try {
        const response = await fetch("/api/commerce/admin/orders?summary=1&filter=unread", { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível consultar os pedidos.");
        if (!controller.signal.aborted) { setData(result); setError(""); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Avisos indisponíveis."); }
      finally { loading = false; }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60000);
    const update = () => { void refresh(); };
    window.addEventListener("focus", update); window.addEventListener("commerce:orders-updated", update); document.addEventListener("visibilitychange", update);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("commerce:orders-updated", update); document.removeEventListener("visibilitychange", update); };
  }, [enabled]);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  if (!enabled) return null;
  const count = data?.summary.unread ?? 0;
  const countLabel = count === 1 ? "1 atualização não vista" : `${count} atualizações não vistas`;
  return <div ref={wrapper} className="relative shrink-0">
    <span aria-live="polite" className="sr-only">{count ? `Pedidos da loja: ${countLabel}` : ""}</span>
    <button ref={trigger} type="button" aria-label={`Alertas da loja${count ? `: ${countLabel}` : ""}`} aria-expanded={open} aria-controls="commerce-order-alerts" title="Compras e atualizações das artes" className="focus-ring relative grid h-11 w-11 place-items-center rounded-md border border-zinc-700 text-zinc-300 transition hover:border-emerald-700 hover:bg-emerald-950/40 hover:text-emerald-200" onClick={() => setOpen(value => !value)}><Bell size={19} />{count || error ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-400 px-1 text-center text-[10px] font-bold leading-5 text-zinc-950">{error ? "!" : count > 99 ? "99+" : count}</span> : null}</button>
    {open ? <section id="commerce-order-alerts" aria-label="Compras e atualizações" className="absolute right-0 top-14 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl">
      <div className="border-b border-zinc-800 p-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><ShoppingBag size={17} />Pedidos da loja</h2><p role="status" className="mt-1 text-xs text-zinc-400">{count ? `${count} ${count === 1 ? "pedido com atualizações não vistas" : "pedidos com atualizações não vistas"}` : "Nenhuma atualização pendente"}</p></div>
      {error ? <div role="alert" className="flex gap-2 p-4 text-xs text-amber-200"><CircleAlert size={16} className="shrink-0" />{error}</div> : <div className="max-h-[45dvh] overflow-y-auto">{data?.orders.map(order => <Link key={order.id} href={`/commerce/orders/${order.id}`} className="block border-b border-zinc-800 px-4 py-3 transition hover:bg-zinc-900" onClick={() => setOpen(false)}><span className="block text-sm font-medium">Compra #{order.id.slice(0, 8).toUpperCase()}</span><span className="mt-1 block truncate text-xs text-zinc-400">{order.customer_name}</span><span className="mt-1 block text-xs text-emerald-300">{orderProductionState(order).label}</span></Link>)}{data && !count ? <div className="flex items-center gap-2 p-4 text-sm text-zinc-400"><CheckCheck size={18} />Tudo em dia por aqui.</div> : null}{!data ? <p className="p-4 text-sm text-zinc-400">Consultando pedidos…</p> : null}</div>}
      <div className="flex items-center justify-between gap-3 p-3"><Link className="text-sm font-semibold text-emerald-300 hover:underline" href="/commerce/orders" onClick={() => setOpen(false)}>Ver todos os pedidos</Link><button type="button" title="Atualizar avisos" aria-label="Atualizar avisos" className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-zinc-700" onClick={() => window.dispatchEvent(new Event("commerce:orders-updated"))}><RefreshCw size={15} /></button></div>
    </section> : null}
  </div>;
}

export function CommerceOrderSeen({ orderId, seenThrough }: { orderId: string; seenThrough: string }) {
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/commerce/admin/orders/${orderId}/seen`, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ seenThrough }) })
      .then(response => { if (!response.ok) throw new Error(); if (!controller.signal.aborted) { setError(""); window.dispatchEvent(new Event("commerce:orders-updated")); } })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível marcar este aviso como visto. O pedido continua disponível."); });
    return () => controller.abort();
  }, [orderId, seenThrough]);
  return error ? <p role="status" className="mb-4 text-xs text-amber-300">{error}</p> : null;
}

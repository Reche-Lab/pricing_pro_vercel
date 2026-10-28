"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Loader2, MapPin, RefreshCw, X } from "lucide-react";
import { olistAwareFetch } from "@/lib/olist/browser-request";
import { quoteShippingEditBlock } from "@/domain/quotes/shipping";
import type { QuoteDetail } from "@/repositories/quotes";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function QuotePickupAction({ quote }: { quote: QuoteDetail }) {
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("Cliente solicitou retirada no local.");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState(false);
  const [pending, setPending] = useState(Boolean(quote.shipping_olist_sync_pending));
  const pickup = removed || quote.delivery_method === "pickup";
  const blocked = quoteShippingEditBlock(quote);
  useEffect(() => { setPending(Boolean(quote.shipping_olist_sync_pending)); }, [quote.shipping_olist_sync_pending]);
  useEffect(() => { setRemoved(false); }, [quote.shipping_total, quote.delivery_method]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setOpen(false);
      if (event.key !== "Tab") return;
      const nodes = dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), textarea:not(:disabled)");
      const first = nodes?.[0]; const last = nodes?.[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [open, busy]);

  async function save(checkOnly: boolean) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await olistAwareFetch(`/api/quotes/${quote.id}/pickup`, {
        method: checkOnly ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: checkOnly ? "{}" : JSON.stringify({ confirmed: true, expectedShippingTotal: Number(quote.shipping_total), reason })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(typeof data?.error === "string" ? data.error : "Não foi possível retirar o frete.");
      if (!checkOnly) setRemoved(true);
      setPending(Boolean(data.pending)); setMessage(data.message); setOpen(false);
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha de comunicação. Tente novamente."); }
    finally { setBusy(false); }
  }

  return <div className="mt-3 min-w-0 border-t border-zinc-800 pt-3">
    {pickup ? <p className="inline-flex items-center gap-2 text-xs font-medium text-emerald-200"><Check size={14} />Retirada no local · sem frete</p> : null}
    {!pickup && Number(quote.shipping_total) > 0 ? <button type="button" disabled={Boolean(blocked)} title={blocked ?? "Remover o frete cobrado e mudar para retirada no local"} className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:border-cyan-400/50 hover:bg-cyan-400/10 disabled:opacity-50" onClick={() => { setError(""); setOpen(true); }}><MapPin size={15} />Retirar frete / retirada no local</button> : null}
    {pending ? <div className="mt-2 grid gap-2 rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100"><p>Olist pendente: {pickup ? "zere" : "ajuste"} o frete cobrado no pedido e revise as parcelas no ERP. A API não permite alterar esse valor em pedidos existentes. A nota fiscal ficará bloqueada até a conferência.</p><button type="button" disabled={busy || Boolean(blocked)} className="focus-ring inline-flex min-h-10 w-fit items-center gap-2 rounded-md border border-amber-400/30 px-3 disabled:opacity-50" onClick={() => void save(true)}>{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Conferir no Olist</button></div> : null}
    {message ? <p role="status" className={`mt-2 text-xs leading-5 ${pending ? "text-amber-200" : "text-emerald-200"}`}>{message}</p> : null}
    {error && !open ? <p role="alert" className="mt-2 text-xs text-rose-200">{error}</p> : null}
    {blocked && !pickup && Number(quote.shipping_total) > 0 ? <p className="mt-2 text-xs leading-5 text-zinc-400">{blocked}</p> : null}
    {open ? createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1} className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg min-w-0 flex-col rounded-lg border border-zinc-700 bg-zinc-950 p-5 text-zinc-200 shadow-2xl outline-none">
      <div className="flex shrink-0 items-start justify-between gap-3"><h2 id={`${id}-title`} className="text-lg font-semibold text-white">Retirada no local</h2><button type="button" disabled={busy} aria-label="Fechar retirada" title="Fechar" className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md hover:bg-zinc-800" onClick={() => setOpen(false)}><X size={18} /></button></div>
      <div className="min-h-0 overflow-y-auto">
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><dt>Frete removido</dt><dd className="text-right">−{brl.format(Number(quote.shipping_total))}</dd><dt>Novo total</dt><dd className="text-right font-semibold text-white">{brl.format(Number(quote.subtotal) - Number(quote.discount_total))}</dd></dl>
      <label className="mt-4 block text-sm">Motivo<textarea className="focus-ring mt-1 min-h-20 w-full rounded-md border border-zinc-700 bg-zinc-900 p-3" maxLength={500} value={reason} onChange={event => setReason(event.currentTarget.value)} /></label>
      <p className="mt-3 text-xs leading-5 text-zinc-400">O total, o PDF e as parcelas locais serão recalculados. A alteração ficará no histórico. Etiquetas compradas não serão canceladas e valores já pagos não serão estornados automaticamente.</p>
      {quote.external_olist_order_id ? <p className="mt-3 rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">Enviaremos uma observação de retirada ao pedido Olist. Você precisará zerar o frete cobrado e revisar as parcelas diretamente no ERP, pois a API não oferece essa alteração. Depois, use Conferir no Olist para atualizar a forma de envio.</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p> : null}
      </div>
      <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2 border-t border-zinc-800 pt-4"><button type="button" disabled={busy} className="focus-ring min-h-10 rounded-md border border-zinc-700 px-4 text-sm" onClick={() => setOpen(false)}>Manter frete</button><button type="button" disabled={busy || reason.trim().length < 3} className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50" onClick={() => void save(false)}>{busy ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}Confirmar retirada</button></div>
    </div></div>, document.body) : null}
  </div>;
}

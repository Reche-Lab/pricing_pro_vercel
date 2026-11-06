"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Download, Eye, Loader2, PackageCheck, Printer, Truck, X } from "lucide-react";
import { orderProductionState, type OrderWorkspaceItem } from "@/domain/commerce/order-workflow";
import { storeRequest } from "./store-http";

export function CommerceOrderProduction({ order, canManage }: { order: OrderWorkspaceItem; canManage: boolean }) {
  const router = useRouter();
  const [cutLines, setCutLines] = useState(true), [action, setAction] = useState<string | null>(null), [note, setNote] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const refresh = () => router.refresh(); window.addEventListener("commerce:artworks-updated", refresh); return () => window.removeEventListener("commerce:artworks-updated", refresh); }, [router]);
  useEffect(() => { if (action) dialog.current?.showModal?.(); }, [action]);
  const state = orderProductionState(order);
  const labels: Record<string, string> = { confirm_manual: "Confirmar pagamento recebido", production: "Iniciar produção", shipped: "Marcar como enviado", completed: "Concluir pedido" };
  const next = order.payment_status === "pending" && order.provider === "manual" ? "confirm_manual"
    : order.payment_status !== "paid" ? null
    : order.fulfillment_status === "received" ? "production"
    : order.fulfillment_status === "production" ? "shipped"
    : order.fulfillment_status === "shipped" ? "completed" : null;
  const ready = order.required_artworks === order.approved_artworks;
  const pdf = `/api/commerce/admin/orders/${order.id}/files?pdf=1&cutLines=${cutLines ? "1" : "0"}`;
  return <section aria-label="Produção e impressão" className="min-w-0 space-y-4 border-y border-zinc-800 py-5">
    <div className="flex items-center gap-2"><Printer size={18} className="text-emerald-400" /><h2 className="font-semibold">Produção e impressão</h2></div>
    <p role="status" className={`flex items-center gap-2 text-sm ${state.key === "ready" ? "text-emerald-300" : "text-amber-200"}`}>{state.key === "ready" ? <PackageCheck size={17} /> : <CircleAlert size={17} />}{state.label}</p>
    <ul className="space-y-2 text-xs text-zinc-400"><li className="flex items-center gap-2"><CheckCircle2 size={15} className={order.payment_status === "paid" ? "text-emerald-400" : "text-zinc-600"} />{order.payment_status === "paid" ? "Pagamento confirmado" : "Pagamento ainda não confirmado"}</li><li className="flex items-center gap-2"><CheckCircle2 size={15} className={ready ? "text-emerald-400" : "text-zinc-600"} />{order.required_artworks ? `${order.approved_artworks} de ${order.required_artworks} artes aprovadas pelo cliente` : "Sem artes personalizadas para impressão"}</li></ul>
    <label className="flex min-h-10 items-center gap-2 text-xs text-zinc-300"><input type="checkbox" className="h-4 w-4 accent-emerald-400" checked={cutLines} onChange={e => setCutLines(e.target.checked)} />Incluir linhas de corte no PDF</label>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{state.printable ? <><a className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-700 bg-emerald-950/25 px-3 text-center text-sm text-emerald-200 hover:bg-emerald-950/50" href={pdf} target="_blank" rel="noopener noreferrer"><Eye size={16} />Visualizar folhas A4</a><a className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-400 px-3 text-center text-sm font-semibold text-zinc-950 hover:bg-emerald-300" href={`${pdf}&download=1`}><Download size={16} />Baixar PDF de produção</a></> : <p className="col-span-full text-xs leading-5 text-zinc-500">{order.required_artworks ? "As folhas A4 serão liberadas após o pagamento e a aprovação de todas as artes pelo cliente." : "Este pedido não precisa de folhas de arte."}</p>}</div>
    {canManage && next ? <button type="button" disabled={next === "production" && !ready} title={next === "production" && !ready ? "Aguarde a aprovação de todas as artes." : labels[next]} className="focus-ring inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 text-sm transition hover:border-emerald-700 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => { setAction(next); setNote(""); setError(""); }}>{next === "shipped" ? <Truck size={16} /> : <PackageCheck size={16} />}{labels[next]}</button> : null}
    {action ? <dialog ref={dialog} aria-labelledby="commerce-order-action" className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-5 text-zinc-100 backdrop:bg-black/75" onCancel={event => { if (busy) event.preventDefault(); else setAction(null); }}>
      <form onSubmit={async event => {
        event.preventDefault(); if (busy) return; setBusy(true); setError("");
        try { await storeRequest(`/api/commerce/admin/orders/${order.id}`, "POST", { action, note }); setAction(null); router.refresh(); window.dispatchEvent(new Event("commerce:orders-updated")); }
        catch (e) { setError(e instanceof Error ? e.message : "Não foi possível atualizar o pedido."); }
        finally { setBusy(false); }
      }} className="space-y-4"><header className="flex items-start justify-between gap-3"><h2 id="commerce-order-action" className="font-semibold">{labels[action]}</h2><button className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md border border-zinc-700" aria-label="Fechar confirmação" disabled={busy} type="button" onClick={() => setAction(null)}><X size={17} /></button></header><p className="text-sm leading-6 text-zinc-400">{action === "confirm_manual" ? "Confirme somente se o valor realmente foi recebido. Esta ação não realiza uma cobrança." : action === "production" ? "As artes ficarão bloqueadas para edição ao iniciar a produção. Confira a aprovação do cliente antes de continuar." : "A mudança ficará registrada no histórico do pedido."}</p><label className="grid gap-2 text-sm">Observação<textarea autoFocus className="min-h-24 w-full rounded-md border border-zinc-700 bg-zinc-900 p-3" required minLength={5} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>{error ? <p role="alert" className="rounded-md bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p> : null}<div className="flex flex-wrap justify-end gap-2"><button type="button" className="min-h-10 rounded-md border border-zinc-700 px-3 text-sm" disabled={busy} onClick={() => setAction(null)}>Voltar</button><button className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-400 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-40" disabled={busy || note.trim().length < 5}>{busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}Confirmar</button></div></form>
    </dialog> : null}
  </section>;
}

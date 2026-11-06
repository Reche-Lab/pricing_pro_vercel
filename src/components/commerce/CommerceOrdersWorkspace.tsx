"use client";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Eye, PackageCheck, Paintbrush, RefreshCw, ShoppingBag } from "lucide-react";
import { orderProductionState, type OrderFilter, type OrderWorkspace } from "@/domain/commerce/order-workflow";
import { storeMoney } from "./store-http";

const filters: [OrderFilter, string][] = [["all", "Todos"], ["unread", "Não vistos"], ["payment", "Pagamento pendente"], ["preparation", "Preparar artes"], ["approval", "Aguardando aprovação"], ["ready", "Prontos para produção"], ["production", "Em produção"], ["shipped", "Enviados"], ["completed", "Concluídos"]];
export function CommerceOrdersWorkspace({ data, filter }: { data: OrderWorkspace; filter: OrderFilter }) {
  const router = useRouter();
  const href = (next: OrderFilter, page = 1) => `/commerce/orders?filter=${next}&page=${page}`;
  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-zinc-400">{data.summary.total} compras · {data.summary.unread} com atualizações não vistas</p><button type="button" className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-700 px-3 text-sm hover:bg-zinc-900" onClick={() => { router.refresh(); window.dispatchEvent(new Event("commerce:orders-updated")); }}><RefreshCw size={15} />Atualizar</button></div>
    <div className="grid gap-3 border-y border-zinc-800 py-4 sm:grid-cols-3"><Summary href={href("preparation")} icon={<Paintbrush size={17} />} count={data.summary.preparation} label="Preparar artes" /><Summary href={href("approval")} icon={<Clock3 size={17} />} count={data.summary.approval} label="Aguardando aprovação" /><Summary href={href("ready")} icon={<PackageCheck size={17} />} count={data.summary.ready} label="Prontos para produção" /></div>
    <div aria-label="Filtrar pedidos" className="flex flex-wrap gap-2">{filters.map(([value, label]) => <Link key={value} href={href(value)} aria-current={filter === value ? "page" : undefined} className={`min-h-10 rounded-md border px-3 py-2 text-xs transition ${filter === value ? "border-emerald-500 bg-emerald-500/10 text-emerald-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"}`}>{label}</Link>)}</div>
    <div className="divide-y divide-zinc-800">{data.orders.map(order => {
      const state = orderProductionState(order);
      return <article key={order.id} className="flex min-w-0 flex-wrap items-center justify-between gap-4 py-5">
        <div className="min-w-0 flex-1 basis-56"><div className="flex flex-wrap items-center gap-2"><Link href={`/commerce/orders/${order.id}`} className="font-semibold hover:text-emerald-300">#{order.id.slice(0, 8).toUpperCase()}</Link>{order.unread ? <span className="rounded bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">Não visto</span> : null}<span className={`text-xs ${state.key === "ready" ? "text-emerald-300" : "text-zinc-400"}`}>{state.label}</span></div><p className="mt-2 break-words text-sm">{order.customer_name}</p><p className="mt-1 text-xs text-zinc-500">{new Date(order.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {order.item_count} {order.item_count === 1 ? "item" : "itens"} · {order.approved_artworks}/{order.required_artworks} artes aprovadas</p></div>
        <div className="flex flex-wrap items-center gap-4"><strong className="text-sm tabular-nums">{storeMoney(order.total_cents)}</strong><Link href={`/commerce/orders/${order.id}`} className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-700 px-3 text-sm transition hover:border-emerald-600 hover:bg-emerald-950/30"><Eye size={16} />Abrir pedido{state.printable ? <CheckCircle2 size={15} className="text-emerald-400" /> : null}</Link></div>
      </article>;
    })}</div>
    {!data.orders.length ? <div className="grid justify-items-center gap-3 py-12 text-center text-zinc-400"><ShoppingBag size={28} /><p>{filter === "all" ? "Nenhuma compra recebida ainda." : "Nenhum pedido neste filtro."}</p>{filter !== "all" ? <Link className="text-sm text-emerald-300 underline" href={href("all")}>Ver todos os pedidos</Link> : null}</div> : null}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4 text-sm text-zinc-400"><span>{data.total} resultados · Página {data.page} de {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><div className="flex gap-2">{data.page > 1 ? <Link aria-label="Página anterior" className="focus-ring grid h-10 w-10 place-items-center rounded-md border border-zinc-700" href={href(filter, data.page - 1)}><ArrowLeft size={16} /></Link> : null}{data.page * data.pageSize < data.total ? <Link aria-label="Próxima página" className="focus-ring grid h-10 w-10 place-items-center rounded-md border border-zinc-700" href={href(filter, data.page + 1)}><ArrowRight size={16} /></Link> : null}</div></div>
  </div>;
}
function Summary({ href, icon, count, label }: { href: string; icon: React.ReactNode; count: number; label: string }) {
  return <Link href={href} className="flex min-w-0 items-center gap-3 rounded-md px-3 py-2 transition hover:bg-zinc-900"><span className="text-emerald-400">{icon}</span><span className="text-2xl font-semibold tabular-nums">{count}</span><span className="text-xs text-zinc-400">{label}</span></Link>;
}

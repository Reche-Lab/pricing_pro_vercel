"use client";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Loader2, Package, RefreshCw, Search, ShoppingBag, Truck } from "lucide-react";
import { buyerOrderDate, buyerOrderUnits, buyerPaymentLabel, buyerFulfillmentLabel, type BuyerOrder, type OrderCatalogImage } from "./buyer-order-presentation";
import { StoreBuyerOrderDetail } from "./StoreBuyerOrderDetail";
import { storeMoney, storeRequest } from "./store-http";
import styles from "./store.module.css";
import q from "./quote.module.css";
import o from "./buyer-orders.module.css";
export function StoreBuyerOrders({ api, base, buyerId, orderId, instructions, products, onSessionExpired }: {
  api: string; base: string; buyerId: string; orderId?: string; instructions: string; products: OrderCatalogImage[]; onSessionExpired?: () => Promise<void>;
}) {
  const scope = `${api}:${buyerId}`, id = useId();
  const [state, setState] = useState<{ scope: string; orders: BuyerOrder[] | null; busy: boolean; error: string }>({ scope, orders: null, busy: false, error: "" });
  const [query, setQuery] = useState(""), [payment, setPayment] = useState("all"), [sort, setSort] = useState("newest");
  const active = useRef(false), sequence = useRef(0), currentScope = useRef(scope), expired = useRef(onSessionExpired);
  currentScope.current = scope; expired.current = onSessionExpired;
  const refresh = useCallback(async () => {
    if (!active.current || currentScope.current !== scope) return;
    const request = ++sequence.current;
    setState(current => ({ scope, orders: current.scope === scope ? current.orders : null, busy: true, error: "" }));
    try {
      const result = await storeRequest(`${api}/orders`);
      if (active.current && request === sequence.current && currentScope.current === scope) setState({ scope, orders: result.orders, busy: false, error: "" });
    } catch (cause) {
      if (active.current && request === sequence.current && currentScope.current === scope) {
        const unauthorized = cause && typeof cause === "object" && "status" in cause && [401, 403].includes(Number(cause.status));
        setState(current => ({ scope, orders: unauthorized ? null : current.scope === scope ? current.orders : null, busy: false, error: cause instanceof Error ? cause.message : "Não foi possível carregar seus pedidos." }));
        if (unauthorized) void expired.current?.().catch(() => {});
      }
    }
  }, [api, scope]);
  useEffect(() => { active.current = true; setQuery(""); setPayment("all"); setSort("newest"); void refresh(); return () => { active.current = false; }; }, [refresh]);
  const current = state.scope === scope ? state : null, orders = current?.orders;
  const busy = current?.busy ?? true, error = current?.error ?? "";
  const normalized = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/#/g, "").trim();
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  const filtered = (orders ?? []).filter(order => (payment === "all" || order.payment_status === payment) && terms.every(term => normalized(`${order.id} ${buyerOrderDate(order.created_at)} ${new Date(order.created_at).toLocaleDateString("pt-BR")} ${order.items.map(item => `${item.name} ${item.artworkName || ""}`).join(" ")}`).includes(term)))
    .sort((a, b) => (sort === "highest" ? b.total_cents - a.total_cents : sort === "lowest" ? a.total_cents - b.total_cents : (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) * (sort === "oldest" ? -1 : 1)) || a.id.localeCompare(b.id));
  const order = orders?.find(item => item.id === orderId);
  return <div className={o.page}>
    {error ? <div className={q.error}><p role="alert">{error}</p><button type="button" className={`${styles.secondary} mt-3`} disabled={busy} onClick={() => void refresh()}><RefreshCw size={16}/>Tentar novamente</button></div> : null}
    {!orders ? !error ? <div className={q.listLoading} role="status"><Loader2 size={18} className="animate-spin motion-reduce:animate-none"/>Carregando seus pedidos…</div> : null : orderId ? order ? <StoreBuyerOrderDetail key={order.id} order={order} api={api} base={base} instructions={instructions} busy={busy} onRefresh={refresh} products={products}/> : <div className={q.listEmpty}><Package size={30}/><h1 className={styles.title}>Pedido não encontrado nesta conta</h1><Link className={styles.secondary} href={`${base}/pedidos`}>Voltar aos meus pedidos<ArrowRight size={16}/></Link></div> : <>
      <header className={q.header}><div><h1 className={styles.title}>Meus pedidos</h1><p>Acompanhe suas compras, pagamentos e artes.</p></div><Link className={styles.secondary} href={`${base}/catalogo`}><ShoppingBag size={17}/>Continuar comprando</Link></header>
      {!orders.length ? <section className={q.listEmpty}><ShoppingBag size={30}/><h2>Nenhum pedido por aqui ainda</h2><p>Suas compras aparecerão aqui para você acompanhar cada etapa.</p><Link className={styles.primary} href={`${base}/catalogo`}>Explorar produtos<ArrowRight size={16}/></Link></section> : <>
        <form className={q.listToolbar} role="search" aria-label="Encontrar pedido" onSubmit={event => event.preventDefault()}>
          <label htmlFor={`${id}-search`}>Buscar pedido<span className={q.listSearch}><Search size={17}/><input id={`${id}-search`} type="search" maxLength={100} placeholder="Código, produto ou data" value={query} onChange={event => setQuery(event.target.value)}/></span></label>
          <label htmlFor={`${id}-payment`}>Pagamento<select id={`${id}-payment`} value={payment} onChange={event => setPayment(event.target.value)}><option value="all">Todos</option><option value="pending">Aguardando</option><option value="paid">Confirmados</option><option value="refunded">Estornados</option></select></label>
          <label htmlFor={`${id}-sort`}>Ordenar por<select id={`${id}-sort`} value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option><option value="highest">Maior valor</option><option value="lowest">Menor valor</option></select></label>
        </form>
        <div className={q.listResults}><p role="status">{filtered.length === orders.length ? `${orders.length} ${orders.length === 1 ? "pedido disponível" : "pedidos disponíveis"}` : `${filtered.length} de ${orders.length} pedidos`}</p>{query || payment !== "all" || sort !== "newest" ? <button type="button" onClick={() => { setQuery(""); setPayment("all"); setSort("newest"); }}>Limpar filtros</button> : null}</div>
        {!filtered.length ? <div className={q.listEmpty}><Search size={28}/><h2>Nenhum pedido corresponde à busca</h2><p>Tente outro produto, código ou situação de pagamento.</p></div> : <div className={q.quoteList}>{filtered.map(item => {
          const code = item.id.slice(0, 8).toUpperCase();
          return <article className={`${q.quoteListCard} ${o.orderRow}`} key={item.id} aria-label={`Pedido ${code}`}><header className={q.listCardHeader}><div className={q.listIdentity}><span className={q.listDocument}><Package size={22}/></span><h2><span>Pedido </span><strong>{code}</strong></h2></div><span className={o.status} data-status={item.payment_status}>{buyerPaymentLabel(item.payment_status)}</span>{item.payment_environment === "test" ? <small className={o.testTag}>Teste · sem produção</small> : null}</header>
            <div className={q.listAmount}><span>Total da compra</span><strong>{storeMoney(item.total_cents)}</strong><small><CalendarDays size={14}/>{buyerOrderDate(item.created_at)}</small></div>
            <div className={o.rowProducts}><strong>{item.items[0]?.name || "Produtos do pedido"}{item.items.length > 1 ? ` + ${item.items.length - 1}` : ""}</strong><small>{buyerOrderUnits(item)} unidades · {item.items.length} {item.items.length === 1 ? "item" : "itens"}</small><span><Truck size={14}/>{buyerFulfillmentLabel(item.fulfillment_status)}</span></div>
            <footer className={q.listCardActions}><Link className={q.listOpen} href={`${base}/pedidos/${item.id}`} aria-label={`Abrir pedido ${code}`}>Ver pedido<ArrowRight size={16}/></Link><small className={o.small}>{item.delivery === "pickup" ? "Retirada na loja" : "Entrega no endereço"}</small></footer>
          </article>;
        })}</div>}
      </>}
    </>}
  </div>;
}

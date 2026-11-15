"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Download, FilePlus2, FileText, Loader2, Search, SearchX, Trash2, Truck } from "lucide-react";
import type { listBuyerQuotes } from "@/repositories/commerce-buyer-quotes";
import { storeMoney, storeRequest } from "./store-http";
import { LibraryDialog } from "./LibraryUI";
import styles from "./store.module.css";
import q from "./quote.module.css";

type Quotes = Awaited<ReturnType<typeof listBuyerQuotes>>;
const dateLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const dateSearch = new Intl.DateTimeFormat("pt-BR");
const timestamp = (date: string) => new Date(date).getTime();
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/#/g, "").toLowerCase().trim();
function QuoteDate({ value }: { value: string }) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? <time dateTime={date.toISOString()}>{dateLabel.format(date)}</time> : <>Data não disponível</>;
}

export function StoreBuyerQuoteList({ quotes, api, base, onDeleted, loading = false }: { quotes: Quotes; api: string; base: string; onDeleted: (id: string) => void; loading?: boolean }) {
  const [query, setQuery] = useState(""), [validity, setValidity] = useState("all"), [sort, setSort] = useState("newest"), [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<Quotes[number] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const deleteLock = useRef(false), searchRef = useRef<HTMLInputElement>(null), emptyRef = useRef<HTMLAnchorElement>(null);
  const id = useId();
  useEffect(() => { if (notice) (searchRef.current ?? emptyRef.current)?.focus(); }, [notice]);
  useEffect(() => {
    if (loading || !quotes.length) return;
    const update = () => setNow(Date.now()), timer = window.setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, [loading, quotes.length]);
  const isValid = (quote: Quotes[number]) => Number.isFinite(timestamp(quote.valid_until)) && timestamp(quote.valid_until) > now;
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const filtered = quotes.filter(quote => {
    if (validity === "valid" && !isValid(quote) || validity === "review" && isValid(quote)) return false;
    const dates = [quote.created_at, quote.valid_until].flatMap(value => Number.isFinite(timestamp(value)) ? [dateSearch.format(new Date(value)), dateLabel.format(new Date(value))] : []);
    const text = normalize(`Orçamento ${quote.id} ${quote.id.replace(/-/g, "")} ${dates.join(" ")}`);
    return terms.every(term => text.includes(term));
  }).sort((a, b) => {
    const recent = (timestamp(b.created_at) || 0) - (timestamp(a.created_at) || 0);
    return (sort === "highest" ? b.total_cents - a.total_cents : sort === "lowest" ? a.total_cents - b.total_cents : sort === "oldest" ? -recent : recent) || a.id.localeCompare(b.id);
  });
  function reset() { setQuery(""); setValidity("all"); setSort("newest"); }
  async function removeSelected() {
    if (!selected || deleteLock.current) return;
    deleteLock.current = true; setBusy(true); setError("");
    try {
      await storeRequest(`${api}/quotes/${selected.id}`, "DELETE", { confirmDelete: true });
      onDeleted(selected.id); setSelected(null); setNotice(`Orçamento ${selected.id.slice(0, 8).toUpperCase()} excluído.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir o orçamento. Tente novamente."); }
    finally { deleteLock.current = false; setBusy(false); }
  }
  if (loading) return <div><p role="status" className={q.listLoading}><Loader2 size={18} className="animate-spin motion-reduce:animate-none"/>Carregando seus orçamentos…</p><div className={q.quoteList} aria-hidden="true">{[0, 1].map(value => <div className={q.quoteSkeleton} key={value}><span/><span/><span/></div>)}</div></div>;
  if (!quotes.length) return <section className={q.listEmpty}>{notice ? <p role="status">{notice}</p> : null}<FilePlus2 size={32} aria-hidden="true"/><h2>Seu próximo projeto começa aqui</h2><p>Você ainda não tem orçamentos salvos. Escolha os produtos e guarde sua proposta em PDF, sem compromisso de compra.</p><Link ref={emptyRef} className={styles.primary} href={`${base}/orcamento`}>Montar meu primeiro orçamento<ArrowRight size={17}/></Link></section>;
  return <section className={q.savedList} aria-label="Lista dos meus orçamentos">
    {notice ? <p role="status" className={q.listNotice}><CheckCircle2 size={16} aria-hidden="true"/>{notice}</p> : null}
    <form role="search" aria-label="Encontrar orçamento" className={q.listToolbar} onSubmit={event => event.preventDefault()}>
      <label htmlFor={`${id}-search`}>Buscar orçamento<span className={q.listSearch}><Search size={18} aria-hidden="true"/><input ref={searchRef} id={`${id}-search`} type="search" maxLength={100} placeholder="Código ou data" value={query} onChange={event => setQuery(event.target.value)}/></span></label>
      <label htmlFor={`${id}-validity`}>Validade<select id={`${id}-validity`} value={validity} onChange={event => setValidity(event.target.value)}><option value="all">Todas</option><option value="valid">Válidos</option><option value="review">A conferir</option></select></label>
      <label htmlFor={`${id}-sort`}>Ordenar por<select id={`${id}-sort`} value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option><option value="highest">Maior valor</option><option value="lowest">Menor valor</option></select></label>
    </form>
    <div className={q.listResults}><p role="status">{filtered.length === quotes.length ? `${quotes.length} ${quotes.length === 1 ? "orçamento disponível" : "orçamentos disponíveis"}` : `${filtered.length} de ${quotes.length} orçamentos`}</p>{query || validity !== "all" || sort !== "newest" ? <button type="button" onClick={reset}>Limpar filtros</button> : null}</div>
    {!filtered.length ? <div className={q.listEmpty}><SearchX size={28} aria-hidden="true"/><h2>Nenhum orçamento corresponde à busca.</h2><p>Experimente outro código, outra data ou altere a validade.</p></div> : <div className={q.quoteList}>{filtered.map(quote => {
      const code = quote.id.slice(0, 8).toUpperCase(), valid = isValid(quote);
      return <article className={q.quoteListCard} key={quote.id} aria-label={`Orçamento ${code}`}>
        <header className={q.listCardHeader}><div className={q.listIdentity}><span className={q.listDocument} aria-hidden="true"><FileText size={22}/></span><h2><span>Orçamento </span><strong>{code}</strong></h2></div><span className={q.listValidity} data-valid={valid}>{valid ? <CheckCircle2 size={14} aria-hidden="true"/> : <Clock3 size={14} aria-hidden="true"/>}{valid ? "Dentro da validade" : "Valores a conferir"}</span></header>
        <div className={q.listAmount}><span>Total do orçamento</span><strong>{storeMoney(quote.total_cents)}</strong><small><Truck size={14} aria-hidden="true"/>{quote.shipping_cents === null ? "Frete não incluído" : quote.shipping_cents === 0 ? "Frete/retirada sem custo" : `Frete incluído · ${storeMoney(quote.shipping_cents)}`}</small></div>
        <dl className={q.listDates}><div><dt><CalendarDays size={14} aria-hidden="true"/>Criado em</dt><dd><QuoteDate value={quote.created_at}/></dd></div><div><dt><Clock3 size={14} aria-hidden="true"/>Validade</dt><dd><QuoteDate value={quote.valid_until}/></dd></div></dl>
        <footer className={q.listCardActions}><Link href={`${base}/orcamentos/${quote.id}`} className={q.listOpen} aria-label={`Abrir orçamento ${code}`}>Ver orçamento<ArrowRight size={17} aria-hidden="true"/></Link><div className={q.listActionTools}><a className={q.listPdf} href={`${api}/quotes/${quote.id}/pdf`} title="Baixar PDF deste orçamento" aria-label={`Baixar PDF do orçamento ${code}`}><Download size={16} aria-hidden="true"/>PDF</a><button className={q.listDelete} type="button" title="Excluir orçamento" aria-label={`Excluir orçamento ${code}`} disabled={busy} onClick={() => { setNotice(""); setError(""); setSelected(quote); }}><Trash2 size={17} aria-hidden="true"/></button></div></footer>
      </article>;
    })}</div>}
    {selected ? <LibraryDialog title="Excluir orçamento" busy={busy} onClose={() => setSelected(null)}><div className={q.confirmation}>
      <p>Excluir o orçamento <strong>{selected.id.slice(0, 8).toUpperCase()}</strong> de <strong>{storeMoney(selected.total_cents)}</strong>?</p>
      <p>O orçamento e seu PDF deixarão de estar disponíveis. Esta ação não pode ser desfeita.</p>
      <p className={q.muted}>Pedidos já realizados, artes e itens do carrinho não serão alterados.</p>
      {error ? <p role="alert" className={q.error}>{error}</p> : null}
      <div className={q.actions}><button type="button" className={styles.secondary} disabled={busy} onClick={() => setSelected(null)}>Manter orçamento</button><button type="button" className={q.deleteConfirm} disabled={busy} onClick={() => void removeSelected()}>{busy ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none"/> : <Trash2 size={16}/>} {busy ? "Excluindo…" : "Excluir definitivamente"}</button></div>
    </div></LibraryDialog> : null}
  </section>;
}

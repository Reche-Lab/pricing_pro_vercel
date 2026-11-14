"use client";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Copy, FileText, Loader2, Send, ShieldCheck, Trash2, X } from "lucide-react";
import type { AssistantMessage } from "@/domain/commerce/assistant";
import type { StoreSettings } from "@/domain/commerce/schemas";
import type { cartView } from "@/repositories/commerce";
import { storeRequest } from "./store-http";
import { BuyerLogin } from "./StoreBuyerLogin";
import { StoreCheckout } from "./StoreCheckout";
import { StoreAssistantCards } from "./StoreAssistantCards";
import { LibraryDialog } from "./LibraryUI";
import type { AssistantPublicConfig } from "./StoreAssistantLauncher";
import styles from "./assistant.module.css";
import storeStyles from "./store.module.css";
type Cart = Awaited<ReturnType<typeof cartView>>;
const quick = ["Quero conhecer os produtos", "Como preparar minha arte?", "Preciso de um orçamento", "Preciso dos dados da empresa", "Quero consultar meus pedidos"];
export function StoreAssistantPanel({ config, api, base, settings, buyerId, onCartChanged, onClose }: {
  config: AssistantPublicConfig; api: string; base: string; settings: StoreSettings; buyerId?: string;
  onCartChanged: () => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), scroll = useRef<HTMLDivElement>(null), heading = useId();
  const [conversationId, setConversationId] = useState(""), [messages, setMessages] = useState<AssistantMessage[]>([]), [text, setText] = useState("");
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [identified, setIdentified] = useState(Boolean(buyerId)), [view, setView] = useState<"chat" | "login" | "quote">("chat");
  const [loginPurpose, setLoginPurpose] = useState<"account" | "quote">("account");
  const [quoteCart, setQuoteCart] = useState<Cart | null>(null), [remove, setRemove] = useState(false), [summary, setSummary] = useState("");
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null), lock = useRef(false), previousBuyer = useRef(buyerId), generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  const phone = settings.contactPhone.replace(/\D/g, ""), international = phone.length <= 11 ? `55${phone}` : phone;
  const whatsapp = /^[1-9]\d{9,14}$/.test(international) ? `https://wa.me/${international}` : "";
  useEffect(() => {
    const element = dialog.current, focus = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; element?.showModal();
    return () => { invalidate(); document.body.style.overflow = overflow; element?.close(); focus?.focus(); };
  }, [invalidate]);
  useEffect(() => {
    // Never leave another verified account's transcript or private form on screen.
    if (previousBuyer.current && previousBuyer.current !== buyerId) {
      generation.current++; controller.current?.abort(); setMessages([]); setConversationId(""); setText(""); setQuoteCart(null); setView("chat"); setSummary(""); setConfirmed([]); setError(""); setBusy(false); lock.current = false;
      setNotice("Sua conta mudou. Inicie um novo atendimento para continuar com segurança.");
    }
    previousBuyer.current = buyerId; setIdentified(Boolean(buyerId));
  }, [buyerId]);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" }); }, [messages, busy, status, notice, view]);
  async function request(url: string, method = "GET", body?: unknown) {
    const token = generation.current, result = await storeRequest(url, method, body);
    if (token !== generation.current) throw new DOMException("Account changed", "AbortError");
    return result;
  }
  async function work(action: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    const token = generation.current;
    try { await action(); } catch (e) { if (token === generation.current && !(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Não foi possível continuar. Tente novamente."); }
    finally { if (token === generation.current) { lock.current = false; setBusy(false); setStatus(""); } }
  }
  async function start() { await work(async () => { const data = await request(`${api}/assistant`, "POST", { action: "start", consent: true }); setConversationId(data.conversation.id); setMessages(data.messages); setIdentified(data.customer); }); }
  async function send(value = text) {
    if (!value.trim() || !conversationId) return;
    await work(async () => {
      const token = generation.current, abort = new AbortController(); controller.current = abort;
      const messageId = crypto.randomUUID(); setText(""); setStatus("Consultando as informações da loja…");
      setMessages(current => [...current, { id: messageId, role: "user", text: value, cards: [] }]);
      const response = await fetch(`${api}/assistant`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "message", conversationId, messageId, text: value }), signal: abort.signal });
      if (!response.ok) { const result = await response.json().catch(() => null); throw new Error(result?.error || "Não foi possível enviar. Tente novamente."); }
      if (!response.headers.get("content-type")?.includes("ndjson")) { const result = await response.json(); if (token === generation.current) setMessages(result.messages); return; }
      const reader = response.body?.getReader(); if (!reader) throw new Error("Resposta indisponível. Reabra a conversa.");
      const decoder = new TextDecoder(); let buffer = "", done = false;
      function event(line: string) {
        if (!line.trim() || token !== generation.current) return;
        const data = JSON.parse(line);
        if (data.type === "status") setStatus(data.text);
        if (data.type === "error") throw new Error(data.message);
        if (data.type === "done") { setMessages(data.messages); done = true; }
      }
      try { while (true) { const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); if (buffer.length > 1048576) throw new Error("Resposta muito longa. Reabra o atendimento."); const lines = buffer.split("\n"); buffer = lines.pop()!; lines.forEach(event); } event(buffer + decoder.decode()); }
      finally { reader.releaseLock(); }
      if (!done && token === generation.current) throw new Error("A conexão foi interrompida. Reabra a conversa para recuperar o histórico.");
    });
  }
  async function confirm(actionId: string) { await work(async () => {
    const result = await request(`${api}/assistant`, "POST", { action: "confirm", conversationId, actionId });
    setConfirmed(current => [...current, actionId]); setQuoteCart(result.cart); setNotice(result.message); await onCartChanged();
  }); }
  async function openQuote() {
    if (!identified) { setLoginPurpose("quote"); setView("login"); return; }
    await work(async () => { const cart = await request(`${api}/cart`); if (!cart.lines.length) throw new Error("Adicione e confirme os produtos da proposta antes de salvar o orçamento."); setQuoteCart(cart); setView("quote"); });
  }
  async function handoff() { await work(async () => { const result = await request(`${api}/assistant`, "POST", { action: "handoff", conversationId }); setSummary(result.summary || "Cliente solicitou orientação pelo assistente da loja."); setNotice(result.message); }); }
  return <>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={heading} onCancel={e => { e.preventDefault(); onClose(); }}>
      <header className={styles.header}><Bot size={24}/><div><h2 id={heading}>{config.name}</h2><small>Assistente virtual · inteligência artificial</small></div><button type="button" className={styles.icon} title="Fechar atendimento" aria-label="Fechar atendimento" onClick={onClose}><X size={20}/></button></header>
      <div ref={scroll} className={styles.messages}>
        <p className={styles.welcome}>{config.welcome}</p>
        {!conversationId ? <section className={styles.consent}><ShieldCheck size={24}/><h3>Você decide o próximo passo</h3><p>A IA ajuda com produtos e dúvidas. Nenhuma compra ou alteração no carrinho acontece sem sua confirmação.</p><p>As mensagens passam pelo OpenRouter e por provedores de IA com rotas restritas de privacidade. O histórico fica na plataforma por até {config.retentionDays} dias. Não envie documentos pessoais, dados de cartão, senhas ou códigos nesta conversa.</p><Link href={`${base}/assistente-privacidade`} target="_blank">Como seus dados são utilizados</Link><button className={styles.primary} type="button" disabled={busy} onClick={() => void start()}>Entendi, iniciar atendimento</button></section> : <>
          {messages.map(m => <article className={`${styles.message} ${m.role === "user" ? styles.user : ""}`} key={m.id}><small>{m.role === "user" ? "Você" : "Assistente virtual"}</small><p>{m.text}</p>{m.cards.map((card, index) => <StoreAssistantCards key={index} card={card} api={api} base={base} identified={identified} busy={busy} confirmed={confirmed} onConfirm={id => void confirm(id)} onQuote={() => void openQuote()} onLogin={() => { setLoginPurpose("account"); setView("login"); }} onHandoff={() => void handoff()} onClose={onClose}/>)}</article>)}
          {!messages.length ? <div className={styles.quick}>{quick.filter(q => config.quotes || !q.includes("orçamento")).filter(q => config.orders || !q.includes("pedidos")).map(q => <button type="button" key={q} disabled={busy} onClick={() => void send(q)}>{q}</button>)}</div> : null}
          {quoteCart?.lines.length && config.quotes ? <button type="button" className={styles.action} disabled={busy} onClick={() => void openQuote()}><FileText size={16}/>Conferir dados e salvar orçamento</button> : null}
          {summary ? <section className={styles.card}><strong>Resumo para a equipe</strong><p>{summary}</p><button type="button" className={styles.action} onClick={() => void navigator.clipboard.writeText(summary).then(() => setNotice("Resumo copiado."), () => setError("Não foi possível copiar. Selecione o texto do resumo."))}><Copy size={16}/>Copiar resumo</button>{whatsapp ? <a className={styles.primary} href={`${whatsapp}?text=${encodeURIComponent(`Olá! Preciso de ajuda na loja. ${summary}`)}`} target="_blank" rel="noopener noreferrer">Continuar no WhatsApp</a> : null}</section> : null}
        </>}
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}{error ? <p className={styles.error} role="alert">{error}</p> : null}{busy ? <p role="status" className={styles.progress}><Loader2 size={16}/>{status || "Concluindo solicitação…"}</p> : null}
      </div>
      {conversationId ? <footer className={styles.composer}><form onSubmit={e => { e.preventDefault(); void send(); }}><label className="sr-only" htmlFor={`${heading}-text`}>Mensagem para o assistente</label><textarea id={`${heading}-text`} rows={2} maxLength={2000} value={text} disabled={busy} placeholder="Conte o que você precisa…" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}/><button type="submit" className={styles.primary} title="Enviar mensagem" aria-label="Enviar mensagem" disabled={busy || !text.trim()}><Send size={18}/></button></form><div className={styles.toolbar}><button type="button" disabled={busy} onClick={() => void handoff()}>Falar com a equipe</button><button type="button" disabled={busy} onClick={() => setRemove(true)} title="Excluir meu histórico"><Trash2 size={14}/>Limpar histórico</button></div><small>Valores e disponibilidade são confirmados nos cartões e no checkout.</small></footer> : null}
    </dialog>
    {view === "login" ? <LibraryDialog title="Acesso seguro à sua conta" onClose={() => setView("chat")}><BuyerLogin api={api} disabled={false} forQuote onLogged={async () => { await onCartChanged(); setIdentified(true); if (loginPurpose === "quote") { setQuoteCart(await request(`${api}/cart`)); setView("quote"); } else setView("chat"); setNotice("E-mail validado. Você pode consultar seus pedidos ou salvar o orçamento."); }}/></LibraryDialog> : null}
    {view === "quote" && quoteCart ? <LibraryDialog title="Seu orçamento · dados e confirmação" wide onClose={() => setView("chat")} busy={busy}><div className={storeStyles.form}><p className={styles.privacy}>Seus dados vão diretamente para o formulário da loja, não para a conversa ou o modelo de IA. Salvar orçamento não realiza cobrança.</p><StoreCheckout cart={quoteCart} settings={settings} base={base} api={api} intent="quote" disabled={busy} onSubmit={async input => {
      const token = generation.current, result = await request(`${api}/quotes`, "POST", input);
      setView("chat"); setNotice("Orçamento salvo na sua conta. Nenhuma compra foi realizada.");
      try { const recorded = await request(`${api}/assistant`, "POST", { action: "quote_saved", conversationId, quoteId: result.id }); setMessages(recorded.messages); }
      catch { if (token === generation.current) setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: "Orçamento salvo na sua conta.", cards: [{ kind: "quote_saved", quoteId: result.id, totalCents: Number((input as { expectedTotalCents: number }).expectedTotalCents) }] }]); }
    }}/></div></LibraryDialog> : null}
    {remove ? <LibraryDialog title="Excluir meu histórico?" onClose={() => setRemove(false)} busy={busy}><p>As mensagens deste atendimento serão excluídas. Pedidos, orçamentos e carrinho continuam na sua conta.</p><button type="button" className={styles.primary} disabled={busy} onClick={() => void work(async () => { await request(`${api}/assistant`, "POST", { action: "clear", conversationId }); setConversationId(""); setMessages([]); setSummary(""); setConfirmed([]); setQuoteCart(null); setRemove(false); setNotice("Histórico excluído."); })}>Excluir histórico</button>{error ? <p role="alert">{error}</p> : null}</LibraryDialog> : null}
  </>;
}

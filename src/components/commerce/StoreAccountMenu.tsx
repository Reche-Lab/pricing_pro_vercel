"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileText, LogOut, ShoppingBag, UserRound } from "lucide-react";
import a from "./buyer-account.module.css";
export function StoreAccountMenu({ base, customer, loading, busy, navigationKey, onLogout }: {
  base: string; customer: { name: string } | null; loading: boolean; busy: boolean; navigationKey: string; onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false), id = useId();
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [navigationKey, customer?.name, loading]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div ref={root} className={a.menuRoot}
    onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <button ref={trigger} type="button" className={a.menuTrigger} aria-label="Minha conta" title="Minha conta" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); window.requestAnimationFrame(() => root.current?.querySelector<HTMLAnchorElement>("nav a")?.focus()); } }}><UserRound size={21}/><ChevronDown size={12}/></button>
    {open ? <nav className={a.dropdown} id={id} aria-label="Atalhos da minha conta"><div className={a.menuIdentity}><small>Minha conta</small><strong>{loading ? "Verificando sua conta…" : customer ? `Olá, ${customer.name}` : "Bem-vindo à loja"}</strong></div>
      <Link prefetch={false} href={`${base}/conta`} onClick={() => setOpen(false)}><UserRound size={17}/>Minha conta</Link>
      <Link prefetch={false} href={`${base}/orcamentos`} onClick={() => setOpen(false)}><FileText size={17}/>Meus orçamentos</Link>
      <Link prefetch={false} href={`${base}/pedidos`} onClick={() => setOpen(false)}><ShoppingBag size={17}/>Minhas compras</Link>
      {customer ? <button type="button" disabled={busy} onClick={() => { setOpen(false); void onLogout(); }}><LogOut size={17}/>Sair</button> : null}
    </nav> : null}
  </div>;
}

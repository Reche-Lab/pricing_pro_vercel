"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { FileText, Home, LogOut, Menu, Moon, ShoppingBag, Sun, UserRound, X } from "lucide-react";
import s from "./mobile-menu.module.css";

export function StoreMobileMenu({ name, logoUrl, base, preview, customer, loading, busy, theme, onToggleTheme, onLogout, navigationKey, children }: {
  name: string; logoUrl?: string; base: string; preview: boolean; customer: { name: string } | null;
  loading: boolean; busy: boolean; theme: string; onToggleTheme: () => void; onLogout: () => Promise<void>;
  navigationKey: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), id = useId();
  useEffect(() => { setOpen(false); }, [navigationKey, base]);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current, opener = trigger.current, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    const resize = () => { if (window.innerWidth > 700) setOpen(false); };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize); element?.close();
      document.body.style.overflow = overflow;
      if (window.innerWidth <= 700) opener?.focus();
    };
  }, [open]);
  return <>
    <button ref={trigger} className={s.trigger} type="button" title="Abrir menu da loja" aria-label="Abrir menu da loja" aria-expanded={open} aria-controls={id} aria-haspopup="dialog" onClick={() => setOpen(true)}><Menu size={23}/></button>
    {open ? <dialog ref={dialog} id={id} className={s.panel} aria-modal="true" aria-labelledby={`${id}-title`} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onClick={event => {
      if (event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false);
      }
      if (event.target instanceof Element && event.target.closest("a[href]")) setOpen(false);
    }}>
      <div className={s.heading}>
        <Link href={base || "/"} className={s.brand}>{logoUrl ? <img src={logoUrl} alt="" width={38} height={38}/> : null}<strong id={`${id}-title`}>{name}</strong></Link>
        <button type="button" className={s.close} title="Fechar menu" aria-label="Fechar menu" onClick={() => setOpen(false)} autoFocus><X size={22}/></button>
      </div>
      <div className={s.content}>
        {!preview ? <Link prefetch={false} href={`${base}/conta`} className={s.identity}><span><UserRound size={22}/></span><div><small>Minha conta</small><strong>{loading ? "Verificando sua conta…" : customer ? `Olá, ${customer.name}` : "Entrar ou criar conta"}</strong></div></Link> : null}
        <nav aria-label="Atalhos da loja" className={s.shortcuts}>
          <Link href={base || "/"}><Home size={18}/>Início</Link>
          {!preview ? <Link href={`${base}/orcamento`} className={s.quote}><FileText size={18}/>Solicitar orçamento</Link> : null}
        </nav>
        <h2 className={s.sectionTitle}>Explore a loja</h2>
        {children}
        {!preview ? <nav aria-label="Meus pedidos e orçamentos" className={s.account}>
          <Link prefetch={false} href={`${base}/orcamentos`}><FileText size={18}/>Meus orçamentos</Link>
          <Link prefetch={false} href={`${base}/pedidos`}><ShoppingBag size={18}/>Minhas compras</Link>
        </nav> : null}
        <div className={s.settings}>
          <button type="button" onClick={onToggleTheme}>{theme === "dark" ? <Sun size={19}/> : <Moon size={19}/>}<span>Tema {theme === "dark" ? "claro" : "escuro"}</span></button>
          {!preview && customer ? <button type="button" disabled={busy} onClick={() => { setOpen(false); void onLogout(); }}><LogOut size={18}/>Sair</button> : null}
        </div>
      </div>
    </dialog> : null}
  </>;
}

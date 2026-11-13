"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, ArrowUpRight, ChevronDown, CreditCard, FileText, Mail, MapPin, MessageCircle, Paintbrush, Phone } from "lucide-react";
import type { StoreSettings } from "@/domain/commerce/schemas";
import type { StoreProduct } from "./StoreHome";
import { PlatformSignature } from "@/components/branding/PlatformSignature";
import styles from "./store-footer.module.css";

type FooterLink = { href: string; label: string };
type Payments = { mp_enabled?: boolean; manual_enabled?: boolean; payment_environment?: string };
type Props = {
  settings: StoreSettings; products: StoreProduct[]; base: string; preview?: boolean;
  libraryEnabled?: boolean; institutionalLinks?: { slug: string; title: string }[];
  payments?: Payments | null; view?: string;
};

function FooterGroup({ title, links, view, base }: { title: string; links: FooterLink[]; view: string; base: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.("(min-width: 701px)");
    const update = () => setOpen(Boolean(media?.matches));
    update(); media?.addEventListener("change", update);
    return () => media?.removeEventListener("change", update);
  }, []);
  return <details className={styles.group} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{title}<ChevronDown size={15} aria-hidden="true"/></summary>
    <nav aria-label={title}><ul>{links.map(link => <li key={link.href}><Link href={link.href} prefetch={false} aria-current={link.href === `${base}/${view}` ? "page" : undefined}><span>{link.label}</span><ArrowUpRight size={13} aria-hidden="true"/></Link></li>)}</ul></nav>
  </details>;
}

function phoneLinks(value: string) {
  if (!/^[+\d\s().-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  const international = value.trim().startsWith("+") || digits.length > 11 ? digits : `55${digits}`;
  return /^[1-9]\d{9,14}$/.test(international) ? { tel: `tel:+${international}`, whatsapp: `https://wa.me/${international}` } : null;
}

export function StoreFooter({ settings, products, base, preview = false, libraryEnabled = false, institutionalLinks = [], payments, view = "home" }: Props) {
  const [logoFailed, setLogoFailed] = useState(false), [entered, setEntered] = useState(false);
  const footer = useRef<HTMLElement>(null);
  const personalized = products.some(product => product.personalized);
  const canCreate = settings.experience?.style === "studio" && products.some(product => product.personalized && product.geometry && product.artworkOptions?.mockup);
  const phone = phoneLinks(settings.contactPhone);
  const canMove = settings.experience?.motion !== false;
  const showInvitation = products.length > 0 && !["checkout", "carrinho", "orcamento", "orcamentos", "pedidos", "conta"].includes(view);
  useEffect(() => setLogoFailed(false), [settings.logoUrl]);
  useEffect(() => {
    const node = footer.current;
    if (!node || !canMove || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setEntered(true); observer.disconnect(); } }, { threshold: .1 });
    observer.observe(node); return () => observer.disconnect();
  }, [canMove]);
  const explore: FooterLink[] = [
    { href: `${base}/catalogo`, label: "Todos os produtos" },
    ...(libraryEnabled ? [{ href: `${base}/campanhas`, label: "Campanhas" }, { href: `${base}/artes`, label: "Artes prontas" }] : []),
    ...(!preview ? [{ href: `${base}/pedidos`, label: "Acompanhar pedido" }, { href: `${base}/orcamentos`, label: "Meus orçamentos" }] : []),
  ];
  const information: FooterLink[] = [
    ...institutionalLinks.filter(link => link.slug !== "condicoes").map(link => ({ href: `${base}/${link.slug}`, label: link.title })),
    { href: `${base}/condicoes`, label: "Condições de compra" },
  ];
  function backToTop() {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    footer.current?.closest("main")?.querySelector<HTMLElement>("[data-store-home-link]")?.focus({ preventScroll: true });
  }
  return <footer ref={footer} role="contentinfo" aria-label="Rodapé da loja" className={styles.footer} data-store-footer data-animate={entered && canMove} data-motion={canMove}>
    <div className={styles.inner}>
      {showInvitation ? <section className={styles.invitation} aria-label="Continue sua criação">
        <div className={styles.inviteCopy}><p className={styles.eyebrow}>{personalized ? "Da ideia ao seu próximo momento" : "Encontre a sua próxima escolha"}</p><h2>{personalized ? <>Vamos criar algo<br/>com a sua cara?</> : <>Seu próximo favorito<br/>está por aqui.</>}</h2>
          <div className={styles.actions}><Link className={styles.primary} href={canCreate ? `${base}?estudio=1` : `${base}/catalogo`} prefetch={false}>{canCreate ? <Paintbrush size={16}/> : <ArrowRight size={16}/>} {canCreate ? "Crie sua arte aqui" : "Explorar produtos"}<ArrowRight size={15}/></Link>{!preview ? <Link className={styles.secondary} href={`${base}/orcamento`} prefetch={false}><FileText size={15}/>Solicitar orçamento<ArrowUpRight size={14}/></Link> : null}</div>
        </div>
        <div className={styles.miniatures} aria-label="Inspirações do catálogo">{products.filter(product => product.imageUrl).slice(0, 3).map(product => <Link href={`${base}/produto/${product.id}`} key={product.id} prefetch={false} title={product.name} aria-label={`Ver ${product.name}`}><img src={product.imageUrl} alt="" loading="lazy" width={100} height={100}/><ArrowUpRight size={14} aria-hidden="true"/></Link>)}</div>
      </section> : null}

      <div className={styles.columns}>
        <div className={styles.brandArea}><Link className={styles.brand} href={base || "/"} prefetch={false}><span className={styles.logo}>{settings.logoUrl && !logoFailed ? <img src={settings.logoUrl} alt={`Logo ${settings.name}`} loading="lazy" width={64} height={64} onError={() => setLogoFailed(true)}/> : <span aria-hidden="true">{settings.name.slice(0, 1).toUpperCase()}</span>}</span><strong>{settings.name}</strong></Link><p>{personalized ? "Sua ideia merece ganhar forma." : "Escolhas que combinam com você."}</p>
          {!preview && payments?.payment_environment === "test" ? <p className={styles.paymentNote}>Ambiente de testes · sem cobrança real</p> : !preview && payments?.mp_enabled ? <p className={styles.paymentNote}><CreditCard size={16} aria-hidden="true"/>Pagamentos via Mercado Pago</p> : null}
        </div>
        <div className={styles.explore}><FooterGroup title="Produtos e criações" links={explore} view={view} base={base}/></div>
        <div className={styles.information}><FooterGroup title="Informações da loja" links={information} view={view} base={base}/></div>
        <section className={styles.contact} aria-label="Atendimento da loja"><h3>Conte com a gente</h3><p>Fale com a equipe da {settings.name}.</p>
          {phone ? <><a className={styles.whatsapp} href={phone.whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} aria-hidden="true"/>Conversar pelo WhatsApp<ArrowUpRight size={13} aria-hidden="true"/></a><a className={styles.contactLink} href={phone.tel}><Phone size={14} aria-hidden="true"/>{settings.contactPhone}</a></> : null}
          {settings.contactEmail ? <a className={styles.contactLink} href={`mailto:${settings.contactEmail}`}><Mail size={14} aria-hidden="true"/>{settings.contactEmail}</a> : null}
          {settings.pickupEnabled && settings.pickupAddress ? <p className={styles.address}><MapPin size={15} aria-hidden="true"/><span>Retirada no local<small>{settings.pickupAddress}</small></span></p> : null}
        </section>
      </div>

      <div className={styles.bottom}><p>© {new Date().getFullYear()} {settings.name}</p><PlatformSignature/><button type="button" className={styles.backTop} onClick={backToTop} aria-label="Voltar ao topo" title="Voltar ao topo"><ArrowUp size={17} aria-hidden="true"/></button></div>
    </div>
  </footer>;
}

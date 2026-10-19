/* eslint-disable @next/next/no-img-element */
import React from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, Check, ChevronDown, ChevronRight, HeartHandshake, Mail, ShieldCheck } from "lucide-react";
import type { StoreSettings } from "@/domain/commerce/schemas";
import { INSTITUTIONAL_UPDATED, storeInstitutionalPages, type StoreInstitutionalPage as Page } from "@/domain/commerce/institutional";
import styles from "./institutional.module.css";

export function StoreInstitutionalPage({ slug, page, settings, preview = false, featuredProduct }: {
  slug: string; page: Page; settings: StoreSettings; preview?: boolean;
  featuredProduct?: { id: string; name: string; imageUrl: string };
}) {
  const base = preview ? `/commerce/${slug}/preview` : `/loja/${slug}`;
  const about = page.slug === "quem-somos";
  const index = <ol>{page.sections.map((section, position) => <li key={section.id}><a href={`#${section.id}`}><span>{String(position + 1).padStart(2, "0")}</span>{section.title}</a></li>)}</ol>;
  return <article className={styles.page} aria-labelledby="institutional-title" id="inicio-do-conteudo">
    <nav aria-label="Caminho da página" className={styles.breadcrumb}>
      <Link href={base}>{settings.name}</Link><ChevronRight size={13} aria-hidden="true" /><span aria-current="page">{page.title}</span>
    </nav>
    <header className={styles.heading}>
      <p className={styles.eyebrow}>{about ? <HeartHandshake size={17} aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />} {about ? "Feito com pessoas. Para pessoas." : "Informação para comprar com confiança"}</p>
      <h1 id="institutional-title">{page.title}</h1>
      <p className={styles.intro}>{page.intro}</p>
      <ul className={styles.highlights}>{page.highlights.map(item => <li key={item}><Check size={15} aria-hidden="true" />{item}</li>)}</ul>
      <p className={styles.updated}>Revisão editorial: <time dateTime={INSTITUTIONAL_UPDATED}>19 de outubro de 2026</time></p>
    </header>
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <nav aria-label="Nesta página" className={styles.desktopIndex}><h2>Nesta página</h2>{index}</nav>
        <details className={styles.mobileIndex}><summary>Explorar esta página<ChevronDown size={16} aria-hidden="true" /></summary><nav aria-label="Índice da página">{index}</nav></details>
        <a className={styles.contactShortcut} href={`mailto:${settings.contactEmail}?subject=${encodeURIComponent(page.title)}`}><Mail size={16} aria-hidden="true" />Falar com a equipe<ArrowRight size={14} aria-hidden="true" /></a>
      </aside>
      <div className={styles.content}>
        {about && featuredProduct ? <figure className={styles.productFigure}><Link href={`${base}/produto/${featuredProduct.id}`}><img src={featuredProduct.imageUrl} alt={featuredProduct.name} width={720} height={480} /></Link><figcaption>Uma ideia. Muitas formas de expressar.<Link href={`${base}/catalogo`}>Explorar criações <ArrowRight size={15} aria-hidden="true" /></Link></figcaption></figure> : null}
        {page.sections.map((section, index) => <section key={section.id} id={section.id} className={styles.section} aria-labelledby={`${section.id}-titulo`}>
          <span className={styles.sectionNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <div><h2 id={`${section.id}-titulo`}>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            {section.items ? <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul> : null}</div>
        </section>)}
        <section className={styles.questions} aria-labelledby="duvidas-titulo"><h2 id="duvidas-titulo">Dúvidas rápidas</h2>{page.questions.map(item => <details key={item.question}><summary>{item.question}<ChevronDown size={17} aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</section>
        <section className={styles.contact} aria-labelledby="conversar-titulo"><div><h2 id="conversar-titulo">Vamos conversar?</h2><p>Conte com a equipe da {settings.name} para orientar o seu próximo passo.</p></div><a href={`mailto:${settings.contactEmail}?subject=${encodeURIComponent(page.title)}`}><Mail size={17} aria-hidden="true" />{settings.contactEmail}<ArrowRight size={16} aria-hidden="true" /></a></section>
        <a href="#inicio-do-conteudo" className={styles.backTop}><ArrowUp size={15} aria-hidden="true" />Voltar ao início</a>
      </div>
    </div>
    <nav className={styles.related} aria-label="Outras informações da loja"><h2>Continue por aqui</h2><div>{storeInstitutionalPages(slug).filter(item => item.slug !== page.slug).map(item => <Link key={item.slug} href={`${base}/${item.slug}`}>{item.title}<ArrowRight size={16} aria-hidden="true" /></Link>)}</div></nav>
  </article>;
}

/* eslint-disable @next/next/no-img-element */
import React from "react";
import Link from "next/link";
import { ArrowLeft,ArrowRight,ArrowUpRight,Clock3,PenLine } from "lucide-react";
import type { publicCommerceProduct } from "@/repositories/commerce";
import { commerceProductPath } from "@/domain/commerce/product-urls";
import { blogCard,blogMinutes,blogPath,normalizeBlogSearch,type BlogArticle } from "@/domain/commerce/blog";
import { defaultBlogSettings, type PublicBlog } from "@/domain/commerce/blog-settings";
import { groundShopArticles } from "@/content/ground-shop-blog";
import { BlogArticleCard,BlogIndex } from "./BlogIndex";
import { ArticleTools,SaveArticle } from "./BlogInteractions";
import styles from "./blog.module.css";

export function StoreBlog({ base,article,products,preview=false,blog,name="Ground Shop" }: { base: string; article?: BlogArticle; products: ReturnType<typeof publicCommerceProduct>[]; preview?: boolean; blog?: PublicBlog; name?: string }) {
  const articles = blog?.articles ?? groundShopArticles;
  const settings = blog?.settings ?? defaultBlogSettings("ground-shop", name);
  const featured = articles.find(a => a.slug === settings.featuredSlug) ?? articles[0];
  if (!featured) return <section className={styles.blog}><h1>{settings.title}</h1><p>Novas histórias em breve.</p></section>;
  if(!article) return <div className={styles.blog} data-store-blog>
    <nav className={styles.breadcrumb} aria-label="Caminho da página">
      <Link href={base||"/"}>{name}</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">Blog</span>
    </nav>
    <header className={styles.hero}>
      {settings.heroImage || featured.image ? <img src={settings.heroImage || featured.image} alt={settings.heroImage ? settings.heroAlt : featured.imageAlt} width={1440} height={960} fetchPriority="high" /> : null}
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{settings.eyebrow}</p>
        <h1>{settings.title}</h1>
        <p style={{ whiteSpace: "pre-line" }}>{settings.tagline}</p>
        <Link href={blogPath(base,featured.slug)}>{featured.title}<ArrowUpRight size={20} />
        </Link>
      </div>
    </header>
    <div className={styles.intro}>
      <p>{settings.description}</p>
      <a href="#historias">Escolha sua próxima leitura<ArrowRight size={16} />
      </a>
    </div>
    <BlogIndex articles={articles.map(blogCard)} base={base} />
  </div>;
  const matchingProducts=products.filter(product => article.productTerms.some(term => normalizeBlogSearch(product.name).includes(normalizeBlogSearch(term)))).slice(0,3);
  const related=articles.filter(a => a.slug!==article.slug).sort((a,b) => Number(b.category===article.category)-Number(a.category===article.category)).slice(0,3);
  return <div className={styles.blog} data-store-blog>
    <nav className={styles.breadcrumb} aria-label="Caminho da página">
      <Link href={base||"/"}>{name}</Link>
      <span aria-hidden="true">/</span>
      <Link href={blogPath(base)}>Blog</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{article.category}</span>
    </nav>
    <article data-blog-article>
      <header className={styles.articleHeader}>
        <p className={styles.eyebrow}>{article.category}</p>
        <h1>{article.title}</h1>
        <p className={styles.deck}>{article.description}</p>
        <div className={styles.byline}>
          <span>
            <PenLine size={15} />Equipe {name}</span>
          <span>
            <Clock3 size={15} />{blogMinutes(article)} min de leitura</span>
          <time dateTime={article.updated}>{new Date(article.updated).toLocaleDateString("pt-BR",{ timeZone: "America/Sao_Paulo",day: "numeric",month: "long",year: "numeric" })}</time>
          <SaveArticle slug={article.slug} />
        </div>
      </header>
      <figure className={styles.articleImage}>
        {article.image ? <img src={article.image} alt={article.imageAlt} width={1440} height={960} fetchPriority="high" /> : null}
        {article.imageCaption || article.image.startsWith("/studio/blog/") ? <figcaption>{article.imageCaption || "Composição ilustrativa. Modelos e acabamentos: consulte o catálogo."}</figcaption> : null}
      </figure>
      <div className={styles.readingLayout}>
        <aside className={styles.toc}>
          <details open>
            <summary>Nesta história</summary>
            <nav aria-label="Seções do artigo">
              {article.sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}{article.questions.length ? <a href="#perguntas">Perguntas rápidas</a> : null}
            </nav>
          </details>
          <ArticleTools />
        </aside>
        <div className={styles.prose}>
          <p className={styles.lead}>{article.intro}</p>
          {article.takeaway ? <aside className={styles.takeaway}>
            <strong>Para guardar a ideia</strong>
            <p>{article.takeaway}</p>
          </aside> : null}
          {article.sections.map(section =>
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>{section.paragraphs.map((p,i) => <p key={i}>{p}</p>)}{section.tips? <ul>{section.tips.map(tip => <li key={tip}>{tip}</li>)}</ul>:null}</section>)}
          {article.questions.length ? <section id="perguntas">
            <h2>Perguntas rápidas</h2>{article.questions.map(q => <details key={q.question} className={styles.faq}>
              <summary>{q.question}</summary>
              <p>{q.answer}</p>
            </details>)}</section> : null}{article.sources?.length ?
              <section className={styles.sources}>
                <h2>Para continuar a pesquisa</h2>
                <ul>{article.sources.map(source => <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ArrowUpRight size={14} />
                  </a>
                </li>)}</ul>
              </section>:null}<div className={styles.author}>
            <PenLine size={23} />
            <div>
              <strong>Equipe {name}</strong>
              <p>Ideias e orientações para escolher produtos personalizados e preparar sua arte com mais clareza. Valores, medidas e condições válidos são os exibidos no produto e no pedido.</p>
            </div>
          </div>
          <Link className={styles.back} href={blogPath(base)}>
            <ArrowLeft size={16} />Voltar para todas as histórias</Link>
        </div>
      </div>
    </article>

    <section className={styles.nextStep} aria-labelledby="blog-next">
      <div>
        <p className={styles.eyebrow}>Da leitura para a criação</p>
        <h2 id="blog-next">Que tal dar forma à sua ideia?</h2>
        <p>Compare modelos, escolha as quantidades e prepare a arte no seu tempo.</p>
      </div>
      <div>{matchingProducts.map(product => <Link key={product.id} href={commerceProductPath(base,product)} prefetch={false}>{product.imageUrl? <img src={product.imageUrl} alt="" width={56} height={56} loading="lazy" />:null}<span>{product.name}</span>
        <ArrowUpRight size={17} />
      </Link>)}<Link href={`${base}/catalogo`}>Explorar o catálogo<ArrowRight size={16} />
        </Link>{!preview? <Link href={`${base}/orcamento`}>Montar um orçamento<ArrowRight size={16} />
        </Link>:null}</div>
    </section>

    <section className={styles.related} aria-labelledby="related-stories">
      <div className={styles.sectionHeading}>
        <h2 id="related-stories">Sua próxima boa leitura</h2>
        <Link href={blogPath(base)}>Ver todas<ArrowRight size={16} />
        </Link>
      </div>
      <div className={styles.grid}>{related.map(a => <BlogArticleCard key={a.slug} article={blogCard(a)} base={base} />)}</div>
    </section>
    <progress className={styles.progress} data-blog-progress value={0} max={100} aria-label="Progresso de leitura" />
  </div>;
}

export function StoreBlogTeaser({ base, blog }: { base: string; blog?: PublicBlog }) {
  const selected = blog ? blog.articles.slice(0, 3) : [groundShopArticles[0], groundShopArticles[2], groundShopArticles[6]];
  return (
  <section className={`${styles.blog} ${styles.related}`} aria-labelledby="home-blog-title">
    <div className={styles.sectionHeading}>
      <div>
        <p className={styles.eyebrow}>{blog?.settings.title ?? "Blog Ground Shop"}</p>
        <h2 id="home-blog-title">Uma ideia para levar com você</h2>
      </div>
      <Link href={blogPath(base)}>Explorar histórias<ArrowRight size={16} />
      </Link>
    </div>
    <div className={styles.grid}>{selected.map(article => <article className={styles.card} key={article.slug}>
      <Link href={blogPath(base,article.slug)} className={styles.cover} prefetch={false} tabIndex={-1} aria-hidden="true">
        {article.image ? <img src={article.image} alt="" width={720} height={480} loading="lazy" decoding="async" /> : null}
      </Link>
      <div className={styles.cardCopy}>
        <p className={styles.eyebrow}>{article.category}</p>
        <h3>
          <Link href={blogPath(base,article.slug)} prefetch={false}>{article.title}</Link>
        </h3>
        <p>{article.description}</p>
      </div>
    </article>)}</div>
  </section>);
}

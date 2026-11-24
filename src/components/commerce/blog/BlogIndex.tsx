"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock3, Search, X } from "lucide-react";
import { blogPath, filterBlogCards, type BlogCard } from "@/domain/commerce/blog";
import { CreativePause, SaveArticle } from "./BlogInteractions";
import styles from "./blog.module.css";

export function BlogArticleCard({ article, base }: { article: BlogCard; base: string }) {
  return <article className={styles.card}><Link href={blogPath(base, article.slug)} prefetch={false} className={styles.cover} tabIndex={-1} aria-hidden="true"><img src={article.image} alt="" width={720} height={480} loading="lazy" decoding="async"/><span><ArrowUpRight size={22}/></span></Link><div className={styles.cardCopy}><div className={styles.cardMeta}><span>{article.category}</span><span><Clock3 size={13}/>{article.minutes} min</span></div><h3><Link href={blogPath(base, article.slug)} prefetch={false}>{article.title}</Link></h3><p>{article.description}</p><div className={styles.cardBottom}><Link href={blogPath(base, article.slug)} prefetch={false}>Ler a história<ArrowUpRight size={16}/></Link><SaveArticle slug={article.slug}/></div></div></article>;
}

export function BlogIndex({ articles, base }: { articles: BlogCard[]; base: string }) {
  const [query, setQuery] = useState(""), [category, setCategory] = useState("");
  const categories = useMemo(() => [...new Set(articles.map(a => a.category))], [articles]);
  const filtered = filterBlogCards(articles, query, category);
  return <><section id="historias" className={styles.library} aria-labelledby="blog-stories"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Uma boa ideia puxa outra</p><h2 id="blog-stories">O que você quer descobrir?</h2></div><div className={styles.search}><Search size={18} aria-hidden="true"/><input type="search" placeholder="Busque um produto ou uma ideia" aria-label="Buscar histórias" value={query} maxLength={100} onChange={e => setQuery(e.target.value)}/>{query ? <button type="button" aria-label="Limpar busca" onClick={() => setQuery("")}><X size={17}/></button> : null}</div></div><div className={styles.filters} role="group" aria-label="Filtrar histórias por assunto">{["", ...categories].map(c => <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}>{c || "Todas as histórias"}</button>)}</div><p className={styles.count} role="status">{filtered.length} {filtered.length === 1 ? "história para explorar" : "histórias para explorar"}</p><div className={styles.grid}>{filtered.map(article => <BlogArticleCard article={article} base={base} key={article.slug}/>)}</div>{filtered.length === 0 ? <div className={styles.empty}><h3>A próxima ideia pode estar em outro assunto.</h3><p>Tente um nome de produto ou volte para todas as histórias.</p><button type="button" onClick={() => { setQuery(""); setCategory(""); }}>Ver todas as histórias</button></div> : null}</section><CreativePause/></>;
}

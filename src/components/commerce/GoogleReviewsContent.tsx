"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Star, UserRound } from "lucide-react";
import type { GoogleReview, GoogleReviewsData } from "@/domain/commerce/google-reviews";
import { GoogleMapsNotice } from "./GoogleMapsNotice";
import styles from "./google-reviews.module.css";
export function GoogleMapsAttribution() {
  return <span className={styles.attribution}><img className={styles.lightLogo} src="/google-maps/attribution-light.png" alt="Google Maps" width={98} height={18}/><img className={styles.darkLogo} src="/google-maps/attribution-dark.png" alt="Google Maps" width={98} height={18}/></span>;
}
function Stars({ value }: { value: number }) {
  return <span className={styles.stars} aria-label={`${value.toLocaleString("pt-BR")} de 5 estrelas`}>{Array.from({ length: 5 }, (_, i) => <span key={i}><Star size={16} aria-hidden="true"/><span style={{ width: `${Math.min(1, Math.max(0, value - i)) * 100}%` }}><Star size={16} aria-hidden="true"/></span></span>)}</span>;
}
function Review({ review }: { review: GoogleReview }) {
  const [expanded, setExpanded] = useState(false), [photoFailed, setPhotoFailed] = useState(false);
  return <article className={styles.review}>
    <header><span className={styles.avatar}>{review.avatarUrl && !photoFailed ? <img src={review.avatarUrl} referrerPolicy="no-referrer" alt="" loading="lazy" width={40} height={40} onError={() => setPhotoFailed(true)}/> : <UserRound size={19}/>}</span><div>{review.authorUrl ? <a href={review.authorUrl} target="_blank" rel="noopener noreferrer">{review.author}</a> : <strong>{review.author}</strong>}{review.publishTime ? <time dateTime={review.publishTime}>{new Date(review.publishTime).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}</time> : <small>{review.relativeTime}</small>}</div></header>
    <Stars value={review.rating}/>
    {review.text ? <><p className={expanded ? styles.fullText : styles.clamped}>{review.text}</p>{review.text.length > 220 ? <button type="button" className={styles.readMore} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Ler menos" : "Ler avaliação completa"}</button> : null}</> : <p className={styles.muted}>Avaliação sem comentário.</p>}
    <a className={styles.source} href={review.sourceUrl} target="_blank" rel="noopener noreferrer">Ver avaliação no Google Maps<ExternalLink size={13}/></a>
  </article>;
}
export function GoogleReviewsContent({ data, title, base, admin = false }: { data: GoogleReviewsData; title: string; base?: string; admin?: boolean }) {
  const rail = useRef<HTMLDivElement>(null);
  return <div className={`${styles.content} ${admin ? styles.admin : ""}`} data-google-reviews-content>
    <header className={styles.heading}><div><p className={styles.eyebrow}>Experiências compartilhadas</p><h2>{title}</h2><p className={styles.muted}>{data.name}</p></div><div className={styles.summary}>{data.rating !== null ? <><strong>{data.rating.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<span>/ 5</span></strong><Stars value={data.rating}/></> : null}<a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">{data.total.toLocaleString("pt-BR")} avaliações no Google Maps<ExternalLink size={13}/></a><GoogleMapsAttribution/></div></header>
    <div className={styles.toolbar}><p>Até 5 avaliações, selecionadas pelo Google por relevância.</p>{data.reviews.length > 1 ? <div><button type="button" title="Avaliações anteriores" aria-label="Avaliações anteriores" onClick={() => rail.current?.scrollBy({ left: -(rail.current?.clientWidth ?? 300), behavior: "smooth" })}><ArrowLeft size={17}/></button><button type="button" title="Próximas avaliações" aria-label="Próximas avaliações" onClick={() => rail.current?.scrollBy({ left: rail.current?.clientWidth ?? 300, behavior: "smooth" })}><ArrowRight size={17}/></button></div> : null}</div>
    {data.reviews.length ? <div className={styles.rail} ref={rail} aria-label="Avaliações de clientes">{data.reviews.map(review => <Review key={review.id} review={review}/>)}</div> : <p className={styles.muted}>Nenhum comentário disponível para exibir. Consulte o perfil no Google Maps.</p>}
    <footer className={styles.footer}>{data.attributions?.map(item => <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a>)}<GoogleMapsNotice/>{base !== undefined ? <a href={`${base}/avaliacoes-google`}>Sobre as avaliações e sua privacidade</a> : null}</footer>
  </div>;
}

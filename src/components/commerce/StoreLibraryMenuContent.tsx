"use client";
/* eslint-disable @next/next/no-img-element */
import React from "react";
import Link from "next/link";
import { ArrowRight, Images, Loader2, RefreshCw } from "lucide-react";
import type { LibraryCampaign, LibraryResult } from "@/domain/commerce/library";
import styles from "./store.module.css";

export function StoreLibraryMenuContent({ kind, base, api, data, campaigns, loading, error, reload, preview, onNavigate }: {
  kind: "artworks" | "campaigns"; base: string; api: string; data: LibraryResult | null; campaigns: LibraryCampaign[];
  loading: boolean; error: string; reload: () => void; preview: boolean; onNavigate: () => void;
}) {
  if (loading) return <div role="status" className={styles.categoryLibraryStatus}><Loader2 size={19} className="animate-spin" aria-hidden="true"/>Carregando {kind === "artworks" ? "artes prontas" : "campanhas"}…</div>;
  if (error) return <div className={styles.categoryLibraryStatus}><p role="alert">{error}</p><button type="button" onClick={reload} className={styles.secondary}><RefreshCw size={15}/>Tentar novamente</button></div>;
  if (kind === "campaigns") return campaigns.length ? <div className={styles.categoryProductGrid}>
    {campaigns.map(campaign => <Link prefetch={false} key={campaign.id} className={styles.categoryProduct} href={`${base}/campanhas/${campaign.slug}`} onClick={onNavigate}>
      <span className={`${styles.categoryProductImage} ${styles.categoryCampaignImage}`}>{campaign.cover_url ? <img src={campaign.cover_url} alt="" loading="lazy" width={96} height={64}/> : <Images size={25} aria-hidden="true"/>}</span>
      <span className={styles.categoryProductText}><strong>{campaign.name}</strong><small>{campaign.artwork_count ?? 0} {campaign.artwork_count === 1 ? "arte" : "artes"}{preview && campaign.status !== "published" ? " · Prévia" : ""}</small></span>
      <ArrowRight className={styles.categoryProductArrow} size={17} aria-hidden="true"/>
    </Link>)}
  </div> : <p className={styles.categoryLibraryStatus}>Novas campanhas estarão disponíveis em breve.</p>;

  const categories = data?.categories.filter(category => category.active && (!category.parent_id || data.categories.some(parent => parent.id === category.parent_id && parent.active))) ?? [];
  const artworks = data?.artworks.filter(artwork => preview || artwork.status === "published").slice(0, 12) ?? [];
  return <div className={styles.categoryLibraryLayout} data-categories={categories.length > 0}>
    {categories.length ? <aside className={styles.categoryArtCategories} aria-label="Categorias de artes">
      <h3>Categorias de artes</h3>
      <ul>{categories.filter(category => !category.parent_id).map(category => <li key={category.id}>
        <Link prefetch={false} href={`${base}/artes?categoria=${encodeURIComponent(category.id)}`} onClick={onNavigate}>{category.name}<ArrowRight size={13} aria-hidden="true"/></Link>
        {categories.some(child => child.parent_id === category.id) ? <ul>{categories.filter(child => child.parent_id === category.id).map(child => <li key={child.id}><Link prefetch={false} href={`${base}/artes?categoria=${encodeURIComponent(child.id)}`} onClick={onNavigate}>{child.name}</Link></li>)}</ul> : null}
      </li>)}</ul>
    </aside> : null}
    <div className={styles.categoryLibraryArtworks}>
      {artworks.length ? <><div className={styles.categoryProductGrid}>
        {artworks.map(artwork => <Link prefetch={false} key={artwork.id} className={styles.categoryProduct} href={`${base}/artes?arte=${encodeURIComponent(artwork.id)}`} onClick={onNavigate}>
          <span className={styles.categoryProductImage}><img src={`${api}/thumbnail/${artwork.id}?v=${encodeURIComponent(artwork.version)}`} alt="" loading="lazy" width={64} height={64}/></span>
          <span className={styles.categoryProductText}><strong>{artwork.title}</strong><small>{artwork.status !== "published" ? "Prévia da arte" : "Arte pronta"}</small></span>
          <ArrowRight className={styles.categoryProductArrow} size={17} aria-hidden="true"/>
        </Link>)}
      </div>{data && data.total > artworks.length ? <p className={styles.categoryLibraryHint}>Mostrando {artworks.length} de {data.total} artes. Explore a galeria para ver todas.</p> : null}</> : <p className={styles.categoryLibraryStatus}>Novas artes estarão disponíveis em breve.</p>}
    </div>
  </div>;
}

"use client";
import React, { useEffect, useRef, useState } from "react";
import type { GoogleReviewsData } from "@/domain/commerce/google-reviews";
import { GoogleMapsAttribution, GoogleReviewsContent } from "./GoogleReviewsContent";
import styles from "./google-reviews.module.css";
type Config = { enabled: boolean; title?: string; sourceUrl?: string };
export function StoreGoogleReviews({ slug, preview, base }: { slug: string; preview: boolean; base: string }) {
  const endpoint = preview ? `/api/commerce/${encodeURIComponent(slug)}/preview/google-reviews` : `/api/store/${encodeURIComponent(slug)}/google-reviews`;
  const [config, setConfig] = useState<Config | null>(null), [data, setData] = useState<GoogleReviewsData | null>(null), [failed, setFailed] = useState(false);
  const section = useRef<HTMLElement>(null);
  useEffect(() => { const controller = new AbortController(); setConfig(null); setData(null); setFailed(false);
    void fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(response => response.ok ? response.json() : null).then(result => { if (!controller.signal.aborted) setConfig(result); }).catch(() => {});
    return () => controller.abort();
  }, [endpoint]);
  useEffect(() => {
    if (!config?.enabled || !section.current) return;
    let requested = false; const controller = new AbortController();
    function load() { if (requested) return; requested = true; void fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store", signal: controller.signal }).then(async response => { if (!response.ok) throw new Error("unavailable"); return response.json(); }).then(result => { if (!controller.signal.aborted) setData(result.data); }).catch(() => { if (!controller.signal.aborted) setFailed(true); }); }
    const observer = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { load(); observer?.disconnect(); } }) : null;
    if (observer) observer.observe(section.current); else load();
    return () => { controller.abort(); observer?.disconnect(); };
  }, [config, endpoint]);
  if (!config?.enabled) return null;
  return <section ref={section} className={styles.section} aria-label={config.title} data-google-reviews>
    {data ? <GoogleReviewsContent data={data} title={config.title!} base={base}/> : failed ? <div className={styles.fallback}><h2>{config.title}</h2><p>As avaliações estão disponíveis no perfil da loja.</p><a href={config.sourceUrl} target="_blank" rel="noopener noreferrer">Ver avaliações no Google Maps</a><GoogleMapsAttribution/></div> : <div className={styles.loading} role="status"><h2>{config.title}</h2><p>Consultando avaliações no Google Maps…</p><div aria-hidden="true"><span/><span/><span/></div></div>}
  </section>;
}

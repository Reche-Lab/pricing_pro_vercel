"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Cookie, X } from "lucide-react";
import { createStoreAnalytics, type AnalyticsConsent } from "./analytics-browser";
import { publicAnalyticsSettings, type AnalyticsEvent, type AnalyticsParameters, type AnalyticsSettings } from "@/domain/commerce/analytics";
import styles from "./analytics.module.css";

const noop = () => false;
const empty = { scope: "", active: false, available: false, consent: null as AnalyticsConsent, open: false, privacySignal: false, track: noop as (name: AnalyticsEvent, params?: AnalyticsParameters) => boolean, once: noop as (key: string, name: AnalyticsEvent, params?: AnalyticsParameters) => boolean,
  showPreferences: () => {}, closePreferences: () => {}, choose: (() => {}) as (choice: "granted" | "denied") => void, setPage: (() => {}) as (path: string[]) => void, setTestMode: (() => {}) as (test: boolean) => void };
const Context = createContext(empty);
export const useStoreAnalytics = () => useContext(Context);

export function StoreAnalyticsProvider({ slug, settings, base, disabled, children }: { slug: string; settings?: AnalyticsSettings; base: string; disabled: boolean; children: React.ReactNode }) {
  const key = JSON.stringify(settings ?? {});
  const config = useMemo(() => publicAnalyticsSettings(JSON.parse(key)), [key]);
  const [runtime, setRuntime] = useState<ReturnType<typeof createStoreAnalytics> | null>(null);
  const [consent, setConsent] = useState<AnalyticsConsent>(null), [open, setOpen] = useState(false);
  useEffect(() => {
    if (disabled || !config.enabled) { setRuntime(null); setOpen(false); return; }
    const next = createStoreAnalytics(slug, config, base);
    next.start(); setRuntime(next); setConsent(next.getConsent()); setOpen(next.getConsent() === null);
    return () => next.dispose();
  }, [slug, config, base, disabled]);
  const choose = useCallback((choice: "granted" | "denied") => { if (runtime) setConsent(runtime.choose(choice)); setOpen(false); }, [runtime]);
  const value = useMemo(() => runtime && !disabled && config.enabled ? {
    scope: `${slug}:${config.measurementId}`, active: consent === "granted" && !runtime.privacySignal, available: true, consent, open, privacySignal: runtime.privacySignal,
    track: runtime.track, once: runtime.once, choose, showPreferences: () => setOpen(true), closePreferences: () => setOpen(false), setPage: runtime.setPage, setTestMode: runtime.setTestMode,
  } : empty, [runtime, disabled, config.enabled, config.measurementId, slug, consent, open, choose]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function StoreAnalyticsConsent() {
  const analytics = useStoreAnalytics();
  if (!analytics.available) return null;
  return <>
    <div className={styles.preferences}><button type="button" onClick={analytics.showPreferences}><Cookie size={16}/>Privacidade e cookies</button></div>
    {analytics.open ? <section className={styles.consent} role="region" aria-label="Preferências de privacidade">
      <div className={styles.consentHeading}><h2>Sua privacidade, sua escolha</h2>{analytics.consent ? <button type="button" onClick={analytics.closePreferences} aria-label="Fechar preferências" title="Fechar preferências"><X size={18}/></button> : null}</div>
      <p>Usamos cookies necessários para manter seu carrinho e acesso. Com sua permissão, usamos o Google Analytics para melhorar a loja. Você pode comprar e orçar sem aceitar essas métricas opcionais.</p>
      {analytics.privacySignal ? <p>Respeitamos o sinal de privacidade do seu navegador. As métricas opcionais estão desativadas.</p> : null}
      <div className={styles.consentActions}><button type="button" onClick={() => analytics.choose("denied")}>Somente necessárias</button><button type="button" disabled={analytics.privacySignal} onClick={() => analytics.choose("granted")}>Aceitar métricas</button></div>
    </section> : null}
  </>;
}

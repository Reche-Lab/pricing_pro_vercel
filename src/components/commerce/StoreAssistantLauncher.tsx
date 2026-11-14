"use client";
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { MessageCircle } from "lucide-react";
import type { StoreSettings } from "@/domain/commerce/schemas";
import styles from "./assistant.module.css";
const Panel = dynamic(() => import("./StoreAssistantPanel").then(m => m.StoreAssistantPanel), { ssr: false, loading: () => <p role="status" className={styles.loading}>Preparando atendimento…</p> });
export type AssistantPublicConfig = { enabled: boolean; name: string; welcome: string; retentionDays: number; quotes: boolean; orders: boolean };
export function StoreAssistantLauncher({ api, base, settings, buyerId, onCartChanged }: { api: string; base: string; settings: StoreSettings; buyerId?: string; onCartChanged: () => Promise<void> }) {
  const [config, setConfig] = useState<AssistantPublicConfig | null>(null), [open, setOpen] = useState(false), [covered, setCovered] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`${api}/assistant`, { signal: abort.signal, cache: "no-store" }).then(r => r.ok ? r.json() : null).then(value => setConfig(value?.enabled ? value : null)).catch(() => {});
    return () => abort.abort();
  }, [api]);
  useEffect(() => {
    const check = () => setCovered(Boolean(document.querySelector("dialog[open]")));
    const observer = new MutationObserver(check); observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"], childList: true }); check();
    return () => observer.disconnect();
  }, []);
  if (!config) return null;
  return <><button type="button" className={styles.launcher} hidden={covered || open} title="Conversar com o assistente virtual da loja" aria-label="Abrir assistente virtual da loja" aria-haspopup="dialog" onClick={() => setOpen(true)}><MessageCircle size={22}/><span>Posso ajudar?</span><small>IA</small></button>{open ? <AssistantBoundary onClose={() => setOpen(false)}><Panel config={config} api={api} base={base} settings={settings} buyerId={buyerId} onCartChanged={onCartChanged} onClose={() => setOpen(false)}/></AssistantBoundary> : null}</>;
}
class AssistantBoundary extends React.Component<{ children: React.ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className={styles.loading} role="alert"><p>O atendimento virtual ficou indisponível. A loja continua funcionando normalmente.</p><button type="button" onClick={this.props.onClose}>Fechar aviso</button></div> : this.props.children; }
}

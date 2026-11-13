import React from "react";
import { ArrowUpRight, Code2, Layers3 } from "lucide-react";
import { platformBranding } from "@/lib/platform-branding";
import styles from "./platform-signature.module.css";

export function PlatformSignature({ appearance = "inherit" }: { appearance?: "inherit" | "dark" }) {
  return <div className={styles.signature} data-appearance={appearance} aria-label="Plataforma e criação" data-platform-signature>
    <span className={styles.credit}><span>Plataforma</span><a href={platformBranding.url} target="_blank" rel="noopener noreferrer" title="Conheça a plataforma Liaflow · abre em nova aba"><Layers3 size={14} aria-hidden="true"/><strong>{platformBranding.name}</strong><ArrowUpRight size={12} className={styles.arrow} aria-hidden="true"/></a></span>
    <span className={styles.separator} aria-hidden="true"/>
    <span className={styles.credit}><span>Criação</span><a href={platformBranding.creator.url} target="_blank" rel="noopener noreferrer" title="Conheça o portfólio da rechelab · abre em nova aba"><Code2 size={15} aria-hidden="true"/><strong className={styles.creator}>{platformBranding.creator.name}</strong><ArrowUpRight size={12} className={styles.arrow} aria-hidden="true"/></a></span>
  </div>;
}

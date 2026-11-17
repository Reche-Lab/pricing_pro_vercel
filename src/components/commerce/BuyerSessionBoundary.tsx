"use client";
import React from "react";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { BuyerLogin } from "./StoreBuyerLogin";
import type { cartView } from "@/repositories/commerce";
import styles from "./store.module.css";
import a from "./buyer-account.module.css";
export function BuyerSessionBoundary({ cart, error, api, refresh, preview, children }: {
  cart: Awaited<ReturnType<typeof cartView>> | null; error: string; api: string; refresh: () => Promise<void>; preview: boolean; children: React.ReactNode;
}) {
  if (preview) return <p className={a.session}>A conta e o histórico de compras ficam disponíveis na loja publicada.</p>;
  if (!cart) return <section className={a.session} aria-label="Acesso à minha conta">
    {error ? <><p role="alert">{error}</p><button type="button" className={styles.secondary} onClick={() => void refresh().catch(() => {})}><RefreshCw size={16}/>Tentar recuperar conta</button></> : <><ShieldCheck size={26} aria-hidden="true"/><p role="status"><Loader2 size={17} className="animate-spin motion-reduce:animate-none"/>Recuperando sua conta…</p></>}
  </section>;
  return cart.customer ? <>{children}</> : <BuyerLogin api={api} onLogged={refresh} disabled={false}/>;
}

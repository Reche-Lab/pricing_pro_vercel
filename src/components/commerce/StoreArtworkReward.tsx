"use client";
import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Sparkles } from "lucide-react";
import { storeMoney } from "./store-http";
import styles from "./artwork-reward.module.css";

const colors = ["#fcd34d", "#f472b6", "#5eead4", "#fb7185", "#a3e635", "#93c5fd"];
export function StoreArtworkReward({ discountCents, celebrate, context, refreshFailed = false }: {
  discountCents: number | null;
  celebrate: boolean;
  context: "selection" | "cart";
  refreshFailed?: boolean;
}) {
  const [particles, setParticles] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const earned = discountCents !== null && discountCents > 0;
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    root.current?.scrollIntoView?.({ block: "nearest", behavior: media?.matches ? "auto" : "smooth" });
    if (!celebrate || !earned || !media || media.matches) return;
    setParticles(true);
    const timer = window.setTimeout(() => setParticles(false), 3700);
    const reduce = () => { if (media.matches) setParticles(false); };
    media.addEventListener?.("change", reduce);
    return () => { window.clearTimeout(timer); media.removeEventListener?.("change", reduce); };
  }, [celebrate, earned]);
  return <>
    <div ref={root} role="status" aria-live="polite" aria-atomic="true" className={styles.reward}>
      <p className={styles.heading}>{earned ? <Sparkles size={20} /> : <CheckCircle2 size={20} />}Arte aprovada!</p>
      {earned ? <>
        <p className={styles.amount}>{celebrate ? "Você ganhou " : "Seu desconto: "}{storeMoney(discountCents!)}</p>
        <p className={styles.note}>{context === "cart" ? "Desconto por preparar a arte, incluído no total do carrinho." : "Desconto por preparar a arte. O benefício acompanha esta seleção ao adicionar ao carrinho."}</p>
      </> : <p className={styles.note}>{discountCents === null ? "Confira o carrinho para consultar o benefício atualizado desta arte." : "Seu enquadramento foi concluído com sucesso."}</p>}
      {refreshFailed ? <p className={styles.note}>Sua aprovação foi salva. Atualize o carrinho para conferir os valores mais recentes.</p> : null}
    </div>
    {particles ? createPortal(<div className={styles.burst} data-artwork-confetti aria-hidden="true">
      {Array.from({ length: 60 }, (_, i) => <span key={i} className={`${styles.particle} ${i % 3 === 0 ? styles.ribbon : ""}`} style={{
        "--x": `${((i * 47) % 97) - 48}vw`, "--rise": `${-18 - (i * 13) % 36}vh`,
        "--drift": `${((i * 47) % 97) - 48 + (i % 2 ? 7 : -7)}vw`, "--spin": `${180 + i * 37}deg`,
        "--delay": `${(i % 7) * 32}ms`, "--color": colors[i % colors.length],
      } as CSSProperties}><i /></span>)}
    </div>, document.body) : null}
  </>;
}

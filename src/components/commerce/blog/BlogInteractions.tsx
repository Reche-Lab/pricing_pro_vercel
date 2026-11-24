"use client";
import React, { useEffect, useState } from "react";
import { Bookmark, Check, Link2, Shuffle } from "lucide-react";
import styles from "./blog.module.css";

const key = "ground-shop:blog:saved:v1";
function readSaved(): string[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string").slice(0, 100) : []; } catch { return []; }
}
export function SaveArticle({ slug }: { slug: string }) {
  const [saved, setSaved] = useState(false), [message, setMessage] = useState("");
  useEffect(() => { const update = () => setSaved(readSaved().includes(slug)); update(); window.addEventListener("storage", update); window.addEventListener("blog-saved", update); return () => { window.removeEventListener("storage", update); window.removeEventListener("blog-saved", update); }; }, [slug]);
  function toggle() {
    try { const next = readSaved().filter(s => s !== slug); if (!saved) next.push(slug); localStorage.setItem(key, JSON.stringify(next.slice(-100))); setSaved(!saved); setMessage(""); window.dispatchEvent(new Event("blog-saved")); }
    catch { setMessage("Seu navegador não permitiu guardar esta leitura."); }
  }
  return <span className={styles.save}><button type="button" aria-label={saved ? "Remover dos favoritos" : "Guardar leitura neste navegador"} title={saved ? "Leitura guardada neste navegador" : "Guardar leitura neste navegador"} aria-pressed={saved} onClick={toggle}>{saved ? <Check size={18}/> : <Bookmark size={18}/>}</button>{message ? <span role="status">{message}</span> : null}</span>;
}

export function ArticleTools() {
  const [copied, setCopied] = useState("");
  useEffect(() => {
    const article = document.querySelector<HTMLElement>("[data-blog-article]");
    if (!article) return;
    const progress = document.querySelector<HTMLProgressElement>("[data-blog-progress]");
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = article.getBoundingClientRect();
      if (progress) progress.value = Math.max(0, Math.min(100, -rect.top / Math.max(1, rect.height - innerHeight) * 100));
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update(); window.addEventListener("scroll", scroll, { passive: true }); window.addEventListener("resize", scroll);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", scroll); window.removeEventListener("resize", scroll); };
  }, []);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(""), 4000); return () => clearTimeout(timer); }, [copied]);
  return <div className={styles.share}><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(location.href.split("#")[0]); setCopied("Link copiado!"); } catch { setCopied("Copie o endereço desta página na barra do navegador."); } }}><Link2 size={16}/>Compartilhar</button><span role="status">{copied}</span></div>;
}

const ideas = {
  evento: ["Um botton para cada pergunta: ‘o que você está criando?’ pode ser o começo de uma conversa no intervalo.", "Três artes, uma identidade: use a mesma paleta para criar bottons diferentes para as trilhas do encontro.", "Um chaveiro com um símbolo do projeto. A história vai no cartão; a arte fica leve e legível."],
  festa: ["Um espelho com a flor do convite. Uma lembrança que continua fazendo sentido depois da festa.", "Um abridor com uma ilustração do lugar do encontro. Deixe a data no cartão, se quiser uma arte mais atemporal.", "Ímãs com três desenhos da mesma coleção. Cada convidado escolhe aquele com que mais se identifica."],
  campanha: ["Uma mensagem de apoio, uma fonte confiável e uma ação de verdade. O botton acompanha o propósito.", "Uma coleção de ímãs com ilustrações originais. Combine a distribuição com uma conversa sobre o tema.", "Um convite em poucas palavras. Se usar QR code, teste a leitura no tamanho real antes de aprovar."],
};
export function CreativePause() {
  const [kind, setKind] = useState<keyof typeof ideas>("evento"), [index, setIndex] = useState(0);
  return <section className={styles.pause} aria-labelledby="creative-pause-title"><div><p className={styles.eyebrow}>Pausa criativa</p><h2 id="creative-pause-title">E se a próxima ideia fosse assim?</h2></div><div className={styles.pauseControls}><label htmlFor="blog-occasion">Seu próximo momento<select id="blog-occasion" value={kind} onChange={e => { setKind(e.target.value as keyof typeof ideas); setIndex(0); }}><option value="evento">Empresa ou evento</option><option value="festa">Festa ou casamento</option><option value="campanha">Campanha de conscientização</option></select></label><button type="button" onClick={() => setIndex(i => (i + 1) % ideas[kind].length)} title="Experimentar outra ideia" aria-label="Experimentar outra ideia"><Shuffle size={20}/></button></div><p key={`${kind}-${index}`} className={styles.idea} aria-live="polite">{ideas[kind][index]}</p></section>;
}

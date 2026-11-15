"use client";
import React, { useEffect, useState } from "react";
import { Bot, Check, Copy, UserRound } from "lucide-react";
import styles from "./assistant.module.css";

export function StoreAssistantMessage({ speaker, text, children, animate = false }: {
  speaker: "user" | "assistant"; text: string; children?: React.ReactNode; animate?: boolean;
}) {
  const [entering] = useState(animate);
  const [feedback, setFeedback] = useState(""), [copying, setCopying] = useState(false);
  const isUser = speaker === "user";
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);
  async function copy() {
    setCopying(true); setFeedback("");
    try { await navigator.clipboard.writeText(text); setFeedback("Resposta copiada."); }
    catch { setFeedback("Não foi possível copiar a resposta."); }
    finally { setCopying(false); }
  }
  return <article className={styles.message} data-speaker={speaker} data-entering={entering} aria-label={isUser ? "Sua mensagem" : "Mensagem do assistente virtual"}>
    <header className={styles.messageHeader}>
      <span className={styles.avatar} aria-hidden="true">{isUser ? <UserRound size={15}/> : <Bot size={17}/>}</span>
      <span className={styles.sender}>{isUser ? "Você" : "Assistente virtual"}</span>
      {!isUser ? <button type="button" className={styles.copyMessage} aria-label="Copiar resposta" title={feedback || "Copiar resposta"} disabled={copying} onClick={() => void copy()}>{feedback === "Resposta copiada." ? <Check size={15} aria-hidden="true"/> : <Copy size={15} aria-hidden="true"/>}</button> : null}
    </header>
    <div className={styles.messageBubble} data-message-bubble><p>{text}</p>{feedback ? <small role="status" className={styles.copyFeedback}>{feedback}</small> : null}</div>
    {React.Children.count(children) > 0 ? <div className={styles.messageActions} data-message-actions>{children}</div> : null}
  </article>;
}

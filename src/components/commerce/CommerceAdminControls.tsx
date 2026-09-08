"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, Monitor, Moon, Sun } from "lucide-react";
import styles from "./commerce-admin.module.css";

export function CommerceHelp({ label, text }: { label: string; text: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  function open() {
    const box = trigger.current?.getBoundingClientRect();
    if (box) setPosition({ left: Math.max(12, Math.min(box.left, window.innerWidth - 292)), top: box.bottom + 8 });
  }
  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const reposition = () => {
      const box = trigger.current?.getBoundingClientRect();
      if (!box || box.bottom < 0 || box.top > window.innerHeight) close();
      else open();
    };
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !tooltip.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const height = tooltip.current?.getBoundingClientRect().height ?? 0;
    if (position.top + height > window.innerHeight - 12) {
      setPosition({ ...position, top: Math.max(12, position.top - height - 44) });
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [position]);
  return <span className={styles.help}>
    <button ref={trigger} type="button" className={styles.helpButton} aria-label={`Ajuda: ${label}`} aria-expanded={!!position}
      aria-describedby={position ? id : undefined} onMouseEnter={open} onFocus={open}
      onMouseLeave={() => { if (document.activeElement !== trigger.current) setPosition(null); }}
      onBlur={() => setPosition(null)} onClick={event => { event.preventDefault(); open(); }}>
      <CircleHelp size={16} aria-hidden="true" />
    </button>
    {position ? createPortal(<span ref={tooltip} id={id} role="tooltip" className={styles.tooltip} style={position}>{text}</span>, document.body) : null}
  </span>;
}

export function CommerceCaption({ label, help }: { label: string; help: string }) {
  return <span className={styles.help}>{label}<CommerceHelp label={label} text={help} /></span>;
}

export function CommerceThemePicker({ value, onChange }: { value: "system" | "light" | "dark"; onChange: (value: "system" | "light" | "dark") => void }) {
  return <div role="group" aria-label="Tema inicial da loja" className={styles.theme}>
    {([{ id: "system", label: "Automático", Icon: Monitor }, { id: "light", label: "Claro", Icon: Sun }, { id: "dark", label: "Escuro", Icon: Moon }] as const).map(({ id, label, Icon }) =>
      <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)} title={id === "system" ? "Acompanhar o tema do dispositivo do cliente" : `Abrir a loja no tema ${label.toLowerCase()}`}>
        <Icon size={16} aria-hidden="true" />{label}
      </button>)}
  </div>;
}

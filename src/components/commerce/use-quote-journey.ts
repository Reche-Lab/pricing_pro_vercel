"use client";
import { useCallback, useEffect, useState } from "react";

export function useQuoteJourney(api: string, view: string, preview: boolean) {
  const key = `commerce-quote-mode:${api}`;
  const [intent, setIntent] = useState<{ key: string; quote: boolean } | null>(null);
  const setQuoteMode = useCallback((quote: boolean) => {
    setIntent({ key, quote });
    try { if (quote) localStorage.setItem(key, "quote"); else localStorage.removeItem(key); } catch { /* Navigation still works when browser storage is unavailable. */ }
  }, [key]);
  useEffect(() => {
    if (preview) return;
    let quote = false;
    try { quote = localStorage.getItem(key) === "quote"; } catch { /* Only the non-sensitive navigation intent is persisted. */ }
    if (view === "orcamento") quote = true;
    if (view === "checkout" || view === "pedidos") quote = false;
    setQuoteMode(quote);
  }, [key, view, preview, setQuoteMode]);
  useEffect(() => {
    const update = (event: StorageEvent) => { if (event.key === key || event.key === null) setIntent({ key, quote: event.newValue === "quote" }); };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, [key]);
  return { quoting: !preview && view !== "checkout" && view !== "pedidos" && (view === "orcamento" || intent?.key === key && intent.quote), setQuoteMode };
}

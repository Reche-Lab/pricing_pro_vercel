"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { checkoutDraftSchema, type CheckoutDraft } from "@/domain/commerce/checkout-draft";
import { storeRequest } from "./store-http";

export function useCheckoutDraft(api: string | undefined, preview: boolean, initial: CheckoutDraft) {
  const [draft, setDraft] = useState(initial), [ready, setReady] = useState(preview || !api);
  const [status, setStatus] = useState("");
  const latest = useRef(draft), saved = useRef(JSON.stringify(initial)), version = useRef(0);
  const pending = useRef<Promise<void> | null>(null), alive = useRef(true);
  latest.current = draft;
  useEffect(() => {
    alive.current = true;
    if (preview || !api) return;
    let active = true;
    void storeRequest(`${api}/checkout-draft`).then(result => {
      if (!active) return;
      version.current = result.version;
      if (result.draft) {
        const restored = checkoutDraftSchema.parse(result.draft);
        saved.current = JSON.stringify(restored); latest.current = restored; setDraft(restored);
        setStatus("Dados recuperados com segurança.");
      }
      setReady(true);
    }).catch(() => { if (active) setStatus("Não foi possível recuperar seus dados. Recarregue a página antes de preencher."); });
    return () => { active = false; alive.current = false; };
  }, [api, preview]);
  const flush = useCallback(async () => {
    if (preview || !api) return;
    if (!ready) throw new Error("Aguarde a recuperação dos dados do checkout.");
    if (pending.current) { await pending.current; return flush(); }
    const snapshot = JSON.stringify(latest.current);
    if (snapshot === saved.current) return;
    const task = (async () => {
      if (alive.current) setStatus("Salvando dados…");
      try {
        const result = await storeRequest(`${api}/checkout-draft`, "PUT", { version: version.current, draft: JSON.parse(snapshot) });
        version.current = result.version; saved.current = snapshot;
        if (alive.current) setStatus("Dados salvos. Você pode voltar ao carrinho sem perder o preenchimento.");
      } catch (error) {
        if (alive.current) setStatus(error instanceof Error ? error.message : "Não foi possível salvar seus dados.");
        throw error;
      }
    })();
    pending.current = task;
    try { await task; } finally { if (pending.current === task) pending.current = null; }
    if (JSON.stringify(latest.current) !== saved.current) await flush();
  }, [api, preview, ready]);
  useEffect(() => {
    if (!ready || preview) return;
    const timer = window.setTimeout(() => { void flush().catch(() => undefined); }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, flush, preview, ready]);
  useEffect(() => {
    if (!api || preview || !ready) return;
    const saveOnExit = () => {
      if (pending.current || saved.current === JSON.stringify(latest.current)) return;
      void fetch(`${api}/checkout-draft`, { method: "PUT", credentials: "same-origin", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ version: version.current, draft: latest.current }) }).catch(() => undefined);
    };
    window.addEventListener("pagehide", saveOnExit);
    return () => { window.removeEventListener("pagehide", saveOnExit); void flush().catch(() => undefined); };
  }, [api, preview, ready, flush]);
  return { draft, setDraft, flush, ready, status };
}

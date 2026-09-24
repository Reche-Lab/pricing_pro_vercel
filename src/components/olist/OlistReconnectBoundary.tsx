"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, KeyRound, Loader2, X } from "lucide-react";
import { OLIST_CONNECTED_EVENT, OLIST_RECONNECT_EVENT } from "@/lib/olist/browser-request";

export function OlistReconnectBoundary({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [connected, setConnected] = useState(false);
  const popup = useRef<Window | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const connecting = useRef(false);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    popup.current?.close();
    popup.current = null;
    channel.current?.close();
    channel.current = null;
    connecting.current = false;
  }, []);

  const close = useCallback(() => { stop(); setBusy(false); setOpen(false); }, [stop]);

  useEffect(() => {
    const show = () => {
      if (!connecting.current) setMessage("");
      setConnected(false); setOpen(true);
    };
    window.addEventListener(OLIST_RECONNECT_EVENT, show);
    return () => { window.removeEventListener(OLIST_RECONNECT_EVENT, show); stop(); };
  }, [stop]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key !== "Tab") return;
      const focusable = dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]");
      const first = focusable?.[0];
      const last = focusable?.[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey, true);
      previous?.focus();
    };
  }, [open, close]);

  async function reconnect() {
    if (connecting.current) return;
    connecting.current = true;
    setMessage("");
    // Open synchronously from the click to avoid the browser's popup blocker.
    const child = window.open("about:blank", "_blank", "popup,width=560,height=760");
    if (!child) {
      connecting.current = false;
      setMessage("Permita pop-ups para este site e clique em Reconectar novamente. Seus dados continuam nesta tela.");
      return;
    }
    popup.current = child;
    setBusy(true);
    try {
      const attempt = crypto.randomUUID();
      const completion = new BroadcastChannel(`olist-oauth:${attempt}`);
      channel.current = completion;
      completion.onmessage = (event: MessageEvent<unknown>) => {
        if (channel.current !== completion) return;
        if (event.data !== "connected" && event.data !== "error") return;
        stop(); setBusy(false);
        if (event.data === "connected") {
          setConnected(true);
          window.dispatchEvent(new Event(OLIST_CONNECTED_EVENT));
        } else {
          setMessage("O Olist não concluiu a autorização. Tente novamente e confirme o acesso à conta correta.");
        }
      };
      const redirectPath = `/olist/oauth/complete?attempt=${attempt}`;
      const response = await fetch(`/api/olist/auth-url?redirectPath=${encodeURIComponent(redirectPath)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (popup.current !== child) return;
      if (!response.ok || !data?.authUrl) {
        throw new Error(response.status === 401
          ? "Sua sessão na plataforma expirou. Entre novamente antes de reconectar o Olist."
          : data?.error ?? "Não foi possível abrir a autenticação. Verifique as credenciais em Configurações > Olist.");
      }
      const authUrl = new URL(data.authUrl);
      if (authUrl.protocol !== "https:") throw new Error("O endereço de autenticação Olist precisa usar HTTPS.");
      child.location.href = authUrl.href;
      // COOP can detach the popup while it is still open. Do not interpret `closed` as cancellation.
      timer.current = setTimeout(() => {
        stop(); setBusy(false);
        setMessage("A autenticação não foi concluída. Clique em Reconectar para tentar novamente.");
      }, 10 * 60 * 1000);
    } catch (error) {
      if (popup.current !== child) return;
      stop(); setBusy(false);
      setMessage(error instanceof Error ? error.message : "Falha de comunicação ao iniciar a autenticação.");
    }
  }

  return <>{children}{open ? createPortal(
    <div className="fixed inset-0 z-[200] grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="olist-reconnect-title" aria-describedby="olist-reconnect-description" tabIndex={-1} className="my-auto w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-950 p-5 text-zinc-200 shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-3">
          <h2 id="olist-reconnect-title" className="flex items-center gap-2 text-lg font-semibold text-white">{connected ? <CheckCircle2 className="shrink-0 text-emerald-400" size={22} /> : <KeyRound className="shrink-0 text-amber-300" size={22} />}{connected ? "Olist conectado" : "Reconectar Olist/Tiny"}</h2>
          <button type="button" aria-label="Fechar reconexão" title="Fechar e manter os dados preenchidos" className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md hover:bg-zinc-800" onClick={close}><X size={18} /></button>
        </div>
        <p id="olist-reconnect-description" className="mt-4 text-sm leading-6 text-zinc-300">{connected ? "Conexão restabelecida. Volte à ação que estava realizando e tente novamente. Nenhum pedido, nota ou cadastro foi reenviado automaticamente." : "É necessário autorizar novamente o acesso ao Olist para continuar. A autenticação abrirá em outra janela; este orçamento e os campos preenchidos serão mantidos."}</p>
        {!connected ? <p className="mt-3 text-sm leading-6 text-zinc-400">Use a conta Olist vinculada a esta empresa. Caso não tenha acesso, peça ao responsável pela integração para reconectar.</p> : null}
        {message ? <p role="alert" className="mt-4 break-words rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">{message}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={close} className="focus-ring min-h-10 rounded-md border border-zinc-700 px-4 text-sm hover:bg-zinc-900">{connected ? "Voltar ao orçamento" : "Agora não"}</button>
          {!connected ? <button type="button" disabled={busy} onClick={() => void reconnect()} className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-60">{busy ? <Loader2 size={17} className="animate-spin" /> : <KeyRound size={17} />}{busy ? "Aguardando autenticação..." : "Reconectar Olist/Tiny"}</button> : null}
        </div>
      </div>
    </div>, document.body
  ) : null}</>;
}

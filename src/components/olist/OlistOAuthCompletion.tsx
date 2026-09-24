"use client";

import { useEffect } from "react";

export function OlistOAuthCompletion({ attempt, status }: { attempt: string; status: "connected" | "error" }) {
  useEffect(() => {
    if (!/^[a-f0-9-]{36}$/i.test(attempt)) return;
    const channel = new BroadcastChannel(`olist-oauth:${attempt}`);
    channel.postMessage(status);
    channel.close();
  }, [attempt, status]);

  return <main className="grid min-h-dvh place-items-center bg-zinc-950 p-6 text-zinc-200"><div className="max-w-md"><h1 className="text-xl font-semibold">{status === "connected" ? "Olist conectado" : "Autorização não concluída"}</h1><p className="mt-3 text-sm leading-6">{status === "connected" ? "Volte ao orçamento para continuar de onde parou." : "Volte ao orçamento e tente reconectar o Olist novamente."} Esta janela pode ser fechada.</p><button type="button" onClick={() => window.close()} className="mt-5 rounded-md border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900">Fechar janela</button></div></main>;
}

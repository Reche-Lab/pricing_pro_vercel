"use client";

import React, { useEffect } from "react";

export function MelhorEnvioOAuthCompletion({ attempt, status }: { attempt: string; status: "connected" | "error" }) {
  useEffect(() => {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(attempt)) return;
    const channel = new BroadcastChannel(`melhor-envio-oauth:${attempt}`);
    channel.postMessage(status);
    channel.close();
  }, [attempt, status]);

  return <main className="grid min-h-dvh place-items-center bg-zinc-950 p-6 text-zinc-200"><div className="max-w-md"><h1 className="text-xl font-semibold">{status === "connected" ? "Melhor Envio conectado" : "Autorização não concluída"}</h1><p className="mt-3 text-sm leading-6">{status === "connected" ? "Volte ao orçamento ou precificador para continuar de onde parou." : "Volte ao orçamento ou precificador e tente reconectar o Melhor Envio novamente."} Esta janela pode ser fechada.</p><button type="button" onClick={() => window.close()} className="mt-5 rounded-md border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900">Fechar janela</button></div></main>;
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";

export function VerifyAccessRequest({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  async function verify() {
    setState("loading");
    const response = await fetch("/api/access-requests/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) { setError(data?.error ?? "Não foi possível confirmar o e-mail."); setState("error"); return; }
    setState("success");
  }
  return <div className="text-center">{state === "success" ? <><CheckCircle2 className="mx-auto text-emerald-300" size={36} /><h1 className="mt-4 text-2xl font-semibold text-white">E-mail confirmado</h1><p className="mt-2 text-sm text-zinc-400">Sua solicitação está na fila de análise. Você receberá as próximas informações por e-mail.</p><Link className="mt-5 inline-flex rounded-md border border-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-800" href="/">Voltar ao início</Link></> : <><MailCheck className="mx-auto text-amber-300" size={36} /><h1 className="mt-4 text-2xl font-semibold text-white">Confirme sua solicitação</h1><p className="mt-2 text-sm text-zinc-400">Ao confirmar, o pedido será enviado para análise do administrador.</p>{error ? <p className="mt-4 rounded-md bg-red-400/10 p-3 text-sm text-red-300">{error}</p> : null}<button className="focus-ring mt-5 w-full rounded-md bg-amber-400 px-4 py-2.5 font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-60" disabled={state === "loading" || state === "error"} onClick={verify} type="button">{state === "loading" ? "Confirmando..." : "Confirmar meu e-mail"}</button></>}</div>;
}

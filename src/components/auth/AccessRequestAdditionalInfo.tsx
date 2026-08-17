"use client";

import { useState } from "react";
import { Send } from "lucide-react";

export function AccessRequestAdditionalInfo({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function submit() {
    setLoading(true); setFeedback("");
    const response = await fetch(`/api/access-requests/status/${token}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) });
    const data = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok || !data?.ok) { setFeedback(data?.error ?? "Não foi possível enviar as informações."); return; }
    setFeedback("Informações enviadas. Sua solicitação voltou para a fila de análise.");
    setMessage("");
  }
  return <div className="mt-4 rounded-md border border-amber-400/20 bg-amber-400/10 p-4"><label className="block"><span className="text-sm font-semibold text-amber-100">Responder ao administrador</span><textarea className="focus-ring mt-2 min-h-28 w-full rounded-md border border-zinc-700 bg-zinc-950/70 p-3 text-sm text-white" maxLength={1500} onChange={(event) => setMessage(event.target.value)} placeholder="Forneça os detalhes solicitados..." value={message} /></label><button className="focus-ring mt-3 inline-flex items-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50" disabled={loading || message.trim().length < 5} onClick={submit} type="button"><Send size={15} /> {loading ? "Enviando..." : "Enviar informações"}</button>{feedback ? <p className="mt-3 text-sm text-zinc-300">{feedback}</p> : null}</div>;
}

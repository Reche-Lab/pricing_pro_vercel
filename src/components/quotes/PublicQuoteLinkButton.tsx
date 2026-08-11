"use client";

import { useState } from "react";
import { Copy, ExternalLink, Link2, ShieldCheck, Trash2, X } from "lucide-react";

export function PublicQuoteLinkButton({
  quoteId,
  customerEmail,
  activeUntil
}: {
  quoteId: string;
  customerEmail?: string | null;
  activeUntil?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState(() => activeUntil && new Date(activeUntil).getTime() > Date.now() ? activeUntil : "");
  const [requireOtp, setRequireOtp] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  async function createLink() {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/quotes/${quoteId}/public-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requireOtp })
    });
    const data = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok || !data?.url) {
      setMessage(data?.error ?? "Não foi possível gerar o link público.");
      return;
    }
    setUrl(data.url);
    setExpiresAt(data.expiresAt ?? "");
    try {
      await navigator.clipboard.writeText(data.url);
      setMessage(requireOtp ? "Link copiado e código enviado ao cliente." : "Link público copiado.");
    } catch {
      setMessage("Link criado. Copie-o manualmente abaixo.");
    }
  }

  async function revokeLink() {
    setLoading(true);
    const response = await fetch(`/api/quotes/${quoteId}/public-link`, { method: "DELETE" });
    setLoading(false);
    if (!response.ok) {
      setMessage("Não foi possível revogar o link público.");
      return;
    }
    setConfirmRevoke(false);
    setUrl("");
    setExpiresAt("");
    setMessage("Link público revogado imediatamente.");
  }

  return (
    <>
      <button
        className="focus-ring inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-400/20"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Link2 size={16} />
        {expiresAt ? "Gerenciar link público" : "Link público para aceite"}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="public-link-title">
          <div className="my-auto w-full max-w-lg overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
              <div>
                <h2 className="font-semibold text-white" id="public-link-title">Compartilhar orçamento</h2>
                <p className="mt-1 text-sm text-zinc-400">O link expira automaticamente em 3 dias e pode ser revogado a qualquer momento.</p>
              </div>
              <button aria-label="Fechar" className="focus-ring rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white" onClick={() => setOpen(false)} type="button"><X size={18} /></button>
            </div>

            <div className="grid gap-4 p-5">
              {expiresAt ? (
                <div className="flex flex-col gap-3 rounded-md border border-emerald-400/20 bg-emerald-400/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-medium text-emerald-200">Link ativo</p><p className="mt-1 text-xs text-zinc-400">Expira em {new Date(expiresAt).toLocaleString("pt-BR")}</p></div>
                  <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-rose-400/25 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-400/10" onClick={() => setConfirmRevoke(true)} type="button"><Trash2 size={13} /> Revogar</button>
                </div>
              ) : null}

              <label className={`flex items-start gap-3 rounded-md border p-3 text-sm ${customerEmail ? "border-zinc-700 text-zinc-300" : "border-zinc-800 text-zinc-600"}`}>
                <input checked={requireOtp} className="mt-1 accent-cyan-400" disabled={!customerEmail || loading} onChange={(event) => setRequireOtp(event.target.checked)} type="checkbox" />
                <span><span className="font-medium"><ShieldCheck className="mr-1 inline" size={15} />Exigir código por e-mail</span><span className="mt-1 block text-xs leading-5">O cliente informa um código de seis dígitos para aceitar ou recusar.{!customerEmail ? " Cadastre o e-mail do cliente para habilitar." : ""}</span></span>
              </label>

              <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-cyan-300 disabled:opacity-60" disabled={loading} onClick={() => void createLink()} type="button"><Link2 size={16} />{loading ? "Gerando..." : expiresAt ? "Gerar novo link" : "Gerar e copiar link"}</button>

              {url ? (
                <div className="min-w-0 rounded-md border border-zinc-800 bg-zinc-900/70 p-3">
                  <p className="break-all text-xs text-zinc-400">{url}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900" onClick={() => navigator.clipboard.writeText(url)} type="button"><Copy size={13} /> Copiar</button>
                    <a className="focus-ring inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/20" href={url} rel="noreferrer" target="_blank">Abrir link <ExternalLink size={13} /></a>
                  </div>
                </div>
              ) : null}
              {message ? <p className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-sm text-zinc-300">{message}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {confirmRevoke ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="revoke-link-title">
          <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5"><div><h2 className="font-semibold text-white" id="revoke-link-title">Revogar link público?</h2><p className="mt-1 text-sm text-zinc-400">O cliente perderá o acesso imediatamente.</p></div><button aria-label="Fechar" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white" onClick={() => setConfirmRevoke(false)} type="button"><X size={17} /></button></div>
            <div className="flex justify-end gap-2 p-4"><button className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900" onClick={() => setConfirmRevoke(false)} type="button">Manter link</button><button className="rounded-md bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400" disabled={loading} onClick={() => void revokeLink()} type="button">{loading ? "Revogando..." : "Revogar agora"}</button></div>
          </div>
        </div>
      ) : null}
    </>
  );
}

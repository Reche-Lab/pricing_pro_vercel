"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, ShieldAlert, UnlockKeyhole, X } from "lucide-react";

export function QuoteAdministrativeEditingControl({
  quoteId, accepted, open, canManage, reopenedBy, reopenedAt, reason, hasInvoice
}: {
  quoteId: string;
  accepted: boolean;
  open: boolean;
  canManage: boolean;
  reopenedBy?: string | null;
  reopenedAt?: string | null;
  reason?: string | null;
  hasInvoice: boolean;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!accepted) return null;

  async function change(action: "reopen" | "lock") {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/quotes/${quoteId}/editing`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, reason: action === "reopen" ? reopenReason : null })
    });
    const data = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) { setMessage(data?.error ?? "Não foi possível atualizar o bloqueio."); return; }
    setModalOpen(false); setReopenReason("");
    router.refresh();
  }

  return <>
    <section className={`mb-5 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${open ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${open ? "bg-amber-400/15 text-amber-300" : "bg-emerald-400/15 text-emerald-300"}`}>{open ? <UnlockKeyhole size={18} /> : <LockKeyhole size={18} />}</span>
        <div><h2 className="text-sm font-semibold text-white">{open ? "Edição administrativa aberta" : "Orçamento aceito e fechado para edição"}</h2><p className="mt-1 text-xs leading-5 text-zinc-400">{open ? `Reaberto${reopenedBy ? ` por ${reopenedBy}` : ""}${reopenedAt ? ` em ${formatDate(reopenedAt)}` : ""}. ${reason || ""}` : "O aceite do cliente está preservado e o link público permanece bloqueado."}</p></div>
      </div>
      {canManage && !hasInvoice ? <button className={`focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${open ? "border border-zinc-700 text-zinc-200 hover:bg-zinc-900" : "bg-amber-400 text-amber-950 hover:bg-amber-300"}`} disabled={busy} type="button" onClick={() => open ? void change("lock") : setModalOpen(true)}>{open ? <LockKeyhole size={15} /> : <UnlockKeyhole size={15} />}{open ? "Fechar edição" : "Reabrir para edição"}</button> : null}
    </section>
    {message ? <p className="mb-4 rounded-md border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">{message}</p> : null}
    {modalOpen ? <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reopen-title"><div className="my-auto w-full max-w-lg overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl"><div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5"><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-amber-400/10 text-amber-300"><ShieldAlert size={19} /></span><div><h2 className="font-semibold text-white" id="reopen-title">Reabrir orçamento aceito</h2><p className="mt-1 text-sm leading-5 text-zinc-400">A reabertura permitirá alterações internas, mas não reativará o link público.</p></div></div><button aria-label="Fechar" className="focus-ring rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white" type="button" onClick={() => setModalOpen(false)}><X size={18} /></button></div><div className="p-5"><label><span className="mb-1 block text-xs font-medium text-zinc-400">Motivo da reabertura</span><textarea autoFocus className="focus-ring min-h-28 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm leading-6 text-white" maxLength={500} placeholder="Ex.: cliente solicitou alteração na quantidade e na arte após o aceite." value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} /></label><p className="mt-2 text-xs text-zinc-500">O responsável, a data e o motivo serão registrados na auditoria.</p>{message ? <p className="mt-3 rounded-md bg-red-400/10 p-3 text-sm text-red-200">{message}</p> : null}</div><div className="flex justify-end gap-2 border-t border-zinc-800 p-4"><button className="focus-ring rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300" type="button" onClick={() => setModalOpen(false)}>Cancelar</button><button className="focus-ring rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50" disabled={busy || reopenReason.trim().length < 10} type="button" onClick={() => void change("reopen")}>{busy ? "Reabrindo..." : "Confirmar reabertura"}</button></div></div></div> : null}
  </>;
}

function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date); }

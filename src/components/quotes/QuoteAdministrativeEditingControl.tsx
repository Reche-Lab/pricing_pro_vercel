"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LockKeyhole, ShieldAlert, UnlockKeyhole, X } from "lucide-react";

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

  function openReopenModal() {
    setMessage("");
    setReopenReason("");
    setModalOpen(true);
  }

  return <>
    <section className={`mb-5 overflow-hidden rounded-lg border ${open ? "border-amber-500/40 bg-amber-500/[0.07]" : "border-zinc-800 bg-zinc-900/70"}`}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${open ? "bg-amber-400/15 text-amber-300" : "bg-emerald-400/10 text-emerald-300"}`}>{open ? <UnlockKeyhole size={18} /> : <LockKeyhole size={18} />}</span>
          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Controle administrativo</p><h2 className="mt-0.5 text-sm font-semibold text-white">{open ? "Orçamento liberado para edição" : "Orçamento aprovado e protegido"}</h2><p className="mt-1 text-xs leading-5 text-zinc-400">{open ? `Liberado${reopenedBy ? ` por ${reopenedBy}` : ""}${reopenedAt ? ` em ${formatDate(reopenedAt)}` : ""}.` : "O aceite do cliente permanece preservado e alterações internas estão bloqueadas."}</p></div>
        </div>
        {canManage ? <button className={`focus-ring inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition ${open ? "border border-zinc-700 text-zinc-200 hover:bg-zinc-900" : "bg-amber-400 text-amber-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"}`} disabled={busy || hasInvoice} title={hasInvoice ? "Orçamentos com nota fiscal emitida não podem ser liberados para edição" : open ? "Encerrar a edição administrativa" : "Liberar este orçamento para alterações internas"} type="button" onClick={() => open ? void change("lock") : openReopenModal()}>{open ? <LockKeyhole size={15} /> : <UnlockKeyhole size={15} />}{open ? "Encerrar edição" : "Liberar edição"}</button> : null}
      </div>
      {open && reason ? <div className="flex items-start gap-2 border-t border-amber-500/20 bg-amber-950/20 px-4 py-3 text-xs leading-5 text-amber-100"><ShieldAlert className="mt-0.5 shrink-0 text-amber-300" size={14} /><p><strong>Observação da liberação:</strong> {reason}</p></div> : null}
      {!open && hasInvoice ? <div className="flex items-center gap-2 border-t border-zinc-800 px-4 py-3 text-xs text-zinc-500"><LockKeyhole size={13} /> A edição não pode ser liberada porque uma nota fiscal Olist já foi emitida.</div> : null}
    </section>
    {message ? <p className="mb-4 rounded-md border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">{message}</p> : null}
    {modalOpen ? <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reopen-title"><div className="my-auto w-full max-w-lg overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl"><div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5"><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-amber-400/10 text-amber-300"><UnlockKeyhole size={19} /></span><div><h2 className="font-semibold text-white" id="reopen-title">Liberar orçamento para edição</h2><p className="mt-1 text-sm leading-5 text-zinc-400">As alterações serão internas. O aceite original e o bloqueio do link público serão preservados.</p></div></div><button aria-label="Fechar" className="focus-ring grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-zinc-900 hover:text-white" type="button" onClick={() => setModalOpen(false)}><X size={18} /></button></div><div className="p-5"><div className="mb-4 flex gap-2 rounded-md border border-amber-900/60 bg-amber-950/25 p-3 text-xs leading-5 text-amber-100"><ShieldAlert className="mt-0.5 shrink-0 text-amber-300" size={15} /><p>Use esta liberação somente quando houver uma solicitação posterior à aprovação. Ao terminar, encerre a edição para proteger novamente o orçamento.</p></div><label><span className="mb-1 flex items-center justify-between gap-3 text-xs font-medium text-zinc-300"><span>Observação obrigatória</span><span className="font-normal tabular-nums text-zinc-600">{reopenReason.length}/500</span></span><textarea autoFocus className="focus-ring min-h-32 w-full resize-y rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm leading-6 text-white placeholder:text-zinc-600" maxLength={500} placeholder="Descreva quem solicitou a alteração e o que precisa ser revisado..." value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} /></label><p className="mt-2 text-xs text-zinc-500">Mínimo de 10 caracteres. Responsável, data e observação ficarão registrados na auditoria.</p>{message ? <p className="mt-3 rounded-md bg-red-400/10 p-3 text-sm text-red-200">{message}</p> : null}</div><div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 p-4"><button className="focus-ring min-h-10 rounded-md border border-zinc-700 px-4 text-sm text-zinc-300 hover:bg-zinc-900" disabled={busy} type="button" onClick={() => setModalOpen(false)}>Cancelar</button><button className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md bg-amber-400 px-4 text-sm font-semibold text-amber-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40" disabled={busy || reopenReason.trim().length < 10} type="button" onClick={() => void change("reopen")}>{busy ? "Liberando..." : <><CheckCircle2 size={15} /> Confirmar liberação</>}</button></div></div></div> : null}
  </>;
}

function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date); }

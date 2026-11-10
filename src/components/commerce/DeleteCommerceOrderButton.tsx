"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert, Trash2, X } from "lucide-react";
import { orderDeletionConfirmation } from "@/domain/commerce/order-deletion";
import { storeMoney, storeRequest } from "./store-http";

export function DeleteCommerceOrderButton({
  orderId,
  customerName,
  totalCents,
  compact = false,
  redirectTo,
  onDeleted,
}: {
  orderId: string;
  customerName?: string;
  totalCents: number;
  compact?: boolean;
  redirectTo?: string;
  onDeleted?: () => void;
}) {
  const code = orderId.slice(0, 8).toUpperCase(),
    confirmationText = orderDeletionConfirmation(orderId);
  const router = useRouter(),
    titleId = useId(),
    confirmationId = useId(),
    reasonId = useId();
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef(false);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [deleted, setDeleted] = useState(false);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const node = dialog.current,
      overflow = document.body.style.overflow,
      previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    if (typeof node.showModal === "function") node.showModal();
    else node.setAttribute("open", "");
    return () => {
      if (node.open && typeof node.close === "function") node.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  const valid =
    confirmation.trim().toUpperCase() === confirmationText &&
    reason.trim().length >= 5 &&
    reason.trim().length <= 500;
  if (deleted)
    return (
      <span role="status" className="text-xs text-zinc-400">
        Pedido #{code} excluído da gestão.
      </span>
    );
  return (
    <>
      <button
        type="button"
        aria-label={`Excluir pedido #${code}`}
        title="Excluir pedido da gestão administrativa"
        className={`focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-rose-400/30 text-sm text-rose-300 transition hover:border-rose-400/60 hover:bg-rose-400/10 ${compact ? "h-11 w-11" : "px-3 py-2"}`}
        onClick={() => {
          setConfirmation("");
          setReason("");
          setError("");
          setOpen(true);
        }}
      >
        <Trash2 size={16} />
        {compact ? null : "Excluir pedido"}
      </button>
      {open ? (
        <dialog
          ref={dialog}
          aria-labelledby={titleId}
          className="m-auto max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-lg border border-zinc-700 bg-zinc-950 p-0 text-zinc-100 shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm"
          onCancel={(event) => {
            event.preventDefault();
            if (!pending.current) setOpen(false);
          }}
        >
          <form
            aria-busy={busy}
            className="min-w-0 space-y-4 p-4 sm:p-5"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!valid || pending.current) return;
              pending.current = true;
              setBusy(true);
              setError("");
              try {
                await storeRequest(
                  `/api/commerce/admin/orders/${orderId}`,
                  "DELETE",
                  { confirmation: confirmation.trim(), reason: reason.trim() },
                );
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Não foi possível excluir o pedido.",
                );
                pending.current = false;
                setBusy(false);
                return;
              }
              setOpen(false);
              setDeleted(true);
              pending.current = false;
              setBusy(false);
              onDeleted?.();
              window.dispatchEvent(new Event("commerce:orders-updated"));
              if (redirectTo) router.push(redirectTo);
              router.refresh();
            }}
          >
            <header className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <ShieldAlert className="shrink-0 text-rose-300" size={20} />
                <h2 id={titleId} className="font-semibold">
                  Excluir pedido da gestão?
                </h2>
              </div>
              <button
                type="button"
                aria-label="Fechar confirmação de exclusão"
                disabled={busy}
                className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-md border border-zinc-700 disabled:opacity-40"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border-y border-zinc-800 py-3 text-sm">
              <dt className="text-zinc-400">Pedido</dt>
              <dd className="font-semibold">#{code}</dd>
              <dt className="min-w-0 break-words text-zinc-400">
                {customerName || "Cliente não informado"}
              </dt>
              <dd className="tabular-nums">{storeMoney(totalCents)}</dd>
            </dl>
            <p className="text-sm leading-6 text-zinc-300">
              O pedido sairá das listagens e dos alertas administrativos. Os
              dados financeiros, as artes e o histórico do cliente serão
              preservados.
            </p>
            <p className="border-l-2 border-amber-400 pl-3 text-sm leading-6 text-amber-200">
              Esta ação não cancela pagamentos, não realiza estornos e não
              cancela pedidos no ERP ou envios já contratados.
            </p>
            <fieldset disabled={busy} className="min-w-0 space-y-4">
              <label htmlFor={reasonId} className="grid gap-2 text-sm">
                Motivo da exclusão
                <textarea
                  id={reasonId}
                  required
                  minLength={5}
                  maxLength={500}
                  rows={3}
                  autoFocus
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="min-h-24 w-full min-w-0 resize-y rounded-md border border-zinc-700 bg-zinc-900 p-3"
                  placeholder="Ex.: pedido de teste ou compra duplicada"
                />
              </label>
              <div className="space-y-2">
                <p className="text-xs leading-5 text-zinc-400">
                  Para confirmar este pedido, digite{" "}
                  <code className="select-all font-semibold text-zinc-100">
                    {confirmationText}
                  </code>
                  .
                </p>
                <label htmlFor={confirmationId} className="grid gap-2 text-sm">
                  Confirmação de exclusão
                  <input
                    id={confirmationId}
                    required
                    maxLength={80}
                    autoComplete="off"
                    spellCheck={false}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    className="min-h-11 w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
                  />
                </label>
              </div>
            </fieldset>
            {error ? (
              <p
                role="alert"
                className="rounded-md border border-rose-400/25 bg-rose-400/10 p-3 text-sm leading-6 text-rose-200"
              >
                {error}
              </p>
            ) : null}
            <footer className="flex flex-col-reverse gap-2 border-t border-zinc-800 pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="focus-ring min-h-11 rounded-md border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900 disabled:opacity-40"
              >
                Manter pedido
              </button>
              <button
                type="submit"
                disabled={busy || !valid}
                className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-rose-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? (
                  <Loader2
                    size={16}
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <Trash2 size={16} />
                )}{" "}
                {busy ? "Excluindo…" : "Excluir da gestão"}
              </button>
            </footer>
          </form>
        </dialog>
      ) : null}
    </>
  );
}

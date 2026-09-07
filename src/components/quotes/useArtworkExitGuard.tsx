"use client";
import React, { useEffect, useState } from "react";
import { Save, Trash2, Undo2 } from "lucide-react";

export function useArtworkExitGuard({
  dirty,
  busy,
  save,
  discard,
}: {
  dirty: boolean;
  busy: boolean;
  save: () => Promise<boolean>;
  discard?: () => Promise<void>;
}) {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!dirty) return;
    function unload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);
  async function leave(shouldSave: boolean) {
    if (working || busy || !pending) return;
    setWorking(true);
    setError("");
    try {
      if (shouldSave && !(await save())) {
        setError(
          "Não foi possível salvar. Continue editando para conferir o erro e tentar novamente.",
        );
        return;
      }
      if (!shouldSave) await discard?.();
      pending();
      setPending(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível continuar.",
      );
    } finally {
      setWorking(false);
    }
  }
  return {
    request(action: () => void) {
      if (busy || working) return;
      if (dirty) {
        setError("");
        setPending(() => action);
      } else action();
    },
    prompt: pending ? (
      <div
        className="fixed inset-0 z-[150] grid place-items-center bg-black/85 p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="artwork-unsaved-title"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <section className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 p-5 text-zinc-200 shadow-2xl">
          <h2 id="artwork-unsaved-title" className="font-semibold text-white">
            Alterações pendentes
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Deseja salvar os ajustes antes de continuar?
          </p>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              disabled={working || busy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-cyan-400 px-3 py-2 text-sm font-semibold text-cyan-950 disabled:opacity-50"
              onClick={() => void leave(true)}
            >
              <Save size={16} /> Salvar e continuar
            </button>
            <button
              type="button"
              disabled={working || busy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => void leave(false)}
            >
              <Trash2 size={16} /> Descartar e continuar
            </button>
            <button
              autoFocus
              type="button"
              disabled={working || busy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 disabled:opacity-50"
              onClick={() => setPending(null)}
            >
              <Undo2 size={16} /> Continuar editando
            </button>
          </div>
        </section>
      </div>
    ) : null,
  };
}

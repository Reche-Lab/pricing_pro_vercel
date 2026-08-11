"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { isProductDeletionConfirmation } from "@/domain/products/products";

export function ProductDeleteButton({ variantId, productName, variantName }: { variantId: string; productName: string; variantName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const confirmed = isProductDeletionConfirmation(confirmation);

  function close() {
    if (loading) return;
    setOpen(false);
    setConfirmation("");
    setError("");
  }

  async function deleteProduct() {
    if (!confirmed) return;
    setLoading(true);
    setError("");
    const response = await fetch(`/api/products/${variantId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation })
    });
    const data = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok || !data?.ok) {
      setError(data?.error ?? "Não foi possível excluir o produto.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md border border-rose-400/30 bg-rose-400/10 px-3 text-sm font-medium text-rose-100 hover:bg-rose-400/20"
        title="Excluir produto"
        type="button"
        onClick={() => setOpen(true)}
      >
        <Trash2 size={15} />
        Excluir
      </button>

      {open ? <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
        <div className="my-auto w-full max-w-lg overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/60">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
            <div className="flex min-w-0 gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-rose-400/10 text-rose-300"><AlertTriangle size={19} /></span>
              <div><h3 className="font-semibold text-white">Excluir produto</h3><p className="mt-1 text-sm leading-5 text-zinc-500">Esta ação remove o produto das novas cotações e do precificador.</p></div>
            </div>
            <button aria-label="Fechar" className="focus-ring rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white" disabled={loading} type="button" onClick={close}><X size={18} /></button>
          </div>

          <div className="grid gap-4 p-5">
            <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
              <p className="font-medium text-white">{productName}</p>
              <p className="mt-1 text-sm text-zinc-500">Variante selecionada: {variantName}</p>
            </div>
            <p className="text-sm leading-6 text-zinc-300">Todas as variantes deste produto serão arquivadas. Orçamentos antigos continuarão preservados para consulta e auditoria.</p>
            <label><span className="mb-1.5 block text-sm font-medium text-zinc-300">Para confirmar, digite <strong className="text-rose-300">excluir</strong></span><input autoComplete="off" autoFocus className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white" placeholder="excluir" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
            {error ? <p className="rounded-md border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">{error}</p> : null}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-zinc-800 p-5 sm:flex-row sm:justify-end">
            <button className="focus-ring rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900" disabled={loading} type="button" onClick={close}>Manter produto</button>
            <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-rose-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-rose-300 disabled:cursor-not-allowed disabled:opacity-40" disabled={!confirmed || loading} type="button" onClick={deleteProduct}><Trash2 size={15} />{loading ? "Excluindo..." : "Excluir produto"}</button>
          </div>
        </div>
      </div> : null}
    </>
  );
}

"use client";

import { useRef, useState } from "react";
import { Search, X } from "lucide-react";

type OlistProduct = {
  id: string | null;
  nome: string | null;
  codigo: string | null;
  situacao: string | null;
  preco: string | number | null;
};

type LookupResult = {
  message?: string;
  products?: OlistProduct[];
  error?: string;
};

export function OlistProductLookupButton({
  skuFieldName = "sku",
  targetFieldName = "externalOlistProductId"
}: {
  skuFieldName?: string;
  targetFieldName?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const activeFormRef = useRef<HTMLFormElement | null>(null);

  async function lookup(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    activeFormRef.current = form;
    const sku = formValue(form, skuFieldName);
    if (!sku) {
      setResult({ error: "Preencha o SKU antes de pesquisar no Olist." });
      return;
    }

    setLoading(true);
    setResult(null);
    const response = await fetch("/api/olist/products/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sku })
    });
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok || !data?.ok) {
      setResult({ error: data?.error ?? "Não foi possível buscar o produto no Olist." });
      return;
    }

    setResult({ message: data.message, products: data.products ?? [] });
  }

  function useProduct(product: OlistProduct) {
    const field = activeFormRef.current?.elements.namedItem(targetFieldName);
    if (field instanceof HTMLInputElement && product.id) {
      const input = field;
      input.value = product.id;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setResult(null);
  }

  return (
    <>
      <button
        className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-60"
        disabled={loading}
        onClick={lookup}
        type="button"
      >
        <Search size={14} />
        {loading ? "Buscando..." : "Buscar ID por SKU"}
      </button>

      {result ? (
        <OlistProductLookupModal
          result={result}
          onClose={() => setResult(null)}
          onUse={useProduct}
        />
      ) : null}
    </>
  );
}

function OlistProductLookupModal({
  result,
  onClose,
  onUse
}: {
  result: LookupResult;
  onClose: () => void;
  onUse: (product: OlistProduct) => void;
}) {
  const products = result.products ?? [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Consulta Olist</p>
            <h3 className="mt-1 text-base font-semibold text-white">Produto por SKU</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {result.error ?? result.message ?? "Selecione o produto correto para preencher o ID Olist no cadastro."}
            </p>
          </div>
          <button
            className="focus-ring rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-3 p-5">
          {result.error ? (
            <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">{result.error}</p>
          ) : products.length ? (
            products.map((product, index) => (
              <div className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3 md:grid-cols-[1fr_auto]" key={`${product.id ?? "sem-id"}-${index}`}>
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-white">{product.nome ?? "Produto sem nome"}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-md bg-zinc-950 px-2 py-1 text-cyan-200">ID {product.id ?? "-"}</span>
                    <span className="rounded-md bg-zinc-950 px-2 py-1 text-zinc-300">SKU {product.codigo ?? "-"}</span>
                    {product.situacao ? <span className="rounded-md bg-zinc-950 px-2 py-1 text-zinc-300">Situação {product.situacao}</span> : null}
                    {product.preco !== null ? <span className="rounded-md bg-zinc-950 px-2 py-1 text-zinc-300">Preço {product.preco}</span> : null}
                  </div>
                </div>
                <button
                  className="focus-ring rounded-md bg-cyan-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-300 disabled:opacity-50"
                  disabled={!product.id}
                  onClick={() => onUse(product)}
                  type="button"
                >
                  Usar este ID
                </button>
              </div>
            ))
          ) : (
            <p className="rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
              Nenhum produto retornado. Confira se o SKU local corresponde ao campo Código do produto no Olist.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function formValue(form: HTMLFormElement | null, name: string) {
  const field = form?.elements.namedItem(name);
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
    return field.value.trim();
  }
  return "";
}

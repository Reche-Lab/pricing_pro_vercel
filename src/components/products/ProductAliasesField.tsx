"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Sparkles, X } from "lucide-react";
import {
  normalizeProductAliases,
  normalizeProductSearchTerm,
  type ProductAliasSource,
  type ProductSearchAlias
} from "@/domain/products/product-search";

type EditableAlias = { alias: string; source: ProductAliasSource };
const EMPTY_ALIASES: ProductSearchAlias[] = [];

export function ProductAliasesField({
  defaultAliases = EMPTY_ALIASES,
  resetKey = 0
}: {
  defaultAliases?: ProductSearchAlias[];
  resetKey?: number;
}) {
  const initialAliases = useMemo(
    () => defaultAliases.map((item) => ({ alias: item.alias, source: item.source })),
    [defaultAliases]
  );
  const [aliases, setAliases] = useState<EditableAlias[]>(initialAliases);
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setAliases(initialAliases);
    setDraft("");
    setSuggestions([]);
    setMessage("");
  }, [initialAliases, resetKey]);

  function addAlias(alias: string, source: ProductAliasSource = "manual") {
    const value = alias.trim().replace(/\s+/g, " ");
    if (value.length < 2) return;
    const normalized = normalizeProductSearchTerm(value);
    if (aliases.some((item) => normalizeProductSearchTerm(item.alias) === normalized)) {
      setMessage("Esse alias já está cadastrado em uma forma equivalente.");
      return;
    }
    setAliases((current) => [...current, { alias: value, source }].slice(0, 30));
    setSuggestions((current) => current.filter((suggestion) => normalizeProductSearchTerm(suggestion) !== normalized));
    setDraft("");
    setMessage("");
  }

  function removeAlias(index: number) {
    setAliases((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function requestSuggestions(event: React.MouseEvent<HTMLButtonElement>) {
    const formElement = event.currentTarget.closest("form");
    if (!formElement) return;
    const form = new FormData(formElement);
    setLoading(true);
    setMessage("");
    setSuggestions([]);
    const response = await fetch("/api/products/aliases/suggest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productName: form.get("productName"),
        variantName: form.get("variantName"),
        category: form.get("category"),
        description: form.get("description"),
        sku: form.get("sku"),
        currentAliases: aliases.map((item) => item.alias)
      })
    });
    const data = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      setMessage(data?.error ?? "Não foi possível gerar sugestões.");
      return;
    }
    const nextSuggestions = Array.isArray(data?.aliases) ? data.aliases.filter((item: unknown) => typeof item === "string") : [];
    setSuggestions(nextSuggestions);
    setMessage(nextSuggestions.length ? "Revise as sugestões antes de adicioná-las." : "Nenhuma sugestão nova foi encontrada.");
  }

  const serialized = JSON.stringify(normalizeProductAliases(aliases));

  return (
    <details className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50">
      <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-900/70">
        <span className="inline-flex min-w-0 items-center gap-2 font-medium">
          <Search className="shrink-0 text-cyan-300" size={16} />
          Aliases de busca
          {aliases.length ? <span className="rounded bg-cyan-400/10 px-1.5 py-0.5 text-xs text-cyan-200">{aliases.length}</span> : null}
        </span>
        <span className="text-xs text-zinc-500">Nomes alternativos</span>
      </summary>

      <div className="grid gap-3 border-t border-zinc-800 p-4">
        <div>
          <p className="text-xs leading-5 text-zinc-400">
            Cadastre formas como o cliente procura este produto, por exemplo “boton 35 mm” ou “broche 3,5 cm”.
            A API usa somente estes dados salvos e não chama IA durante as buscas.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="focus-ring min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            maxLength={120}
            placeholder="Digite um nome alternativo"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addAlias(draft);
              }
            }}
          />
          <button
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            disabled={draft.trim().length < 2 || aliases.length >= 30}
            type="button"
            onClick={() => addAlias(draft)}
          >
            <Plus size={15} />
            Adicionar
          </button>
          <button
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-violet-400/15 px-3 py-2 text-sm font-medium text-violet-200 hover:bg-violet-400/25 disabled:opacity-50"
            disabled={loading || aliases.length >= 30}
            type="button"
            onClick={requestSuggestions}
          >
            <Sparkles size={15} />
            {loading ? "Sugerindo..." : "Sugerir com IA"}
          </button>
        </div>

        {aliases.length ? (
          <div className="flex flex-wrap gap-2">
            {aliases.map((item, index) => (
              <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200" key={`${item.alias}-${index}`}>
                <span className="truncate">{item.alias}</span>
                {item.source === "ai" ? <Sparkles aria-label="Sugerido por IA" className="shrink-0 text-violet-300" size={11} /> : null}
                <button className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-white" title="Remover alias" type="button" onClick={() => removeAlias(index)}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {suggestions.length ? (
          <div className="rounded-md border border-violet-400/20 bg-violet-400/5 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-violet-100">Sugestões para revisar</p>
              <button className="text-xs font-medium text-violet-200 hover:text-white" type="button" onClick={() => suggestions.forEach((suggestion) => addAlias(suggestion, "ai"))}>
                Adicionar todas
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button className="rounded-md border border-violet-400/20 bg-zinc-950 px-2 py-1 text-xs text-violet-100 hover:border-violet-300/50" key={suggestion} type="button" onClick={() => addAlias(suggestion, "ai")}>
                  <Plus className="mr-1 inline" size={11} />
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {message ? <p className="text-xs text-zinc-400">{message}</p> : null}
        <input name="aliasesJson" type="hidden" value={serialized} readOnly />
      </div>
    </details>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";

export function ArtworkPdfPreview({ quoteId, onClose }: { quoteId: string; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");

  useEffect(() => {
    let objectUrl = "";
    void fetch(`/api/quotes/${quoteId}/production/pdf?preview=1`).then(async (response) => {
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Não foi possível montar a pré-visualização.");
      }
      objectUrl = URL.createObjectURL(await response.blob());
      setSummary(`${response.headers.get("x-production-pages") ?? "-"} página(s) · ${response.headers.get("x-production-copies") ?? "-"} cópias`);
      setUrl(objectUrl);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível montar a pré-visualização."));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [quoteId]);

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"><div className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950"><div className="flex items-center justify-between gap-4 border-b border-zinc-800 p-4"><div><h3 className="font-semibold text-white">Pré-visualização A4</h3><p className="text-xs text-zinc-500">{summary || "Montando páginas..."}</p></div><div className="flex gap-2"><a className={`focus-ring inline-flex items-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-950 ${url ? "" : "pointer-events-none opacity-50"}`} href={`/api/quotes/${quoteId}/production/pdf`}><Download size={15} /> Baixar</a><button className="focus-ring rounded-md p-2 text-zinc-400 hover:bg-zinc-900" type="button" onClick={onClose}><X size={18} /></button></div></div><div className="grid min-h-0 flex-1 place-items-center bg-zinc-900 p-2">{error ? <p className="max-w-lg rounded-md bg-red-400/10 p-4 text-sm text-red-300">{error}</p> : url ? <iframe className="h-full w-full rounded bg-white" src={url} title="Pré-visualização do PDF de produção" /> : <Loader2 className="animate-spin text-cyan-300" size={28} />}</div></div></div>;
}

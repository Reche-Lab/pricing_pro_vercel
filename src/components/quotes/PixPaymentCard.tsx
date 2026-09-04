"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { pixKeyTypeLabel, type PixPaymentSnapshot } from "@/domain/payments/pix";

export function PixPaymentCard({ snapshot, compact = false }: { snapshot: PixPaymentSnapshot; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(snapshot.key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`min-w-0 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.07] ${compact ? "p-3" : "p-4"}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-400/10 text-emerald-300">
          <KeyRound size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase text-emerald-200/70">Pagamento via Pix</p>
          <p className="mt-1 text-xs text-zinc-500">Chave {pixKeyTypeLabel(snapshot.keyType)}</p>
          <p className="mt-0.5 break-all font-mono text-sm font-semibold text-white">{snapshot.key}</p>
          {snapshot.beneficiaryName ? (
            <p className="mt-1 break-words text-xs text-zinc-400">Favorecido: {snapshot.beneficiaryName}</p>
          ) : null}
        </div>
        <button
          className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-400/20 text-emerald-200 hover:bg-emerald-400/10"
          title="Copiar chave Pix"
          type="button"
          onClick={copyKey}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
      {copied ? <p className="mt-2 text-xs text-emerald-300">Chave Pix copiada.</p> : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

export function PublicQuoteExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const expiresAtMs = new Date(expiresAt).getTime();
    const update = () => setRemainingMs(Math.max(0, expiresAtMs - Date.now()));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);

  const expired = remainingMs === 0;

  return (
    <div
      className={`mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
        expired
          ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
          : "border-amber-400/25 bg-amber-400/10 text-amber-100"
      }`}
      role="status"
    >
      <Clock3 aria-hidden="true" className="shrink-0" size={14} />
      <span>
        {remainingMs === null
          ? "Calculando validade do link..."
          : expired
            ? "Este link expirou. Solicite um novo link à empresa responsável."
            : <>Este link expira em <strong className="font-semibold text-white">{formatRemainingTime(remainingMs)}</strong>.</>}
      </span>
    </div>
  );
}

export function formatRemainingTime(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    days > 0 ? `${days}d` : null,
    `${String(hours).padStart(2, "0")}h`,
    `${String(minutes).padStart(2, "0")}min`,
    `${String(seconds).padStart(2, "0")}s`
  ].filter(Boolean).join(" ");
}

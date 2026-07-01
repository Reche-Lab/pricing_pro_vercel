"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CreditCard } from "lucide-react";
import type { BillingOverview } from "@/repositories/billing";

export function BillingStatusBanner() {
  const [billing, setBilling] = useState<BillingOverview | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/billing/overview")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active) setBilling(data?.billing ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const state = useMemo(() => {
    if (!billing) return null;
    const trialDays = daysUntil(billing.trial_ends_at);
    const periodDays = billing.current_period_end ? daysUntil(billing.current_period_end) : null;

    if (billing.billing_status === "blocked" || billing.billing_status === "past_due") {
      return {
        tone: "danger" as const,
        title: "Assinatura precisa de atenção",
        message: "Regularize a cobrança para liberar criação de orçamentos, produtos, clientes e configurações.",
        action: "Regularizar"
      };
    }

    if (billing.billing_status === "trial" && trialDays <= 5) {
      return {
        tone: "warning" as const,
        title: trialDays >= 0 ? `Trial termina em ${trialDays} dia${trialDays === 1 ? "" : "s"}` : "Trial expirado",
        message: "Ative a assinatura para manter o tenant operando sem interrupções.",
        action: "Ativar assinatura"
      };
    }

    if (billing.billing_status === "active" && periodDays !== null && periodDays <= 5) {
      return {
        tone: "warning" as const,
        title: periodDays >= 0 ? `Renovação em ${periodDays} dia${periodDays === 1 ? "" : "s"}` : "Período vencido",
        message: "Confira a cobrança para evitar interrupção no uso do sistema.",
        action: "Ver cobrança"
      };
    }

    return null;
  }, [billing]);

  if (!state) return null;

  return (
    <div
      className={
        state.tone === "danger"
          ? "mb-4 rounded-lg border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100"
          : "mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100"
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <span className="mt-0.5">{state.tone === "danger" ? <AlertTriangle size={18} /> : <CreditCard size={18} />}</span>
          <div>
            <p className="text-sm font-semibold">{state.title}</p>
            <p className="mt-1 text-sm opacity-85">{state.message}</p>
          </div>
        </div>
        <Link
          className="inline-flex w-fit items-center justify-center rounded-lg border border-current px-3 py-2 text-sm font-semibold transition-colors hover:bg-white/10"
          href="/billing"
        >
          {state.action}
        </Link>
      </div>
    </div>
  );
}

function daysUntil(value: string) {
  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.ceil((target - Date.now()) / 86_400_000);
}

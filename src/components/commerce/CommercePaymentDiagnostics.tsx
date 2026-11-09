"use client";
import React, { useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, Stethoscope } from "lucide-react";
import type { PaymentConnectionDiagnosis, PaymentEnvironment } from "@/domain/commerce/payment-settings";
import { storeRequest } from "./store-http";

export function CommercePaymentDiagnostics({ environment, configured, disabled }: { environment: PaymentEnvironment; configured: boolean; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<PaymentConnectionDiagnosis | null>(null);
  const [error, setError] = useState("");
  async function diagnose() {
    if (busy || disabled || !configured) return;
    setBusy(true); setReport(null); setError("");
    try { setReport(await storeRequest("/api/commerce/admin/payments/diagnostics", "POST", { environment })); }
    catch (error) { setError(error instanceof Error ? error.message : "Não foi possível concluir o diagnóstico."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Diagnóstico Mercado Pago" aria-busy={busy} className="min-w-0 space-y-3 border-t border-zinc-800 pt-4">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <h3 className="text-sm font-medium">Conexão · {environment === "test" ? "Teste" : "Produção"}</h3>
      <button type="button" disabled={disabled || !configured || busy} onClick={() => void diagnose()} title="Consulta a identidade do vendedor e o acesso de leitura à Orders API com as credenciais já salvas. Não cria pedidos nem cobranças." className="focus-ring inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-left text-sm transition hover:border-emerald-500 hover:bg-emerald-500/10 disabled:opacity-40">
        {busy ? <Loader2 size={17} className="shrink-0 animate-spin"/> : <Stethoscope size={17} className="shrink-0"/>}<span>{busy ? "Consultando conexão…" : "Diagnosticar conexão sem cobrança"}</span>
      </button>
    </div>
    <p className="text-xs leading-5 text-zinc-400">O checkout externo usa Produção nesta integração. Seu funcionamento não comprova o acesso do transparente em Teste. O diagnóstico usa somente credenciais salvas, sem mudar o ambiente ativo da loja.</p>
    {!configured ? <p className="text-xs text-amber-200">Cadastre e salve as credenciais deste ambiente primeiro.</p> : disabled ? <p className="text-xs text-amber-200">Salve as alterações antes de consultar a conexão.</p> : null}
    {error ? <p role="alert" className="break-words text-sm text-red-300">{error}</p> : null}
    {report && !disabled ? <div className="min-w-0 space-y-2" role="status">
      <ul className="min-w-0 divide-y divide-zinc-800">{report.checks.map(check => <li key={check.key} className="flex min-w-0 items-start gap-3 py-3">
        {check.outcome === "ok" ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400"/> : <CircleAlert size={18} className="mt-0.5 shrink-0 text-amber-300"/>}
        <div className="min-w-0 flex-1 space-y-2"><div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"><code>GET {check.endpoint}</code><span className={check.outcome === "ok" ? "text-emerald-300" : "text-amber-200"}>{check.httpStatus === null ? "Sem resposta HTTP" : `HTTP ${check.httpStatus}`}</span></div>
          <p className="text-xs leading-5 text-zinc-300">{check.message}</p>
          {check.code ? <p className="break-all text-xs text-zinc-400">Código: <code>{check.code}</code></p> : null}
          {check.supportReference ? <p className="text-xs leading-5 text-zinc-400">Referência para suporte: <code className="break-all text-zinc-200">{check.supportReference}</code></p> : null}
        </div>
      </li>)}</ul>
      <p className="text-xs leading-5 text-zinc-500">Uma consulta autorizada não comprova permissão para criar ou processar pagamentos. Nenhuma cobrança foi enviada pelo diagnóstico.</p>
    </div> : null}
  </section>;
}

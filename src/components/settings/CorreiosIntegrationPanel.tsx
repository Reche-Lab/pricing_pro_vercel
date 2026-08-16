"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Save, Truck } from "lucide-react";

type IntegrationState = {
  configured: boolean;
  active: boolean;
  status: string;
  apiBaseUrl: string;
  contract: string;
  sedexServiceCode: string;
  pacServiceCode: string;
  tokenTail: string | null;
};

type StatusMessage = {
  type: "success" | "error";
  text: string;
};

export function CorreiosIntegrationPanel() {
  const [integration, setIntegration] = useState<IntegrationState | null>(null);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadIntegration();
  }, []);

  async function loadIntegration() {
    setLoading(true);
    const response = await fetch("/api/integrations/correios");
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok || !data?.ok) {
      setMessage({ type: "error", text: "Não foi possível carregar a configuração dos Correios." });
      return;
    }
    setIntegration(data.integration);
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setMessage(null);
    setLoading(true);
    const form = new FormData(formElement);
    const response = await fetch("/api/integrations/correios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        active: form.get("active") === "on",
        apiBaseUrl: form.get("apiBaseUrl"),
        token: form.get("token"),
        contract: form.get("contract"),
        sedexServiceCode: form.get("sedexServiceCode"),
        pacServiceCode: form.get("pacServiceCode")
      })
    });
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok || !data?.ok) {
      setMessage({ type: "error", text: readableError(data?.error) });
      return;
    }

    setMessage({ type: "success", text: "Configuração dos Correios salva para este tenant." });
    const tokenInput = formElement.elements.namedItem("token");
    if (tokenInput instanceof HTMLInputElement) tokenInput.value = "";
    await loadIntegration();
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="text-sky-400" size={19} />
            <h2 className="font-semibold">API dos Correios</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-500">Credenciais e serviços de cotação configurados por tenant.</p>
        </div>
        <StatusBadge integration={integration} loading={loading} />
      </div>

      {integration ? (
        <form className="grid gap-5" onSubmit={saveSettings}>
          <label className="flex items-start gap-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
            <input className="mt-1 size-4 accent-sky-500" defaultChecked={integration.active} name="active" type="checkbox" />
            <span>
              <span className="block text-sm font-medium text-zinc-200">Ativar cotação pelos Correios</span>
              <span className="mt-0.5 block text-xs text-zinc-500">
                Quando ativa, PAC e SEDEX ficam disponíveis no precificador e na tela de frete.
              </span>
            </span>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              defaultValue={integration.apiBaseUrl}
              label="URL base da API"
              name="apiBaseUrl"
              required
              type="url"
            />
            <Input defaultValue={integration.contract} label="Número do contrato" name="contract" placeholder="Opcional" />
            <Input
              label={integration.configured ? "Token da API (deixe em branco para manter)" : "Token da API"}
              name="token"
              required={!integration.configured && integration.active}
              type="password"
            />
            <div className="flex items-end pb-2 text-xs text-zinc-500">
              <KeyRound className="mr-2 shrink-0 text-zinc-600" size={15} />
              {integration.tokenTail
                ? `Token criptografado salvo, final ${integration.tokenTail}.`
                : "Nenhum token está salvo para este tenant."}
            </div>
            <Input defaultValue={integration.sedexServiceCode} label="Código do serviço SEDEX" name="sedexServiceCode" required />
            <Input defaultValue={integration.pacServiceCode} label="Código do serviço PAC" name="pacServiceCode" required />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-4">
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              <Save size={16} />
              {loading ? "Salvando..." : "Salvar configuração"}
            </button>
            <span className="text-xs text-zinc-600">Os códigos padrão são 04162 (SEDEX) e 04669 (PAC).</span>
          </div>
        </form>
      ) : loading ? (
        <div className="h-40 animate-pulse rounded-md bg-zinc-950/50" />
      ) : null}

      {message ? (
        <p className={`mt-4 rounded-md px-3 py-2 text-sm ${message.type === "success" ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300"}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

function Input({
  defaultValue,
  label,
  name,
  placeholder,
  required = false,
  type = "text"
}: {
  defaultValue?: string;
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="focus-ring w-full min-w-0 rounded-md border border-zinc-700 px-3 py-2"
        defaultValue={defaultValue}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </label>
  );
}

function StatusBadge({ integration, loading }: { integration: IntegrationState | null; loading: boolean }) {
  if (loading && !integration) return <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">Carregando</span>;
  if (integration?.active && integration.configured) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
        <CheckCircle2 size={14} /> Ativo
      </span>
    );
  }
  if (integration?.configured) return <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">Desativado</span>;
  return <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-300">Não configurado</span>;
}

function readableError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "fieldErrors" in error) {
    const fieldErrors = (error as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    const first = fieldErrors ? Object.values(fieldErrors).flat()[0] : null;
    if (first) return first;
  }
  return "Não foi possível salvar a configuração dos Correios.";
}

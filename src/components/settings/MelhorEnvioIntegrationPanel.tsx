"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound, LinkIcon, Save } from "lucide-react";

type IntegrationState = {
  configured: boolean;
  connected: boolean;
  status: string;
  redirectUri: string;
  environment: "sandbox" | "production";
  clientIdTail?: string | null;
};

type StatusMessage = {
  type: "success" | "error" | "info";
  text: string;
};

export function MelhorEnvioIntegrationPanel({
  callbackStatus,
  callbackMessage
}: {
  callbackStatus?: string;
  callbackMessage?: string;
}) {
  const [integration, setIntegration] = useState<IntegrationState | null>(null);
  const [message, setMessage] = useState<StatusMessage | null>(callbackStatusMessage(callbackStatus, callbackMessage));
  const [loading, setLoading] = useState("");

  useEffect(() => {
    void loadIntegration();
  }, []);

  async function loadIntegration() {
    const response = await fetch("/api/integrations/melhor-envio");
    const data = await response.json().catch(() => null);
    if (response.ok && data?.ok) setIntegration(data.integration);
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setLoading("save");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/integrations/melhor-envio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        environment: form.get("environment"),
        clientId: form.get("clientId"),
        clientSecret: form.get("clientSecret"),
        userAgent: form.get("userAgent")
      })
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage({ type: "error", text: data?.error ?? "Nao foi possivel salvar a integracao." });
      return;
    }

    setMessage({ type: "success", text: "Credenciais salvas. Agora autorize o aplicativo." });
    await loadIntegration();
  }

  async function startAuthorization() {
    setMessage(null);
    setLoading("connect");
    const response = await fetch("/api/melhor-envio/auth-url");
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage({ type: "error", text: data?.error ?? "Nao foi possivel iniciar a autorizacao." });
      return;
    }

    window.location.href = data.authUrl;
  }

  async function refreshToken() {
    setMessage(null);
    setLoading("refresh");
    const response = await fetch("/api/melhor-envio/refresh-token", { method: "POST" });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage({ type: "error", text: data?.error ?? "Nao foi possivel renovar o token." });
      return;
    }

    setMessage({ type: "success", text: "Token renovado e salvo." });
    await loadIntegration();
  }

  async function copyCallback() {
    if (!integration?.redirectUri) return;
    await navigator.clipboard.writeText(integration.redirectUri);
    setMessage({ type: "info", text: "Callback copiado." });
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <LinkIcon className="text-brand" size={18} />
            <h2 className="font-semibold">Melhor Envio</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-500">OAuth por tenant, sem token manual no servidor.</p>
        </div>
        <StatusBadge integration={integration} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <form className="grid gap-4" onSubmit={saveSettings}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-700">Ambiente</span>
              <select
                className="focus-ring w-full rounded-md border border-zinc-300 px-3 py-2"
                defaultValue={integration?.environment ?? "sandbox"}
                name="environment"
              >
                <option value="sandbox">Sandbox</option>
                <option value="production">Producao</option>
              </select>
            </label>
            <Input label="User-Agent" name="userAgent" placeholder="Pricing Pro (email@dominio.com)" />
            <Input label="Client ID" name="clientId" required />
            <Input label="Client Secret" name="clientSecret" required type="password" />
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Callback cadastrado no app</span>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <input
                className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600"
                readOnly
                value={integration?.redirectUri ?? ""}
              />
              <button
                className="focus-ring rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                onClick={copyCallback}
                type="button"
              >
                Copiar
              </button>
            </div>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              disabled={loading === "save"}
              type="submit"
            >
              <Save size={16} />
              {loading === "save" ? "Salvando..." : "Salvar credenciais"}
            </button>
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              disabled={!integration?.configured || loading === "connect"}
              onClick={startAuthorization}
              type="button"
            >
              <ExternalLink size={16} />
              {loading === "connect" ? "Abrindo..." : "Autorizar aplicativo"}
            </button>
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              disabled={!integration?.connected || loading === "refresh"}
              onClick={refreshToken}
              type="button"
            >
              <KeyRound size={16} />
              {loading === "refresh" ? "Renovando..." : "Renovar token"}
            </button>
          </div>
        </form>

        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
          <p className="font-medium text-zinc-950">Checklist OAuth</p>
          <ul className="mt-3 grid gap-2">
            <li className="flex gap-2">
              <CheckCircle2 className={integration?.configured ? "text-emerald-600" : "text-zinc-300"} size={16} />
              Credenciais do aplicativo salvas
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className={integration?.connected ? "text-emerald-600" : "text-zinc-300"} size={16} />
              Tenant autorizado com token salvo
            </li>
          </ul>
          {integration?.clientIdTail ? (
            <p className="mt-3 text-xs text-zinc-500">Client ID final: ...{integration.clientIdTail}</p>
          ) : null}
        </div>
      </div>

      {message ? (
        <p className={`mt-4 rounded-md px-3 py-2 text-sm ${messageClassName(message.type)}`}>{message.text}</p>
      ) : null}
    </section>
  );
}

function StatusBadge({ integration }: { integration: IntegrationState | null }) {
  if (!integration) return <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600">Carregando</span>;
  if (integration.connected) {
    return <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">Conectado</span>;
  }
  if (integration.configured) {
    return <span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">Aguardando autorizacao</span>;
  }
  return <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600">Nao configurado</span>;
}

function Input({
  label,
  name,
  placeholder,
  required = false,
  type = "text"
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700">{label}</span>
      <input
        className="focus-ring w-full rounded-md border border-zinc-300 px-3 py-2"
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </label>
  );
}

function callbackStatusMessage(status?: string, callbackMessage?: string): StatusMessage | null {
  if (status === "connected") return { type: "success", text: "Melhor Envio conectado com sucesso." };
  if (status === "error") {
    return {
      type: "error",
      text: callbackMessage ? `Falha no OAuth: ${callbackMessage}` : "Falha no OAuth do Melhor Envio."
    };
  }
  return null;
}

function messageClassName(type: StatusMessage["type"]) {
  if (type === "success") return "bg-emerald-50 text-emerald-700";
  if (type === "error") return "bg-red-50 text-red-700";
  return "bg-zinc-50 text-zinc-600";
}

"use client";

import { useEffect, useState } from "react";
import { Save, Store } from "lucide-react";

type OlistConnectionView = {
  configured: boolean;
  connected: boolean;
  status: string;
  apiBaseUrl?: string;
  path?: string;
  authScheme?: "Bearer" | "Token" | "ApiKey";
  authHeader?: string;
};

type OlistIntegrations = {
  olist: OlistConnectionView;
  olistCrm: OlistConnectionView;
};

export function OlistIntegrationPanel() {
  const [integrations, setIntegrations] = useState<OlistIntegrations | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");

  useEffect(() => {
    void loadIntegrations();
  }, []);

  async function loadIntegrations() {
    const response = await fetch("/api/integrations/olist");
    const data = await response.json().catch(() => null);
    if (response.ok && data?.ok) setIntegrations(data.integrations);
  }

  async function save(event: React.FormEvent<HTMLFormElement>, provider: "olist" | "olist_crm") {
    event.preventDefault();
    setMessage("");
    setLoading(provider);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/integrations/olist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider,
        apiBaseUrl: form.get("apiBaseUrl"),
        path: form.get("path"),
        apiToken: form.get("apiToken"),
        authScheme: form.get("authScheme"),
        authHeader: form.get("authHeader")
      })
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage(data?.error ?? "Nao foi possivel salvar a integracao.");
      return;
    }

    setMessage("Integracao salva.");
    await loadIntegrations();
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="mb-5 flex items-center gap-2">
        <Store className="text-brand" size={18} />
        <h2 className="font-semibold">Olist e CRM</h2>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <IntegrationForm
          connection={integrations?.olist}
          loading={loading === "olist"}
          onSubmit={(event) => save(event, "olist")}
          pathLabel="Path para criar cliente"
          title="Olist clientes"
        />
        <IntegrationForm
          connection={integrations?.olistCrm}
          loading={loading === "olist_crm"}
          onSubmit={(event) => save(event, "olist_crm")}
          pathLabel="Path para enviar orçamento"
          title="CRM Olist"
        />
      </div>
      {message ? <p className="mt-4 rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-600">{message}</p> : null}
    </section>
  );
}

function IntegrationForm({
  title,
  pathLabel,
  connection,
  loading,
  onSubmit
}: {
  title: string;
  pathLabel: string;
  connection?: OlistConnectionView;
  loading: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="rounded-md border border-zinc-200 p-4" onSubmit={onSubmit}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-medium text-zinc-950">{title}</h3>
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            connection?.connected ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {connection?.connected ? "Configurado" : "Pendente"}
        </span>
      </div>
      <div className="grid gap-3">
        <Input defaultValue={connection?.apiBaseUrl} label="Base URL" name="apiBaseUrl" required type="url" />
        <Input defaultValue={connection?.path} label={pathLabel} name="path" placeholder="/api/..." required />
        <Input label="Token/API key" name="apiToken" required type="password" />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Auth scheme</span>
            <select
              className="focus-ring w-full rounded-md border border-zinc-300 px-3 py-2"
              defaultValue={connection?.authScheme ?? "Bearer"}
              name="authScheme"
            >
              <option value="Bearer">Bearer</option>
              <option value="Token">Token</option>
              <option value="ApiKey">ApiKey</option>
            </select>
          </label>
          <Input defaultValue={connection?.authHeader ?? "authorization"} label="Auth header" name="authHeader" />
        </div>
      </div>
      <button
        className="focus-ring mt-4 inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        disabled={loading}
        type="submit"
      >
        <Save size={16} />
        {loading ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}

function Input({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
  placeholder
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700">{label}</span>
      <input
        className="focus-ring w-full rounded-md border border-zinc-300 px-3 py-2"
        defaultValue={defaultValue ?? ""}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </label>
  );
}

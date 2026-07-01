"use client";

import { useEffect, useState } from "react";
import { KeyRound, Route, Save, Store } from "lucide-react";
import { OLIST_API_V3_BASE_URL, OLIST_APP_BASE_URL, OLIST_DEFAULT_PATHS } from "@/services/olist/defaults";

type OlistConnectionView = {
  configured: boolean;
  connected: boolean;
  status: string;
  apiBaseUrl?: string;
  path?: string;
  customerLookupPath?: string;
  salesOrderPath?: string;
  invoicePath?: string;
  invoiceEmitPath?: string;
  userPath?: string;
  taskPath?: string;
  authScheme?: "Bearer" | "Token" | "ApiKey";
  authHeader?: string;
  appBaseUrl?: string;
  authorizePath?: string;
  tokenPath?: string;
  clientId?: string;
  scopes?: string;
  apiVersion?: "v3";
};

type OlistIntegrations = {
  olist: OlistConnectionView;
  olistCrm: OlistConnectionView;
};

export function OlistIntegrationPanel() {
  const [integrations, setIntegrations] = useState<OlistIntegrations | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");

  useEffect(() => {
    setCallbackUrl(`${window.location.origin}/api/olist/oauth/callback`);
    const params = new URLSearchParams(window.location.search);
    if (params.get("olist") === "connected") setMessage("OAuth Olist conectado.");
    if (params.get("olist") === "error") setMessage(params.get("message") ?? "Erro no OAuth Olist.");
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
        appBaseUrl: form.get("appBaseUrl"),
        authorizePath: form.get("authorizePath"),
        tokenPath: form.get("tokenPath"),
        path: form.get("path"),
        customerLookupPath: form.get("customerLookupPath") ?? "",
        salesOrderPath: form.get("salesOrderPath") ?? "",
        invoicePath: form.get("invoicePath") ?? "",
        invoiceEmitPath: form.get("invoiceEmitPath") ?? "",
        userPath: form.get("userPath") ?? "",
        taskPath: form.get("taskPath") ?? "",
        clientId: form.get("clientId"),
        clientSecret: form.get("clientSecret"),
        scopes: form.get("scopes"),
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

  async function connect(provider: "olist" | "olist_crm") {
    setMessage("");
    setLoading(`${provider}_oauth`);
    const response = await fetch(`/api/olist/auth-url?provider=${provider}`);
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.authUrl) {
      setMessage(data?.error ?? "Não foi possível iniciar OAuth Olist.");
      return;
    }

    window.location.href = data.authUrl;
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="mb-5 flex items-center gap-2">
        <Store className="text-amber-400" size={18} />
        <h2 className="font-semibold">Olist e CRM</h2>
      </div>
      <div className="mb-5 rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-3 text-sm text-cyan-100">
        <p className="font-medium">URL para cadastrar no app OAuth da Olist</p>
        <p className="mt-1 break-all text-cyan-100/85">
          {callbackUrl}
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <IntegrationForm
          connection={integrations?.olist}
          loading={loading === "olist"}
          oauthLoading={loading === "olist_oauth"}
          onConnect={() => connect("olist")}
          onSubmit={(event) => save(event, "olist")}
          pathLabel="Path para criar cliente"
          type="olist"
          defaultPath={OLIST_DEFAULT_PATHS.customer}
          title="Olist clientes"
        />
        <IntegrationForm
          connection={integrations?.olistCrm}
          loading={loading === "olist_crm"}
          oauthLoading={loading === "olist_crm_oauth"}
          onConnect={() => connect("olist_crm")}
          onSubmit={(event) => save(event, "olist_crm")}
          pathLabel="Path para enviar orçamento"
          type="olist_crm"
          defaultPath={OLIST_DEFAULT_PATHS.crmQuote}
          title="CRM Olist"
        />
      </div>
      {message ? <p className="mt-4 rounded-md bg-zinc-950/60 px-3 py-2 text-sm text-zinc-400">{message}</p> : null}
    </section>
  );
}

function IntegrationForm({
  title,
  pathLabel,
  type,
  defaultPath,
  connection,
  loading,
  oauthLoading,
  onConnect,
  onSubmit
}: {
  title: string;
  pathLabel: string;
  type: "olist" | "olist_crm";
  defaultPath: string;
  connection?: OlistConnectionView;
  loading: boolean;
  oauthLoading: boolean;
  onConnect: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="rounded-md border border-zinc-800 p-4" onSubmit={onSubmit}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-medium text-white">{title}</h3>
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            connection?.connected ? "bg-emerald-400/10 text-emerald-300" : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {connection?.connected ? "OAuth conectado" : "Pendente"}
        </span>
      </div>
      <div className="grid gap-3">
        <Input defaultValue={connection?.apiBaseUrl ?? OLIST_API_V3_BASE_URL} label="Base URL API v3" name="apiBaseUrl" required type="url" />
        <Input defaultValue={connection?.appBaseUrl ?? OLIST_APP_BASE_URL} label="Base URL autorização" name="appBaseUrl" required type="url" />
        <div className="grid gap-3 md:grid-cols-2">
          <Input defaultValue={connection?.authorizePath ?? OLIST_DEFAULT_PATHS.authorize} label="Authorize path" name="authorizePath" required />
          <Input defaultValue={connection?.tokenPath ?? OLIST_DEFAULT_PATHS.token} label="Token path" name="tokenPath" required />
        </div>
        <Input defaultValue={connection?.clientId ?? ""} label="Client ID" name="clientId" required />
        <Input label="Client Secret" name="clientSecret" required type="password" />
        <Input defaultValue={connection?.scopes ?? ""} label="Scopes OAuth" name="scopes" placeholder="customers quotes" />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-300">Auth scheme</span>
            <select
              className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
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
        <details className="rounded-md border border-zinc-800 bg-zinc-950/50">
          <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900/80">
            <span className="inline-flex items-center gap-2">
              <Route size={16} className="text-cyan-300" />
              Endpoints avançados
            </span>
            <span className="text-xs font-normal text-zinc-500">recolhido por padrão</span>
          </summary>
          <div className="grid gap-3 border-t border-zinc-800 p-3">
            <p className="text-xs leading-5 text-zinc-500">
              Mantenha os padrões da API v3, a menos que a Olist/Tiny informe endpoints específicos para o seu app.
            </p>
            <Input defaultValue={connection?.path || defaultPath} label={pathLabel} name="path" placeholder="/api/..." required />
            {type === "olist" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Input defaultValue={connection?.customerLookupPath ?? OLIST_DEFAULT_PATHS.customerLookup} label="Path consulta cliente" name="customerLookupPath" placeholder="/contatos" />
                <Input defaultValue={connection?.salesOrderPath ?? OLIST_DEFAULT_PATHS.salesOrder} label="Path pedido de venda" name="salesOrderPath" placeholder="/pedidos" />
                <Input defaultValue={connection?.invoicePath ?? OLIST_DEFAULT_PATHS.invoice} label="Path gerar nota" name="invoicePath" placeholder="/pedidos/{idPedido}/gerar-nota-fiscal" />
                <Input defaultValue={connection?.invoiceEmitPath ?? OLIST_DEFAULT_PATHS.invoiceEmit} label="Path autorizar nota" name="invoiceEmitPath" placeholder="/notas/{idNota}/emitir" />
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <Input defaultValue={connection?.userPath ?? OLIST_DEFAULT_PATHS.users} label="Path usuários" name="userPath" placeholder="/usuarios" />
                <Input defaultValue={connection?.taskPath ?? OLIST_DEFAULT_PATHS.crmTask} label="Path tarefas/agenda" name="taskPath" placeholder="/crm/assuntos/{idAssunto}/acoes" />
              </div>
            )}
          </div>
        </details>
      </div>
      <button
        className="focus-ring mt-4 inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        disabled={loading}
        type="submit"
      >
        <Save size={16} />
        {loading ? "Salvando..." : "Salvar"}
      </button>
      <button
        className="focus-ring ml-2 mt-4 inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-60"
        disabled={oauthLoading}
        type="button"
        onClick={onConnect}
      >
        <KeyRound size={16} />
        {oauthLoading ? "Conectando..." : "Conectar OAuth"}
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
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
        defaultValue={defaultValue ?? ""}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </label>
  );
}

"use client";

import { useEffect, useState } from "react";
import { KeyRound, PlayCircle, Route, Save, Store } from "lucide-react";
import { OLIST_API_V3_BASE_URL, OLIST_APP_BASE_URL, OLIST_DEFAULT_PATHS } from "@/services/olist/defaults";

type OlistConnectionView = {
  configured: boolean;
  connected: boolean;
  status: string;
  apiBaseUrl?: string;
  path?: string;
  quotePath?: string;
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

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading("olist");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/integrations/olist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        apiBaseUrl: form.get("apiBaseUrl"),
        appBaseUrl: form.get("appBaseUrl"),
        authorizePath: form.get("authorizePath"),
        tokenPath: form.get("tokenPath"),
        path: form.get("path"),
        quotePath: form.get("quotePath") ?? "",
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

  async function connect() {
    setMessage("");
    setLoading("olist_oauth");
    const response = await fetch("/api/olist/auth-url");
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
      <div>
        <IntegrationForm
          connection={integrations?.olist}
          loading={loading === "olist"}
          oauthLoading={loading === "olist_oauth"}
          onConnect={connect}
          onSubmit={save}
          title="Olist API v3"
        />
      </div>
      <OlistApiTestLab connected={Boolean(integrations?.olist?.connected)} />
      {message ? <p className="mt-4 rounded-md bg-zinc-950/60 px-3 py-2 text-sm text-zinc-400">{message}</p> : null}
    </section>
  );
}

type TestPreset = {
  key: string;
  label: string;
  description: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
};

const TEST_PRESETS: TestPreset[] = [
  {
    key: "customers-list",
    label: "Listar clientes",
    description: "GET /contatos com paginação curta para validar leitura de clientes.",
    method: "GET",
    path: "/contatos",
    query: { situacao: "B", limit: 5, offset: 0 }
  },
  {
    key: "customers-cpf",
    label: "Consultar cliente por CPF/CNPJ",
    description: "Troque o CPF/CNPJ no JSON de query antes de executar.",
    method: "GET",
    path: "/contatos",
    query: { cpfCnpj: "00000000000", limit: 1, offset: 0 }
  },
  {
    key: "customers-create",
    label: "Criar cliente teste",
    description: "POST /contatos com payload mínimo. Use dados reais apenas quando quiser criar de fato.",
    method: "POST",
    path: "/contatos",
    body: {
      nome: "Cliente Teste API",
      tipoPessoa: "F",
      cpfCnpj: "00000000000",
      email: "cliente.teste@example.com",
      celular: "11999999999",
      situacao: "B"
    }
  },
  {
    key: "orders-create",
    label: "Criar pedido",
    description: "Exige idContato e produto.id numéricos existentes no Olist/Tiny.",
    method: "POST",
    path: "/pedidos",
    body: {
      idContato: 123,
      data: "2026-07-02",
      observacoes: "Pedido teste criado pelo Pricing Pro",
      itens: [{ produto: { id: 123, tipo: "P" }, quantidade: 1, valorUnitario: 10 }]
    }
  },
  {
    key: "invoice-create",
    label: "Gerar nota do pedido",
    description: "Troque {idPedido} pelo ID numérico do pedido Olist.",
    method: "POST",
    path: "/pedidos/{idPedido}/gerar-nota-fiscal",
    body: { modelo: 55 }
  },
  {
    key: "invoice-emit",
    label: "Autorizar nota",
    description: "Troque {idNota} pelo ID numérico da nota Olist.",
    method: "POST",
    path: "/notas/{idNota}/emitir",
    body: { enviarEmail: true }
  },
  {
    key: "crm-subject",
    label: "Criar assunto CRM",
    description: "Exige idContato numérico existente.",
    method: "POST",
    path: "/crm/assuntos",
    body: { idContato: 123, descricao: "Orçamento teste Pricing Pro", data: "2026-07-02" }
  },
  {
    key: "crm-task",
    label: "Criar tarefa CRM",
    description: "Troque {idAssunto} pelo ID do assunto CRM.",
    method: "POST",
    path: "/crm/assuntos/{idAssunto}/acoes",
    body: { descricao: "Retornar orçamento ao cliente", tipoData: "Q" }
  },
  {
    key: "users-list",
    label: "Listar usuários",
    description: "Valida se o token tem acesso ao recurso de usuários.",
    method: "GET",
    path: "/usuarios",
    query: { limit: 5, offset: 0 }
  },
  {
    key: "sellers-list",
    label: "Listar vendedores",
    description: "Valida se o token tem acesso ao recurso de vendedores.",
    method: "GET",
    path: "/vendedores",
    query: { limit: 5, offset: 0 }
  }
];

function OlistApiTestLab({ connected }: { connected: boolean }) {
  const [selectedKey, setSelectedKey] = useState(TEST_PRESETS[0].key);
  const [method, setMethod] = useState<TestPreset["method"]>(TEST_PRESETS[0].method);
  const [path, setPath] = useState(TEST_PRESETS[0].path);
  const [queryText, setQueryText] = useState(formatJson(TEST_PRESETS[0].query ?? {}));
  const [bodyText, setBodyText] = useState(formatJson(TEST_PRESETS[0].body ?? {}));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [message, setMessage] = useState("");

  function selectPreset(key: string) {
    const preset = TEST_PRESETS.find((item) => item.key === key);
    if (!preset) return;
    setSelectedKey(key);
    setMethod(preset.method);
    setPath(preset.path);
    setQueryText(formatJson(preset.query ?? {}));
    setBodyText(formatJson(preset.body ?? {}));
    setMessage("");
    setResult(null);
  }

  async function runTest() {
    setMessage("");
    setResult(null);
    const query = parseJsonObject(queryText, "Query JSON");
    if ("error" in query) {
      setMessage(query.error);
      return;
    }
    const body = parseJsonObject(bodyText, "Body JSON");
    if ("error" in body) {
      setMessage(body.error);
      return;
    }

    if (!window.confirm(`Executar ${method} ${path} na API Olist/Tiny deste tenant?`)) return;

    setLoading(true);
    const response = await fetch("/api/olist/test-call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        method,
        path,
        query: query.value,
        body: method === "GET" ? undefined : body.value
      })
    });
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok || !data?.ok) {
      setMessage(data?.debugId ? `${data?.error ?? "Falha no teste Olist."} Debug: ${data.debugId}` : data?.error ?? "Falha no teste Olist.");
      setResult(data);
      return;
    }

    setMessage(data.call?.message ?? "Teste executado.");
    setResult(data);
  }

  return (
    <div className="mt-5 rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-medium text-white">Ambiente de testes da API Olist</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Execute chamadas isoladas usando o OAuth salvo para este tenant. O retorno aparece humanizado e com JSON bruto para diagnóstico.
          </p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs ${connected ? "bg-emerald-400/10 text-emerald-300" : "bg-zinc-800 text-zinc-400"}`}>
          {connected ? "Pronto para testar" : "Conecte o OAuth primeiro"}
        </span>
      </div>
      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <div className="grid gap-2">
          {TEST_PRESETS.map((preset) => (
            <button
              className={`focus-ring rounded-md border px-3 py-2 text-left text-sm transition ${
                selectedKey === preset.key
                  ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"
                  : "border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900"
              }`}
              key={preset.key}
              onClick={() => selectPreset(preset.key)}
              type="button"
            >
              <span className="block font-medium">{preset.label}</span>
              <span className="mt-1 block text-xs text-zinc-500">{preset.description}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-[160px_1fr]">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-300">Método</span>
              <select
                className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
                onChange={(event) => setMethod(event.currentTarget.value as TestPreset["method"])}
                value={method}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-300">Path</span>
              <input
                className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
                onChange={(event) => setPath(event.currentTarget.value)}
                value={path}
              />
            </label>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <JsonEditor label="Query JSON" value={queryText} onChange={setQueryText} />
            <JsonEditor label="Body JSON" value={bodyText} onChange={setBodyText} />
          </div>
          <button
            className="focus-ring inline-flex w-fit items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-60"
            disabled={!connected || loading}
            onClick={runTest}
            type="button"
          >
            <PlayCircle size={16} />
            {loading ? "Testando..." : "Executar teste"}
          </button>
          {message ? <p className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">{message}</p> : null}
          {result ? (
            <pre className="max-h-[420px] overflow-auto rounded-md border border-zinc-800 bg-black/40 p-3 text-xs leading-5 text-zinc-300">
              {formatJson(result)}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function JsonEditor({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <textarea
        className="focus-ring min-h-40 w-full rounded-md border border-zinc-700 px-3 py-2 font-mono text-xs"
        onChange={(event) => onChange(event.currentTarget.value)}
        spellCheck={false}
        value={value}
      />
    </label>
  );
}

function parseJsonObject(value: string, label: string): { value: Record<string, unknown> } | { error: string } {
  if (!value.trim()) return { value: {} };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: `${label} precisa ser um objeto JSON.` };
    }
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { error: `${label} inválido. Confira vírgulas, aspas e chaves.` };
  }
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function IntegrationForm({
  title,
  connection,
  loading,
  oauthLoading,
  onConnect,
  onSubmit
}: {
  title: string;
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
        <Input defaultValue={connection?.scopes ?? "openid"} label="Scopes OAuth" name="scopes" placeholder="openid" />
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
            <div className="grid gap-3 md:grid-cols-2">
              <Input defaultValue={connection?.path || OLIST_DEFAULT_PATHS.customer} label="Path criar cliente" name="path" placeholder="/contatos" required />
              <Input defaultValue={connection?.customerLookupPath ?? OLIST_DEFAULT_PATHS.customerLookup} label="Path consulta cliente" name="customerLookupPath" placeholder="/contatos" />
              <Input defaultValue={connection?.quotePath ?? OLIST_DEFAULT_PATHS.crmQuote} label="Path assunto CRM" name="quotePath" placeholder="/crm/assuntos" />
              <Input defaultValue={connection?.taskPath ?? OLIST_DEFAULT_PATHS.crmTask} label="Path tarefas/agenda" name="taskPath" placeholder="/crm/assuntos/{idAssunto}/acoes" />
              <Input defaultValue={connection?.salesOrderPath ?? OLIST_DEFAULT_PATHS.salesOrder} label="Path pedido de venda" name="salesOrderPath" placeholder="/pedidos" />
              <Input defaultValue={connection?.invoicePath ?? OLIST_DEFAULT_PATHS.invoice} label="Path gerar nota" name="invoicePath" placeholder="/pedidos/{idPedido}/gerar-nota-fiscal" />
              <Input defaultValue={connection?.invoiceEmitPath ?? OLIST_DEFAULT_PATHS.invoiceEmit} label="Path autorizar nota" name="invoiceEmitPath" placeholder="/notas/{idNota}/emitir" />
              <Input defaultValue={connection?.userPath ?? OLIST_DEFAULT_PATHS.users} label="Path usuários/vendedores" name="userPath" placeholder="/usuarios" />
            </div>
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

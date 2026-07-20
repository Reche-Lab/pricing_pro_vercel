"use client";

import { useEffect, useState } from "react";
import { CreditCard, KeyRound, PlayCircle, Route, Save, Store, X } from "lucide-react";
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
  invoiceCancelPath?: string;
  userPath?: string;
  taskPath?: string;
  authScheme?: "Bearer" | "Token" | "ApiKey";
  authHeader?: string;
  defaultPaymentCategoryExternalId?: string;
  defaultPaymentCategoryName?: string;
  appBaseUrl?: string;
  authorizePath?: string;
  tokenPath?: string;
  clientId?: string;
  scopes?: string;
  apiVersion?: "v3";
};

type OlistPaymentOptionView = {
  kind: "payment_method" | "receiving_method" | "category";
  externalId: string;
  name: string;
  groupName: string | null;
};

type OlistIntegrations = {
  olist: OlistConnectionView;
};

export function OlistIntegrationPanel() {
  const [integrations, setIntegrations] = useState<OlistIntegrations | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [paymentOptions, setPaymentOptions] = useState<OlistPaymentOptionView[]>([]);

  useEffect(() => {
    setCallbackUrl(`${window.location.origin}/api/olist/oauth/callback`);
    const params = new URLSearchParams(window.location.search);
    if (params.get("olist") === "connected") setMessage("OAuth Olist conectado.");
    if (params.get("olist") === "error") setMessage(params.get("message") ?? "Erro no OAuth Olist.");
    void loadIntegrations();
    void loadPaymentOptions();
  }, []);

  async function loadIntegrations() {
    const response = await fetch("/api/integrations/olist");
    const data = await response.json().catch(() => null);
    if (response.ok && data?.ok) setIntegrations(data.integrations);
  }

  async function loadPaymentOptions() {
    const response = await fetch("/api/olist/payment-options");
    const data = await response.json().catch(() => null);
    if (response.ok && data?.ok) {
      setPaymentOptions((data.options ?? []).map((option: Record<string, unknown>) => ({
        kind: option.kind,
        externalId: option.external_id,
        name: option.name,
        groupName: option.group_name ?? null
      })).filter((option: OlistPaymentOptionView) => option.kind && option.externalId && option.name));
    }
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
        invoiceCancelPath: form.get("invoiceCancelPath") ?? "",
        userPath: form.get("userPath") ?? "",
        taskPath: form.get("taskPath") ?? "",
        clientId: form.get("clientId"),
        clientSecret: form.get("clientSecret"),
        scopes: form.get("scopes"),
        authScheme: form.get("authScheme"),
        authHeader: form.get("authHeader"),
        defaultPaymentCategoryExternalId: form.get("defaultPaymentCategoryExternalId") ?? "",
        defaultPaymentCategoryName: selectedOptionName(paymentOptions, String(form.get("defaultPaymentCategoryExternalId") ?? ""))
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

  async function syncPaymentOptions() {
    setMessage("");
    setLoading("olist_payments");
    const response = await fetch("/api/olist/payment-options/sync", { method: "POST" });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage(data?.error ?? "Não foi possível sincronizar formas de pagamento do Olist.");
      return;
    }

    setMessage(
      `Opções financeiras sincronizadas: ${data.counts?.paymentMethods ?? 0} formas de pagamento, ${data.counts?.receivingMethods ?? 0} formas de recebimento.`
    );
    await loadPaymentOptions();
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
          onSyncPaymentOptions={syncPaymentOptions}
          onSubmit={save}
          paymentSyncLoading={loading === "olist_payments"}
          paymentOptions={paymentOptions}
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
  searchFields?: SearchField[];
};

type SearchField = {
  key: string;
  label: string;
  placeholder: string;
  target: "query" | "path" | "body";
  parameter: string;
  normalize?: "digits" | "number" | "text";
  bodyPath?: Array<string | number>;
};

type PreparedOlistTestRequest = {
  method: TestPreset["method"];
  path: string;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  presetLabel: string;
  searchLabel?: string;
  searchValue?: string;
};

const TEST_PRESETS: TestPreset[] = [
  {
    key: "customers-list",
    label: "Listar clientes",
    description: "GET /contatos com paginação curta para validar leitura de clientes.",
    method: "GET",
    path: "/contatos",
    query: { limit: 5, offset: 0 },
    searchFields: [
      { key: "nome", label: "Nome", placeholder: "Ex.: Angelita", target: "query", parameter: "nome" },
      { key: "cpfCnpj", label: "CPF/CNPJ", placeholder: "Somente números ou formatado", target: "query", parameter: "cpfCnpj", normalize: "digits" },
      { key: "celular", label: "Celular", placeholder: "Ex.: 11999999999", target: "query", parameter: "celular", normalize: "digits" },
      { key: "codigo", label: "Código", placeholder: "Código exato do contato", target: "query", parameter: "codigo" },
      { key: "idVendedor", label: "ID vendedor", placeholder: "ID numérico do vendedor", target: "query", parameter: "idVendedor", normalize: "number" }
    ]
  },
  {
    key: "customers-cpf",
    label: "Consultar cliente",
    description: "Escolha nome, CPF/CNPJ, telefone ou código e informe um valor conhecido.",
    method: "GET",
    path: "/contatos",
    query: { limit: 5, offset: 0 },
    searchFields: [
      { key: "nome", label: "Nome", placeholder: "Ex.: Angelita", target: "query", parameter: "nome" },
      { key: "cpfCnpj", label: "CPF/CNPJ", placeholder: "Ex.: 00000000000", target: "query", parameter: "cpfCnpj", normalize: "digits" },
      { key: "celular", label: "Telefone/celular", placeholder: "Ex.: 11999999999", target: "query", parameter: "celular", normalize: "digits" },
      { key: "codigo", label: "Código", placeholder: "Código exato do contato", target: "query", parameter: "codigo" }
    ]
  },
  {
    key: "orders-list",
    label: "Listar pedidos",
    description: "Consulta pedidos por número, cliente, CPF/CNPJ, vendedor ou número de e-commerce.",
    method: "GET",
    path: "/pedidos",
    query: { limit: 5, offset: 0 },
    searchFields: [
      { key: "numero", label: "Número do pedido", placeholder: "Ex.: 1234", target: "query", parameter: "numero", normalize: "number" },
      { key: "nomeCliente", label: "Nome do cliente", placeholder: "Ex.: Angelita", target: "query", parameter: "nomeCliente" },
      { key: "cpfCnpj", label: "CPF/CNPJ", placeholder: "Documento do cliente", target: "query", parameter: "cpfCnpj", normalize: "digits" },
      { key: "codigoCliente", label: "Código cliente", placeholder: "Código do cliente", target: "query", parameter: "codigoCliente" },
      { key: "numeroPedidoEcommerce", label: "Pedido e-commerce", placeholder: "Número externo/e-commerce", target: "query", parameter: "numeroPedidoEcommerce" },
      { key: "idVendedor", label: "ID vendedor", placeholder: "ID numérico", target: "query", parameter: "idVendedor", normalize: "number" },
      { key: "situacao", label: "Situação", placeholder: "Ex.: aberto, aprovado, faturado", target: "query", parameter: "situacao" },
      { key: "origemPedido", label: "Origem", placeholder: "Origem do pedido", target: "query", parameter: "origemPedido" }
    ]
  },
  {
    key: "invoices-list",
    label: "Listar notas",
    description: "Consulta notas fiscais por número, CPF/CNPJ, venda, vendedor ou pedido e-commerce.",
    method: "GET",
    path: "/notas",
    query: { limit: 5, offset: 0 },
    searchFields: [
      { key: "numero", label: "Número da nota", placeholder: "Ex.: 123", target: "query", parameter: "numero", normalize: "number" },
      { key: "cpfCnpj", label: "CPF/CNPJ", placeholder: "Documento do cliente", target: "query", parameter: "cpfCnpj", normalize: "digits" },
      { key: "idVenda", label: "ID venda/pedido", placeholder: "ID numérico da venda", target: "query", parameter: "idVenda", normalize: "number" },
      { key: "idVendedor", label: "ID vendedor", placeholder: "ID numérico", target: "query", parameter: "idVendedor", normalize: "number" },
      { key: "numeroPedidoEcommerce", label: "Pedido e-commerce", placeholder: "Número externo/e-commerce", target: "query", parameter: "numeroPedidoEcommerce" },
      { key: "tipo", label: "Tipo", placeholder: "Tipo da nota fiscal", target: "query", parameter: "tipo" },
      { key: "situacao", label: "Situação", placeholder: "Situação da nota", target: "query", parameter: "situacao" },
      { key: "idFormaEnvio", label: "ID forma envio", placeholder: "ID numérico da forma de envio", target: "query", parameter: "idFormaEnvio", normalize: "number" }
    ]
  },
  {
    key: "crm-subjects-list",
    label: "Listar assuntos CRM",
    description: "Pesquisa assuntos CRM por cliente, contato, texto do assunto ou usuário responsável.",
    method: "GET",
    path: "/crm/assuntos",
    query: { limit: 5, offset: 0 },
    searchFields: [
      { key: "nomeCliente", label: "Nome do cliente", placeholder: "Ex.: Angelita", target: "query", parameter: "nomeCliente" },
      { key: "idContato", label: "ID contato", placeholder: "ID numérico do contato", target: "query", parameter: "idContato", normalize: "number" },
      { key: "assunto", label: "Texto do assunto", placeholder: "Trecho do assunto", target: "query", parameter: "assunto" },
      { key: "idUsuarioResponsavel", label: "ID responsável", placeholder: "ID do usuário responsável", target: "query", parameter: "idUsuarioResponsavel", normalize: "number" },
      { key: "situacao", label: "Situação", placeholder: "Situação do assunto", target: "query", parameter: "situacao" },
      { key: "statusCrm", label: "Status CRM", placeholder: "Status CRM", target: "query", parameter: "statusCrm" },
      { key: "idEstagio", label: "ID estágio", placeholder: "ID numérico do estágio", target: "query", parameter: "idEstagio", normalize: "number" }
    ]
  },
  {
    key: "products-list",
    label: "Listar produtos",
    description: "Consulta produtos por nome, código, GTIN ou situação.",
    method: "GET",
    path: "/produtos",
    query: { limit: 5, offset: 0 },
    searchFields: [
      { key: "nome", label: "Nome", placeholder: "Ex.: Botton", target: "query", parameter: "nome" },
      { key: "codigo", label: "Código/SKU", placeholder: "Código do produto", target: "query", parameter: "codigo" },
      { key: "gtin", label: "GTIN", placeholder: "Código GTIN", target: "query", parameter: "gtin", normalize: "number" },
      { key: "situacao", label: "Situação", placeholder: "A, I ou E", target: "query", parameter: "situacao" },
      { key: "idListaPreco", label: "ID lista preço", placeholder: "ID numérico da lista de preço", target: "query", parameter: "idListaPreco", normalize: "number" }
    ]
  },
  {
    key: "services-list",
    label: "Listar serviços",
    description: "Consulta serviços por nome, código ou situação.",
    method: "GET",
    path: "/servicos",
    query: { limit: 5, offset: 0 },
    searchFields: [
      { key: "nome", label: "Nome", placeholder: "Ex.: Impressão", target: "query", parameter: "nome" },
      { key: "codigo", label: "Código", placeholder: "Código do serviço", target: "query", parameter: "codigo" },
      { key: "situacao", label: "Situação", placeholder: "A, I ou E", target: "query", parameter: "situacao" }
    ]
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
    },
    searchFields: [
      { key: "idContato", label: "ID contato", placeholder: "ID numérico do contato", target: "body", parameter: "idContato", normalize: "number", bodyPath: ["idContato"] },
      { key: "idProduto", label: "ID produto", placeholder: "ID numérico do produto", target: "body", parameter: "idProduto", normalize: "number", bodyPath: ["itens", 0, "produto", "id"] }
    ]
  },
  {
    key: "invoice-create",
    label: "Gerar nota do pedido",
    description: "Troque {idPedido} pelo ID numérico do pedido Olist.",
    method: "POST",
    path: "/pedidos/{idPedido}/gerar-nota-fiscal",
    body: { modelo: 55 },
    searchFields: [
      { key: "idPedido", label: "ID pedido", placeholder: "ID numérico do pedido", target: "path", parameter: "idPedido", normalize: "number" }
    ]
  },
  {
    key: "invoice-emit",
    label: "Autorizar nota",
    description: "Troque {idNota} pelo ID numérico da nota Olist.",
    method: "POST",
    path: "/notas/{idNota}/emitir",
    body: { enviarEmail: true },
    searchFields: [
      { key: "idNota", label: "ID nota", placeholder: "ID numérico da nota", target: "path", parameter: "idNota", normalize: "number" }
    ]
  },
  {
    key: "crm-subject",
    label: "Criar assunto CRM",
    description: "Exige idContato numérico existente.",
    method: "POST",
    path: "/crm/assuntos",
    body: { idContato: 123, descricao: "Orçamento teste Pricing Pro", data: "2026-07-02" },
    searchFields: [
      { key: "idContato", label: "ID contato", placeholder: "ID numérico do contato", target: "body", parameter: "idContato", normalize: "number", bodyPath: ["idContato"] },
      { key: "descricao", label: "Descrição", placeholder: "Descrição do assunto", target: "body", parameter: "descricao", bodyPath: ["descricao"] }
    ]
  },
  {
    key: "crm-task",
    label: "Criar tarefa CRM",
    description: "Troque {idAssunto} pelo ID do assunto CRM.",
    method: "POST",
    path: "/crm/assuntos/{idAssunto}/acoes",
    body: { descricao: "Retornar orçamento ao cliente", tipoData: "Q" },
    searchFields: [
      { key: "idAssunto", label: "ID assunto", placeholder: "ID numérico do assunto CRM", target: "path", parameter: "idAssunto", normalize: "number" },
      { key: "descricao", label: "Descrição da tarefa", placeholder: "Ex.: Retornar orçamento", target: "body", parameter: "descricao", bodyPath: ["descricao"] }
    ]
  },
  {
    key: "users-list",
    label: "Listar usuários",
    description: "Valida se o token tem acesso ao recurso de usuários.",
    method: "GET",
    path: "/usuarios",
    query: { limit: 5, offset: 0 },
    searchFields: [
      { key: "nome", label: "Nome", placeholder: "Ex.: Admin", target: "query", parameter: "nome" },
      { key: "id", label: "ID usuário", placeholder: "ID do usuário", target: "query", parameter: "id" },
      { key: "tipo", label: "Tipo", placeholder: "vendedor, contador ou vazio", target: "query", parameter: "tipo" }
    ]
  },
  {
    key: "sellers-list",
    label: "Listar vendedores",
    description: "Valida se o token tem acesso ao recurso de vendedores.",
    method: "GET",
    path: "/vendedores",
    query: { limit: 5, offset: 0 },
    searchFields: [
      { key: "nome", label: "Nome", placeholder: "Ex.: Angelita", target: "query", parameter: "nome" },
      { key: "codigo", label: "Código", placeholder: "Código completo do vendedor", target: "query", parameter: "codigo" }
    ]
  }
];

function OlistApiTestLab({ connected }: { connected: boolean }) {
  const [selectedKey, setSelectedKey] = useState(TEST_PRESETS[0].key);
  const [method, setMethod] = useState<TestPreset["method"]>(TEST_PRESETS[0].method);
  const [path, setPath] = useState(TEST_PRESETS[0].path);
  const [queryText, setQueryText] = useState(formatJson(TEST_PRESETS[0].query ?? {}));
  const [bodyText, setBodyText] = useState(formatJson(TEST_PRESETS[0].body ?? {}));
  const [searchFieldKey, setSearchFieldKey] = useState(TEST_PRESETS[0].searchFields?.[0]?.key ?? "");
  const [searchValue, setSearchValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const [pendingRequest, setPendingRequest] = useState<PreparedOlistTestRequest | null>(null);

  const selectedPreset = TEST_PRESETS.find((item) => item.key === selectedKey) ?? TEST_PRESETS[0];
  const selectedSearchField = selectedPreset.searchFields?.find((field) => field.key === searchFieldKey) ?? selectedPreset.searchFields?.[0] ?? null;

  function selectPreset(key: string) {
    const preset = TEST_PRESETS.find((item) => item.key === key);
    if (!preset) return;
    setSelectedKey(key);
    setMethod(preset.method);
    setPath(preset.path);
    setQueryText(formatJson(preset.query ?? {}));
    setBodyText(formatJson(preset.body ?? {}));
    setSearchFieldKey(preset.searchFields?.[0]?.key ?? "");
    setSearchValue("");
    setMessage("");
    setResult(null);
    setPendingRequest(null);
  }

  function prepareTest() {
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

    const request = applySearchToRequest({
      preset: selectedPreset,
      path,
      query: query.value,
      body: body.value,
      searchField: selectedSearchField,
      searchValue
    });

    if ("error" in request) {
      setMessage(request.error);
      return;
    }

    setPendingRequest({
      method,
      path: request.path,
      query: request.query,
      body: request.body,
      presetLabel: selectedPreset.label,
      searchLabel: selectedSearchField?.label,
      searchValue: searchValue.trim() || undefined
    });
  }

  async function executeTest(request: PreparedOlistTestRequest) {
    setPendingRequest(null);
    setLoading(true);
    const response = await fetch("/api/olist/test-call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        method: request.method,
        path: request.path,
        query: request.query,
        body: request.method === "GET" ? undefined : request.body
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
        <div className="grid gap-3 content-start">
          <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="grid gap-3 md:grid-cols-[130px_1fr]">
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
            {selectedPreset.searchFields?.length ? (
              <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-cyan-100">Pesquisar por</span>
                  <select
                    className="focus-ring w-full rounded-md border border-cyan-400/30 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                    onChange={(event) => {
                      setSearchFieldKey(event.currentTarget.value);
                      setSearchValue("");
                    }}
                    value={searchFieldKey}
                  >
                    {selectedPreset.searchFields.map((field) => (
                      <option key={field.key} value={field.key}>{field.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-cyan-100">Valor para testar</span>
                  <input
                    className="focus-ring w-full rounded-md border border-cyan-400/30 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                    onChange={(event) => setSearchValue(event.currentTarget.value)}
                    placeholder={selectedSearchField?.placeholder}
                    value={searchValue}
                  />
                </label>
              <button
                  className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-60"
                  disabled={!connected || loading}
                  onClick={prepareTest}
                  type="button"
                >
                  <PlayCircle size={16} />
                  {loading ? "Testando..." : "Executar teste"}
                </button>
              </div>
            ) : (
              <div className="mt-3 flex justify-end">
                <button
                  className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-60"
                  disabled={!connected || loading}
                  onClick={prepareTest}
                  type="button"
                >
                  <PlayCircle size={16} />
                  {loading ? "Testando..." : "Executar teste"}
                </button>
              </div>
            )}
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              {selectedSearchField
                ? `O valor informado será aplicado automaticamente no ${selectedSearchField.target === "query" ? "Query JSON" : selectedSearchField.target === "path" ? "Path" : "Body JSON"} ao executar o teste.`
                : "A chamada será executada com os parâmetros atuais."}
            </p>
          </div>
          <details className="rounded-md border border-zinc-800 bg-zinc-900/40">
            <summary className="focus-ring cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900">
              JSON avançado
            </summary>
            <div className="grid gap-3 border-t border-zinc-800 p-3 lg:grid-cols-2">
              <JsonEditor label="Query JSON" value={queryText} onChange={setQueryText} />
              <JsonEditor label="Body JSON" value={bodyText} onChange={setBodyText} />
            </div>
          </details>
          {message ? <p className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">{message}</p> : null}
          {result ? (
            <pre className="max-h-[420px] overflow-auto rounded-md border border-zinc-800 bg-black/40 p-3 text-xs leading-5 text-zinc-300">
              {formatJson(result)}
            </pre>
          ) : null}
        </div>
      </div>
      {pendingRequest ? (
        <OlistTestConfirmModal
          loading={loading}
          onClose={() => setPendingRequest(null)}
          onConfirm={() => executeTest(pendingRequest)}
          request={pendingRequest}
        />
      ) : null}
    </div>
  );
}

function OlistTestConfirmModal({
  request,
  loading,
  onClose,
  onConfirm
}: {
  request: PreparedOlistTestRequest;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Confirmação Olist/Tiny</p>
            <h3 className="mt-1 text-base font-semibold text-white">Executar teste de API</h3>
            <p className="mt-1 text-sm leading-5 text-zinc-500">
              Esta chamada será feita usando o OAuth salvo para este tenant. Use dados reais apenas quando quiser consultar ou criar registros no Olist/Tiny.
            </p>
          </div>
          <button
            className="focus-ring rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
            disabled={loading}
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-3 p-5">
          <div className="grid gap-3 md:grid-cols-[140px_1fr]">
            <InfoTile label="Preset" value={request.presetLabel} />
            <InfoTile label="Endpoint" value={`${request.method} ${request.path}`} />
          </div>
          {request.searchLabel || request.searchValue ? (
            <div className="grid gap-3 md:grid-cols-2">
              <InfoTile label="Campo de busca" value={request.searchLabel ?? "-"} />
              <InfoTile label="Valor" value={request.searchValue ?? "-"} />
            </div>
          ) : null}
          <details className="rounded-md border border-zinc-800 bg-zinc-900/40">
            <summary className="focus-ring cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900">
              Prévia técnica da chamada
            </summary>
            <pre className="max-h-64 overflow-auto border-t border-zinc-800 p-3 text-xs leading-5 text-zinc-300">
              {formatJson({
                method: request.method,
                path: request.path,
                query: request.query,
                body: request.method === "GET" ? undefined : request.body
              })}
            </pre>
          </details>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-zinc-800 p-5 sm:flex-row sm:justify-end">
          <button
            className="focus-ring rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-60"
            disabled={loading}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-300 disabled:opacity-60"
            disabled={loading}
            onClick={onConfirm}
            type="button"
          >
            <PlayCircle size={16} />
            {loading ? "Executando..." : "Executar teste"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-zinc-100">{value}</p>
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

function applySearchToRequest({
  preset,
  path,
  query,
  body,
  searchField,
  searchValue
}: {
  preset: TestPreset;
  path: string;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  searchField: SearchField | null;
  searchValue: string;
}): { path: string; query: Record<string, unknown>; body: Record<string, unknown> } | { error: string } {
  const output = {
    path,
    query: { ...query },
    body: cloneRecord(body)
  };
  if (!searchField || !searchValue.trim()) return output;

  const normalized = normalizeSearchValue(searchValue, searchField);
  if (normalized === null) return { error: `Informe um valor válido para ${searchField.label}.` };

  for (const field of preset.searchFields ?? []) {
    if (field.target === "query") delete output.query[field.parameter];
  }

  if (searchField.target === "query") {
    output.query[searchField.parameter] = normalized;
    return output;
  }

  if (searchField.target === "path") {
    output.path = output.path.replaceAll(`{${searchField.parameter}}`, encodeURIComponent(String(normalized)));
    return output;
  }

  if (searchField.target === "body") {
    setNestedValue(output.body, searchField.bodyPath ?? [searchField.parameter], normalized);
    return output;
  }

  return output;
}

function normalizeSearchValue(value: string, field: SearchField) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (field.normalize === "digits") return trimmed.replace(/\D/g, "") || null;
  if (field.normalize === "number") {
    const number = Number(trimmed.replace(/\D/g, ""));
    return Number.isFinite(number) && number > 0 ? number : null;
  }
  return trimmed;
}

function cloneRecord(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value ?? {})) as Record<string, unknown>;
}

function setNestedValue(target: Record<string, unknown>, path: Array<string | number>, value: unknown) {
  let current: Record<string, unknown> | unknown[] = target;
  path.forEach((segment, index) => {
    const isLast = index === path.length - 1;
    if (isLast) {
      if (Array.isArray(current) && typeof segment === "number") current[segment] = value;
      else if (!Array.isArray(current)) current[String(segment)] = value;
      return;
    }

    const nextSegment = path[index + 1];
    if (Array.isArray(current) && typeof segment === "number") {
      if (current[segment] === undefined) current[segment] = typeof nextSegment === "number" ? [] : {};
      current = current[segment] as Record<string, unknown> | unknown[];
      return;
    }

    if (!Array.isArray(current)) {
      const key = String(segment);
      if (current[key] === undefined) current[key] = typeof nextSegment === "number" ? [] : {};
      current = current[key] as Record<string, unknown> | unknown[];
    }
  });
}

function IntegrationForm({
  title,
  connection,
  loading,
  oauthLoading,
  onConnect,
  onSyncPaymentOptions,
  onSubmit,
  paymentSyncLoading,
  paymentOptions
}: {
  title: string;
  connection?: OlistConnectionView;
  loading: boolean;
  oauthLoading: boolean;
  onConnect: () => void;
  onSyncPaymentOptions: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  paymentSyncLoading: boolean;
  paymentOptions: OlistPaymentOptionView[];
}) {
  const categoryOptions = paymentOptions.filter((option) => option.kind === "category");
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
        <Input
          label="Client Secret"
          name="clientSecret"
          placeholder={connection?.clientId ? "Deixe em branco para manter o atual" : ""}
          required={!connection?.clientId}
          type="password"
        />
        <p className="-mt-2 text-xs leading-5 text-zinc-500">
          Ao salvar, o OAuth atual é preservado. Preencha o secret somente na primeira configuração ou quando quiser trocar o aplicativo.
        </p>
        <Input defaultValue={connection?.scopes ?? "openid"} label="Scopes OAuth" name="scopes" placeholder="openid" />
        <label className="block rounded-md border border-emerald-400/20 bg-emerald-400/5 p-3">
          <span className="mb-1 block text-sm font-medium text-emerald-100">Categoria padrão para pagamentos</span>
          <select
            className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
            defaultValue={connection?.defaultPaymentCategoryExternalId ?? ""}
            name="defaultPaymentCategoryExternalId"
          >
            <option value="">Sem categoria padrão</option>
            {categoryOptions.map((option) => (
              <option key={option.externalId} value={option.externalId}>
                {option.groupName ? `${option.name} - ${option.groupName}` : option.name}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-xs leading-5 text-zinc-500">
            Use “Sincronizar pagamentos” para carregar as categorias do Olist. A categoria padrão será enviada no pedido de venda.
          </span>
        </label>
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
              <Input defaultValue={connection?.invoiceCancelPath ?? OLIST_DEFAULT_PATHS.invoiceCancel} label="Path cancelar nota" name="invoiceCancelPath" placeholder="/notas/xml/cancelar" />
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
      <button
        className="focus-ring ml-2 mt-4 inline-flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-60"
        disabled={paymentSyncLoading}
        type="button"
        onClick={onSyncPaymentOptions}
      >
        <CreditCard size={16} />
        {paymentSyncLoading ? "Sincronizando..." : "Sincronizar pagamentos"}
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

function selectedOptionName(options: OlistPaymentOptionView[], externalId: string) {
  const option = options.find((item) => item.externalId === externalId);
  return option?.name ?? "";
}

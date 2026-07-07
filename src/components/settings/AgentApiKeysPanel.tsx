"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Check, Clipboard, KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";

type AgentKey = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  status: "active" | "revoked";
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
};

type StatusMessage = {
  type: "success" | "error" | "info";
  text: string;
};

const SCOPE_LABELS: Record<string, { title: string; description: string }> = {
  "products:read": {
    title: "Consultar produtos",
    description: "Lista produtos, SKUs, medidas e pesos disponíveis para orçamento."
  },
  "pricing:calculate": {
    title: "Calcular preços",
    description: "Simula valores sem gravar orçamento."
  },
  "shipping:quote": {
    title: "Calcular frete",
    description: "Consulta embalagem e opções de envio configuradas no tenant."
  },
  "quotes:create": {
    title: "Criar orçamento",
    description: "Grava orçamento composto com cliente, itens e frete."
  },
  "quotes:read": {
    title: "Ler orçamento",
    description: "Consulta dados completos de orçamentos criados pelo tenant."
  },
  "quotes:whatsapp": {
    title: "Texto WhatsApp",
    description: "Gera mensagem formatada para atendimento."
  },
  "quotes:pdf": {
    title: "PDF",
    description: "Permite baixar o PDF do orçamento."
  },
  "quotes:public_link": {
    title: "Link público",
    description: "Cria link público para aceite do orçamento."
  }
};

const DEFAULT_SCOPES = [
  "products:read",
  "pricing:calculate",
  "shipping:quote",
  "quotes:create",
  "quotes:read",
  "quotes:whatsapp",
  "quotes:pdf",
  "quotes:public_link"
];

export function AgentApiKeysPanel() {
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [availableScopes, setAvailableScopes] = useState<string[]>(DEFAULT_SCOPES);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(DEFAULT_SCOPES);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [newToken, setNewToken] = useState("");
  const [loading, setLoading] = useState("");
  const [pendingRevoke, setPendingRevoke] = useState<AgentKey | null>(null);

  const activeKeys = useMemo(() => keys.filter((key) => key.status === "active").length, [keys]);

  useEffect(() => {
    void loadKeys();
  }, []);

  async function loadKeys() {
    const response = await fetch("/api/agent-keys");
    const data = await response.json().catch(() => null);
    if (response.ok && data?.ok) {
      setKeys(data.keys ?? []);
      setAvailableScopes(data.availableScopes ?? DEFAULT_SCOPES);
      setSelectedScopes(data.availableScopes ?? DEFAULT_SCOPES);
    }
  }

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setMessage(null);
    setNewToken("");
    setLoading("create");
    const form = new FormData(formElement);
    const response = await fetch("/api/agent-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        scopes: selectedScopes
      })
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage({ type: "error", text: data?.error?.formErrors?.[0] ?? data?.error ?? "Não foi possível criar a chave." });
      return;
    }

    formElement.reset();
    setNewToken(data.token);
    setMessage({ type: "success", text: "Chave criada. Copie o token agora, ele não será exibido novamente." });
    await loadKeys();
  }

  async function revokeKey(key: AgentKey) {
    setMessage(null);
    setLoading(key.id);
    const response = await fetch(`/api/agent-keys/${key.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage({ type: "error", text: data?.error ?? "Não foi possível revogar a chave." });
      return;
    }

    setMessage({ type: "success", text: "Chave revogada." });
    setPendingRevoke(null);
    await loadKeys();
  }

  async function copyToken() {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setMessage({ type: "info", text: "Token copiado para a área de transferência." });
  }

  function toggleScope(scope: string) {
    setSelectedScopes((current) => {
      if (current.includes(scope)) return current.filter((item) => item !== scope);
      return [...current, scope];
    });
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="text-cyan-300" size={18} />
            <h2 className="font-semibold">Agentes e API</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Chaves para agentes externos, como Lia Flow, criarem orçamentos e consultarem produtos com segurança.
          </p>
        </div>
        <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
          {activeKeys} {activeKeys === 1 ? "chave ativa" : "chaves ativas"}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-3">
          {keys.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/50 p-5 text-sm text-zinc-400">
              Nenhuma chave criada ainda. Crie uma chave para conectar o agente da Lia Flow.
            </div>
          ) : (
            keys.map((key) => (
              <div key={key.id} className="rounded-lg border border-zinc-800 bg-zinc-950/55 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-white">{key.name}</p>
                      <StatusBadge status={key.status} />
                    </div>
                    <p className="mt-1 font-mono text-xs text-zinc-500">pp_agent_live_{key.key_prefix}_••••••••••••</p>
                  </div>
                  <button
                    className="focus-ring inline-flex items-center gap-2 rounded-md border border-red-400/30 px-3 py-2 text-sm text-red-200 hover:bg-red-400/10 disabled:opacity-50"
                    disabled={key.status !== "active" || loading === key.id}
                    onClick={() => setPendingRevoke(key)}
                    type="button"
                  >
                    <Trash2 size={15} />
                    {loading === key.id ? "Revogando..." : "Revogar"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {key.scopes.map((scope) => (
                    <span key={scope} className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">
                      {SCOPE_LABELS[scope]?.title ?? scope}
                    </span>
                  ))}
                </div>
                <dl className="mt-4 grid gap-3 text-xs text-zinc-500 sm:grid-cols-3">
                  <div>
                    <dt>Criada em</dt>
                    <dd className="mt-1 text-zinc-300">{formatDateTime(key.created_at)}</dd>
                  </div>
                  <div>
                    <dt>Último uso</dt>
                    <dd className="mt-1 text-zinc-300">{key.last_used_at ? formatDateTime(key.last_used_at) : "Ainda não usada"}</dd>
                  </div>
                  <div>
                    <dt>Criada por</dt>
                    <dd className="mt-1 text-zinc-300">{key.created_by_name ?? key.created_by_email ?? "Sistema"}</dd>
                  </div>
                </dl>
              </div>
            ))
          )}
        </div>

        <form className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4" onSubmit={createKey}>
          <div className="flex items-center gap-2">
            <KeyRound className="text-amber-300" size={18} />
            <h3 className="font-medium text-white">Nova chave</h3>
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium text-zinc-300">Nome da integração</span>
            <input
              className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
              defaultValue="Lia Flow Agent"
              name="name"
              placeholder="Ex.: Lia Flow Agent"
              required
            />
          </label>

          <div className="mt-4">
            <p className="text-sm font-medium text-zinc-300">Permissões</p>
            <div className="mt-2 grid gap-2">
              {availableScopes.map((scope) => {
                const selected = selectedScopes.includes(scope);
                return (
                  <button
                    className={`focus-ring rounded-md border p-3 text-left transition ${
                      selected
                        ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-50"
                        : "border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-600"
                    }`}
                    key={scope}
                    onClick={() => toggleScope(scope)}
                    type="button"
                  >
                    <span className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          selected ? "border-cyan-200 bg-cyan-300 text-zinc-950" : "border-zinc-600"
                        }`}
                      >
                        {selected ? <Check size={12} /> : null}
                      </span>
                      <span>
                        <span className="block text-sm font-medium">{SCOPE_LABELS[scope]?.title ?? scope}</span>
                        <span className="mt-0.5 block text-xs opacity-75">{SCOPE_LABELS[scope]?.description ?? scope}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-200 disabled:opacity-60"
            disabled={loading === "create" || selectedScopes.length === 0}
            type="submit"
          >
            <Plus size={16} />
            {loading === "create" ? "Criando..." : "Criar chave"}
          </button>
        </form>
      </div>

      {newToken ? (
        <div className="mt-5 rounded-lg border border-amber-300/30 bg-amber-300/10 p-4">
          <div className="flex items-center gap-2 text-amber-100">
            <ShieldCheck size={18} />
            <p className="font-medium">Token criado</p>
          </div>
          <p className="mt-2 text-sm text-amber-100/80">
            Copie e salve este token no ambiente da Lia Flow. Depois que sair desta tela, ele não poderá ser recuperado.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              className="w-full rounded-md border border-amber-300/20 bg-zinc-950/80 px-3 py-2 font-mono text-xs text-amber-50"
              readOnly
              value={newToken}
            />
            <button
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-amber-300 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-200"
              onClick={copyToken}
              type="button"
            >
              <Clipboard size={16} />
              Copiar token
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={`mt-4 rounded-md px-3 py-2 text-sm ${messageClassName(message.type)}`}>{message.text}</p>
      ) : null}

      {pendingRevoke ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-red-400/10 p-2 text-red-200">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Revogar chave do agente?</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  A chave <span className="font-medium text-zinc-200">{pendingRevoke.name}</span> deixará de autenticar
                  imediatamente. A integração da Lia Flow que usa esse token precisará de uma nova chave.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
              <p className="font-mono text-xs text-zinc-400">pp_agent_live_{pendingRevoke.key_prefix}_••••••••••••</p>
              <p className="mt-2 text-xs text-zinc-500">
                Criada em {formatDateTime(pendingRevoke.created_at)}
                {pendingRevoke.last_used_at ? ` · último uso em ${formatDateTime(pendingRevoke.last_used_at)}` : " · ainda não usada"}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                className="focus-ring rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
                disabled={loading === pendingRevoke.id}
                onClick={() => setPendingRevoke(null)}
                type="button"
              >
                Manter chave
              </button>
              <button
                className="focus-ring inline-flex items-center gap-2 rounded-md bg-red-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-red-300 disabled:opacity-60"
                disabled={loading === pendingRevoke.id}
                onClick={() => revokeKey(pendingRevoke)}
                type="button"
              >
                <Trash2 size={16} />
                {loading === pendingRevoke.id ? "Revogando..." : "Revogar agora"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StatusBadge({ status }: { status: AgentKey["status"] }) {
  if (status === "active") return <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-300">Ativa</span>;
  return <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">Revogada</span>;
}

function messageClassName(type: StatusMessage["type"]) {
  if (type === "success") return "bg-emerald-400/10 text-emerald-200";
  if (type === "error") return "bg-red-400/10 text-red-200";
  return "bg-cyan-400/10 text-cyan-100";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

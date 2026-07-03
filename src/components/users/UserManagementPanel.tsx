"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, RefreshCw, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import type { RoleRow, TenantMemberRow } from "@/repositories/users";

const STATUSES = [
  { key: "active", label: "Ativo" },
  { key: "invited", label: "Convidado" },
  { key: "blocked", label: "Bloqueado" }
] as const;

type OlistUserAction =
  | { type: "sync"; member: TenantMemberRow }
  | { type: "task"; member: TenantMemberRow }
  | null;

type OlistUserResult = {
  tone: "success" | "error" | "info";
  title: string;
  message: string;
  debugId?: string | null;
  externalId?: string | null;
  detail?: string | null;
};

type OlistUserSearchResult = {
  id: string | null;
  nome: string | null;
  email: string | null;
  tipo: string | null;
  situacao: string | null;
};

export function UserManagementPanel({
  members,
  roles,
  currentUserId,
  currentRole
}: {
  members: TenantMemberRow[];
  roles: RoleRow[];
  currentUserId: string;
  currentRole: string;
}) {
  const router = useRouter();
  const assignableRoles = roles.filter((role) => currentRole === "owner" || role.key !== "owner");
  const visibleRolesFor = (memberRole: string) =>
    roles.filter((role) => currentRole === "owner" || role.key !== "owner" || role.key === memberRole);
  const [message, setMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [newMemberStatus, setNewMemberStatus] = useState<"active" | "invited">("invited");
  const [loading, setLoading] = useState("");
  const [olistAction, setOlistAction] = useState<OlistUserAction>(null);
  const [olistResult, setOlistResult] = useState<OlistUserResult | null>(null);

  async function createMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setMessage("");
    setInviteUrl("");
    setLoading("create");
    const form = new FormData(formElement);
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        roleKey: form.get("roleKey"),
        memberStatus: form.get("memberStatus")
      })
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage(data?.error ?? "Nao foi possivel criar o usuario.");
      return;
    }

    formElement.reset();
    setNewMemberStatus("invited");
    if (data.inviteUrl) {
      setInviteUrl(data.inviteUrl);
      setMessage("Convite criado. Envie o link para o usuario definir a propria senha.");
    } else {
      setMessage("Usuario vinculado ao tenant.");
    }
    router.refresh();
  }

  async function copyInviteUrl() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setMessage("Link de convite copiado.");
  }

  async function updateMember(membershipId: string, input: { roleKey?: string; status?: string }) {
    setMessage("");
    setLoading(membershipId);
    const response = await fetch(`/api/users/${membershipId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage(data?.error ?? "Nao foi possivel atualizar o membro.");
      return;
    }

    router.refresh();
  }

  async function removeMember(membershipId: string) {
    if (!window.confirm("Remover este membro do tenant?")) return;
    setMessage("");
    setLoading(membershipId);
    const response = await fetch(`/api/users/${membershipId}`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setMessage(data?.error ?? "Nao foi possivel remover o membro.");
      return;
    }

    router.refresh();
  }

  async function syncOlistUser(member: TenantMemberRow, formData: FormData) {
    const externalOlistUserId = stringField(formData, "externalOlistUserId");
    const mode = externalOlistUserId || stringField(formData, "mode") === "manual" ? "manual" : "lookup";
    const lookupName = stringField(formData, "lookupName") || member.name;
    const type = stringField(formData, "type");

    setMessage("");
    setOlistResult(null);
    setLoading(`${member.membership_id}:olist`);
    const response = await fetch(`/api/users/${member.membership_id}/olist/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, externalOlistUserId, lookupName, type })
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setOlistResult({
        tone: "error",
        title: "Vínculo Olist não concluído",
        message: data?.error ?? "Não foi possível vincular o usuário no Olist.",
        debugId: data?.debugId ?? null
      });
      return;
    }

    setOlistResult({
      tone: data.warning ? "info" : "success",
      title: data.externalId ? "Usuário vinculado ao Olist" : "Usuário sem vínculo Olist",
      message: data.warning ?? data.message ?? (data.externalId ? `Usuário vinculado ao Olist: ${data.externalId}` : "Consulta enviada ao Olist."),
      debugId: data.debugId ?? null,
      externalId: data.externalId ?? null,
      detail: data.detail ?? data.lookup?.path ?? null
    });
    setOlistAction(null);
    router.refresh();
  }

  async function createOlistTask(member: TenantMemberRow, formData: FormData) {
    const title = stringField(formData, "title");
    const subjectId = stringField(formData, "subjectId");
    const description = stringField(formData, "description");
    const dueDate = stringField(formData, "dueDate");
    const dueTime = stringField(formData, "dueTime");
    if (!title || title.length < 3) {
      setOlistResult({ tone: "error", title: "Tarefa incompleta", message: "Informe um título com pelo menos 3 caracteres." });
      return;
    }
    if (!subjectId) {
      setOlistResult({ tone: "error", title: "Tarefa incompleta", message: "Informe o ID do assunto CRM Olist." });
      return;
    }

    setMessage("");
    setOlistResult(null);
    setLoading(`${member.membership_id}:task`);
    const response = await fetch(`/api/users/${member.membership_id}/olist/task`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, subjectId, description, dueDate, dueTime })
    });
    const data = await response.json().catch(() => null);
    setLoading("");

    if (!response.ok || !data?.ok) {
      setOlistResult({
        tone: "error",
        title: "Tarefa CRM não criada",
        message: data?.error ?? "Não foi possível criar a tarefa no Olist.",
        debugId: data?.debugId ?? null
      });
      return;
    }

    setOlistResult({
      tone: "success",
      title: "Tarefa CRM criada",
      message: data.message ?? (data.externalId ? `Tarefa criada no Olist: ${data.externalId}` : "Tarefa enviada ao Olist."),
      externalId: data.externalId ?? null,
      detail: data.call?.path ?? null
    });
    setOlistAction(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <form className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5" onSubmit={createMember}>
        <div className="mb-5 flex items-center gap-2">
          <UserPlus className="text-amber-400" size={18} />
          <h2 className="font-semibold">Novo membro</h2>
        </div>
        <div className="grid gap-4">
          <Input label="Nome" name="name" required />
          <Input label="Email" name="email" required type="email" />
          {newMemberStatus === "active" ? (
            <Input label="Senha inicial" minLength={8} name="password" required type="password" />
          ) : null}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-300">Role</span>
            <select className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2" name="roleKey">
              {assignableRoles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-300">Status</span>
            <select
              className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
              name="memberStatus"
              onChange={(event) => setNewMemberStatus(event.target.value as "active" | "invited")}
              value={newMemberStatus}
            >
              <option value="active">Ativo</option>
              <option value="invited">Convidado</option>
            </select>
          </label>
        </div>
        <button
          className="focus-ring mt-4 inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          disabled={loading === "create"}
          type="submit"
        >
          <ShieldCheck size={16} />
          {loading === "create" ? "Salvando..." : newMemberStatus === "invited" ? "Gerar convite" : "Criar membro"}
        </button>
        {inviteUrl ? (
          <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
            <p className="text-xs font-medium text-zinc-300">Link de convite</p>
            <div className="mt-2 grid gap-2">
              <input
                className="w-full rounded-md border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-400"
                readOnly
                value={inviteUrl}
              />
              <button
                className="focus-ring w-fit rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900/70"
                onClick={copyInviteUrl}
                type="button"
              >
                Copiar link
              </button>
            </div>
          </div>
        ) : null}
        {message ? <p className="mt-4 rounded-md bg-zinc-950/60 px-3 py-2 text-sm text-zinc-400">{message}</p> : null}
      </form>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="font-semibold">Membros do tenant</h2>
        </div>
        <div className="divide-y divide-zinc-800">
          {members.map((member) => {
            const isSelf = member.user_id === currentUserId;
            const canEdit = !isSelf && (currentRole === "owner" || member.role_key !== "owner");
            return (
              <div className="grid gap-3 px-5 py-4 text-sm xl:grid-cols-[1fr_150px_150px_auto]" key={member.membership_id}>
                <div>
                  <p className="font-medium text-white">{member.name}</p>
                  <p className="text-zinc-500">{member.email}</p>
                  {isSelf ? <p className="mt-1 text-xs text-zinc-400">Usuario atual</p> : null}
                  {member.external_olist_user_id ? (
                    <p className="mt-1 text-xs text-cyan-300">Olist: {member.external_olist_user_id}</p>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-600">Olist nao vinculado</p>
                  )}
                </div>
                <select
                  className="focus-ring h-10 rounded-md border border-zinc-700 px-3"
                  disabled={!canEdit || loading === member.membership_id}
                  onChange={(event) => updateMember(member.membership_id, { roleKey: event.target.value })}
                  value={member.role_key}
                >
                  {visibleRolesFor(member.role_key).map((role) => (
                      <option key={role.key} value={role.key}>
                        {role.name}
                      </option>
                    ))}
                </select>
                <select
                  className="focus-ring h-10 rounded-md border border-zinc-700 px-3"
                  disabled={!canEdit || loading === member.membership_id}
                  onChange={(event) => updateMember(member.membership_id, { status: event.target.value })}
                  value={member.member_status}
                >
                  {STATUSES.map((status) => (
                    <option key={status.key} value={status.key}>
                      {status.label}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md border border-cyan-400/25 px-3 text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-60"
                    disabled={loading === `${member.membership_id}:olist`}
                    onClick={() => setOlistAction({ type: "sync", member })}
                    type="button"
                  >
                    <RefreshCw size={16} />
                    {loading === `${member.membership_id}:olist` ? "Vinculando..." : "Vincular Olist"}
                  </button>
                  <button
                    className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md border border-amber-400/25 px-3 text-amber-100 hover:bg-amber-400/10 disabled:opacity-60"
                    disabled={loading === `${member.membership_id}:task`}
                    onClick={() => setOlistAction({ type: "task", member })}
                    type="button"
                  >
                    <CalendarPlus size={16} />
                    Criar tarefa CRM
                  </button>
                  <button
                    className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 text-zinc-300 hover:bg-zinc-950/60 disabled:opacity-60"
                    disabled={!canEdit || loading === member.membership_id}
                    onClick={() => removeMember(member.membership_id)}
                    type="button"
                  >
                    <Trash2 size={16} />
                    Remover
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {olistResult ? <OlistUserResultPanel result={olistResult} onClose={() => setOlistResult(null)} /> : null}
      {olistAction ? (
        <OlistUserActionModal
          action={olistAction}
          loading={loading}
          onClose={() => setOlistAction(null)}
          onSubmit={(formData) => {
            if (olistAction.type === "sync") void syncOlistUser(olistAction.member, formData);
            else void createOlistTask(olistAction.member, formData);
          }}
        />
      ) : null}
    </div>
  );
}

function OlistUserActionModal({
  action,
  loading,
  onClose,
  onSubmit
}: {
  action: Exclude<OlistUserAction, null>;
  loading: string;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const member = action.member;
  const isSync = action.type === "sync";
  const loadingKey = isSync ? `${member.membership_id}:olist` : `${member.membership_id}:task`;
  const [lookupName, setLookupName] = useState(member.name);
  const [lookupType, setLookupType] = useState(member.role_key === "sales" ? "vendedor" : "");
  const [externalOlistUserId, setExternalOlistUserId] = useState(member.external_olist_user_id ?? "");
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [searchResults, setSearchResults] = useState<OlistUserSearchResult[]>([]);

  async function searchOlistUsers() {
    if (!lookupName.trim()) {
      setSearchMessage("Informe um nome para buscar no Olist.");
      return;
    }

    setSearchMessage("");
    setSearchResults([]);
    setSearching(true);
    const response = await fetch(`/api/users/${member.membership_id}/olist/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nome: lookupName, tipo: lookupType || undefined })
    });
    const data = await response.json().catch(() => null);
    setSearching(false);

    if (!response.ok || !data?.ok) {
      setSearchMessage(data?.error ?? "Não foi possível buscar usuários no Olist.");
      return;
    }

    const results = Array.isArray(data.results) ? data.results as OlistUserSearchResult[] : [];
    setSearchResults(results);
    setSearchMessage(
      [
        data.warning,
        results.length ? `${results.length} resultado(s) encontrado(s). Selecione um responsável abaixo.` : "Nenhum usuário encontrado para esse nome."
      ].filter(Boolean).join(" ")
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <form className="w-full max-w-2xl rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50" onSubmit={submit}>
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Olist CRM</p>
            <h3 className="mt-1 text-base font-semibold text-white">
              {isSync ? "Vincular usuário ao CRM Olist" : "Criar tarefa para usuário no CRM"}
            </h3>
            <p className="mt-1 text-sm leading-5 text-zinc-500">
              {isSync
                ? `Defina qual responsável do Olist será usado para ${member.name}.`
                : `A tarefa será criada no assunto CRM informado e vinculada ao responsável Olist de ${member.name}.`}
            </p>
          </div>
          <button className="focus-ring rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-5">
          <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
            <p className="font-medium text-white">{member.name}</p>
            <p className="text-zinc-500">{member.email}</p>
            <p className="mt-1 text-xs text-cyan-300">
              {member.external_olist_user_id ? `Responsável Olist atual: ${member.external_olist_user_id}` : "Ainda sem responsável Olist vinculado"}
            </p>
          </div>

          {isSync ? (
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">Como vincular</span>
                <select className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2" name="mode" defaultValue={member.external_olist_user_id ? "manual" : "lookup"}>
                  <option value="lookup">Procurar no Olist pelo nome</option>
                  <option value="manual">Usar ID de responsável existente</option>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-300">Nome para procurar no Olist</span>
                  <input
                    className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
                    name="lookupName"
                    onChange={(event) => setLookupName(event.currentTarget.value)}
                    value={lookupName}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-300">Tipo</span>
                  <select
                    className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
                    name="type"
                    onChange={(event) => setLookupType(event.currentTarget.value)}
                    value={lookupType}
                  >
                    <option value="">Usuário</option>
                    <option value="vendedor">Vendedor</option>
                  </select>
                </label>
                <button
                  className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-cyan-400/30 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-60"
                  disabled={searching}
                  onClick={searchOlistUsers}
                  type="button"
                >
                  {searching ? "Buscando..." : "Buscar no Olist"}
                </button>
              </div>
              {searchMessage ? (
                <p className="rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs leading-5 text-zinc-300">{searchMessage}</p>
              ) : null}
              {searchResults.length ? (
                <div className="grid gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 p-2">
                  {searchResults.map((result, index) => (
                    <button
                      className={`focus-ring rounded-md border px-3 py-2 text-left text-sm transition ${
                        result.id && externalOlistUserId === result.id
                          ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"
                          : "border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-950"
                      }`}
                      disabled={!result.id}
                      key={`${result.id ?? "sem-id"}-${index}`}
                      onClick={() => {
                        if (result.id) setExternalOlistUserId(result.id);
                      }}
                      type="button"
                    >
                      <span className="block font-medium">{result.nome ?? "Usuário sem nome"}</span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {[result.email, result.tipo, result.situacao, result.id ? `ID ${result.id}` : "sem ID retornado"].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">ID do responsável Olist selecionado</span>
                <input
                  className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
                  name="externalOlistUserId"
                  onChange={(event) => setExternalOlistUserId(event.currentTarget.value)}
                  value={externalOlistUserId}
                />
              </label>
              <p className="rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                A API v3 expõe consulta de usuários/vendedores. Se o responsável ainda não existir no Olist, crie-o no Olist e informe o ID aqui para vincular.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              <Input label="ID do assunto CRM Olist" name="subjectId" required />
              <Input defaultValue={`Retornar contato com ${member.name}`} label="Título da tarefa" name="title" required />
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">Descrição</span>
                <textarea
                  className="focus-ring min-h-24 w-full rounded-md border border-zinc-700 px-3 py-2"
                  name="description"
                  placeholder="Detalhe a próxima ação que deve aparecer na agenda do CRM"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Data prevista" name="dueDate" type="date" />
                <Input label="Horário" name="dueTime" type="time" />
              </div>
              {!member.external_olist_user_id ? (
                <p className="rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                  Este usuário ainda não tem responsável Olist vinculado. A tarefa pode ser criada, mas não ficará atribuída a ele até o vínculo ser configurado.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-zinc-800 p-5 sm:flex-row sm:justify-end">
          <button className="focus-ring rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900" disabled={loading === loadingKey} onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="focus-ring rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-300 disabled:opacity-60" disabled={loading === loadingKey} type="submit">
            {loading === loadingKey ? "Processando..." : isSync ? "Vincular responsável" : "Criar tarefa CRM"}
          </button>
        </div>
      </form>
    </div>
  );
}

function OlistUserResultPanel({ result, onClose }: { result: OlistUserResult; onClose: () => void }) {
  const tone =
    result.tone === "error"
      ? "border-rose-400/25 bg-rose-400/10 text-rose-100"
      : result.tone === "info"
        ? "border-amber-400/25 bg-amber-400/10 text-amber-100"
        : "border-cyan-400/25 bg-cyan-400/10 text-cyan-100";

  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{result.title}</p>
          <p className="mt-1 text-xs leading-5 opacity-85">{result.message}</p>
        </div>
        <button className="focus-ring rounded-md p-1 opacity-70 hover:bg-black/20 hover:opacity-100" onClick={onClose} type="button">
          <X size={16} />
        </button>
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        {result.externalId ? <ResultItem label="ID Olist" value={result.externalId} /> : null}
        {result.debugId ? <ResultItem label="Debug" value={result.debugId} /> : null}
        {result.detail ? <ResultItem label="Detalhe" value={result.detail} wide /> : null}
      </dl>
    </div>
  );
}

function ResultItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-md bg-black/20 px-2 py-2 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[11px] uppercase tracking-wide opacity-60">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function Input({
  label,
  name,
  type = "text",
  required = false,
  minLength,
  defaultValue
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
        defaultValue={defaultValue}
        minLength={minLength}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

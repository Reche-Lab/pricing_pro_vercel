"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Trash2, UserPlus } from "lucide-react";
import type { RoleRow, TenantMemberRow } from "@/repositories/users";

const STATUSES = [
  { key: "active", label: "Ativo" },
  { key: "invited", label: "Convidado" },
  { key: "blocked", label: "Bloqueado" }
] as const;

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

  async function createMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setInviteUrl("");
    setLoading("create");
    const form = new FormData(event.currentTarget);
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

    event.currentTarget.reset();
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
              <div className="grid gap-3 px-5 py-4 text-sm xl:grid-cols-[1fr_160px_160px_auto]" key={member.membership_id}>
                <div>
                  <p className="font-medium text-white">{member.name}</p>
                  <p className="text-zinc-500">{member.email}</p>
                  {isSelf ? <p className="mt-1 text-xs text-zinc-400">Usuario atual</p> : null}
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
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Input({
  label,
  name,
  type = "text",
  required = false,
  minLength
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
        minLength={minLength}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

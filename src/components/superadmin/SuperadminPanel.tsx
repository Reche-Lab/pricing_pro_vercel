"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Copy, Gift, Mail, ShieldCheck, TimerReset, Users } from "lucide-react";
import type { SuperadminTenantRow, SuperadminUserRow } from "@/repositories/superadmin";

export function SuperadminPanel({
  tenants,
  users
}: {
  tenants: SuperadminTenantRow[];
  users: SuperadminUserRow[];
}) {
  const router = useRouter();
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [message, setMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState("");

  const generatedSlug = useMemo(() => slugify(tenantName), [tenantName]);

  async function createTenant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setLoading(true);
    setMessage("");
    setInviteUrl("");

    const response = await fetch("/api/superadmin/tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantName: form.get("tenantName"),
        tenantSlug: form.get("tenantSlug") || generatedSlug,
        ownerName: form.get("ownerName"),
        ownerEmail: form.get("ownerEmail")
      })
    });
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok || !data?.ok) {
      setMessage(formatError(data?.error) || "Nao foi possivel criar o tenant.");
      return;
    }

    formElement.reset();
    setTenantName("");
    setTenantSlug("");
    setInviteUrl(data.inviteUrl ?? "");
    setMessage(
      data.emailDelivery?.sent
        ? "Tenant criado e convite enviado por email."
        : "Tenant criado. Email nao configurado; copie o link de convite abaixo."
    );
    router.refresh();
  }

  async function copyInviteUrl() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setMessage("Link de convite copiado.");
  }

  async function updateTenantBilling(tenantId: string, input: Record<string, unknown>) {
    setBillingLoading(tenantId);
    setMessage("");
    const response = await fetch(`/api/superadmin/tenants/${tenantId}/billing`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    const data = await response.json().catch(() => null);
    setBillingLoading("");

    if (!response.ok || !data?.ok) {
      setMessage(data?.error ? "Não foi possível atualizar a cobrança." : "Não foi possível atualizar a cobrança.");
      return;
    }

    setMessage("Cobrança atualizada.");
    router.refresh();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[440px_1fr]">
      <section className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-5 xl:col-span-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
              <ShieldCheck size={15} />
              Acesso exclusivo de superadmin
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Visão global da plataforma</h2>
            <p className="mt-1 text-sm text-zinc-300">
              Esta área consolida todos os tenants, usuários globais, trial, vouchers e cobrança. Ela não aparece no menu
              de usuários comuns.
            </p>
          </div>
          <span className="w-fit rounded-full border border-amber-300/40 bg-zinc-950/70 px-3 py-1 text-xs font-semibold text-amber-200">
            liaflow.ai@gmail.com
          </span>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="mb-5 flex items-center gap-2">
          <Building2 className="text-amber-400" size={18} />
          <h2 className="font-semibold text-white">Novo tenant</h2>
        </div>
        <form className="grid gap-4" onSubmit={createTenant}>
          <Input
            label="Nome do tenant"
            name="tenantName"
            onChange={(value) => {
              setTenantName(value);
              setTenantSlug((current) => current || slugify(value));
            }}
            required
          />
          <Input
            help="Use letras minusculas, numeros e hifen. Ex.: ground-shop"
            label="Slug"
            name="tenantSlug"
            onChange={setTenantSlug}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            required
            value={tenantSlug || generatedSlug}
          />
          <div className="mt-2 border-t border-zinc-800 pt-4">
            <p className="mb-3 text-sm font-medium text-zinc-300">Owner inicial</p>
            <div className="grid gap-4">
              <Input label="Nome" name="ownerName" required />
              <Input label="Email" name="ownerEmail" required type="email" />
            </div>
          </div>
          <button
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-amber-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-300 disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            <ShieldCheck size={16} />
            {loading ? "Criando..." : "Criar tenant e convidar owner"}
          </button>
        </form>

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
                className="focus-ring inline-flex w-fit items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900/70"
                onClick={copyInviteUrl}
                type="button"
              >
                <Copy size={14} />
                Copiar link
              </button>
            </div>
          </div>
        ) : null}
        {message ? <p className="mt-4 rounded-md bg-zinc-950/60 px-3 py-2 text-sm text-zinc-400">{message}</p> : null}
      </section>

      <div className="grid gap-6">
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/70">
          <div className="border-b border-zinc-800 px-5 py-4">
            <div className="flex items-center gap-2">
              <Building2 className="text-zinc-500" size={18} />
              <h2 className="font-semibold text-white">Tenants</h2>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              Gestão global por tenant: status, assinatura, trial, voucher e quantidade de membros.
            </p>
          </div>
          <div className="grid gap-4 p-4">
            {tenants.map((tenant) => (
              <article className="rounded-lg border border-zinc-800 bg-zinc-950/45 p-4" key={tenant.id}>
                <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr_320px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">{tenant.name}</p>
                      <Badge>{tenant.status}</Badge>
                    </div>
                    <p className="mt-1 text-zinc-500">{tenant.slug}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      Owner: {tenant.owner_name ? `${tenant.owner_name} (${tenant.owner_email})` : "não definido"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">{tenant.member_count} membro(s)</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <StatusBlock
                      label="Assinatura"
                      value={billingLabel(tenant.subscription_status ?? tenant.billing_status)}
                      detail={tenant.current_period_end ? `Válida até ${new Intl.DateTimeFormat("pt-BR").format(new Date(tenant.current_period_end))}` : "Sem vencimento definido"}
                    />
                    <StatusBlock
                      label="Voucher"
                      value={tenant.discount_percent && Number(tenant.discount_percent) > 0 ? `${Number(tenant.discount_percent).toFixed(0)}% de desconto` : "Sem voucher ativo"}
                      detail={
                        tenant.discount_percent && Number(tenant.discount_percent) > 0
                          ? `Expira em ${tenant.discount_expires_at ? new Intl.DateTimeFormat("pt-BR").format(new Date(tenant.discount_expires_at)) : "data não definida"}`
                          : "Use o formulário ao lado para aplicar um desconto por prazo definido."
                      }
                    />
                  </div>

                  <TenantBillingActions
                    disabled={billingLoading === tenant.id}
                    tenantId={tenant.id}
                    onSubmit={updateTenantBilling}
                  />
                </div>
              </article>
            ))}
            {tenants.length === 0 ? <EmptyState text="Nenhum tenant cadastrado." /> : null}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/70">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-4">
            <Users className="text-zinc-500" size={18} />
            <h2 className="font-semibold text-white">Usuarios globais</h2>
          </div>
          <div className="divide-y divide-zinc-800">
            {users.map((user) => (
              <div className="grid gap-3 px-5 py-4 text-sm lg:grid-cols-[1fr_150px_150px]" key={user.id}>
                <div className="min-w-0">
                  <p className="font-medium text-white">{user.name}</p>
                  <p className="text-zinc-500">{user.email}</p>
                </div>
                <Badge>{user.status}</Badge>
                <p className="flex items-center gap-2 text-zinc-400">
                  {user.is_super_admin ? <Mail className="text-amber-400" size={15} /> : null}
                  {user.is_super_admin ? "Superadmin" : `${user.tenant_count} tenants`}
                </p>
              </div>
            ))}
            {users.length === 0 ? <EmptyState text="Nenhum usuario encontrado." /> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function TenantBillingActions({
  disabled,
  onSubmit,
  tenantId
}: {
  disabled: boolean;
  onSubmit: (tenantId: string, input: Record<string, unknown>) => void;
  tenantId: string;
}) {
  const [trialDays, setTrialDays] = useState(14);
  const [discountPercent, setDiscountPercent] = useState(50);
  const [voucherDays, setVoucherDays] = useState(30);

  function futureDate(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + Math.max(1, days));
    return date.toISOString();
  }

  return (
    <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Trial do tenant</p>
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-zinc-500">Dias a partir de hoje</span>
            <input
              className="focus-ring h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs"
              min={1}
              type="number"
              value={trialDays}
              onChange={(event) => setTrialDays(Number(event.target.value))}
            />
          </label>
          <button
            className="focus-ring mt-5 inline-flex h-9 items-center gap-1 rounded-md border border-zinc-700 px-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            disabled={disabled}
            type="button"
            onClick={() => onSubmit(tenantId, { action: "extend_trial", endsAt: futureDate(trialDays) })}
          >
            <TimerReset size={14} />
            Estender
          </button>
        </div>
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Voucher do tenant</p>
        <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-zinc-500">% desconto</span>
            <input
              className="focus-ring h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs"
              max={100}
              min={1}
              type="number"
              value={discountPercent}
              onChange={(event) => setDiscountPercent(Number(event.target.value))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-zinc-500">Duração em dias</span>
            <input
              className="focus-ring h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs"
              min={1}
              type="number"
              value={voucherDays}
              onChange={(event) => setVoucherDays(Number(event.target.value))}
            />
          </label>
          <button
            className="focus-ring mt-5 inline-flex h-9 items-center gap-1 rounded-md border border-emerald-400/40 px-2 text-xs text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50"
            disabled={disabled}
            type="button"
            onClick={() =>
              onSubmit(tenantId, {
                action: "apply_voucher",
                discountPercent,
                expiresAt: futureDate(voucherDays),
                note: `Voucher ${discountPercent}% por ${voucherDays} dia(s)`
              })
            }
          >
            <Gift size={14} />
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBlock({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

function Input({
  help,
  label,
  name,
  onChange,
  pattern,
  required,
  type = "text",
  value
}: {
  help?: string;
  label: string;
  name: string;
  onChange?: (value: string) => void;
  pattern?: string;
  required?: boolean;
  type?: string;
  value?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
        name={name}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        pattern={pattern}
        required={required}
        type={type}
        value={value}
      />
      {help ? <span className="mt-1 block text-xs text-zinc-500">{help}</span> : null}
    </label>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-8 w-fit items-center rounded-full border border-zinc-700 bg-zinc-950/60 px-3 text-xs font-medium text-zinc-300">
      {children}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="px-5 py-6 text-sm text-zinc-500">{text}</p>;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatError(error: unknown) {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "fieldErrors" in error) return "Confira os campos informados.";
  return "Erro inesperado.";
}

function billingLabel(status: string) {
  const map: Record<string, string> = {
    active: "Ativo",
    blocked: "Bloqueado",
    cancelled: "Cancelado",
    past_due: "Em atraso",
    trial: "Teste"
  };
  return map[status] ?? status;
}

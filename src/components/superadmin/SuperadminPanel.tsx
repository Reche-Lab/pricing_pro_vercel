"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Copy, DollarSign, Gift, ShieldCheck, TimerReset, Users } from "lucide-react";
import type { BillingPlanRow } from "@/repositories/billing";
import type { SuperadminTenantRow } from "@/repositories/superadmin";

export function SuperadminPanel({
  billingPlans,
  tenants
}: {
  billingPlans: BillingPlanRow[];
  tenants: SuperadminTenantRow[];
}) {
  const router = useRouter();
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [message, setMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState("");
  const [planLoading, setPlanLoading] = useState("");

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

    setMessage(
      input.action === "change_plan"
        ? `Plano do tenant alterado para ${data.planName}. O novo valor mensal é ${formatCurrency(Number(data.amountCents ?? 0))}.`
        : "Cobrança atualizada."
    );
    router.refresh();
  }

  async function updateBillingPlan(input: Record<string, unknown>) {
    const key = String(input.key ?? "");
    setPlanLoading(key || "new");
    setMessage("");
    const response = await fetch("/api/superadmin/billing-plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    const data = await response.json().catch(() => null);
    setPlanLoading("");

    if (!response.ok || !data?.ok) {
      setMessage(data?.error ? "Não foi possível salvar o preço base." : "Não foi possível salvar o preço base.");
      return;
    }

    const affectedTenants = Number(data.plan?.tenant_count ?? 0);
    setMessage(
      affectedTenants > 0
        ? `Preço base atualizado para ${affectedTenants} ${affectedTenants === 1 ? "tenant vinculado" : "tenants vinculados"}. ` +
          "Cobranças abertas foram invalidadas e o próximo checkout usará o novo valor."
        : "Plano salvo, mas nenhum tenant utiliza esse plano. Para aplicar o preço, abra o tenant e use “Alterar plano”."
    );
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
              Esta área consolida todos os tenants. Cada card mostra assinatura, trial, voucher e os usuários vinculados
              ao tenant sem misturar com a operação dos usuários comuns.
            </p>
          </div>
          <span className="w-fit rounded-full border border-amber-300/40 bg-zinc-950/70 px-3 py-1 text-xs font-semibold text-amber-200">
            liaflow.ai@gmail.com
          </span>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5 xl:col-span-2">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <DollarSign className="text-emerald-300" size={18} />
              <h2 className="font-semibold text-white">Preços base da plataforma</h2>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              Defina o valor mensal padrão usado nas assinaturas e nos checkouts do Mercado Pago. Alterar um plano cancela cobranças abertas dele para que a próxima seja recriada com o novo valor.
            </p>
          </div>
          <span className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border border-zinc-700 bg-zinc-950/60 px-3 text-xs font-medium text-zinc-300">
            {billingPlans.length} {billingPlans.length === 1 ? "plano" : "planos"}
          </span>
        </div>
        <BillingPlansPanel
          disabledKey={planLoading}
          plans={billingPlans}
          onSubmit={updateBillingPlan}
        />
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
              Um card por tenant. Usuários, trial e voucher ficam recolhidos para manter a visão limpa.
            </p>
          </div>
          <div className="grid gap-4 p-4">
            {tenants.map((tenant) => (
              <article className="rounded-lg border border-zinc-800 bg-zinc-950/45" key={tenant.id}>
                <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-white">{tenant.name}</p>
                      <Badge>{tenant.status}</Badge>
                      <Badge>{billingLabel(tenant.subscription_status ?? tenant.billing_status)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">{tenant.slug}</p>
                    <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2 2xl:grid-cols-4">
                      <SummaryPill
                        label="Owner"
                        value={tenant.owner_name ? `${tenant.owner_name} (${tenant.owner_email})` : "não definido"}
                      />
                      <SummaryPill label="Usuários" value={`${tenant.member_count} membro(s)`} />
                      <SummaryPill
                        label="Plano"
                        value={
                          tenant.plan_name && tenant.plan_amount_cents !== null
                            ? `${tenant.plan_name} · ${formatCurrency(tenant.plan_amount_cents)}/mês`
                            : "não configurado"
                        }
                      />
                      <SummaryPill
                        label="Voucher"
                        value={tenant.discount_percent && Number(tenant.discount_percent) > 0 ? `${Number(tenant.discount_percent).toFixed(0)}% ativo` : "sem voucher"}
                      />
                    </div>
                  </div>

                  <div className="grid min-w-[220px] gap-2 text-xs">
                    <StatusBlock
                      label="Assinatura"
                      value={billingLabel(tenant.subscription_status ?? tenant.billing_status)}
                      detail={
                        tenant.plan_name && tenant.plan_amount_cents !== null
                          ? `${tenant.plan_name} · ${formatCurrency(tenant.plan_amount_cents)}/mês`
                          : "Plano não configurado"
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-3 border-t border-zinc-800 p-4">
                  <details className="rounded-md border border-zinc-800 bg-zinc-900/50">
                    <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-900">
                      <span className="inline-flex items-center gap-2">
                        <Users size={15} />
                        Usuários deste tenant
                      </span>
                      <span className="text-xs text-zinc-500">{tenant.member_count} membro(s)</span>
                    </summary>
                    <div className="grid gap-2 border-t border-zinc-800 p-3">
                      {tenant.members.length ? tenant.members.map((member) => (
                        <div
                          className="grid gap-2 rounded-md bg-zinc-950/60 px-3 py-2 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center"
                          key={member.membership_id}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-white">{member.name ?? "Usuário sem nome"}</p>
                            <p className="truncate text-xs text-zinc-500">{member.email}</p>
                          </div>
                          <Badge>{member.role_name ?? member.role_key ?? "sem função"}</Badge>
                          <Badge>{member.is_super_admin ? "superadmin" : member.member_status}</Badge>
                        </div>
                      )) : <EmptyState text="Nenhum usuário vinculado a este tenant." />}
                    </div>
                  </details>

                  <details className="rounded-md border border-zinc-800 bg-zinc-900/50">
                    <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-900">
                      <span className="inline-flex items-center gap-2">
                        <Gift size={15} />
                        Trial, voucher e cobrança
                      </span>
                      <span className="text-xs text-zinc-500">
                        {tenant.discount_percent && Number(tenant.discount_percent) > 0
                          ? `Voucher ${Number(tenant.discount_percent).toFixed(0)}%`
                          : "Sem voucher"}
                      </span>
                    </summary>
                    <div className="grid gap-4 border-t border-zinc-800 p-3 lg:grid-cols-[1fr_340px]">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <StatusBlock
                          label="Trial/assinatura"
                          value={billingLabel(tenant.subscription_status ?? tenant.billing_status)}
                          detail={tenant.current_period_end ? `Válida até ${new Intl.DateTimeFormat("pt-BR").format(new Date(tenant.current_period_end))}` : "Sem vencimento definido"}
                        />
                        <StatusBlock
                          label="Voucher"
                          value={tenant.discount_percent && Number(tenant.discount_percent) > 0 ? `${Number(tenant.discount_percent).toFixed(0)}% de desconto` : "Sem voucher ativo"}
                          detail={
                            tenant.discount_percent && Number(tenant.discount_percent) > 0
                              ? `Expira em ${tenant.discount_expires_at ? new Intl.DateTimeFormat("pt-BR").format(new Date(tenant.discount_expires_at)) : "data não definida"}`
                              : "Aplique um desconto por prazo definido para este tenant."
                          }
                        />
                      </div>
                      <TenantBillingActions
                        key={`${tenant.id}-${tenant.plan_id ?? "no-plan"}`}
                        disabled={billingLoading === tenant.id}
                        currentPlanId={tenant.plan_id}
                        plans={billingPlans}
                        tenantId={tenant.id}
                        onSubmit={updateTenantBilling}
                      />
                    </div>
                  </details>
                </div>
              </article>
            ))}
            {tenants.length === 0 ? <EmptyState text="Nenhum tenant cadastrado." /> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function TenantBillingActions({
  currentPlanId,
  disabled,
  onSubmit,
  plans,
  tenantId
}: {
  currentPlanId: string | null;
  disabled: boolean;
  onSubmit: (tenantId: string, input: Record<string, unknown>) => void;
  plans: BillingPlanRow[];
  tenantId: string;
}) {
  const [trialDays, setTrialDays] = useState(14);
  const [discountPercent, setDiscountPercent] = useState(50);
  const [voucherDays, setVoucherDays] = useState(30);
  const [selectedPlanId, setSelectedPlanId] = useState(currentPlanId ?? "");

  function futureDate(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + Math.max(1, days));
    return date.toISOString();
  }

  return (
    <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Plano deste tenant</p>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-zinc-500">Plano e valor mensal</span>
            <select
              className="focus-ring h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs"
              onChange={(event) => setSelectedPlanId(event.target.value)}
              value={selectedPlanId}
            >
              <option disabled value="">Selecione um plano</option>
              {plans.filter((plan) => plan.active || plan.id === currentPlanId).map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} · {formatCurrency(plan.amount_cents)}/mês{plan.active ? "" : " (inativo)"}
                </option>
              ))}
            </select>
          </label>
          <button
            className="focus-ring mt-5 inline-flex h-9 items-center gap-1 rounded-md border border-emerald-400/40 px-3 text-xs text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50"
            disabled={disabled || !selectedPlanId || selectedPlanId === currentPlanId}
            type="button"
            onClick={() => onSubmit(tenantId, { action: "change_plan", planId: selectedPlanId })}
          >
            <DollarSign size={14} />
            Alterar plano
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-zinc-600">
          A troca vale imediatamente. Cobranças abertas são substituídas no próximo checkout; pagamentos concluídos não são alterados.
        </p>
      </div>

      <div className="border-t border-zinc-800 pt-3">
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

function BillingPlansPanel({
  disabledKey,
  onSubmit,
  plans
}: {
  disabledKey: string;
  onSubmit: (input: Record<string, unknown>) => void;
  plans: BillingPlanRow[];
}) {
  const [newPlanKey, setNewPlanKey] = useState("");
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanAmount, setNewPlanAmount] = useState("50,00");

  function submitPlan(event: React.FormEvent<HTMLFormElement>, currentKey?: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const key = String(form.get("planKey") ?? currentKey ?? "").trim();
    const name = String(form.get("planName") ?? "").trim();
    const amountCents = moneyToCents(String(form.get("planAmount") ?? ""));
    const active = form.get("planActive") === "on";
    if (!key || !name || amountCents < 100) return;
    onSubmit({ key, name, amountCents, active });
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        {plans.map((plan) => (
          <form
            className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"
            key={`${plan.id}-${plan.updated_at}`}
            onSubmit={(event) => submitPlan(event, plan.key)}
          >
            <input name="planKey" type="hidden" value={plan.key} />
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(160px,200px)_100px_140px] lg:items-end">
              <label className="min-w-0">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Nome do plano</span>
                <input
                  className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  defaultValue={plan.name}
                  name="planName"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Valor mensal</span>
                <input
                  className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  defaultValue={centsToInput(plan.amount_cents)}
                  inputMode="decimal"
                  name="planAmount"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Disponível</span>
                <span className="flex min-h-10 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300">
                  <input className="h-4 w-4 accent-emerald-300" defaultChecked={plan.active} name="planActive" type="checkbox" />
                  Ativo
                </span>
              </label>
              <button
                className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-300 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 disabled:opacity-60"
                disabled={disabledKey === plan.key}
                type="submit"
              >
                {disabledKey === plan.key ? "Salvando..." : "Salvar preço"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800/80 pt-3 text-xs text-zinc-500">
              <span>
                Chave: <span className="font-mono text-zinc-300">{plan.key}</span>
              </span>
              <span className={plan.tenant_count === 0 ? "font-medium text-amber-300" : "text-emerald-300"}>
                {plan.tenant_count} {plan.tenant_count === 1 ? "tenant vinculado" : "tenants vinculados"}
              </span>
              <span>{plan.open_invoice_count} {plan.open_invoice_count === 1 ? "cobrança aberta" : "cobranças abertas"}</span>
            </div>
          </form>
        ))}
        {plans.length === 0 ? <EmptyState text="Nenhum plano de cobrança cadastrado." /> : null}
      </div>

      <form className="grid h-fit gap-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 p-3 sm:grid-cols-2 lg:grid-cols-[180px_1fr_180px_100px_140px] lg:items-end" onSubmit={(event) => submitPlan(event)}>
        <div>
          <p className="text-sm font-semibold text-white">Novo plano base</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">Crie outra opção de assinatura.</p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Chave</span>
          <input
            className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            name="planKey"
            onChange={(event) => setNewPlanKey(event.target.value)}
            pattern="[a-z0-9]+(_[a-z0-9]+)*"
            placeholder="starter_99"
            required
            value={newPlanKey}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Nome</span>
          <input
            className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            name="planName"
            onChange={(event) => setNewPlanName(event.target.value)}
            placeholder="Starter"
            required
            value={newPlanName}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Valor mensal</span>
          <input
            className="focus-ring w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            inputMode="decimal"
            name="planAmount"
            onChange={(event) => setNewPlanAmount(event.target.value)}
            required
            value={newPlanAmount}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Disponível</span>
          <span className="flex min-h-10 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300">
            <input className="h-4 w-4 accent-emerald-300" defaultChecked name="planActive" type="checkbox" />
            Ativo
          </span>
        </label>
        <button
          className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-300/20 disabled:opacity-60"
          disabled={disabledKey === "new"}
          type="submit"
        >
          {disabledKey === "new" ? "Criando..." : "Criar plano"}
        </button>
      </form>
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

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">{label}</p>
      <p className="mt-1 truncate text-xs font-medium text-zinc-300">{value}</p>
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

function moneyToCents(value: string) {
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function centsToInput(value: number) {
  return (Number(value) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatCurrency(valueInCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(valueInCents) / 100);
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

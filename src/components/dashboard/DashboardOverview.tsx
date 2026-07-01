import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Calculator,
  FileText,
  PackagePlus,
  Settings,
  ShieldCheck,
  Sparkles,
  Truck,
  UserPlus,
  Users
} from "lucide-react";
import type { BillingOverview } from "@/repositories/billing";
import type { DashboardOverview as DashboardOverviewData } from "@/repositories/dashboard";

type DashboardOverviewProps = {
  data: DashboardOverviewData;
  billing: BillingOverview | null;
};

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2
});

const numberFormatter = new Intl.NumberFormat("pt-BR");

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  accepted: "Aceito",
  rejected: "Recusado",
  expired: "Expirado",
  cancelled: "Cancelado",
  active: "Ativo",
  trialing: "Trial",
  past_due: "Pendente",
  blocked: "Bloqueado"
};

const statusStyles: Record<string, string> = {
  accepted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  sent: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  trialing: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  draft: "border-zinc-600 bg-zinc-800/80 text-zinc-200",
  rejected: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  cancelled: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  expired: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  past_due: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  blocked: "border-rose-500/30 bg-rose-500/10 text-rose-200"
};

export function DashboardOverview({ data, billing }: DashboardOverviewProps) {
  const conversionBase = data.metrics.accepted_month + data.metrics.rejected_month + data.metrics.pending_month;
  const conversionRate = conversionBase > 0 ? (data.metrics.accepted_month / conversionBase) * 100 : 0;
  const melhorEnvio = getIntegrationStatus(data, "melhor_envio");
  const olist = getIntegrationStatus(data, "olist");
  const olistCrm = getIntegrationStatus(data, "olist_crm");
  const hasSenderAddress = Boolean(
    data.tenantProfile?.postal_code && data.tenantProfile.city && data.tenantProfile.state
  );
  const hasCompanyData = Boolean(
    data.tenantProfile?.name && data.tenantProfile.company_phone && data.tenantProfile.company_document
  );
  const setupItems = [
    { label: "Dados da empresa", done: hasCompanyData, href: "/settings" },
    { label: "Logo cadastrada", done: Boolean(data.tenantProfile?.logo_url), href: "/settings" },
    { label: "CEP/remetente", done: hasSenderAddress, href: "/settings" },
    { label: "Produtos e curvas", done: data.setup.variants_count > 0 && data.setup.variants_without_curve === 0, href: "/products" },
    { label: "Canais de venda", done: data.setup.platforms_count > 0, href: "/platforms" },
    { label: "Embalagens", done: data.setup.packaging_count > 0, href: "/packaging" },
    { label: "Integrações", done: melhorEnvio === "active" || olist === "active" || olistCrm === "active", href: "/settings" },
    { label: "Equipe", done: data.setup.active_members > 1 || data.setup.invited_members > 0, href: "/users" }
  ];
  const completedSetup = setupItems.filter((item) => item.done).length;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<FileText size={18} />}
          label="Orçamentos no mês"
          value={String(data.metrics.quotes_month)}
          detail={`${money(Number(data.metrics.quoted_total_month))} orçados`}
        />
        <MetricCard
          icon={<Sparkles size={18} />}
          label="Ticket médio"
          value={money(Number(data.metrics.avg_ticket_month))}
          detail={`${data.metrics.accepted_month} aceitos no mês`}
        />
        <MetricCard
          icon={<BadgeCheck size={18} />}
          label="Conversão"
          value={`${conversionRate.toFixed(1).replace(".", ",")}%`}
          detail={`${data.metrics.pending_month} pendentes para acompanhar`}
        />
        <MetricCard
          icon={<ShieldCheck size={18} />}
          label="Margem média recente"
          value={`${Number(data.metrics.avg_margin_recent).toFixed(1).replace(".", ",")}%`}
          detail={
            data.metrics.low_margin_count > 0
              ? `${data.metrics.low_margin_count} orçamentos com margem baixa`
              : "Sem alertas nos últimos 30 dias"
          }
          tone={data.metrics.low_margin_count > 0 ? "warning" : "default"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <Panel
          title="Atalhos rápidos"
          description="Ações mais frequentes para atendimento, cadastro e frete."
          action={<LinkButton href="/pricing" label="Abrir precificador" />}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Shortcut href="/pricing" icon={<Calculator size={18} />} label="Novo orçamento" detail="Calcular, gerar PDF e WhatsApp" />
            <Shortcut href="/customers" icon={<Users size={18} />} label="Novo cliente" detail="Cadastro com CEP automático" />
            <Shortcut href="/products" icon={<PackagePlus size={18} />} label="Novo produto" detail="Curvas, âncoras e variantes" />
            <Shortcut href="/shipping" icon={<Truck size={18} />} label="Cotar frete" detail="Origem do tenant por padrão" />
            <Shortcut href="/platforms" icon={<Settings size={18} />} label="Canais" detail="Comissão, taxa e ordem" />
            <Shortcut href="/users" icon={<UserPlus size={18} />} label="Convidar usuário" detail="Papéis e permissões" />
          </div>
        </Panel>

        <Panel title="Assinatura" description="Status financeiro do tenant.">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-400">{billing?.plan_name ?? "Plano não configurado"}</p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {billing ? centsToMoney(billing.discounted_amount_cents) : "R$ 0,00"}
                </p>
              </div>
              <StatusBadge status={billing?.subscription_status ?? "blocked"} />
            </div>
            {billing?.discount_percent ? (
              <p className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100">
                Voucher de {Number(billing.discount_percent).toFixed(0)}% ativo
                {billing.discount_expires_at ? ` até ${formatDate(billing.discount_expires_at)}` : ""}.
              </p>
            ) : null}
            {billing?.trial_ends_at ? (
              <p className="text-sm text-zinc-400">Trial até {formatDate(billing.trial_ends_at)}.</p>
            ) : null}
            <LinkButton href="/billing" label={billing?.latest_invoice_checkout_url ? "Regularizar pagamento" : "Ver cobrança"} />
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel
          title="Últimos orçamentos"
          description="Acompanhe o que foi criado recentemente e abra o detalhe para PDF, WhatsApp e integrações."
          action={<LinkButton href="/pricing" label="Criar orçamento" />}
        >
          <div className="space-y-2">
            {data.recentQuotes.length === 0 ? (
              <EmptyState title="Nenhum orçamento criado" detail="Use o precificador para criar o primeiro orçamento deste tenant." />
            ) : (
              data.recentQuotes.map((quote) => (
                <Link
                  className="group grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/5 sm:grid-cols-[1fr_auto_auto]"
                  href={`/quotes/${quote.id}`}
                  key={quote.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {quote.customer_name ?? "Cliente não informado"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">{formatDate(quote.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <StatusBadge status={quote.status} />
                    <span className="text-sm font-semibold text-white">{money(Number(quote.grand_total))}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-cyan-200">
                    Abrir <ArrowUpRight size={14} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Produtos mais orçados" description="Ranking dos últimos 90 dias por valor orçado.">
          <div className="space-y-3">
            {data.topProducts.length === 0 ? (
              <EmptyState title="Sem histórico por produto" detail="Os produtos aparecerão aqui conforme os orçamentos forem gerados." />
            ) : (
              data.topProducts.map((product) => (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3" key={product.variant_id}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-medium text-white">{product.product_label}</p>
                    <p className="shrink-0 text-sm font-semibold text-cyan-100">{money(Number(product.total_value))}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-400">
                    <span>{product.quote_count} orç.</span>
                    <span>{numberFormatter.format(product.total_quantity)} un.</span>
                    <span>{Number(product.avg_margin).toFixed(1).replace(".", ",")}% margem</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel title="Saúde da precificação" description="Alertas para evitar orçamento com cadastro incompleto.">
          <HealthItem
            href="/products"
            label="Produtos sem curva ativa"
            value={data.setup.variants_without_curve}
            okText="Todas as variantes têm curva"
          />
          <HealthItem
            href="/platforms"
            label="Canais sem comissão, taxa ou frete vendedor"
            value={data.setup.platforms_without_fee}
            okText="Canais principais configurados"
          />
          <HealthItem
            href="/quotes"
            label="Margem baixa em 30 dias"
            value={data.metrics.low_margin_count}
            okText="Margens recentes saudáveis"
          />
        </Panel>

        <Panel title="Frete e integrações" description="Condições para cálculo e fluxo de envio.">
          <IntegrationRow label="Melhor Envio" status={melhorEnvio} />
          <IntegrationRow label="Olist clientes" status={olist} />
          <IntegrationRow label="Olist CRM" status={olistCrm} />
          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-zinc-300">CEP/remetente</span>
              <StatusBadge status={hasSenderAddress ? "active" : "expired"} label={hasSenderAddress ? "Configurado" : "Incompleto"} />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {hasSenderAddress
                ? `${data.tenantProfile?.postal_code} · ${data.tenantProfile?.city}/${data.tenantProfile?.state}`
                : "Complete os dados do tenant para usar o CEP de origem automaticamente."}
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
            <span className="text-zinc-300">Envios em andamento</span>
            <span className="font-semibold text-white">{data.setup.shipments_pending}</span>
          </div>
        </Panel>

        <Panel title="Checklist do tenant" description={`${completedSetup} de ${setupItems.length} etapas concluídas.`}>
          <div className="space-y-2">
            {setupItems.map((item) => (
              <Link
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/5"
                href={item.href}
                key={item.label}
              >
                <span className={item.done ? "text-zinc-200" : "text-zinc-400"}>{item.label}</span>
                <span
                  className={
                    item.done
                      ? "rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-medium text-emerald-200"
                      : "rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-200"
                  }
                >
                  {item.done ? "Ok" : "Pendente"}
                </span>
              </Link>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "default"
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={
        tone === "warning"
          ? "rounded-lg border border-amber-400/25 bg-amber-400/10 p-4"
          : "rounded-lg border border-zinc-800 bg-zinc-900/70 p-4"
      }
    >
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <span className={tone === "warning" ? "text-amber-200" : "text-cyan-200"}>{icon}</span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className={tone === "warning" ? "mt-1 text-sm text-amber-100/80" : "mt-1 text-sm text-zinc-500"}>{detail}</p>
    </div>
  );
}

function Panel({
  title,
  description,
  action,
  children
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 shadow-2xl shadow-black/10">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {description ? <p className="mt-1 text-sm text-zinc-400">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Shortcut({ href, icon, label, detail }: { href: string; icon: React.ReactNode; label: string; detail: string }) {
  return (
    <Link
      className="group rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/5"
      href={href}
    >
      <div className="flex items-center gap-2 text-cyan-200">
        {icon}
        <span className="text-sm font-semibold text-white">{label}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-500 group-hover:text-zinc-300">{detail}</p>
    </Link>
  );
}

function HealthItem({ href, label, value, okText }: { href: string; label: string; value: number; okText: string }) {
  const hasAlert = value > 0;
  return (
    <Link
      className="mb-3 flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/5"
      href={href}
    >
      <span className={hasAlert ? "mt-0.5 text-amber-200" : "mt-0.5 text-emerald-200"}>
        {hasAlert ? <AlertTriangle size={17} /> : <BadgeCheck size={17} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">{hasAlert ? label : okText}</span>
        <span className="mt-1 block text-xs text-zinc-500">
          {hasAlert ? `${value} item${value > 1 ? "s" : ""} precisa${value > 1 ? "m" : ""} de revisão.` : "Nenhuma ação necessária agora."}
        </span>
      </span>
    </Link>
  );
}

function IntegrationRow({ label, status }: { label: string; status: string | null }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      <span className="text-sm text-zinc-300">{label}</span>
      <StatusBadge status={status ?? "expired"} label={status === "active" ? "Ativa" : status ? statusLabels[status] ?? status : "Não conectada"} />
    </div>
  );
}

function LinkButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/20"
      href={href}
    >
      {label}
      <ArrowUpRight size={14} />
    </Link>
  );
}

function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
        statusStyles[status] ?? "border-zinc-700 bg-zinc-800/80 text-zinc-200"
      }`}
    >
      {label ?? statusLabels[status] ?? status}
    </span>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 p-4 text-center">
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{detail}</p>
    </div>
  );
}

function getIntegrationStatus(data: DashboardOverviewData, provider: string) {
  return data.integrations.find((item) => item.provider === provider)?.status ?? null;
}

function money(value: number) {
  return moneyFormatter.format(Number.isFinite(value) ? value : 0);
}

function centsToMoney(value: number) {
  return money(value / 100);
}

function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return dateFormatter.format(date);
}

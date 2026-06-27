import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentSession } from "@/lib/auth/session";
import { listAuditLogs, listIntegrationLogs, type AuditLogRow, type IntegrationLogRow } from "@/repositories/audit";
import { getSessionProfile, userHasPermission } from "@/repositories/users";

export default async function AuditPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, allowed] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    userHasPermission(session.userId, session.tenantId, "settings:manage")
  ]);
  if (!profile) redirect("/login");

  const [auditLogs, integrationLogs] = allowed
    ? await Promise.all([
        listAuditLogs(session.userId, session.tenantId),
        listIntegrationLogs(session.userId, session.tenantId)
      ])
    : [[], []];

  return (
    <AppShell title="Auditoria" subtitle="Eventos internos e historico de integracoes." tenantName={profile.tenant_name}>
      {allowed ? (
        <div className="grid gap-6">
          <AuditTable rows={auditLogs} />
          <IntegrationTable rows={integrationLogs} />
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          Seu usuario nao tem permissao para visualizar auditoria.
        </div>
      )}
    </AppShell>
  );
}

function AuditTable({ rows }: { rows: AuditLogRow[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-zinc-950">Eventos do sistema</h2>
        <p className="text-sm text-zinc-500">Ultimos {rows.length} registros de escrita no tenant.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Data</th>
              <th className="px-5 py-3 font-semibold">Acao</th>
              <th className="px-5 py-3 font-semibold">Entidade</th>
              <th className="px-5 py-3 font-semibold">Usuario</th>
              <th className="px-5 py-3 font-semibold">Metadados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="whitespace-nowrap px-5 py-3 text-zinc-600">{formatDate(row.created_at)}</td>
                <td className="px-5 py-3 font-medium text-zinc-950">{row.action}</td>
                <td className="px-5 py-3 text-zinc-600">
                  <div>{row.entity_type}</div>
                  {row.entity_id ? <div className="mt-1 max-w-56 truncate text-xs text-zinc-400">{row.entity_id}</div> : null}
                </td>
                <td className="px-5 py-3 text-zinc-600">
                  <div>{row.actor_name ?? "Sistema"}</div>
                  {row.actor_email ? <div className="mt-1 text-xs text-zinc-400">{row.actor_email}</div> : null}
                </td>
                <td className="px-5 py-3">{renderMetadata(row.metadata)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-center text-zinc-500" colSpan={5}>
                  Nenhum evento encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IntegrationTable({ rows }: { rows: IntegrationLogRow[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-zinc-950">Integracoes</h2>
        <p className="text-sm text-zinc-500">Chamadas para provedores externos e respostas registradas.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Data</th>
              <th className="px-5 py-3 font-semibold">Provider</th>
              <th className="px-5 py-3 font-semibold">Operacao</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Mensagem</th>
              <th className="px-5 py-3 font-semibold">Metadados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="whitespace-nowrap px-5 py-3 text-zinc-600">{formatDate(row.created_at)}</td>
                <td className="px-5 py-3 font-medium text-zinc-950">{row.provider}</td>
                <td className="px-5 py-3 text-zinc-600">
                  <div>{row.operation}</div>
                  {row.external_id ? <div className="mt-1 max-w-48 truncate text-xs text-zinc-400">{row.external_id}</div> : null}
                </td>
                <td className="px-5 py-3">
                  <span className={statusClassName(row.status)}>{row.status}</span>
                </td>
                <td className="max-w-sm px-5 py-3 text-zinc-600">{row.message ?? "-"}</td>
                <td className="px-5 py-3">{renderMetadata(row.metadata)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-center text-zinc-500" colSpan={6}>
                  Nenhuma chamada de integracao encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function renderMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata || Object.keys(metadata).length === 0) return <span className="text-zinc-400">-</span>;

  return (
    <details className="max-w-sm">
      <summary className="cursor-pointer text-brand hover:underline">Ver dados</summary>
      <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-100">
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </details>
  );
}

function statusClassName(status: string) {
  const base = "inline-flex rounded-full px-2 py-1 text-xs font-medium";
  if (status === "success") return `${base} bg-emerald-50 text-emerald-700`;
  if (status === "error") return `${base} bg-red-50 text-red-700`;
  return `${base} bg-zinc-100 text-zinc-700`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo"
  }).format(new Date(value));
}

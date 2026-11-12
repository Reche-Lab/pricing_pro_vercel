import type pg from "pg";
import { getPool } from "@/lib/db/client";
import { commerceTransaction } from "./commerce";
import { commerceDomains } from "@/domain/commerce/domains";
import { CommerceError } from "@/domain/commerce/commerce";
import { domainRequestSchema, dnsRecordName, canApproveDomain, type DomainSetup, type DnsCheck, type DnsRecord } from "@/domain/commerce/domain-setup";

const columns = `d.id,d.tenant_id,d.hostname,d.dns_provider,d.verification_token,d.expected_records,d.operator_note,d.revision,
  d.vercel_added_at::text,d.https_confirmed_at::text,d.approved_at::text,d.last_check,t.name as tenant_name,t.slug as tenant_slug`;
function publicRow(row: DomainSetup): DomainSetup { return { ...row, authorized: commerceDomains()[row.hostname] === row.tenant_slug }; }
export async function listStoreDomains(tenantId?: string) {
  return (await getPool().query<DomainSetup>(`select ${columns} from commerce_domain_requests d join tenants t on t.id=d.tenant_id where ($1::uuid is null or d.tenant_id=$1) order by d.created_at desc limit 150`, [tenantId ?? null])).rows.map(publicRow);
}
export async function getStoreDomain(id: string, tenantId?: string) {
  const row = (await getPool().query<DomainSetup>(`select ${columns} from commerce_domain_requests d join tenants t on t.id=d.tenant_id where d.id=$1 and ($2::uuid is null or d.tenant_id=$2)`, [id, tenantId ?? null])).rows[0];
  if (!row) throw new CommerceError("Domínio não encontrado.", 404);
  return publicRow(row);
}
async function audit(client: pg.PoolClient, actor: string, tenant: string, action: string, id?: string) {
  await client.query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id) values($1,$2,$3,'commerce_domain',$4)", [tenant, actor, action, id ?? null]);
}
export async function requestStoreDomains(actor: string, tenantId: string, raw: unknown) {
  const input = domainRequestSchema.parse(raw), hosts = [input.hostname];
  if (input.includeWww && !input.hostname.startsWith("www.")) hosts.push(`www.${input.hostname}`);
  if (hosts.some(host => host.length > 253)) throw new CommerceError("Domínio muito longo.");
  try {
    await commerceTransaction(async client => {
      const store = (await client.query<{ slug: string }>("select t.slug from commerce_stores s join tenants t on t.id=s.tenant_id where s.tenant_id=$1 for update of s", [tenantId])).rows[0];
      if (!store) throw new CommerceError("Salve a loja antes de solicitar o domínio.");
      if (hosts.some(host => commerceDomains()[host] && commerceDomains()[host] !== store.slug)) throw new CommerceError("Este domínio já possui um vínculo autorizado. Fale com a administração.", 409);
      const existing = (await client.query<{ hostname: string }>("select hostname from commerce_domain_requests where tenant_id=$1", [tenantId])).rows;
      if (existing.length + hosts.filter(host => !existing.some(row => row.hostname === host)).length > 6) throw new CommerceError("Limite de seis domínios por loja. Fale com a administração.");
      for (const host of hosts) {
        const result = await client.query<{ id: string }>(`insert into commerce_domain_requests(tenant_id,hostname,dns_provider) values($1,$2,$3)
          on conflict(hostname) do update set dns_provider=excluded.dns_provider,updated_at=now()
          where commerce_domain_requests.tenant_id=excluded.tenant_id returning id`, [tenantId, host, input.provider]);
        if (!result.rowCount) throw new CommerceError("Este domínio já possui uma solicitação. Fale com a administração.", 409);
        await audit(client, actor, tenantId, "commerce.domain.request", result.rows[0].id);
      }
    });
  } catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "23505") throw new CommerceError("Domínio já solicitado. Fale com a administração.", 409); throw error; }
  return listStoreDomains(tenantId);
}
export async function saveDomainOperatorConfig(actor: string, row: DomainSetup, input: { revision: number; records: DnsRecord[]; note: string; vercelAdded: boolean; httpsConfirmed: boolean }) {
  let records: DnsRecord[];
  try { records = input.records.map(record => ({ ...record, name: dnsRecordName(record.name, row.hostname) })); }
  catch { throw new CommerceError("O nome de cada registro deve pertencer ao domínio solicitado."); }
  if (new Set(records.map(record => `${record.type}:${record.name}:${record.value}`)).size !== records.length) throw new CommerceError("Remova os registros duplicados.");
  if (records.some(record => record.type === "CNAME" && records.some(other => other.name === record.name && ["A", "AAAA"].includes(other.type)))) throw new CommerceError("Não misture CNAME com A/AAAA no mesmo nome.");
  await commerceTransaction(async client => {
    const result = await client.query(`update commerce_domain_requests set expected_records=$3,operator_note=$4,
      vercel_added_at=case when $5::boolean then coalesce(vercel_added_at,now()) else null end,
      https_confirmed_at=case when $6::boolean then coalesce(https_confirmed_at,now()) else null end,
      approved_at=null,approved_by=null,last_check=null,revision=revision+1,updated_at=now()
      where id=$1 and revision=$2 returning id`, [row.id, input.revision, JSON.stringify(records), input.note, input.vercelAdded, input.httpsConfirmed]);
    if (!result.rowCount) throw new CommerceError("A configuração mudou. Recarregue antes de salvar.", 409);
    await audit(client, actor, row.tenant_id, "commerce.domain.operator_config", row.id);
  });
  return getStoreDomain(row.id);
}
export async function storeDomainCheck(actor: string, row: DomainSetup, check: DnsCheck) {
  await commerceTransaction(async client => {
    const result = await client.query("update commerce_domain_requests set last_check=$3,updated_at=now() where id=$1 and revision=$2 returning id", [row.id, row.revision, JSON.stringify(check)]);
    if (!result.rowCount) throw new CommerceError("Os registros mudaram durante a consulta. Verifique novamente.", 409);
    await audit(client, actor, row.tenant_id, "commerce.domain.dns_check", row.id);
  });
  return getStoreDomain(row.id, row.tenant_id);
}
export async function approveStoreDomain(actor: string, id: string, revision: number) {
  await commerceTransaction(async client => {
    const row = (await client.query<DomainSetup>("select * from commerce_domain_requests where id=$1 and revision=$2 for update", [id, revision])).rows[0];
    if (!row) throw new CommerceError("A configuração mudou. Recarregue.", 409);
    if (!canApproveDomain(row)) throw new CommerceError("Confirme Vercel e HTTPS e faça uma consulta DNS válida nos últimos 10 minutos, incluindo a prova TXT.", 409);
    await client.query("update commerce_domain_requests set approved_at=now(),approved_by=$2,revision=revision+1,updated_at=now() where id=$1", [id, actor]);
    await audit(client, actor, row.tenant_id, "commerce.domain.approve", id);
  });
  return getStoreDomain(id);
}

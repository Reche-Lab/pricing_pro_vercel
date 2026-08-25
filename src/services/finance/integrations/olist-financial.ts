import { parseMoneyToCents } from "@/domain/finance/csv";
import { decryptIntegrationCredentials, getIntegrationConnection, logIntegrationEvent, updateIntegrationCredentials } from "@/repositories/integrations";
import { OlistRequestError, olistRequest, refreshOlistToken } from "@/services/olist/olist";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";
import type { ExternalFinancialTransaction, FinancialIntegrationProvider, FinancialMatchCriteria, TenantFinancialContext } from "./types";

export type OlistFinancialResource = "accounts_receivable" | "accounts_payable";
export type OlistFinancialDiagnostic = {
  resource: OlistFinancialResource;
  label: string;
  path: string;
  status: "available" | "forbidden" | "authentication_required" | "error";
  httpStatus: number | null;
  count: number;
  message: string | null;
};
export type OlistFinancialSearchResult = {
  records: ExternalFinancialTransaction[];
  diagnostics: OlistFinancialDiagnostic[];
  partial: boolean;
};

const resources = [
  { path: "/contas-receber", type: "accounts_receivable", label: "Contas a receber" },
  { path: "/contas-pagar", type: "accounts_payable", label: "Contas a pagar" }
] as const;

export class OlistFinancialReadProvider implements FinancialIntegrationProvider {
  readonly provider = "olist";
  readonly capabilities = { listAccounts: false, readTransactions: true, createTransaction: false, createTransfer: false, reconcile: false };

  async listAccounts() { return []; }

  async searchTransactions(context: TenantFinancialContext, criteria: FinancialMatchCriteria) {
    return (await this.searchFinancialRecords(context, criteria)).records;
  }

  async searchFinancialRecords(context: TenantFinancialContext, criteria: FinancialMatchCriteria): Promise<OlistFinancialSearchResult> {
    const connection = await getIntegrationConnection(context.userId, context.tenantId, "olist");
    if (!connection || connection.status !== "active") throw new Error("Integração Olist não está conectada para este tenant.");
    const settings = connection.settings as OlistSettings;
    let credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
    const output: ExternalFinancialTransaction[] = [];
    const diagnostics: OlistFinancialDiagnostic[] = [];
    const maximumRecords = Math.max(1, Math.min(1000, criteria.limit ?? 500));

    for (const resource of resources) {
      try {
        const items: ExternalFinancialTransaction[] = [];
        let offset = 0;
        while (items.length < maximumRecords) {
          const query = new URLSearchParams({
            dataInicialEmissao: criteria.dateFrom,
            dataFinalEmissao: criteria.dateTo,
            limit: String(Math.min(100, maximumRecords - items.length)),
            offset: String(offset),
            orderBy: "asc"
          });
          const data = await requestWithRefresh(context, settings, credentials, `${resource.path}?${query}`, (refreshed) => {
            credentials = refreshed;
          });
          const parsedPage = parseOlistFinancialPage(data);
          const page = parsedPage.items;
          items.push(...page.map((item) => normalize(item, resource.type)));
          const total = parsedPage.total;
          offset += page.length;
          if (!page.length || page.length < Number(query.get("limit")) || (total !== null && offset >= total)) break;
        }
        output.push(...items);
        diagnostics.push({ resource: resource.type, label: resource.label, path: resource.path,
          status: "available", httpStatus: 200, count: items.length, message: null });
      } catch (error) {
        if (!(error instanceof OlistRequestError)) throw error;
        const status = error.status === 403 ? "forbidden" : error.status === 401 ? "authentication_required" : "error";
        diagnostics.push({ resource: resource.type, label: resource.label, path: resource.path,
          status, httpStatus: error.status, count: 0, message: financialAccessMessage(resource.label, error.status, error.message) });
        console.warn("Olist financial resource unavailable.", {
          tenantId: context.tenantId, resource: resource.type, path: resource.path,
          status: error.status, response: error.data, message: error.message
        });
      }
    }

    const unavailable = diagnostics.filter((item) => item.status !== "available");
    await safeLogIntegrationEvent(context, {
      provider: "olist", operation: "financial.accounts.list", status: unavailable.length === diagnostics.length ? "error" : "success",
      message: unavailable.length ? unavailable.map((item) => `${item.label}: ${item.message}`).join(" | ") : null,
      metadata: { dateFrom: criteria.dateFrom, dateTo: criteria.dateTo, recordCount: output.length, diagnostics }
    });
    return { records: output, diagnostics, partial: unavailable.length > 0 };
  }
}

async function requestWithRefresh(
  context: TenantFinancialContext,
  settings: OlistSettings,
  credentials: OlistCredentials,
  path: string,
  onRefresh: (credentials: OlistCredentials) => void
) {
  try {
    return await olistRequest({ settings, credentials, path, method: "GET" });
  } catch (error) {
    if (!(error instanceof OlistRequestError) || error.status !== 401 || !credentials.refreshToken) throw error;
    console.info("Olist financial request returned 401. Refreshing OAuth token once.", { path });
    const token = await refreshOlistToken(settings, credentials);
    const refreshed = { ...credentials, accessToken: token.access_token, refreshToken: token.refresh_token ?? credentials.refreshToken };
    await updateIntegrationCredentials(context.userId, context.tenantId, { provider: "olist", credentials: refreshed, status: "active" });
    onRefresh(refreshed);
    await safeLogIntegrationEvent(context, {
      provider: "olist", operation: "oauth.refresh_token", status: "success",
      metadata: { tokenType: token.token_type, expiresIn: token.expires_in, scope: token.scope, triggerPath: path }
    });
    return olistRequest({ settings, credentials: refreshed, path, method: "GET" });
  }
}

function normalize(item: Record<string, unknown>, recordType: ExternalFinancialTransaction["recordType"]): ExternalFinancialTransaction {
  const counterparty = object(item.cliente ?? item.fornecedor ?? item.contato);
  return {
    id: string(item.id) || `${recordType}-${string(item.numeroDocumento)}-${string(item.data)}`,
    recordType, date: nullableString(item.data ?? item.dataEmissao), dueDate: nullableString(item.dataVencimento),
    amountCents: money(item.valor ?? item.saldo ?? item.valorOriginal), status: nullableString(item.situacao),
    counterparty: nullableString(counterparty?.nome ?? counterparty?.razaoSocial),
    document: nullableString(item.numeroDocumento ?? item.documento), raw: item
  };
}

export function financialAccessMessage(label: string, status: number, fallback: string) {
  if (status === 401) return `${label}: a autenticação foi recusada mesmo após a tentativa de renovação. Verifique o usuário autorizado e refaça o OAuth.`;
  if (status === 403) return `${label}: o aplicativo não possui permissão de leitura para este módulo no Olist ERP.`;
  return `${label}: ${fallback}`;
}

export function parseOlistFinancialPage(value: unknown): { items: Record<string, unknown>[]; total: number | null } {
  return { items: records(value), total: paginationTotal(value) };
}

function records(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  const source = Array.isArray(value.itens) ? value.itens : Array.isArray(value.items) ? value.items : [];
  if (source.length) return source.filter(isRecord);
  return value.id !== undefined ? [value] : [];
}
function paginationTotal(value: unknown) {
  if (!isRecord(value) || !isRecord(value.paginacao)) return null;
  const total = Number(value.paginacao.total);
  return Number.isFinite(total) && total >= 0 ? total : null;
}
async function safeLogIntegrationEvent(
  context: TenantFinancialContext,
  event: Parameters<typeof logIntegrationEvent>[2]
) {
  try {
    await logIntegrationEvent(context.userId, context.tenantId, event);
  } catch (error) {
    console.error("Olist financial integration event could not be persisted.", {
      tenantId: context.tenantId,
      operation: event.operation,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
function isRecord(value:unknown):value is Record<string,unknown>{return Boolean(value)&&typeof value==="object"&&!Array.isArray(value)}
function object(value:unknown){return isRecord(value)?value:null} function string(value:unknown){return typeof value==="string"?value:typeof value==="number"?String(value):""} function nullableString(value:unknown){return string(value)||null}
function money(value:unknown){try{return value===null||value===undefined?null:parseMoneyToCents(string(value));}catch{return null}}

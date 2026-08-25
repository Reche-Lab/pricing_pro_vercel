import { parseMoneyToCents } from "@/domain/finance/csv";
import { decryptIntegrationCredentials, getIntegrationConnection, updateIntegrationCredentials } from "@/repositories/integrations";
import { OlistRequestError, olistRequest, refreshOlistToken } from "@/services/olist/olist";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";
import type { ExternalFinancialTransaction, FinancialIntegrationProvider, FinancialMatchCriteria, TenantFinancialContext } from "./types";

export class OlistFinancialReadProvider implements FinancialIntegrationProvider {
  readonly provider = "olist";
  readonly capabilities = { listAccounts: false, readTransactions: true, createTransaction: false, createTransfer: false, reconcile: false };

  async listAccounts() { return []; }

  async searchTransactions(context: TenantFinancialContext, criteria: FinancialMatchCriteria) {
    const connection = await getIntegrationConnection(context.userId, context.tenantId, "olist");
    if (!connection || connection.status !== "active") throw new Error("Integração Olist não está conectada para este tenant.");
    const settings = connection.settings as OlistSettings;
    let credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
    const query = new URLSearchParams({
      dataInicialEmissao: criteria.dateFrom, dataFinalEmissao: criteria.dateTo,
      limit: String(Math.min(100, criteria.limit ?? 100)), offset: "0", orderBy: "desc"
    });
    const output: ExternalFinancialTransaction[] = [];
    for (const [path, type] of [["/contas-receber", "accounts_receivable"], ["/contas-pagar", "accounts_payable"]] as const) {
      const response = await requestWithRefresh(context, settings, credentials, `${path}?${query}`);
      credentials = response.credentials;
      for (const item of records(response.data)) output.push(normalize(item, type));
    }
    return output;
  }
}

async function requestWithRefresh(context: TenantFinancialContext, settings: OlistSettings, credentials: OlistCredentials, path: string) {
  try {
    return { data: await olistRequest({ settings, credentials, path, method: "GET" }), credentials };
  } catch (error) {
    if (!(error instanceof OlistRequestError) || error.status !== 401 || !credentials.refreshToken) throw error;
    const token = await refreshOlistToken(settings, credentials);
    const refreshed = { ...credentials, accessToken: token.access_token, refreshToken: token.refresh_token ?? credentials.refreshToken };
    await updateIntegrationCredentials(context.userId, context.tenantId, { provider: "olist", credentials: refreshed, status: "active" });
    return { data: await olistRequest({ settings, credentials: refreshed, path, method: "GET" }), credentials: refreshed };
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
function records(value: unknown): Record<string, unknown>[] { if(Array.isArray(value))return value.filter(isRecord);if(!isRecord(value))return [];const source=Array.isArray(value.itens)?value.itens:Array.isArray(value.items)?value.items:[];return source.filter(isRecord); }
function isRecord(value:unknown):value is Record<string,unknown>{return Boolean(value)&&typeof value==="object"&&!Array.isArray(value)}
function object(value:unknown){return isRecord(value)?value:null} function string(value:unknown){return typeof value==="string"?value:typeof value==="number"?String(value):""} function nullableString(value:unknown){return string(value)||null}
function money(value:unknown){try{return value===null||value===undefined?null:parseMoneyToCents(string(value));}catch{return null}}


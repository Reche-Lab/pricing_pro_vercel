import { NextResponse } from "next/server";
import { z } from "zod";
import { getFinancialOverview } from "@/repositories/finance";
import { OlistFinancialReadProvider } from "@/services/finance/integrations/olist-financial";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";

export async function GET(request: Request) {
  const auth = await requireFinancePermission("finance:reconcile");
  if ("response" in auth) return auth.response;
  const competence = new URL(request.url).searchParams.get("competence") ?? "";
  if (!z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).safeParse(competence).success) return NextResponse.json({ ok: false, error: "Competência inválida." }, { status: 400 });
  try {
    const lastDay = new Date(Date.UTC(Number(competence.slice(0,4)), Number(competence.slice(5,7)), 0)).getUTCDate();
    const provider = new OlistFinancialReadProvider();
    const [olistResult, overview] = await Promise.all([
      provider.searchFinancialRecords(auth.session, { dateFrom: `${competence}-01`, dateTo: `${competence}-${lastDay}`, limit: 500 }),
      getFinancialOverview(auth.session.userId, auth.session.tenantId, competence)
    ]);
    const external = olistResult.records;
    const suggestions = overview.transactions.flatMap((local) => external.map((remote) => match(local, remote)).filter(Boolean));
    const availableResources = olistResult.diagnostics.filter((item) => item.status === "available");
    console.info("Olist financial read reconciliation completed.", {
      tenantId: auth.session.tenantId, competence, externalCount: external.length,
      suggestionCount: suggestions.length, partial: olistResult.partial, diagnostics: olistResult.diagnostics
    });
    const body = {
      ok: availableResources.length > 0,
      capabilities: provider.capabilities,
      external,
      suggestions,
      diagnostics: olistResult.diagnostics,
      partial: olistResult.partial,
      requiresOlistConfiguration: availableResources.length === 0,
      configurationPath: "/settings?section=olist",
      error: availableResources.length === 0
        ? "O aplicativo Olist não possui acesso aos módulos financeiros necessários. Libere a leitura de Contas a Receber e Contas a Pagar, atualize o Client Secret e refaça o OAuth."
        : null,
      warning: olistResult.partial
        ? "Consulta parcial: ao menos um módulo financeiro do Olist não está autorizado."
        : null
    };
    return NextResponse.json(body, { status: availableResources.length ? 200 : 403 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar o Olist.";
    if (message.includes("não está conectada")) {
      return NextResponse.json({
        ok: false,
        error: "A integração Olist ainda não está conectada para este tenant.",
        requiresOlistConfiguration: true,
        configurationPath: "/settings?section=olist"
      }, { status: 409 });
    }
    if (/invalid_grant|refreshToken|token request failed/i.test(message)) {
      return NextResponse.json({
        ok: false,
        error: "A sessão OAuth do Olist expirou ou foi revogada. Refaça a conexão para continuar.",
        requiresReconnect: true,
        configurationPath: "/settings?section=olist"
      }, { status: 401 });
    }
    return financeError(error, "olist_financial.search");
  }
}

function match(local: {id:string;transaction_date:string;amount_cents:string;counterparty:string|null}, remote: {id:string;recordType:string;date:string|null;dueDate:string|null;amountCents:number|null;counterparty:string|null}) {
  if (remote.amountCents === null || Math.abs(Number(local.amount_cents)) !== Math.abs(remote.amountCents)) return null;
  const expectedDirection = remote.recordType === "accounts_receivable" ? 1 : -1;
  if (Math.sign(Number(local.amount_cents)) !== expectedDirection) return null;
  const candidateDates = [remote.date, remote.dueDate].filter((value): value is string => Boolean(value));
  if (!candidateDates.length) return null;
  const localTime = new Date(`${local.transaction_date.slice(0,10)}T12:00:00Z`).getTime();
  const days = Math.min(...candidateDates.map((remoteDate) => Math.abs(localTime-new Date(`${remoteDate.slice(0,10)}T12:00:00Z`).getTime())/86400000));
  if (days > 3) return null;
  const sameName = local.counterparty && remote.counterparty && normalize(local.counterparty).includes(normalize(remote.counterparty).split(" ")[0]);
  return { localTransactionId: local.id, externalId: remote.id, recordType: remote.recordType, score: Number((0.7+(days===0?0.2:0.1)+(sameName?0.1:0)).toFixed(2)), reasons:["Mesmo valor e direção",days===0?"Mesma data":`Datas próximas (${days} dias)`,...(sameName?["Contraparte compatível"]:[])] };
}
function normalize(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase()}

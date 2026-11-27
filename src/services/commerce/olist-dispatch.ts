import { CommerceError } from "@/domain/commerce/commerce";
import { OlistRequestError } from "@/services/olist/olist";

type Row = Record<string, unknown>;
type Request = (path: string) => Promise<Row>;
export type CommerceOlistDispatchLookup = { filter: "idNota" | "idPedido"; offset: number; returned: number; matched: number };
type LookupLog = (details: CommerceOlistDispatchLookup) => void;
const record = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
const id = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : typeof value === "string" && /^[1-9]\d{0,14}$/.test(value) ? value : null;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export class OlistDispatchReviewRequired extends CommerceError {
  constructor(message: string) { super(message, 409, { code: "olist_dispatch_review_required" }); this.name = "OlistDispatchReviewRequired"; }
}

function unwrap(value: unknown, field: "itens" | "expedicoes", depth = 0): Row | null {
  const source = record(value);
  if (!source || depth > 3) return null;
  if (Array.isArray(source[field])) return source;
  for (const key of ["data", "retorno"]) {
    const found = unwrap(source[key], field, depth + 1);
    if (found) return found;
  }
  return null;
}

// The list contains groups, not individual shipments. Never trust its filter alone.
export async function findCommerceOlistDispatch(request: Request, invoiceId: string, salesOrderId: string, log?: LookupLog): Promise<string | null> {
  if (!id(invoiceId) || !id(salesOrderId)) throw new OlistDispatchReviewRequired("Confira os identificadores da nota fiscal e do pedido antes de consultar a expedição.");
  const groups = new Map<string, Row>();
  const matches = new Map<string, string>();
  let orderVerified = false;
  for (const filter of ["idNota", "idPedido"] as const) {
    let offset = 0;
    for (let page = 0; page < 5; page++) {
      const result = unwrap(await request(`/expedicao?${new URLSearchParams({ [filter]: filter === "idNota" ? invoiceId : salesOrderId, limit: "100", offset: String(offset), orderBy: "desc" })}`), "itens");
      const items = result?.itens;
      if (!Array.isArray(items) || items.some(item => !record(item))) throw new OlistDispatchReviewRequired("O Olist retornou uma lista de expedições em formato inesperado. Nenhuma nova expedição será criada sem concluir a consulta.");
      for (const item of items) {
        const groupId = id(record(item)?.id);
        if (!groupId) throw new OlistDispatchReviewRequired("Um agrupamento retornado pelo Olist não possui identificador válido. Confira a expedição antes de retomar.");
        let detail = groups.get(groupId);
        if (!detail) {
          detail = unwrap(await request(`/expedicao/${groupId}`), "expedicoes") ?? undefined;
          if (!detail || id(detail.id) !== groupId || (detail.expedicoes as unknown[]).some(item => !record(item))) throw new OlistDispatchReviewRequired("Não foi possível conferir os detalhes do agrupamento Olist. Nenhum vínculo será presumido pela listagem.");
          groups.set(groupId, detail);
        }
        for (const value of detail.expedicoes as Row[]) {
          const invoice = id(record(value.notaFiscal)?.id);
          const sale = id(record(value.venda)?.id);
          const origin = typeof value.tipoObjeto === "string" ? normalize(value.tipoObjeto).replace(/[ _-]/g, "") : "";
          const originId = id(value.idObjeto);
          const invoiceOrigin = origin === "notafiscal" && originId === invoiceId;
          const orderOrigin = (origin === "venda" || origin === "pedido") && originId === salesOrderId;
          if (!invoice && !sale && !((origin === "notafiscal" || origin === "venda" || origin === "pedido") && originId))
            throw new OlistDispatchReviewRequired("O Olist não informou a nota ou pedido de origem de uma expedição. Confira o registro antes de criar ou vincular um agrupamento.");
          if (invoice !== invoiceId && !invoiceOrigin && !((sale === salesOrderId || orderOrigin) && !invoice)) continue;
          if (invoice && invoice !== invoiceId || sale && sale !== salesOrderId || origin === "notafiscal" && originId && originId !== invoiceId || (origin === "venda" || origin === "pedido") && originId && originId !== salesOrderId)
            throw new OlistDispatchReviewRequired("A nota ou o pedido de origem da expedição diverge desta compra. Confira o Olist antes de vincular.");
          if (!invoice && !invoiceOrigin && !orderVerified) {
            const order = await request(`/pedidos/${salesOrderId}`);
            if (id(order.id) !== salesOrderId || id(order.idNotaFiscal) !== invoiceId) throw new OlistDispatchReviewRequired("Não foi possível confirmar que a expedição do pedido corresponde à nota fiscal desta compra.");
            orderVerified = true;
          }
          const shipmentId = id(value.id);
          if (!shipmentId) throw new OlistDispatchReviewRequired("A expedição da nota não possui identificador válido. Confira o agrupamento no Olist.");
          if (typeof value.situacao === "string" && /cancelad|excluid/.test(normalize(value.situacao))) throw new OlistDispatchReviewRequired("A expedição localizada está cancelada ou excluída. Confira o Olist antes de continuar.");
          matches.set(`${groupId}:${shipmentId}`, groupId);
          if (matches.size > 1) throw new OlistDispatchReviewRequired("Há mais de uma expedição para esta nota no Olist. Confira os registros antes de vincular.");
        }
      }
      log?.({ filter, offset, returned: items.length, matched: matches.size });
      const rawTotal = record(result?.paginacao)?.total;
      const total = rawTotal === undefined ? undefined : Number(rawTotal);
      if (total !== undefined && (!Number.isSafeInteger(total) || total < offset + items.length)) throw new OlistDispatchReviewRequired("A paginação das expedições retornou dados inconsistentes. Confira o Olist antes de retomar.");
      const more = total !== undefined ? offset + items.length < total : items.length === 100;
      if (!more) break;
      if (!items.length || page === 4) throw new OlistDispatchReviewRequired("A consulta de expedições do Olist ficou incompleta. Nenhuma nova expedição será criada sem concluir a conferência.");
      offset += items.length;
    }
    if (matches.size) return [...matches.values()][0];
  }
  return null;
}

export function isCommerceOlistAlreadyDispatched(error: unknown, invoiceId: string): error is OlistRequestError {
  if (!(error instanceof OlistRequestError) || ![400, 409].includes(error.status) || !id(invoiceId)) return false;
  const data = record(error.data);
  const messages = [error.message, ...(Array.isArray(data?.detalhes) ? data.detalhes.filter(item => /^idsNotasFiscais\[\d+\]$/.test(String(record(item)?.campo))).map(item => record(item)?.mensagem) : [])];
  const duplicate = new RegExp(`\\bnota fiscal com id\\s*['\"]?${invoiceId}['\"]?\\s+ja foi expedida\\b`);
  return messages.some(message => typeof message === "string" && duplicate.test(normalize(message)));
}

export async function recoverCommerceOlistDispatch(error: unknown, request: Request, invoiceId: string, salesOrderId: string, log?: LookupLog): Promise<string> {
  if (!isCommerceOlistAlreadyDispatched(error, invoiceId)) throw error;
  try {
    const found = await findCommerceOlistDispatch(request, invoiceId, salesOrderId, log);
    if (found) return found;
  } catch (lookupError) {
    if (lookupError instanceof OlistDispatchReviewRequired || lookupError instanceof OlistRequestError && [401, 403].includes(lookupError.status)) throw lookupError;
    throw new OlistDispatchReviewRequired("O Olist informa que esta nota já foi expedida, mas a consulta do registro falhou. A nota emitida foi preservada. Use Conferir e retomar para tentar a conferência novamente; não criaremos outra expedição sem localizar a existente.");
  }
  throw new OlistDispatchReviewRequired("O Olist informa que esta nota já foi expedida, mas não localizamos o agrupamento correspondente. A nota emitida foi preservada. Confira a expedição no Olist e use Conferir e retomar; nenhuma nova expedição será criada automaticamente.");
}

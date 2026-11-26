import { CommerceError } from "@/domain/commerce/commerce";
import { OlistRequestError } from "@/services/olist/olist";
import type { CommerceOlistCustomerChoice } from "@/domain/commerce/olist";

type Row = Record<string, unknown>;
type Request = (path: string) => Promise<Row>;
export type CommerceOlistCustomerLookup = { format: "digits" | "formatted"; offset: number; returned: number; matched: number };
type LookupLog = (details: CommerceOlistCustomerLookup) => void;
const record = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
const digits = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).replace(/\D/g, "") : "";
const id = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : typeof value === "string" && /^[1-9]\d{0,14}$/.test(value.trim()) ? value.trim() : null;

export class OlistCustomerReviewRequired extends CommerceError {
  constructor(message: string, status = 409, public ambiguous = false) { super(message, status); this.name = "OlistCustomerReviewRequired"; }
}
const text = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 240) : "";
function choice(source: Row, externalId: string): CommerceOlistCustomerChoice {
  const address = record(source.endereco);
  return { id: externalId, name: text(source.nome) || `Contato ${externalId}`, document: text(source.cpfCnpj), email: text(source.email), phone: text(source.celular) || text(source.telefone), city: text(address?.municipio), state: text(address?.uf), inactive: source.situacao === "I" || source.situacao === "E" };
}

function list(value: unknown, depth = 0): { items: Row[]; total?: number } | null {
  if (depth > 3) return null;
  if (Array.isArray(value)) {
    const items = value.map(record);
    return items.every((row): row is Row => Boolean(row)) ? { items } : null;
  }
  const source = record(value);
  if (!source) return null;
  for (const key of ["itens", "items", "data", "retorno"]) {
    const found = list(source[key], depth + 1);
    if (found) {
      const total = Number(record(source.paginacao)?.total);
      return { ...found, ...(Number.isSafeInteger(total) && total >= 0 ? { total } : {}) };
    }
  }
  return null;
}

function contact(value: unknown, depth = 0): Row | null {
  const source = record(value);
  if (!source || depth > 3) return null;
  if (id(source.id)) return source;
  for (const key of ["data", "retorno", "contato"]) {
    const found = contact(source[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function confirmedContact(value: unknown, expectedId: string, document: string) {
  const source = contact(value);
  if (id(source?.id) !== expectedId || digits(source?.cpfCnpj) !== document)
    throw new OlistCustomerReviewRequired("Não foi possível confirmar o CPF/CNPJ do contato existente no Olist. Confira o cadastro antes de retomar.", 409);
  return expectedId;
}

export async function findCommerceOlistCustomer(request: Request, document: string, log?: LookupLog): Promise<string | null> {
  const found = await lookupCustomers(request, document, log, false);
  return found[0]?.id ?? null;
}

export async function listCommerceOlistCustomerChoices(request: Request, document: string, log?: LookupLog): Promise<CommerceOlistCustomerChoice[]> {
  return lookupCustomers(request, document, log, true);
}

export async function verifyCommerceOlistCustomer(request: Request, externalId: string, document: string): Promise<string> {
  if (!id(externalId)) throw new CommerceError("Selecione um contato Olist válido.", 409);
  const detail = await request(`/contatos/${externalId}`);
  const confirmed = confirmedContact(detail, externalId, digits(document));
  const source = contact(detail)!;
  if (source.situacao === "I" || source.situacao === "E") throw new CommerceError("O contato está inativo ou excluído no Olist. Ative o cadastro ou selecione outro contato.", 409);
  return confirmed;
}

async function lookupCustomers(request: Request, document: string, log: LookupLog | undefined, allowMultiple: boolean): Promise<CommerceOlistCustomerChoice[]> {
  document = digits(document);
  if (![11, 14].includes(document.length)) throw new CommerceError("Confira o CPF/CNPJ de faturamento antes de consultar o Olist.", 409);
  const formatted = document.length === 11
    ? `${document.slice(0, 3)}.${document.slice(3, 6)}.${document.slice(6, 9)}-${document.slice(9)}`
    : `${document.slice(0, 2)}.${document.slice(2, 5)}.${document.slice(5, 8)}/${document.slice(8, 12)}-${document.slice(12)}`;
  for (const [index, search] of [document, formatted].entries()) {
    const matches = new Map<string, CommerceOlistCustomerChoice>();
    for (let page = 0; page < 5; page++) {
      const offset = page * 100;
      const result = list(await request(`/contatos?${new URLSearchParams({ cpfCnpj: search, limit: "100", offset: String(offset) })}`));
      if (!result) throw new OlistCustomerReviewRequired("O Olist retornou uma lista de contatos em formato inesperado. Nenhum cliente será criado sem concluir a consulta.", 409);
      for (const item of result.items) {
        let source = item;
        const externalId = id(item.id);
        let customerDocument = digits(item.cpfCnpj);
        if (!customerDocument && externalId) {
          const detail = await request(`/contatos/${externalId}`);
          customerDocument = digits(contact(detail)?.cpfCnpj);
          if (!customerDocument) throw new OlistCustomerReviewRequired("O contato retornado pelo Olist não tem CPF/CNPJ disponível para conferência.", 409);
          confirmedContact(detail, externalId, customerDocument);
          source = contact(detail)!;
        }
        if (customerDocument === document) {
          if (!externalId) throw new OlistCustomerReviewRequired("O contato encontrado no Olist não possui um identificador válido.", 409);
          matches.set(externalId, choice(source, externalId));
        }
      }
      log?.({ format: index === 0 ? "digits" : "formatted", offset, returned: result.items.length, matched: matches.size });
      if (matches.size > 1 && !allowMultiple) throw new OlistCustomerReviewRequired("Há mais de um contato Olist com o CPF/CNPJ de faturamento. Use Conferir cliente Olist para selecionar o cadastro correto e continuar.", 409, true);
      const more = result.total !== undefined ? offset + result.items.length < result.total : result.items.length === 100;
      if (!more) break;
      if (!result.items.length || page === 4) throw new OlistCustomerReviewRequired("A consulta de contatos do Olist ficou incompleta. Confira o cadastro antes de retomar.", 409);
    }
    if (matches.size) return [...matches.values()];
  }
  return [];
}

export function existingCommerceOlistCustomerId(data: unknown): string | null {
  const source = record(data);
  if (!source) return null;
  const candidates = new Set<string>();
  const add = (value: unknown) => { const parsed = id(value); if (parsed) candidates.add(parsed); };
  add(source.idContatoExistente);
  if (Array.isArray(source.detalhes)) for (const value of source.detalhes) {
    const detail = record(value);
    if (detail?.campo === "idContatoExistente") add(detail.mensagem);
  }
  if (candidates.size > 1) throw new OlistCustomerReviewRequired("O Olist indicou mais de um contato existente. Confira os cadastros antes de vincular.", 409);
  return [...candidates][0] ?? null;
}

export async function recoverCommerceOlistCustomer(error: unknown, request: Request, document: string, log?: LookupLog): Promise<string> {
  if (!(error instanceof OlistRequestError) || error.status !== 409) throw error;
  const existingId = existingCommerceOlistCustomerId(error.data);
  if (existingId) return confirmedContact(await request(`/contatos/${existingId}`), existingId, digits(document));
  const found = await findCommerceOlistCustomer(request, document, log);
  if (found) return found;
  throw error;
}

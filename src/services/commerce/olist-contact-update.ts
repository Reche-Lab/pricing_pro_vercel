import { z } from "zod";
import { CommerceError } from "@/domain/commerce/commerce";

const optionalText = z.string().nullish();
const id = z.number().int().positive().safe();
function optionalEnumNumber(value: unknown) {
  if (value === 0) return undefined;
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  if (!normalized || normalized === "0") return undefined;
  return /^[1-9]\d*$/.test(normalized) ? Number(normalized) : value;
}
function optionalSex(value: unknown) {
  if (value === 0) return undefined;
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "0") return undefined;
  if (normalized === "m") return "masculino";
  if (normalized === "f") return "feminino";
  return normalized;
}
function optionalCreditLimit(value: unknown) {
  if (value == null || value === 0) return undefined;
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return value;
  const amount = Number(normalized);
  return amount === 0 ? undefined : amount;
}

export class OlistContactUpdateValidationError extends CommerceError {
  constructor(public validationFields: string[], public validationIssues: { field: string; inputType: string; reason: string }[]) {
    super(`O cadastro retornado pelo Olist precisa de conferência nos campos: ${validationFields.join(", ")}. Corrija o cadastro ou escolha manter os e-mails do Olist. Nenhuma atualização foi enviada.`, 409, { code: "olist_contact_update_invalid" });
    this.name = "OlistContactUpdateValidationError";
  }
}
const address = z.object({
  endereco: optionalText, numero: optionalText, complemento: optionalText,
  bairro: optionalText, municipio: optionalText, cep: optionalText,
  uf: optionalText, pais: optionalText,
});

// GET contains read-only fields and expanded relationships; PUT does not accept
// the same representation. Never spread a raw ERP response into an update.
const writableContact = z.object({
  nome: z.string().refine(value => value.trim().length > 0),
  codigo: optionalText, fantasia: optionalText,
  tipoPessoa: z.enum(["J", "F", "E", "X"]).nullish(),
  cpfCnpj: optionalText, inscricaoEstadual: optionalText, rg: optionalText,
  telefone: optionalText, celular: optionalText,
  endereco: address.nullish(), enderecoCobranca: address.nullish(),
  inscricaoMunicipal: optionalText, telefoneAdicional: optionalText,
  // Legacy contacts can return unset enums as blank strings or zero. Do not
  // invent tax/personal classifications or send those placeholders back in PUT.
  site: optionalText, regimeTributario: z.preprocess(optionalEnumNumber, z.number().int().min(1).max(4).nullish()),
  estadoCivil: z.preprocess(optionalEnumNumber, z.number().int().min(1).max(5).nullish()), profissao: optionalText,
  sexo: z.preprocess(optionalSex, z.enum(["masculino", "feminino"]).nullish()), dataNascimento: optionalText,
  naturalidade: optionalText, nomePai: optionalText, nomeMae: optionalText,
  // GET may return zero for no credit limit, while PUT requires a positive
  // amount when supplied. Omit unset limits; never invent a financial value.
  cpfPai: optionalText, cpfMae: optionalText, limiteCredito: z.preprocess(optionalCreditLimit, z.number().finite().positive().optional()),
  situacao: z.enum(["B", "A", "I", "E"]).nullish(),
  observacoes: optionalText, observacoesDoContato: optionalText,
  vendedor: z.object({ id }).nullish(),
  tipos: z.array(z.object({ id })).nullish().transform(values => values?.map(value => value.id) ?? values),
  contatos: z.array(z.object({ nome: optionalText, telefone: optionalText, ramal: optionalText, email: optionalText, setor: optionalText })).nullish(),
});

export function buildOlistContactEmailUpdate(contact: Record<string, unknown>, targetEmail: string) {
  const parsed = writableContact.safeParse(contact);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map(issue => String(issue.path[0])))];
    throw new OlistContactUpdateValidationError(fields, parsed.error.issues.map(issue => {
      const field = String(issue.path[0]), value = contact[field];
      return { field, inputType: value === null ? "null" : Array.isArray(value) ? "array" : typeof value, reason: issue.code };
    }));
  }
  const email = z.string().trim().email().max(254).safeParse(targetEmail);
  if (!email.success) throw new CommerceError("Confira o e-mail de faturamento antes de atualizar o contato Olist.", 409);
  const { endereco, enderecoCobranca, vendedor, ...fields } = parsed.data;
  const payload = {
    ...fields,
    ...(endereco ? { endereco } : {}),
    ...(enderecoCobranca ? { enderecoCobranca } : {}),
    ...(vendedor ? { vendedor } : {}),
    email: email.data, emailNfe: email.data,
  };
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

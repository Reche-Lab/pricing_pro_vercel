import { z } from "zod";
import { CommerceError } from "@/domain/commerce/commerce";

const optionalText = z.string().nullish();
const id = z.number().int().positive().safe();
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
  site: optionalText, regimeTributario: z.number().int().min(1).max(4).nullish(),
  estadoCivil: z.number().int().min(1).max(5).nullish(), profissao: optionalText,
  sexo: z.enum(["masculino", "feminino"]).nullish(), dataNascimento: optionalText,
  naturalidade: optionalText, nomePai: optionalText, nomeMae: optionalText,
  cpfPai: optionalText, cpfMae: optionalText, limiteCredito: z.number().finite().nullish(),
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
    throw new CommerceError(`O cadastro retornado pelo Olist precisa de conferência nos campos: ${fields.join(", ")}. Corrija o cadastro ou escolha manter os e-mails do Olist. Nenhuma atualização foi enviada.`, 409, { code: "olist_contact_update_invalid" });
  }
  const email = z.string().trim().email().max(254).safeParse(targetEmail);
  if (!email.success) throw new CommerceError("Confira o e-mail de faturamento antes de atualizar o contato Olist.", 409);
  const { endereco, enderecoCobranca, vendedor, ...fields } = parsed.data;
  return {
    ...fields,
    ...(endereco ? { endereco } : {}),
    ...(enderecoCobranca ? { enderecoCobranca } : {}),
    ...(vendedor ? { vendedor } : {}),
    email: email.data, emailNfe: email.data,
  };
}

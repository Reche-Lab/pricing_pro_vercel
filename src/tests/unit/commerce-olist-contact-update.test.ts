// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildOlistContactEmailUpdate, OlistContactUpdateValidationError } from "@/services/commerce/olist-contact-update";

describe("Olist contact email update payload", () => {
  it("preserves the current ERP fields and translates GET relationships into documented PUT fields", () => {
    const existing = {
      id: 11, nome: "Nome já cadastrado no ERP", codigo: "CLI-11", fantasia: "Empresa",
      tipoPessoa: "F", cpfCnpj: "529.982.247-25", inscricaoEstadual: "ISENTO",
      rg: "123", telefone: "1133334444", celular: "11999998888",
      endereco: { endereco: "Rua do ERP", numero: "10", complemento: null, bairro: "Centro", municipio: "São Paulo", cep: "01001000", uf: "SP", pais: "Brasil", id: 99 },
      enderecoCobranca: { endereco: "Rua de cobrança", numero: "20", uf: "SP" },
      inscricaoMunicipal: "123", telefoneAdicional: null, site: "https://example.test",
      regimeTributario: 1, estadoCivil: 2, profissao: null, sexo: "feminino",
      dataNascimento: "1990-01-01", naturalidade: "São Paulo", nomePai: null, nomeMae: null,
      cpfPai: null, cpfMae: null, limiteCredito: 0, situacao: "B",
      observacoes: "Não alterar", observacoesDoContato: "Cadastro do ERP",
      email: "old@example.test", emailNfe: "old-fiscal@example.test",
      vendedor: { id: 5, nome: "Responsável" }, tipos: [{ id: 2, descricao: "Cliente" }, { id: 3, descricao: "Fornecedor" }],
      contatos: [{ id: 4, nome: "Financeiro", telefone: "1122223333", ramal: "10", email: "finance@example.test", setor: "Financeiro" }],
      dataCriacao: "2020-01-01", dataAtualizacao: "2026-01-01", statusCrm: "C", listaPreco: { id: 9 }, unknown: "read-only",
    };
    const original = structuredClone(existing);
    const result = buildOlistContactEmailUpdate(existing, "purchase@example.test");
    expect(result).toEqual({
      nome: existing.nome, codigo: existing.codigo, fantasia: existing.fantasia, tipoPessoa: "F",
      cpfCnpj: existing.cpfCnpj, inscricaoEstadual: "ISENTO", rg: "123", telefone: existing.telefone, celular: existing.celular,
      endereco: { endereco: "Rua do ERP", numero: "10", complemento: null, bairro: "Centro", municipio: "São Paulo", cep: "01001000", uf: "SP", pais: "Brasil" },
      enderecoCobranca: existing.enderecoCobranca, inscricaoMunicipal: "123", telefoneAdicional: null,
      site: existing.site, regimeTributario: 1, estadoCivil: 2, profissao: null, sexo: "feminino",
      dataNascimento: "1990-01-01", naturalidade: "São Paulo", nomePai: null, nomeMae: null,
      cpfPai: null, cpfMae: null, limiteCredito: 0, situacao: "B", observacoes: "Não alterar", observacoesDoContato: "Cadastro do ERP",
      vendedor: { id: 5 }, tipos: [2, 3],
      contatos: [{ nome: "Financeiro", telefone: "1122223333", ramal: "10", email: "finance@example.test", setor: "Financeiro" }],
      email: "purchase@example.test", emailNfe: "purchase@example.test",
    });
    expect(existing).toEqual(original);
  });

  it.each([undefined, null, "", "   ", 42])("rejects missing or invalid ERP name %s without inventing a replacement", nome => {
    expect(() => buildOlistContactEmailUpdate({ nome }, "purchase@example.test")).toThrow(/campos: nome/);
  });

  it("keeps optional nulls, empty lists and absent values without inventing ERP data", () => {
    expect(buildOlistContactEmailUpdate({ nome: "Cliente", codigo: null, limiteCredito: 0, tipos: [], contatos: [], vendedor: null, endereco: null }, "purchase@example.test"))
      .toEqual({ nome: "Cliente", codigo: null, limiteCredito: 0, tipos: [], contatos: [], email: "purchase@example.test", emailNfe: "purchase@example.test" });
    expect(buildOlistContactEmailUpdate({ nome: "Cliente" }, "purchase@example.test"))
      .toEqual({ nome: "Cliente", email: "purchase@example.test", emailNfe: "purchase@example.test" });
  });

  it.each([{ tipos: [{ descricao: "Missing ID" }] }, { vendedor: { id: "bad" } }, { contatos: "invalid" }, { endereco: "invalid" }])("blocks incompatible ERP fields rather than silently discarding them: %j", fields => {
    expect(() => buildOlistContactEmailUpdate({ nome: "Cliente", ...fields }, "purchase@example.test")).toThrow(/Nenhuma atualização foi enviada/);
  });

  it("does not accept malformed target emails", () => {
    expect(() => buildOlistContactEmailUpdate({ nome: "Cliente" }, "invalid")).toThrow(/e-mail de faturamento/);
  });

  it.each(["", "   ", 0, "0", " 0 "])("omits unset enum placeholder %j instead of blocking an email-only update", value => {
    const existing = { nome: "Cliente ERP", regimeTributario: value, estadoCivil: value, sexo: value };
    const payload = buildOlistContactEmailUpdate(existing, "purchase@example.test");
    expect(payload).toEqual({ nome: "Cliente ERP", email: "purchase@example.test", emailNfe: "purchase@example.test" });
    for (const field of ["regimeTributario", "estadoCivil", "sexo"]) expect(payload).not.toHaveProperty(field);
    expect(existing).toEqual({ nome: "Cliente ERP", regimeTributario: value, estadoCivil: value, sexo: value });
  });

  it.each([["1", "2", " Masculino ", 1, 2, "masculino"], ["4", "5", "F", 4, 5, "feminino"], [2, 3, "m", 2, 3, "masculino"]])("normalizes equivalent codes %j/%j/%j without guessing classifications", (regimeTributario, estadoCivil, sexo, tax, marital, sex) => {
    expect(buildOlistContactEmailUpdate({ nome: "Cliente ERP", regimeTributario, estadoCivil, sexo }, "purchase@example.test"))
      .toMatchObject({ regimeTributario: tax, estadoCivil: marital, sexo: sex });
  });

  it.each([{ regimeTributario: 9 }, { estadoCivil: true }, { sexo: "private-unknown-value" }, { regimeTributario: [] }, { estadoCivil: {} }, { sexo: 1 }])("rejects unknown populated classifications instead of erasing or guessing values: %j", fields => {
    try {
      buildOlistContactEmailUpdate({ nome: "Private ERP name", ...fields }, "private-email@example.test");
      expect.fail("Expected populated invalid classification to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(OlistContactUpdateValidationError);
      const diagnostic = error as OlistContactUpdateValidationError;
      expect(diagnostic.validationFields).toEqual(Object.keys(fields));
      expect(diagnostic.details?.code).toBe("olist_contact_update_invalid");
      expect(diagnostic.validationIssues).toHaveLength(1);
      expect(JSON.stringify(diagnostic.validationIssues)).not.toMatch(/Private|private-email|private-unknown-value/);
    }
  });
});

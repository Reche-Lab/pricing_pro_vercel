// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { existingCommerceOlistCustomerId, findCommerceOlistCustomer, recoverCommerceOlistCustomer, OlistCustomerReviewRequired, listCommerceOlistCustomerChoices, verifyCommerceOlistCustomer } from "@/services/commerce/olist-customer";
import { OlistRequestError } from "@/services/olist/olist";

const document = "52998224725";
const formatted = "529.982.247-25";
const duplicate = () => new OlistRequestError("Contato já cadastrado.", 409, {
  mensagem: "Contato já cadastrado.", detalhes: [{ campo: "cpfCnpj", mensagem: "Contato já existe." }, { campo: "idContatoExistente", mensagem: "11" }],
});

describe("commerce Olist billing contact resolution", () => {
  it("identifies ambiguity explicitly and lists choices without choosing one or exposing arbitrary fields", async () => {
    const request = vi.fn(async () => ({ itens: [{ id: 11, cpfCnpj: document, nome: "Principal", email: "buyer@example.test", observacoes: "private notes" }, { id: 12, cpfCnpj: formatted, nome: "Antigo", situacao: "I" }, { id: 13, cpfCnpj: "11144477735" }] }));
    await expect(findCommerceOlistCustomer(request, document)).rejects.toMatchObject({ ambiguous: true, name: "OlistCustomerReviewRequired", status: 409 });
    const choices = await listCommerceOlistCustomerChoices(request, document);
    expect(choices).toHaveLength(2);
    expect(choices[0]).toMatchObject({ id: "11", name: "Principal", inactive: false });
    expect(choices[1]).toMatchObject({ id: "12", inactive: true });
    expect(JSON.stringify(choices)).not.toContain("private notes");
  });
  it("deduplicates repeated IDs, returns all exact matches and rechecks selection against the current ERP record", async () => {
    const request = vi.fn(async (path: string) => path.startsWith("/contatos?") ? { itens: [{ id: 11, cpfCnpj: document }, { id: 11, cpfCnpj: formatted }] } : { id: 11, cpfCnpj: document, situacao: "B" });
    expect(await listCommerceOlistCustomerChoices(request, document)).toHaveLength(1);
    expect(await verifyCommerceOlistCustomer(request, "11", document)).toBe("11");
    for (const detail of [{ id: 11, cpfCnpj: "11144477735" }, { id: 12, cpfCnpj: document }, { id: 11, cpfCnpj: document, situacao: "I" }, { id: 11, cpfCnpj: document, situacao: "E" }])
      await expect(verifyCommerceOlistCustomer(vi.fn(async () => detail), "11", document)).rejects.toThrow();
    await expect(verifyCommerceOlistCustomer(request, "../11", document)).rejects.toThrow(/válido/);
  });
  it.each([
    { itens: [{ id: 11, cpfCnpj: formatted }] },
    { data: { itens: [{ id: "11", cpfCnpj: document }] } },
    { items: [{ id: 11, cpfCnpj: document }] },
  ])("matches the exact normalized document, including supported response envelopes", async result => {
    const request = vi.fn<(path: string) => Promise<Record<string, unknown>>>(async () => result);
    expect(await findCommerceOlistCustomer(request, document)).toBe("11");
    expect(request).toHaveBeenCalledTimes(1);
    const query = new URL(request.mock.calls[0][0], "https://example.test").searchParams;
    expect(query.get("cpfCnpj")).toBe(document);
  });

  it.each([
    [document, formatted], ["11222333000181", "11.222.333/0001-81"],
  ])("tries the formatted document only if the digit query has no match", async (digits, mask) => {
    const request = vi.fn(async (path: string) => ({ itens: new URL(path, "https://example.test").searchParams.get("cpfCnpj") === mask ? [{ id: 11, cpfCnpj: mask }] : [] }));
    expect(await findCommerceOlistCustomer(request, digits)).toBe("11");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("checks contact detail if a listing omits the document", async () => {
    const request = vi.fn(async (path: string) => path.startsWith("/contatos?") ? { itens: [{ id: 11, nome: "Cliente" }] } : { id: 11, cpfCnpj: formatted });
    expect(await findCommerceOlistCustomer(request, document)).toBe("11");
    expect(request).toHaveBeenLastCalledWith("/contatos/11");
  });

  it("checks all filtered pages and refuses ambiguous document matches", async () => {
    const request = vi.fn(async (path: string) => ({ itens: [{ id: new URL(path, "https://example.test").searchParams.get("offset") === "0" ? 11 : 12, cpfCnpj: document }], paginacao: { total: 101 } }));
    await expect(findCommerceOlistCustomer(request, document)).rejects.toBeInstanceOf(OlistCustomerReviewRequired);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toContain("offset=100");
  });

  it("never treats malformed or incomplete results as permission to create a customer", async () => {
    await expect(findCommerceOlistCustomer(vi.fn(async () => ({ unexpected: [] })), document)).rejects.toThrow(/formato inesperado/);
    await expect(findCommerceOlistCustomer(vi.fn(async () => ({ itens: [null] })), document)).rejects.toThrow(/formato inesperado/);
    await expect(findCommerceOlistCustomer(vi.fn(async () => ({ itens: [], paginacao: { total: 101 } })), document)).rejects.toThrow(/incompleta/);
    await expect(findCommerceOlistCustomer(vi.fn(async () => ({ itens: [{ cpfCnpj: document }] })), document)).rejects.toThrow(/identificador válido/);
  });

  it("returns no match only after valid empty results, never matching by name alone", async () => {
    const request = vi.fn(async () => ({ itens: [{ id: 11, nome: "Mesmo nome", cpfCnpj: "11144477735" }] }));
    expect(await findCommerceOlistCustomer(request, document)).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("uses only the explicit existing-contact ID from a conflict, not other IDs or numbers in a message", () => {
    expect(existingCommerceOlistCustomerId(duplicate().data)).toBe("11");
    expect(existingCommerceOlistCustomerId({ idContatoExistente: 11 })).toBe("11");
    expect(existingCommerceOlistCustomerId({ id: 99, mensagem: "Contato com documento 52998224725 já existe: 11" })).toBeNull();
    expect(existingCommerceOlistCustomerId({ detalhes: [{ campo: "idContatoExistente", mensagem: "0" }] })).toBeNull();
    expect(() => existingCommerceOlistCustomerId({ idContatoExistente: 12, detalhes: [{ campo: "idContatoExistente", mensagem: "11" }] })).toThrow(/mais de um contato/);
  });

  it("recovers a 409 only after verifying that the returned contact belongs to the billing document", async () => {
    const request = vi.fn(async () => ({ id: 11, cpfCnpj: formatted }));
    expect(await recoverCommerceOlistCustomer(duplicate(), request, document)).toBe("11");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/contatos/11");
    for (const detail of [{ id: 12, cpfCnpj: document }, { id: 11, cpfCnpj: "11144477735" }, { id: 11 }]) {
      await expect(recoverCommerceOlistCustomer(duplicate(), vi.fn(async () => detail), document)).rejects.toThrow(/confirmar o CPF/);
    }
  });

  it("rechecks the document if the 409 has no ID, and propagates other failures unchanged", async () => {
    const error = new OlistRequestError("Conflito", 409, {});
    expect(await recoverCommerceOlistCustomer(error, vi.fn(async () => ({ itens: [{ id: 11, cpfCnpj: document }] })), document)).toBe("11");
    await expect(recoverCommerceOlistCustomer(error, vi.fn(async () => ({ itens: [] })), document)).rejects.toBe(error);
    const invalid = new OlistRequestError("E-mail inválido.", 400, {}), request = vi.fn();
    await expect(recoverCommerceOlistCustomer(invalid, request, document)).rejects.toBe(invalid);
    expect(request).not.toHaveBeenCalled();
  });

  it("lets provider failures reach the worker without converting them into a missing contact", async () => {
    const error = new OlistRequestError("Indisponível", 503, {});
    await expect(findCommerceOlistCustomer(vi.fn(async () => { throw error; }), document)).rejects.toBe(error);
    await expect(recoverCommerceOlistCustomer(duplicate(), vi.fn(async () => { throw error; }), document)).rejects.toBe(error);
  });

  it("reports lookup counts without logging personal contact fields", async () => {
    const log = vi.fn();
    expect(await findCommerceOlistCustomer(vi.fn(async () => ({ itens: [{ id: 11, cpfCnpj: document, nome: "Cliente teste", email: "private@example.test" }] })), document, log)).toBe("11");
    expect(log).toHaveBeenCalledWith({ format: "digits", offset: 0, returned: 1, matched: 1 });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/52998224725|Cliente teste|private@example/);
  });
});

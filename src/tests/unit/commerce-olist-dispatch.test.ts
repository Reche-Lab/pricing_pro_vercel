// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { findCommerceOlistDispatch, recoverCommerceOlistDispatch, isCommerceOlistAlreadyDispatched, OlistDispatchReviewRequired } from "@/services/commerce/olist-dispatch";
import { OlistRequestError } from "@/services/olist/olist";

type Row = Record<string, unknown>;
const shipment = (id = 441, invoice = 33, sale = 22): Row => ({ id, tipoObjeto: "notafiscal", idObjeto: invoice, notaFiscal: { id: invoice }, venda: { id: sale } });
const duplicate = (status = 400, invoice = 33) => new OlistRequestError(`Ocorreram erros de validação: Nota fiscal com id '${invoice}' já foi expedida - idsNotasFiscais[0]`, status, { detalhes: [{ campo: "idsNotasFiscais[0]", mensagem: `Nota fiscal com id '${invoice}' já foi expedida` }] });
const provider = (items: Row[] = [shipment()]) => vi.fn(async (path: string): Promise<Row> => path.startsWith("/expedicao?") ? { itens: [{ id: 44 }] } : { id: 44, expedicoes: items });

describe("commerce Olist dispatch reconciliation", () => {
  it("verifies the invoice and sale inside the group, returning the group ID rather than the shipment ID", async () => {
    const request = provider(), log = vi.fn();
    expect(await findCommerceOlistDispatch(request, "33", "22", log)).toBe("44");
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toContain("idNota=33");
    expect(request).toHaveBeenLastCalledWith("/expedicao/44");
    expect(log).toHaveBeenCalledWith({ filter: "idNota", offset: 0, returned: 1, matched: 1 });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/notaFiscal|venda|destinatario/);
  });

  it.each(["data", "retorno"])("accepts the %s envelope without assuming malformed payloads are empty", async key => {
    const request = vi.fn(async (path: string): Promise<Row> => ({ [key]: path.startsWith("/expedicao?") ? { itens: [{ id: 44 }], paginacao: { total: 1 } } : { id: 44, expedicoes: [shipment()] } }));
    expect(await findCommerceOlistDispatch(request, "33", "22")).toBe("44");
  });

  it("falls back to the sale filter, confirms its invoice and does not reuse an unrelated group", async () => {
    const request = vi.fn(async (path: string): Promise<Row> => {
      if (path.startsWith("/expedicao?")) return { itens: [{ id: path.includes("idPedido=") ? 44 : 99 }] };
      if (path === "/pedidos/22") return { id: 22, idNotaFiscal: 33 };
      return path === "/expedicao/99" ? { id: 99, expedicoes: [shipment(991, 88, 77)] } : { id: 44, expedicoes: [{ id: 441, tipoObjeto: "venda", idObjeto: 22 }] };
    });
    expect(await findCommerceOlistDispatch(request, "33", "22")).toBe("44");
    expect(request).toHaveBeenCalledWith("/pedidos/22");
  });

  it("scans all reported pages without skipping when the ERP returns fewer than 100 groups", async () => {
    const request = vi.fn(async (path: string): Promise<Row> => {
      if (path.startsWith("/expedicao?")) return { itens: [{ id: path.includes("offset=0") ? 99 : 44 }], paginacao: { total: 2 } };
      return path === "/expedicao/99" ? { id: 99, expedicoes: [shipment(991, 88, 77)] } : { id: 44, expedicoes: [shipment()] };
    });
    expect(await findCommerceOlistDispatch(request, "33", "22")).toBe("44");
    expect(request.mock.calls[2][0]).toContain("offset=1");
  });

  it("ignores unrelated shipments and deduplicates repeated groups and shipments", async () => {
    const request = vi.fn(async (path: string): Promise<Row> => path.startsWith("/expedicao?") ? { itens: [{ id: 44 }, { id: 44 }] } : { id: 44, expedicoes: [shipment(991, 88, 77), shipment(), shipment()] });
    expect(await findCommerceOlistDispatch(request, "33", "22")).toBe("44");
    expect(request.mock.calls.filter(([path]) => path === "/expedicao/44")).toHaveLength(1);
  });

  it.each([
    [shipment(), shipment(442)],
    [{ ...shipment(), venda: { id: 77 } }],
    [{ ...shipment(), idObjeto: 88 }],
    [{ ...shipment(), id: null }],
    [{ ...shipment(), situacao: "Cancelada" }],
    [{ id: 441 }],
  ].map(items => [items]))("requires review for ambiguity, conflicting origin or incomplete shipment details: %j", async items => {
    await expect(findCommerceOlistDispatch(provider(items as Row[]), "33", "22")).rejects.toBeInstanceOf(OlistDispatchReviewRequired);
  });

  it.each([
    { unexpected: [] }, { itens: [null] }, { itens: [{}] },
    { itens: [], paginacao: { total: 1 } }, { itens: [], paginacao: { total: "invalid" } },
  ])("does not treat malformed or incomplete listings as permission to create: %j", async result => {
    await expect(findCommerceOlistDispatch(vi.fn(async () => result), "33", "22")).rejects.toBeInstanceOf(OlistDispatchReviewRequired);
  });

  it.each([{ id: 99, expedicoes: [shipment()] }, { id: 44 }, { id: 44, expedicoes: [null] }])("requires verified details for the exact listed group: %j", async detail => {
    const request = vi.fn(async (path: string): Promise<Row> => path.startsWith("/expedicao?") ? { itens: [{ id: 44 }] } : detail);
    await expect(findCommerceOlistDispatch(request, "33", "22")).rejects.toBeInstanceOf(OlistDispatchReviewRequired);
  });

  it("does not link an order-origin shipment when the sale belongs to a different invoice", async () => {
    const request = vi.fn(async (path: string): Promise<Row> => path.startsWith("/expedicao?") ? { itens: [{ id: 44 }] } : path === "/pedidos/22" ? { id: 22, idNotaFiscal: 88 } : { id: 44, expedicoes: [{ id: 441, tipoObjeto: "venda", idObjeto: 22 }] });
    await expect(findCommerceOlistDispatch(request, "33", "22")).rejects.toThrow(/corresponde à nota/);
  });

  it("bounds pagination and never returns a partial lookup as a confirmed absence", async () => {
    const request = vi.fn(async (path: string): Promise<Row> => path.startsWith("/expedicao?") ? { itens: [{ id: 99 }], paginacao: { total: 600 } } : { id: 99, expedicoes: [shipment(991, 88, 77)] });
    await expect(findCommerceOlistDispatch(request, "33", "22")).rejects.toThrow(/incompleta/);
    expect(request.mock.calls.filter(([path]) => path.startsWith("/expedicao?"))).toHaveLength(5);
  });

  it("returns null only after both valid filters have no confirmed match", async () => {
    const request = vi.fn<(path: string) => Promise<Row>>(async () => ({ itens: [] }));
    expect(await findCommerceOlistDispatch(request, "33", "22")).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toContain("idPedido=22");
    const invalid = vi.fn();
    await expect(findCommerceOlistDispatch(invalid, "../33", "22")).rejects.toThrow(/identificadores/);
    expect(invalid).not.toHaveBeenCalled();
  });

  it.each([400, 409])("recovers an already-dispatched HTTP %i only after verifying the existing group", async status => {
    const request = provider();
    expect(await recoverCommerceOlistDispatch(duplicate(status), request, "33", "22")).toBe("44");
    expect(request).toHaveBeenCalledWith("/expedicao/44");
  });

  it("does not mistake another invoice or validation failure for the expected duplicate", async () => {
    for (const error of [duplicate(400, 333), duplicate(503), new OlistRequestError("Nota fiscal inválida", 400, {}), new Error("Nota fiscal com id '33' já foi expedida")]) {
      const request = vi.fn();
      expect(isCommerceOlistAlreadyDispatched(error, "33")).toBe(false);
      await expect(recoverCommerceOlistDispatch(error, request, "33", "22")).rejects.toBe(error);
      expect(request).not.toHaveBeenCalled();
    }
  });

  it("uses structured validation details but never treats the invoice ID as the group ID", async () => {
    const error = duplicate();
    expect(isCommerceOlistAlreadyDispatched(new OlistRequestError("Validação", 400, error.data), "33")).toBe(true);
    await expect(recoverCommerceOlistDispatch(error, vi.fn(async () => ({ itens: [] })), "33", "22")).rejects.toMatchObject({ name: "OlistDispatchReviewRequired", details: { code: "olist_dispatch_review_required" } });
  });

  it("keeps a known duplicate distinct from an uncertain mutation if the follow-up lookup fails", async () => {
    const failure = new OlistRequestError("Temporariamente indisponível", 503, {});
    await expect(recoverCommerceOlistDispatch(duplicate(), vi.fn(async () => { throw failure; }), "33", "22")).rejects.toThrow(/consulta do registro falhou/);
    const unauthorized = new OlistRequestError("Reconecte o Olist", 401, {});
    await expect(recoverCommerceOlistDispatch(duplicate(), vi.fn(async () => { throw unauthorized; }), "33", "22")).rejects.toBe(unauthorized);
    await expect(findCommerceOlistDispatch(vi.fn(async () => { throw failure; }), "33", "22")).rejects.toBe(failure);
  });
});

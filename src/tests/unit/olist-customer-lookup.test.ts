import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/quotes/[quoteId]/olist/_shared", () => ({
  loadQuoteOlistContext: vi.fn(),
  sendOlistQuoteOperation: vi.fn(),
  olistOperationErrorResponse: vi.fn(() => ({ ok: false, error: "Falha Olist" }))
}));
import { loadQuoteOlistContext, sendOlistQuoteOperation } from "@/app/api/quotes/[quoteId]/olist/_shared";
import { POST } from "@/app/api/quotes/[quoteId]/olist/customer/lookup/route";

const quote = {
  customer_id: "local-customer", customer_name: "Angelita Valenciani",
  customer_document: "52998224725", customer_phone: "11999999999", customer_email: "cliente@example.test"
};
function load(customer = quote, settings = { customer_lookup_path: "/contatos" }) {
  vi.mocked(loadQuoteOlistContext).mockResolvedValue({
    session: { userId: "user", tenantId: "tenant" }, detail: { quote: customer }, settings,
    credentials: { accessToken: "test" }
  } as unknown as Awaited<ReturnType<typeof loadQuoteOlistContext>>);
}
async function search(body: Record<string, unknown>) {
  return POST(new Request("https://example.test/api/quotes/quote/olist/customer/lookup", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" }
  }), { params: Promise.resolve({ quoteId: "quote" }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  load();
  vi.mocked(sendOlistQuoteOperation).mockResolvedValue({ ok: true, externalId: "123", result: { itens: [{ id: 123, nome: "Angelita Valenciani" }] } } as Awaited<ReturnType<typeof sendOlistQuoteOperation>>);
});

describe("quote customer lookup", () => {
  it("uses the edited partial name in automatic mode despite prefilled identifiers", async () => {
    const response = await search({ mode: "auto", nome: " Angelita ", cpfCnpj: quote.customer_document,
      celular: quote.customer_phone, email: quote.customer_email, codigo: quote.customer_id });
    expect(response.status).toBe(200);
    expect(sendOlistQuoteOperation).toHaveBeenCalledWith(expect.objectContaining({ path: "/contatos?nome=Angelita&limit=5&offset=0" }));
    expect(await response.json()).toMatchObject({ lookup: { criteria: { campo: "nome", valor: "Angelita" } } });
  });

  it("honors an explicit free search term before saved customer fields", async () => {
    await search({ mode: "auto", value: "Angelita" });
    expect(sendOlistQuoteOperation).toHaveBeenCalledWith(expect.objectContaining({ path: "/contatos?nome=Angelita&limit=5&offset=0" }));
  });

  it("ignores the generated local code when automatically searching a name-only customer", async () => {
    load({ ...quote, customer_document: "", customer_phone: "", customer_email: "" });
    await search({ mode: "auto" });
    expect(sendOlistQuoteOperation).toHaveBeenCalledWith(expect.objectContaining({ path: "/contatos?nome=Angelita+Valenciani&limit=5&offset=0" }));
  });

  it("preserves default document priority when no criteria have changed", async () => {
    await search({ mode: "auto", nome: quote.customer_name, cpfCnpj: "529.982.247-25", celular: "(11) 99999-9999" });
    expect(sendOlistQuoteOperation).toHaveBeenCalledWith(expect.objectContaining({ path: "/contatos?cpfCnpj=52998224725&limit=5&offset=0" }));
  });

  it("uses a name intentionally selected even when it matches the saved name", async () => {
    await search({ mode: "auto", preferredField: "nome", nome: quote.customer_name });
    expect(sendOlistQuoteOperation).toHaveBeenCalledWith(expect.objectContaining({ path: "/contatos?nome=Angelita+Valenciani&limit=5&offset=0" }));
  });

  it("uses the telephone field rather than guessing a document from its eleven digits", async () => {
    await search({ mode: "auto", preferredField: "celular", celular: "(11) 99999-9999" });
    expect(sendOlistQuoteOperation).toHaveBeenCalledWith(expect.objectContaining({ path: "/contatos?celular=11999999999&limit=5&offset=0" }));
  });

  it("honors the explicit mode before the field last edited", async () => {
    await search({ mode: "cpfCnpj", preferredField: "nome", nome: "Angelita" });
    expect(sendOlistQuoteOperation).toHaveBeenCalledWith(expect.objectContaining({ path: "/contatos?cpfCnpj=52998224725&limit=5&offset=0" }));
  });

  it("preserves status and returns the actual criteria used", async () => {
    const response = await search({ mode: "email", email: "outro@example.test", situacao: "I" });
    expect(sendOlistQuoteOperation).toHaveBeenCalledWith(expect.objectContaining({ path: "/contatos?email=outro%40example.test&situacao=I&limit=5&offset=0" }));
    expect(await response.json()).toMatchObject({ lookup: { criteria: { campo: "email", valor: "outro@example.test", situacao: "I" } } });
  });

  it("does not silently search by name when the selected field is empty", async () => {
    const response = await search({ mode: "cpfCnpj", cpfCnpj: "", nome: "Angelita" });
    expect(response.status).toBe(400);
    expect(sendOlistQuoteOperation).not.toHaveBeenCalled();
  });

  it("requires a criterion and never performs an unfiltered lookup", async () => {
    const response = await search({ mode: "auto", nome: "", cpfCnpj: "", celular: "", email: "", codigo: "" });
    expect(response.status).toBe(400);
    expect(sendOlistQuoteOperation).not.toHaveBeenCalled();
  });
});

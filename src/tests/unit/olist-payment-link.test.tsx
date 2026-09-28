import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuotePaymentTermPanel } from "@/components/quotes/QuotePaymentTermPanel";
import { OlistQuoteActions } from "@/components/quotes/OlistQuoteActions";
import { normalizeOlistPaymentTermInput, isOlistPaymentLink } from "@/lib/olist/payment-terms";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const options = [
  { kind: "receiving_method" as const, externalId: "20", name: "Pix", groupName: null },
  { kind: "receiving_method" as const, externalId: "21", name: "Link de pagamento", groupName: null },
  { kind: "payment_method" as const, externalId: "10", name: "Olist Conta Digital", groupName: "Banco" }
];
const term = {
  payment_method_external_id: "10", payment_method_name: "Olist Conta Digital",
  receiving_method_external_id: "20", receiving_method_name: "Pix",
  category_external_id: null, category_name: null, installments_count: 1, notes: "Conferir pagamento"
};

describe("Olist payment link compatibility", () => {
  it("normalizes writes without mutating other terms or stripping notes", () => {
    const input = {
      paymentMethodExternalId: "10", paymentMethodName: "Banco",
      receivingMethodName: "Link de pagamento", notes: "Conta informada pelo cliente",
      installments: [{ installmentNumber: 1, amount: 100, paymentMethodExternalId: "10" }]
    };
    expect(normalizeOlistPaymentTermInput(input)).toMatchObject({
      paymentMethodExternalId: null, paymentMethodName: null, notes: input.notes,
      installments: [{ amount: 100, paymentMethodExternalId: null, paymentMethodName: null }]
    });
    expect(input.paymentMethodExternalId).toBe("10");
    expect(normalizeOlistPaymentTermInput({ ...input, receivingMethodName: "Pix" }).paymentMethodExternalId).toBe("10");
    expect(isOlistPaymentLink("Boleto")).toBe(false);
    expect(isOlistPaymentLink(null)).toBe(false);
  });

  it.each([false, true])("hides and omits bank for payment links (legacy saved: %s)", async (legacy) => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    render(<QuotePaymentTermPanel quoteId="q" total={100} options={options}
      initialPaymentTerm={legacy ? { ...term, receiving_method_external_id: "21", receiving_method_name: "Link de pagamento" } : term}
      defaultCategory={{ externalId: "", name: "" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Configurar" }));
    if (!legacy) {
      expect(screen.getByLabelText("Conta bancária (obrigatória)")).toHaveValue("10");
      fireEvent.change(screen.getByLabelText("Forma de recebimento"), { target: { value: "21" } });
    }
    expect(screen.queryByLabelText(/Conta bancária/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Parcelas")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Salvar pagamento" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.receivingMethodExternalId).toBe("21");
    expect(body.paymentMethodExternalId).toBeNull();
    expect(body.installments[0].paymentMethodExternalId).toBeNull();
    fireEvent.change(screen.getByLabelText("Forma de recebimento"), { target: { value: "20" } });
    expect(screen.getByLabelText("Conta bancária (obrigatória)")).toHaveValue("");
  });

  it("clears bank selection in the sales order modal and sends only the receiving method", async () => {
    const fetcher = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json({ ok: true });
      return Response.json({ ok: true, quote: { total: "100" }, items: [], payload: {}, paymentRequired: true });
    });
    vi.stubGlobal("fetch", fetcher);
    const { container } = render(<OlistQuoteActions quoteId="q" hasCustomer externalOlistId="123" paymentOptions={options} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar pedido" }));
    const receiving = await screen.findByLabelText("Forma de recebimento");
    const value = (id: string, name: string) => JSON.stringify({ externalId: id, name });
    fireEvent.change(receiving, { target: { value: value("20", "Pix") } });
    fireEvent.change(screen.getByLabelText("Conta bancária"), { target: { value: value("10", "Olist Conta Digital") } });
    fireEvent.change(receiving, { target: { value: value("21", "Link de pagamento") } });
    expect(screen.queryByLabelText("Conta bancária")).not.toBeInTheDocument();
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const call = fetcher.mock.calls.find(([, init]) => init?.method === "POST")!;
    const body = JSON.parse(call[1].body);
    expect(body.paymentTerm.receivingMethodExternalId).toBe("21");
    expect(body.paymentTerm.paymentMethodExternalId).toBeUndefined();
    expect(body.paymentTerm.installments[0].paymentMethodExternalId).toBeUndefined();
  });
});

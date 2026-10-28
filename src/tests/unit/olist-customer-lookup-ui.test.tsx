import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OlistQuoteActions } from "@/components/quotes/OlistQuoteActions";
import { QuoteCustomerDeliveryModal } from "@/components/quotes/QuoteCustomerDeliveryModal";
import type { QuoteDetail } from "@/repositories/quotes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("quote customer search intent", () => {
  it.each([false, true])("lets the user review the selected contact in the delivery form, already linked: %s", async linked => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/customer/use?")) return Response.json({ ok: true, externalId: "2", profile: { name: "Angelita Olist", addressLine: "Rua atualizada", postalCode: "01001000", city: "São Paulo", state: "SP" } });
      if (url.endsWith("/customer/use")) return Response.json({ ok: true, externalId: "2", profileSynced: false });
      if (url.endsWith("/customer/lookup")) return Response.json({ ok: true, externalId: "2", result: { itens: [{ id: 2, nome: "Angelita Olist" }] } });
      return Response.json({ ok: true, integrations: { olist: { configured: true, connected: true, status: "active" } } });
    });
    vi.stubGlobal("fetch", fetcher);
    const quote = { id: "quote", customer_name: "Angelita local", customer_address_line: "Rua antiga", delivery_attention_to: "Marina", customer_external_olist_id: linked ? "2" : null } as QuoteDetail;
    const { container } = render(<><QuoteCustomerDeliveryModal quote={quote} /><OlistQuoteActions quoteId="quote" hasCustomer customerName="Angelita local" externalOlistId={linked ? "2" : null} enableCustomerDataImport /></>);
    fireEvent.click(screen.getByRole("button", { name: "Consultar cliente" }));
    fireEvent.submit(container.querySelector("form")!);
    await screen.findByText("Cliente encontrado no Olist");
    if (!linked) {
      expect(screen.queryByRole("button", { name: "Atualizar dados do orçamento" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Usar este cliente" }));
      await screen.findByText("Cliente em uso");
      const link = fetcher.mock.calls.find(([url]) => url.endsWith("/customer/use"));
      expect(link).toBeTruthy();
    }
    fireEvent.click(await screen.findByRole("button", { name: "Atualizar dados do orçamento" }));
    expect(await screen.findByDisplayValue("Rua atualizada")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Angelita Olist")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Marina")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Cliente e responsável pelo recebimento");
    expect(fetcher.mock.calls.some(([url]) => url.endsWith("/customer-delivery"))).toBe(false);
  });
  it.each(["partial", "firstName", "phone"])("prioritizes the intended field in automatic mode: %s", async (action) => {
    const fetcher = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) =>
      Response.json(init?.method === "POST"
        ? { ok: true, externalId: "123", result: { itens: [{ id: 123, nome: "Angelita Valenciani" }] } }
        : { ok: true, integrations: { olist: { configured: true, connected: true, status: "active" } } }));
    vi.stubGlobal("fetch", fetcher);
    const { container } = render(<OlistQuoteActions quoteId="quote" hasCustomer
      customerName={action === "firstName" ? "Angelita" : "Angelita Valenciani"}
      customerDocument="52998224725" customerPhone="11999999999" customerLocalCode="local-uuid" />);
    fireEvent.click(screen.getByRole("button", { name: "Consultar cliente" }));
    expect(screen.getByLabelText("Código Olist")).toHaveValue("");
    if (action === "partial") fireEvent.change(screen.getByLabelText("Nome para busca"), { target: { value: "Angelita" } });
    else if (action === "firstName") fireEvent.click(screen.getByRole("button", { name: "Usar primeiro nome" }));
    else fireEvent.change(screen.getByLabelText("Telefone/celular"), { target: { value: "(11) 99999-9999" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const call = fetcher.mock.calls.find(([, init]) => init?.method === "POST")!;
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({ mode: "auto", preferredField: action === "phone" ? "celular" : "nome", cpfCnpj: "52998224725" });
    if (action !== "phone") expect(body.nome).toBe("Angelita");
    await screen.findByText("Cliente encontrado no Olist");
  });
});

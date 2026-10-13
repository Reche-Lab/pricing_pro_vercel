import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OlistQuoteActions } from "@/components/quotes/OlistQuoteActions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("quote customer search intent", () => {
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

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommerceHelp, CommerceThemePicker } from "@/components/commerce/CommerceAdminControls";
import { CommerceAdmin } from "@/components/commerce/CommerceAdmin";
import { storeRequest } from "@/components/commerce/store-http";
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn(), storeMoney: (n: number) => String(n) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("commerce configuration controls", () => {
  it("opens help on focus or touch, closes on Escape and never submits the form", () => {
    const submit = vi.fn();
    render(<form onSubmit={submit}><CommerceHelp label="Canal" text="Usa os preços publicados do canal selecionado." /></form>);
    const button = screen.getByRole("button", { name: "Ajuda: Canal" });
    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("preços publicados");
    fireEvent.keyDown(button, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
  it("selects an explicit theme without submitting and honors disabled fieldsets", () => {
    const change = vi.fn();
    const { rerender } = render(<CommerceThemePicker value="system" onChange={change} />);
    expect(screen.getByRole("button", { name: "Automático" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Escuro" }));
    expect(change).toHaveBeenCalledWith("dark");
    rerender(<fieldset disabled><CommerceThemePicker value="dark" onChange={change} /></fieldset>);
    expect(screen.getByRole("button", { name: "Escuro" })).toBeDisabled();
  });
  it("preserves theme and store fields when saving through the redesigned controls", async () => {
    const initial = { store: null, products: [], variants: [], platforms: [{ id: "channel", name: "WhatsApp" }], orders: [], payments: null };
    vi.mocked(storeRequest).mockResolvedValue(initial);
    render(<CommerceAdmin initial={initial as never} tenantName="Loja teste" />);
    fireEvent.change(screen.getByLabelText("E-mail de atendimento"), { target: { value: "teste@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Escuro" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajuda: Canal de preços" }));
    expect(storeRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar loja e catálogo" }));
    await waitFor(() => expect(storeRequest).toHaveBeenCalledWith("/api/commerce/admin", "PUT", expect.objectContaining({
      platformId: "channel", settings: expect.objectContaining({ name: "Loja teste", theme: "dark", contactEmail: "teste@example.com" }),
    })));
    expect(await screen.findByRole("status")).toHaveTextContent("Alterações salvas");
  });
  it("lets an admin restrict card methods and installments without exposing existing credentials", async () => {
    const initial = { store: { tenant_id: "tenant", slug: "ground-shop" }, products: [], variants: [], platforms: [{ id: "channel", name: "WhatsApp" }], orders: [], payments: { mp_enabled: true, mp_configured: true, checkout_settings: { maxInstallments: 4 } } };
    vi.mocked(storeRequest).mockResolvedValue(initial);
    render(<CommerceAdmin initial={initial as never} tenantName="Ground Shop"/>);
    fireEvent.click(screen.getByRole("button", { name: "Pagamentos" }));
    fireEvent.click(screen.getByLabelText("Cartão de débito"));
    fireEvent.change(screen.getByLabelText("Máximo de parcelas"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar meios de pagamento" }));
    await waitFor(() => expect(storeRequest).toHaveBeenCalledWith("/api/commerce/admin/payments", "PUT", expect.objectContaining({ checkoutSettings: { pix: true, credit: true, debit: false, boleto: true, maxInstallments: 6 }, accessToken: undefined, webhookSecret: undefined })));
  });
  it("shows the URL and records a desired domain without claiming DNS is already active", () => {
    const initial = { store: { tenant_id: "tenant", slug: "ground-shop" }, urls: { public: "https://panel.test/loja/ground-shop", domains: [], platform: "https://panel.test/loja/ground-shop", webhook: "https://panel.test/api/store/ground-shop/payment-webhook" }, products: [], variants: [], platforms: [], orders: [], payments: null };
    render(<CommerceAdmin initial={initial as never} tenantName="Ground Shop"/>);
    fireEvent.click(screen.getByRole("button", { name: "Endereço da loja" }));
    expect(screen.getByRole("link", { name: "https://panel.test/loja/ground-shop" })).toHaveAttribute("href", initial.urls.public);
    fireEvent.change(screen.getByLabelText("Domínio desejado"), { target: { value: "groundshop.com.br" } });
    expect(screen.getByText(/não altera DNS nem comprova sua propriedade/)).toBeInTheDocument();
    expect(storeRequest).not.toHaveBeenCalled();
  });
});

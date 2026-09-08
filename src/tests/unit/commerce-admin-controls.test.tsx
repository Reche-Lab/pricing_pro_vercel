import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommerceHelp, CommerceThemePicker } from "@/components/commerce/CommerceAdminControls";
import { CommerceAdmin } from "@/components/commerce/CommerceAdmin";
import { storeRequest } from "@/components/commerce/store-http";
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn(), storeMoney: (n: number) => String(n) }));

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
});

import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommerceEmailSettings } from "@/components/commerce/CommerceEmailSettings";
import { CommerceDomainSetup } from "@/components/commerce/CommerceDomainSetup";
import { storeRequest } from "@/components/commerce/store-http";
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn() }));
const settings = { configured: true, host: "smtp.gmail.com", port: 587, username: "loja@example.com", fromEmail: "loja@example.com", fromName: "Ground Shop", replyTo: "", revision: 1, enabled: false, hasPassword: true, tested: false, testedAt: null };
beforeEach(() => vi.mocked(storeRequest).mockReset());
afterEach(cleanup);
describe("company email setup UX", () => {
  it("keeps stored passwords blank and requires test plus explicit receipt confirmation", async () => {
    const readyChanged = vi.fn();
    vi.mocked(storeRequest).mockImplementation(async (_path, method, body) => {
      if (method !== "POST") return { settings, testRecipient: "admin@example.com", platformReady: false };
      if ((body as { action: string }).action === "test") return { settings: { ...settings, tested: true, testedAt: "2026-11-12T12:00:00Z" }, message: "Teste aceito pelo SMTP." };
      return { settings: { ...settings, enabled: true, tested: true, testedAt: "2026-11-12T12:00:00Z" }, message: "Remetente ativo." };
    });
    render(<CommerceEmailSettings storeName="Ground Shop" contactEmail="loja@example.com" onReadyChange={readyChanged}/>);
    expect(await screen.findByLabelText("Senha SMTP / senha de aplicativo")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Ativar e-mail da empresa" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar teste para meu e-mail" }));
    const activate = await screen.findByRole("button", { name: "Ativar e-mail da empresa" }); expect(activate).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Recebi o e-mail de teste/ })); fireEvent.click(activate);
    await waitFor(() => expect(storeRequest).toHaveBeenCalledWith("/api/commerce/admin/email", "POST", { action: "toggle", revision: 1, enabled: true, confirmReceived: true }));
    await screen.findByText(/Remetente ativo: Ground Shop/);
    expect(readyChanged).toHaveBeenLastCalledWith(true);
  });
  it("blocks tests of unsaved changes and displays API failures in the page", async () => {
    vi.mocked(storeRequest).mockImplementation(async (_path, method) => { if (method === "PUT") throw new Error("Configuração mudou em outra aba."); return { settings, testRecipient: "admin@example.com", platformReady: true }; });
    render(<CommerceEmailSettings storeName="Ground Shop" contactEmail="loja@example.com"/>);
    fireEvent.change(await screen.findByLabelText("Nome do remetente"), { target: { value: "Novo nome" } });
    expect(screen.getByRole("button", { name: "Enviar teste para meu e-mail" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar configuração SMTP" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("outra aba");
  });
});
describe("domain request UX", () => {
  it("requests DNS setup rather than pretending to publish a domain", async () => {
    vi.mocked(storeRequest).mockImplementation(async (_path, method) => method === "POST" ? { domains: [], message: "Solicitação registrada. O DNS ainda não foi alterado." } : { domains: [] });
    function Form() { const [hostname, setHostname] = useState(""); return <CommerceDomainSetup hostname={hostname} onHostnameChange={setHostname} disabled={false}/>; }
    render(<Form/>);
    await screen.findByText(/Nenhuma solicitação registrada/);
    fireEvent.change(screen.getByLabelText("Domínio desejado"), { target: { value: "GroundShop.com.br" } });
    fireEvent.change(screen.getByLabelText("Provedor DNS (opcional)"), { target: { value: "Registro.br" } });
    fireEvent.click(screen.getByRole("button", { name: "Solicitar configuração do domínio" }));
    await waitFor(() => expect(storeRequest).toHaveBeenCalledWith("/api/commerce/admin/domains", "POST", { hostname: "groundshop.com.br", provider: "Registro.br", includeWww: true }));
    expect(await screen.findByRole("status")).toHaveTextContent("não foi alterado");
  });
});

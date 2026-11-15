import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreAssistantMessage } from "@/components/commerce/StoreAssistantMessage";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
beforeEach(() => Object.defineProperty(navigator, "clipboard", { configurable: true, get: () => undefined }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard); else Reflect.deleteProperty(navigator, "clipboard"); });
describe("assistant conversation bubbles", () => {
  it("identifies the sender without relying on color and keeps structured actions outside the text bubble", () => {
    render(<><StoreAssistantMessage speaker="user" text="Quero 50 bottons"/><StoreAssistantMessage speaker="assistant" text="Qual tamanho você prefere?"><a href="/produto/test">Conhecer produto</a></StoreAssistantMessage></>);
    const user = screen.getByRole("article", { name: "Sua mensagem" });
    const assistant = screen.getByRole("article", { name: "Mensagem do assistente virtual" });
    expect(user).toHaveAttribute("data-speaker", "user");
    expect(assistant).toHaveAttribute("data-speaker", "assistant");
    expect(within(user).getByText("Você")).toBeInTheDocument();
    expect(within(assistant).getByText("Assistente virtual")).toBeInTheDocument();
    expect(within(user).queryByRole("button", { name: "Copiar resposta" })).not.toBeInTheDocument();
    expect(within(assistant).getByRole("link", { name: "Conhecer produto" }).closest("[data-message-bubble]")).toBeNull();
  });
  it("copies only the displayed answer, with accessible feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText } as unknown as Clipboard);
    render(<StoreAssistantMessage speaker="assistant" text="Você pode salvar sem comprar."><span>Dados do cartão</span></StoreAssistantMessage>);
    fireEvent.click(screen.getByRole("button", { name: "Copiar resposta" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Resposta copiada."));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("Você pode salvar sem comprar.");
  });
  it("reports clipboard failure without interrupting the conversation", async () => {
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText: vi.fn().mockRejectedValue(new Error("denied")) } as unknown as Clipboard);
    render(<StoreAssistantMessage speaker="assistant" text="Confira os produtos."/>);
    fireEvent.click(screen.getByRole("button", { name: "Copiar resposta" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Não foi possível copiar a resposta.");
    expect(screen.getByText("Confira os produtos.")).toBeInTheDocument();
  });
  it("does not animate restored messages later when another reply arrives", () => {
    const { rerender } = render(<StoreAssistantMessage speaker="assistant" text="Resposta salva" animate={false}/>);
    expect(screen.getByRole("article")).toHaveAttribute("data-entering", "false");
    rerender(<StoreAssistantMessage speaker="assistant" text="Resposta salva" animate/>);
    expect(screen.getByRole("article")).toHaveAttribute("data-entering", "false");
  });
  it("renders text literally instead of interpreting customer content as HTML", () => {
    render(<StoreAssistantMessage speaker="user" text={'<img src=x onerror="alert(1)">'} animate/>);
    expect(screen.getByRole("article")).toHaveAttribute("data-entering", "true");
    expect(screen.getByRole("article").querySelector("img")).toBeNull();
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
  });
  it("does not add an empty card rail when a message has no actions", () => {
    render(<StoreAssistantMessage speaker="user" text="Obrigado">{[]}</StoreAssistantMessage>);
    expect(screen.getByRole("article").querySelector("[data-message-actions]")).toBeNull();
  });
});

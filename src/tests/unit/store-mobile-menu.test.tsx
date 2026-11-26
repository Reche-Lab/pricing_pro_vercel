import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreMobileMenu } from "@/components/commerce/StoreMobileMenu";
import { StoreCategoryNavigation } from "@/components/commerce/StoreCategoryNavigation";

const products = [{ id: "botton", name: "Botton 3,5 cm", category: "Bottons", imageUrl: "", unitCents: 300, personalized: true }];
const props = { name: "Ground Shop", base: "/loja/ground-shop", preview: false, customer: { name: "Ana" }, loading: false, busy: false, theme: "light", onToggleTheme: vi.fn(), onLogout: vi.fn().mockResolvedValue(undefined), navigationKey: "/" };
function menu(overrides: Partial<typeof props> = {}) {
  const input = { ...props, ...overrides };
  return <StoreMobileMenu {...input}><StoreCategoryNavigation products={products} base={input.base} preview={input.preview} view="home" layout="drawer" blogEnabled libraryEnabled/></StoreMobileMenu>;
}
beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); document.body.style.overflow = ""; });
function openMenu() { const trigger = screen.getByRole("button", { name: "Abrir menu da loja" }); fireEvent.click(trigger); return trigger; }

describe("mobile storefront menu", () => {
  it("opens an accessible dialog with categories, account and quote shortcuts", () => {
    render(menu()); const trigger = openMenu();
    const dialog = screen.getByRole("dialog", { name: "Ground Shop" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
    expect(document.body.style.overflow).toBe("hidden");
    expect(within(dialog).getByText("Olá, Ana")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Solicitar orçamento" })).toHaveAttribute("href", "/loja/ground-shop/orcamento");
    expect(within(dialog).getByRole("link", { name: "Minhas compras" })).toHaveAttribute("href", "/loja/ground-shop/pedidos");
    expect(within(dialog).getByRole("button", { name: "Campanhas" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Blog" })).toBeInTheDocument();
  });
  it("supports touch drilldown and return without closing the entire menu", () => {
    render(menu()); openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Bottons" }));
    expect(screen.getByRole("region", { name: "Produtos de Bottons" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar às categorias" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bottons" }));
    fireEvent.keyDown(screen.getByRole("region"), { key: "Escape" });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("closes on navigation including links to the current page", () => {
    render(menu()); const trigger = openMenu();
    const link = screen.getByRole("link", { name: "Início" });
    link.addEventListener("click", event => event.preventDefault()); fireEvent.click(link);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus(); expect(document.body.style.overflow).toBe("");
  });
  it("closes on Escape/backdrop and restores the previous scrolling state", () => {
    document.body.style.overflow = "clip";
    render(menu()); const trigger = openMenu();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: false, cancelable: true }));
    expect(trigger).toHaveFocus(); expect(document.body.style.overflow).toBe("clip");
    openMenu(); fireEvent.click(screen.getByRole("dialog"), { clientX: 500, clientY: 50 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("clip");
  });
  it("closes on a route change or resizing to desktop", () => {
    const { rerender } = render(menu()); openMenu();
    rerender(menu({ navigationKey: "/catalogo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    openMenu(); act(() => { Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 }); window.dispatchEvent(new Event("resize")); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(document.body.style.overflow).toBe("");
  });
  it("toggles theme in place and logs out with the existing handler", () => {
    render(menu()); openMenu(); fireEvent.click(screen.getByRole("button", { name: "Tema escuro" }));
    expect(props.onToggleTheme).toHaveBeenCalledOnce(); expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(props.onLogout).toHaveBeenCalledOnce(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("preserves private preview routes and hides live customer actions", () => {
    render(menu({ preview: true, base: "/commerce/ground-shop/preview" })); openMenu();
    expect(screen.queryByRole("link", { name: "Minhas compras" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sair" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pesquisar produtos" })).toHaveAttribute("href", "/commerce/ground-shop/preview/catalogo");
  });
  it("wraps keyboard focus within the visible dialog controls", () => {
    render(menu()); openMenu();
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{ width: 44, height: 44 }] as unknown as DOMRectList);
    const first = screen.getByRole("link", { name: "Ground Shop" });
    const last = screen.getByRole("button", { name: "Sair" });
    last.focus(); fireEvent.keyDown(last, { key: "Tab" }); expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true }); expect(last).toHaveFocus();
  });
});

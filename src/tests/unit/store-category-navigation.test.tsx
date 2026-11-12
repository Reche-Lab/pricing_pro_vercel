import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreCategoryNavigation } from "@/components/commerce/StoreCategoryNavigation";

const products = [
  { id: "small", name: "Botton 2,5 cm", category: "Bottons", imageUrl: "/botton.webp", unitCents: 325, personalized: true },
  { id: "large", name: "Botton 5,5 cm", category: "Bottons", imageUrl: "", unitCents: 500, personalized: true },
  { id: "mirror", name: "Espelho personalizado", category: "Espelhos & presentes", imageUrl: "/espelho.webp", unitCents: 900, personalized: false },
];
const props = { products, base: "/loja/ground-shop", preview: false, view: "home" };
beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.stubGlobal("PointerEvent", class extends MouseEvent { pointerType: string; constructor(type: string, options: PointerEventInit = {}) { super(type, options); this.pointerType = options.pointerType ?? "mouse"; } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("store category navigation", () => {
  it("keeps an empty store navigable without inventing categories", () => {
    render(<StoreCategoryNavigation {...props} products={[]}/>);
    expect(screen.getByRole("link", { name: "Pesquisar produtos" })).toHaveAttribute("href", "/loja/ground-shop/catalogo");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("opens only the selected category with real products and an encoded category link", () => {
    render(<StoreCategoryNavigation {...props}/>);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bottons" }));
    const panel = screen.getByRole("region", { name: "Produtos de Bottons" });
    expect(within(panel).getByRole("link", { name: /Botton 2,5 cm/ })).toHaveAttribute("href", "/loja/ground-shop/produto/small");
    expect(within(panel).queryByText("Espelho personalizado")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Espelhos & presentes" }));
    expect(screen.queryByRole("region", { name: "Produtos de Bottons" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver categoria completa" })).toHaveAttribute("href", "/loja/ground-shop/catalogo?categoria=Espelhos%20%26%20presentes");
    fireEvent.click(screen.getByRole("button", { name: "Espelhos & presentes" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("supports mouse hover without closing while crossing into the dropdown", () => {
    vi.useFakeTimers(); render(<StoreCategoryNavigation {...props}/>);
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Bottons" }), { pointerType: "mouse" });
    const nav = screen.getByRole("navigation", { name: "Categorias de produtos" });
    expect(screen.getByRole("region", { name: "Produtos de Bottons" })).toBeInTheDocument();
    fireEvent.pointerLeave(nav, { pointerType: "mouse" });
    fireEvent.pointerEnter(nav, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole("region")).toBeInTheDocument();
    fireEvent.pointerLeave(nav, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("opens by touch, closes outside and restores trigger focus on Escape", () => {
    render(<StoreCategoryNavigation {...props}/>);
    const trigger = screen.getByRole("button", { name: "Bottons" });
    fireEvent.pointerEnter(trigger, { pointerType: "touch" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("region").contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    const next = screen.getByRole("button", { name: "Espelhos & presentes" });
    expect(next).toHaveFocus();
    fireEvent.keyDown(next, { key: "ArrowDown" });
    expect(screen.getByRole("region", { name: "Produtos de Espelhos & presentes" })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    fireEvent.keyDown(next, { key: "Home" }); expect(trigger).toHaveFocus();
  });
  it("preserves preview/custom domain paths, current category and optional library links", () => {
    const { rerender } = render(<StoreCategoryNavigation {...props} base="/commerce/ground-shop/preview" preview libraryEnabled activeCategory="Bottons"/>);
    fireEvent.click(screen.getByRole("button", { name: "Bottons" }));
    expect(screen.getByRole("link", { name: /Botton 2,5 cm/ })).toHaveAttribute("href", "/commerce/ground-shop/preview/produto/small");
    expect(screen.queryByRole("link", { name: "Solicitar orçamento" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Campanhas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bottons" })).toHaveAttribute("aria-current", "true");
    rerender(<StoreCategoryNavigation {...props} base="" navigationKey="/catalogo"/>);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pesquisar produtos" })).toHaveAttribute("href", "/catalogo");
    expect(screen.getByRole("link", { name: "Solicitar orçamento" })).toHaveAttribute("href", "/orcamento");
  });
  it("closes after selecting a product and does not trap tab navigation", () => {
    render(<StoreCategoryNavigation {...props}/>);
    fireEvent.click(screen.getByRole("button", { name: "Bottons" }));
    const product = screen.getByRole("link", { name: /Botton 2,5 cm/ });
    product.addEventListener("click", event => event.preventDefault());
    fireEvent.click(product);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bottons" }));
    fireEvent.blur(screen.getByRole("navigation"), { relatedTarget: document.body });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

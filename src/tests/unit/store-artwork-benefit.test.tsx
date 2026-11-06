import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { artworkDiscountForLines } from "@/domain/commerce/artwork-benefit";
import { StoreOrderSummary } from "@/components/commerce/StoreOrderSummary";
import { StoreArtworkReward } from "@/components/commerce/StoreArtworkReward";

beforeEach(() => vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("artwork discount feedback", () => {
  it("reads only the approved art's authoritative discount, including split groups", () => {
    const lines = [
      { id: "a", productId: "p", artworkId: "art", quantity: 10, artworkName: "A" },
      { id: "b", productId: "p", artworkId: "art", quantity: 10, artworkName: "A" },
      { id: "c", productId: "p", artworkId: "other", quantity: 10, artworkName: "B" },
    ];
    const calculation = { items: [{ id: "a", artworkDiscountCents: 33 }, { id: "b", artworkDiscountCents: 68 }, { id: "c", artworkDiscountCents: 999 }] };
    expect(artworkDiscountForLines(calculation, lines, "p", "art")).toBe(101);
    expect(artworkDiscountForLines(calculation, lines, "other", "art")).toBe(0);
    expect(artworkDiscountForLines(null, lines, "p", "art")).toBeNull();
  });
  it("shows gross products minus the benefit plus delivery without subtracting twice", () => {
    render(<StoreOrderSummary subtotal={9000} artworkDiscountCents={1000} shipping={2000} />);
    expect(screen.getByText("Produtos antes do benefício").nextElementSibling).toHaveTextContent("100,00");
    expect(screen.getByText("Desconto por arte pronta").nextElementSibling).toHaveTextContent("−R$ 10,00");
    expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("110,00");
  });
  it("keeps ordinary summaries compact when no artwork benefit applies", () => {
    render(<StoreOrderSummary subtotal={5000} />);
    expect(screen.queryByText("Desconto por arte pronta")).not.toBeInTheDocument();
    expect(screen.getByText("Produtos").nextElementSibling).toHaveTextContent("50,00");
  });
  it("celebrates an earned benefit without covering or intercepting the interface", () => {
    render(<StoreArtworkReward discountCents={500} celebrate context="cart" />);
    expect(screen.getByRole("status")).toHaveTextContent("Você ganhou R$ 5,00");
    expect(screen.getByRole("status")).toHaveTextContent("carrinho");
    expect(document.querySelector("[data-artwork-confetti]")).toHaveAttribute("aria-hidden", "true");
  });
  it("respects reduced motion while keeping the discount message", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(<StoreArtworkReward discountCents={500} celebrate context="selection" />);
    expect(document.querySelector("[data-artwork-confetti]")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("ao adicionar");
  });
  it("removes the particles automatically but retains the benefit confirmation", () => {
    vi.useFakeTimers();
    render(<StoreArtworkReward discountCents={500} celebrate context="cart" />);
    expect(document.querySelector("[data-artwork-confetti]")).not.toBeNull();
    act(() => vi.advanceTimersByTime(3800));
    expect(document.querySelector("[data-artwork-confetti]")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Você ganhou R$ 5,00");
  });
  it.each([0, null])("does not claim money or throw confetti for an unknown/zero benefit (%s)", discountCents => {
    render(<StoreArtworkReward discountCents={discountCents} celebrate context="cart" />);
    expect(screen.queryByText(/Você ganhou/)).not.toBeInTheDocument();
    expect(document.querySelector("[data-artwork-confetti]")).toBeNull();
  });
});

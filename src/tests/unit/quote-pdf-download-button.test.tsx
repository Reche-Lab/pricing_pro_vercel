import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QuotePdfDownloadButton } from "@/components/quotes/QuotePdfDownloadButton";

afterEach(cleanup);
describe("PDF artwork and product view selection", () => {
  it("defaults to approved product front/back and allows a front-only download", () => {
    render(<QuotePdfDownloadButton quoteId="quote" artworkCount={2} editedCount={1} croppedCount={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Baixar PDF" }));
    expect(screen.getByRole("button", { name: /Produto aprovado/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Gerar PDF" })).toHaveAttribute("href", "/api/quotes/quote/pdf?artwork=product&view=both");
    fireEvent.click(screen.getByRole("button", { name: "Somente frente" }));
    expect(screen.getByRole("link", { name: "Gerar PDF" })).toHaveAttribute("href", "/api/quotes/quote/pdf?artwork=product&view=front");
    fireEvent.click(screen.getByRole("button", { name: /Arte original/ }));
    expect(screen.getByRole("link", { name: "Gerar PDF" })).toHaveAttribute("href", "/api/quotes/quote/pdf?artwork=original&view=front");
  });
  it("keeps automatic presentation available without an attachment", () => {
    render(<QuotePdfDownloadButton quoteId="quote" artworkCount={0} editedCount={0} croppedCount={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Baixar PDF" }));
    expect(screen.getByRole("button", { name: /Produto aprovado/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Arte editada/ })).toBeDisabled();
    expect(screen.getByText(/Sem artes anexadas/)).toBeVisible();
  });
});

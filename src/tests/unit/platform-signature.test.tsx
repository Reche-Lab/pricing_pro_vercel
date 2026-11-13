import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/AppShell";
import { LandingPage } from "@/components/landing/LandingPage";
vi.mock("@/components/billing/BillingStatusBanner", () => ({ BillingStatusBanner: () => null }));
vi.mock("@/components/layout/SidebarNav", () => ({ SidebarNav: () => null }));
vi.mock("@/components/commerce/CommerceOrderAlerts", () => ({ CommerceOrderAlerts: () => null }));
afterEach(cleanup);
describe("shared platform signature", () => {
  it("appears in the administrative shell without replacing the tenant identity", () => {
    render(<AppShell title="Painel" tenantName="Minha empresa"><p>Conteúdo administrativo</p></AppShell>);
    expect(screen.getByText("Minha empresa")).toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "rechelab" })).toHaveAttribute("href", "https://reche-lab-portfolio.vercel.app/");
  });
  it("appears on the public platform landing page", () => {
    render(<LandingPage/>);
    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: "Liaflow" })).toHaveAttribute("href", "https://liaflow-calcula.vercel.app/");
    expect(footer.getByRole("link", { name: "rechelab" })).toHaveAttribute("href", "https://reche-lab-portfolio.vercel.app/");
  });
});

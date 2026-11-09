import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommercePaymentDiagnostics } from "@/components/commerce/CommercePaymentDiagnostics";
import { storeRequest } from "@/components/commerce/store-http";
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("payment diagnostic experience", () => {
  it("checks only saved credentials in the selected environment without submitting the surrounding form", async () => {
    const submit = vi.fn();
    vi.mocked(storeRequest).mockResolvedValue({ environment: "test", checks: [
      { key: "identity", endpoint: "/users/me", outcome: "ok", httpStatus: 200, message: "Vendedor corresponde." },
      { key: "orders_read", endpoint: "/v1/orders", outcome: "failed", httpStatus: 403, code: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES", supportReference: "mp-reference-123", message: "Consulta recusada pelo provedor." },
    ] });
    render(<form onSubmit={submit}><CommercePaymentDiagnostics environment="test" configured disabled={false}/></form>);
    fireEvent.click(screen.getByRole("button", { name: "Diagnosticar conexão sem cobrança" }));
    expect(await screen.findByText("mp-reference-123")).toBeInTheDocument();
    expect(screen.getByText("HTTP 403")).toBeInTheDocument();
    expect(screen.getByText(/Uma consulta autorizada não comprova/)).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    expect(storeRequest).toHaveBeenCalledWith("/api/commerce/admin/payments/diagnostics", "POST", { environment: "test" });
  });
  it("does not query unsaved credentials or an unconfigured environment", () => {
    const view = render(<CommercePaymentDiagnostics environment="test" configured={false} disabled={false}/>);
    expect(screen.getByRole("button", { name: "Diagnosticar conexão sem cobrança" })).toBeDisabled();
    view.rerender(<CommercePaymentDiagnostics environment="test" configured disabled/>);
    expect(screen.getByRole("button", { name: "Diagnosticar conexão sem cobrança" })).toBeDisabled();
    expect(storeRequest).not.toHaveBeenCalled();
  });
  it("contains a diagnostic failure without inviting a payment or switching environments", async () => {
    vi.mocked(storeRequest).mockRejectedValue(new Error("Diagnóstico indisponível"));
    render(<CommercePaymentDiagnostics environment="production" configured disabled={false}/>);
    fireEvent.click(screen.getByRole("button", { name: "Diagnosticar conexão sem cobrança" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Diagnóstico indisponível");
    expect(storeRequest).toHaveBeenCalledOnce();
  });
});

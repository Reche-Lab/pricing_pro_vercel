import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteCommerceOrderButton } from "@/components/commerce/DeleteCommerceOrderButton";
import { storeRequest } from "@/components/commerce/store-http";
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/commerce/store-http", () => ({
  storeRequest: vi.fn(),
  storeMoney: (value: number) => `R$ ${(value / 100).toFixed(2)}`,
}));
const order = {
  orderId: "11111111-2222-4333-8444-555555555555",
  customerName: "Cliente teste",
  totalCents: 12345,
};
beforeEach(() => {
  vi.mocked(storeRequest).mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("store order deletion confirmation", () => {
  it("shows the right order and keeps deletion disabled until code and reason are entered", () => {
    render(<DeleteCommerceOrderButton {...order} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Excluir pedido #11111111" }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Cliente teste");
    expect(screen.getByRole("dialog")).toHaveTextContent("R$ 123.45");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      /não cancela pagamentos/i,
    );
    const submit = screen.getByRole("button", { name: "Excluir da gestão" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Confirmação de exclusão"), {
      target: { value: "excluir" },
    });
    fireEvent.change(screen.getByLabelText("Motivo da exclusão"), {
      target: { value: "Pedido duplicado" },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Confirmação de exclusão"), {
      target: { value: "excluir 11111111" },
    });
    expect(submit).toBeEnabled();
    expect(storeRequest).not.toHaveBeenCalled();
  });
  it("leaves failures inside the modal and preserves the fields", async () => {
    vi.mocked(storeRequest).mockRejectedValue(
      new Error("Não foi possível excluir este pedido."),
    );
    render(<DeleteCommerceOrderButton {...order} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Excluir pedido #11111111" }),
    );
    fireEvent.change(screen.getByLabelText("Confirmação de exclusão"), {
      target: { value: "EXCLUIR 11111111" },
    });
    fireEvent.change(screen.getByLabelText("Motivo da exclusão"), {
      target: { value: "Pedido duplicado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Excluir da gestão" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível excluir",
    );
    expect(screen.getByLabelText("Motivo da exclusão")).toHaveValue(
      "Pedido duplicado",
    );
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it("submits only once, updates notifications and returns from the detail page", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(storeRequest).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const deleted = vi.fn(),
      updated = vi.fn();
    window.addEventListener("commerce:orders-updated", updated);
    try {
      render(
        <DeleteCommerceOrderButton
          {...order}
          redirectTo="/commerce/orders"
          onDeleted={deleted}
        />,
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Excluir pedido #11111111" }),
      );
      fireEvent.change(screen.getByLabelText("Confirmação de exclusão"), {
        target: { value: "EXCLUIR 11111111" },
      });
      fireEvent.change(screen.getByLabelText("Motivo da exclusão"), {
        target: { value: "Pedido duplicado" },
      });
      const button = screen.getByRole("button", { name: "Excluir da gestão" });
      fireEvent.click(button);
      fireEvent.click(button);
      expect(storeRequest).toHaveBeenCalledOnce();
      expect(storeRequest).toHaveBeenCalledWith(
        `/api/commerce/admin/orders/${order.orderId}`,
        "DELETE",
        { confirmation: "EXCLUIR 11111111", reason: "Pedido duplicado" },
      );
      finish({ ok: true });
      await waitFor(() => expect(deleted).toHaveBeenCalledOnce());
      expect(router.push).toHaveBeenCalledWith("/commerce/orders");
      expect(updated).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("commerce:orders-updated", updated);
    }
  });
});

import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommerceImageUpload } from "@/components/commerce/CommerceImageUpload";
import { storeRequest } from "@/components/commerce/store-http";
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("store image upload control", () => {
  it("uploads a file, updates the draft URL and never submits the parent form", async () => {
    vi.mocked(storeRequest).mockResolvedValue({
      url: "https://example.test/new.webp",
    });
    const changed = vi.fn();
    const busy = vi.fn();
    const submit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={submit}>
        <CommerceImageUpload
          label="Logo"
          purpose="logo"
          value=""
          onChange={changed}
          onBusyChange={busy}
        />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Enviar imagem" }));
    fireEvent.change(screen.getByLabelText("Enviar Logo"), {
      target: { files: [new File(["png"], "logo.png", { type: "image/png" })] },
    });
    await waitFor(() =>
      expect(changed).toHaveBeenCalledWith("https://example.test/new.webp"),
    );
    expect(storeRequest).toHaveBeenCalledWith(
      "/api/commerce/admin/media",
      "POST",
      expect.objectContaining({ purpose: "logo", fileName: "logo.png" }),
    );
    expect(busy.mock.calls).toEqual([[true], [false]]);
    expect(submit).not.toHaveBeenCalled();
  });
  it("keeps the current image when an upload fails and shows the error", async () => {
    vi.mocked(storeRequest).mockRejectedValue(
      new Error("Armazenamento indisponível"),
    );
    const changed = vi.fn();
    render(
      <CommerceImageUpload
        label="Capa"
        purpose="cover"
        value="https://example.test/old.webp"
        onChange={changed}
        onBusyChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Enviar Capa"), {
      target: {
        files: [new File(["png"], "cover.png", { type: "image/png" })],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Armazenamento indisponível",
    );
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByAltText("Prévia: Capa")).toHaveAttribute(
      "src",
      "https://example.test/old.webp",
    );
    fireEvent.click(screen.getByRole("button", { name: "Remover Capa" }));
    expect(changed).toHaveBeenCalledWith("");
  });
  it("rejects unsupported files without a request", () => {
    render(
      <CommerceImageUpload
        label="Produto"
        purpose="product"
        value=""
        onChange={vi.fn()}
        onBusyChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Enviar Produto"), {
      target: {
        files: [new File(["<svg/>"], "image.svg", { type: "image/svg+xml" })],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("PNG, JPEG ou WebP");
    expect(storeRequest).not.toHaveBeenCalled();
  });
});

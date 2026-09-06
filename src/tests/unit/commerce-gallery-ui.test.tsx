import React, { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreProductGallery } from "@/components/commerce/StoreProductGallery";
import { CommerceProductMediaEditor } from "@/components/commerce/CommerceProductMediaEditor";
import { uploadProductFile } from "@/components/commerce/store-media-http";
import type { ProductMedia } from "@/domain/commerce/product-media";
vi.mock("@/components/commerce/store-media-http", async (original) => ({
  ...(await original<
    typeof import("@/components/commerce/store-media-http")
  >()),
  uploadProductFile: vi.fn(),
}));
const media: ProductMedia[] = [
  { id: "1", kind: "image", url: "https://example.test/1.webp" },
  { id: "2", kind: "image", url: "https://example.test/2.webp" },
  { id: "3", kind: "video", url: "https://example.test/3.mp4" },
];
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("product media galleries", () => {
  it("only loads a video after selection and removes it on navigation", () => {
    const { container } = render(
      <StoreProductGallery
        id="product"
        name="Botton"
        media={media}
        imageUrl={media[0].url}
      />,
    );
    expect(container.querySelector("video")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver vídeo 3" }));
    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("playsinline");
    expect(video).not.toHaveAttribute("autoplay");
    fireEvent.error(video);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "não conseguiu reproduzir",
    );
    fireEvent.click(screen.getByRole("button", { name: "Próxima mídia" }));
    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByText("Imagem 1 de 3")).toBeInTheDocument();
  });
  it("changes cover/order and prevents removing the last image while videos remain", () => {
    function Editor() {
      const [value, setValue] = useState<{
        media?: ProductMedia[];
        imageUrl: string;
      }>({ media: [media[0], media[2]], imageUrl: media[0].url });
      return (
        <CommerceProductMediaEditor
          productId="product"
          {...value}
          onChange={setValue}
          onBusyChange={() => undefined}
        />
      );
    }
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Remover mídia 1" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Mantenha pelo menos uma imagem",
    );
    fireEvent.click(screen.getByRole("button", { name: "Remover mídia 2" }));
    expect(
      screen.queryByLabelText("Vídeo 2 do produto"),
    ).not.toBeInTheDocument();
    cleanup();
    const onChange = vi.fn();
    render(
      <CommerceProductMediaEditor
        productId="product"
        media={media}
        imageUrl={media[0].url}
        onChange={onChange}
        onBusyChange={() => undefined}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Definir imagem 2 como capa" }),
    );
    expect(onChange).toHaveBeenCalledWith({
      media: [media[1], media[0], media[2]],
      imageUrl: media[1].url,
    });
  });
  it("enforces limits before upload and preserves successful files on partial failure", async () => {
    const onChange = vi.fn();
    const busy = vi.fn();
    render(
      <CommerceProductMediaEditor
        productId="product"
        media={media}
        imageUrl={media[0].url}
        onChange={onChange}
        onBusyChange={busy}
      />,
    );
    const file = new File(["image"], "sample.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Adicionar mídias do produto"), {
      target: { files: Array(8).fill(file) },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("até 10");
    expect(uploadProductFile).not.toHaveBeenCalled();
    vi.mocked(uploadProductFile)
      .mockResolvedValueOnce({
        id: "4",
        kind: "image",
        url: "https://example.test/4.webp",
      })
      .mockRejectedValueOnce(new Error("Falha no segundo arquivo"));
    fireEvent.change(screen.getByLabelText("Adicionar mídias do produto"), {
      target: { files: [file, file] },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Falha no segundo"),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].media).toHaveLength(4);
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });
});

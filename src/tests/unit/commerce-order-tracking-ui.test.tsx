import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreOrderTracking, type StoreOrderTrackingShipping } from "@/components/commerce/StoreOrderTracking";

const shipping: StoreOrderTrackingShipping = {
  status: "in_transit",
  serviceName: "Correios · SEDEX",
  trackingCode: "AB123456789BR",
  trackingUrl: "https://rastreamento.correios.com.br/app/index.php",
  postedAt: "2026-11-20T12:00:00Z",
  deliveredAt: null,
  updatedAt: "2026-11-21T15:00:00Z",
  events: [
    { status: "posted", occurredAt: "2026-11-20T12:00:00Z", description: "Objeto postado." },
    { status: "in_transit", occurredAt: "2026-11-21T15:00:00Z", description: "Objeto em transferência." },
  ],
};
const parcels: NonNullable<StoreOrderTrackingShipping["parcels"]> = [
  { id: "parcel-1", status: "posted", trackingCode: "EF123456789BR", trackingUrl: "https://carrier.example/track/1" },
  { id: "parcel-2", status: "label_ready", trackingCode: "GH123456789BR", trackingUrl: "https://carrier.example/track/2" },
];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("buyer order shipping tracking", () => {
  it("does not render a shipping section when there is no shipment", () => {
    const { container } = render(<StoreOrderTracking shipping={null}/>);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows public shipping information, milestones and newest-first events without mutating the prop", () => {
    const { container } = render(<StoreOrderTracking shipping={{ ...shipping, deliveredAt: "2026-11-22T15:00:00Z", status: "delivered" }}/>);
    const section = screen.getByRole("region", { name: "Rastreamento da entrega" });
    expect(within(section).getByText("Entregue")).toBeInTheDocument();
    expect(screen.getByText("Correios · SEDEX")).toBeInTheDocument();
    expect(screen.getByText("AB123456789BR")).toBeInTheDocument();
    expect(screen.getByText("Postagem confirmada")).toBeInTheDocument();
    expect(screen.getByText("Entrega confirmada")).toBeInTheDocument();
    expect(screen.getByText("Última atualização")).toBeInTheDocument();
    expect(container.querySelector('time[datetime="2026-11-22T15:00:00Z"]')).toBeInTheDocument();
    const events = screen.getAllByRole("listitem");
    expect(events).toHaveLength(2);
    expect(events[0]).toHaveTextContent("Objeto em transferência.");
    expect(events[1]).toHaveTextContent("Objeto postado.");
    expect(shipping.events[0].status).toBe("posted");
  });

  it("never describes label creation or the presence of a code as confirmed posting", () => {
    render(<StoreOrderTracking shipping={{ ...shipping, status: "label_ready", postedAt: null, updatedAt: null, events: [] }}/>);
    expect(screen.getByText("Aguardando postagem")).toBeInTheDocument();
    expect(screen.getByText(/a postagem ainda não foi confirmada/)).toBeInTheDocument();
    expect(screen.queryByText("Postagem confirmada")).not.toBeInTheDocument();
    expect(screen.queryByText("Postado")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar código de rastreamento" })).toBeInTheDocument();
  });

  it("explains awaiting tracking and empty events without inventing a code or carrier link", () => {
    render(<StoreOrderTracking shipping={{ ...shipping, status: "awaiting_tracking", trackingCode: null, trackingUrl: null, postedAt: null, updatedAt: null, events: [] }}/>);
    expect(screen.getByText("Aguardando rastreamento")).toBeInTheDocument();
    expect(screen.getByText(/O código e as movimentações aparecerão aqui/)).toBeInTheDocument();
    expect(screen.getByText("Ainda não há movimentações registradas pela transportadora.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("opens an absolute HTTPS carrier link with a protected new tab, even without a code", () => {
    render(<StoreOrderTracking shipping={{ ...shipping, trackingCode: null }}/>);
    const link = screen.getByRole("link", { name: "Acompanhar na transportadora" });
    expect(link).toHaveAttribute("href", shipping.trackingUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([
    "javascript:alert(1)", "http://carrier.example/track", "//carrier.example/track",
    "/api/private/label", "data:text/html,private", "not a URL",
    "https://user:secret@carrier.example/track", "https://user@carrier.example/track",
  ])("does not create a link for unsafe or non-HTTPS URL %s", trackingUrl => {
    render(<StoreOrderTracking shipping={{ ...shipping, trackingUrl }}/>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar código de rastreamento" })).toBeInTheDocument();
  });

  it("copies only the tracking code and announces success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<StoreOrderTracking shipping={shipping}/>);
    fireEvent.click(screen.getByRole("button", { name: "Copiar código de rastreamento" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Código copiado."));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("AB123456789BR");
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it.each(["denied", "unavailable"])("offers manual copying when clipboard access is %s", async mode => {
    vi.stubGlobal("navigator", mode === "denied" ? { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } } : {});
    render(<StoreOrderTracking shipping={shipping}/>);
    fireEvent.click(screen.getByRole("button", { name: "Copiar código de rastreamento" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Não foi possível copiar. Selecione o código e copie manualmente."));
    expect(screen.getByText(shipping.trackingCode!)).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it("does not carry copy feedback over to another tracking code", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const view = render(<StoreOrderTracking shipping={shipping}/>);
    fireEvent.click(screen.getByRole("button"));
    await screen.findByText("Código copiado.");
    view.rerender(<StoreOrderTracking shipping={{ ...shipping, trackingCode: "CD987654321BR" }}/>);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("keeps tracking actions and only the latest event in compact mode", () => {
    render(<StoreOrderTracking shipping={shipping} compact/>);
    expect(screen.getByRole("region")).toHaveAttribute("data-compact", "true");
    expect(screen.getByRole("heading", { name: "Última ocorrência" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Objeto em transferência.")).toBeInTheDocument();
    expect(screen.queryByText("Objeto postado.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar código de rastreamento" })).toBeInTheDocument();
    expect(screen.getByRole("link")).toBeInTheDocument();
  });

  it("handles unknown statuses, invalid dates and blank codes without exposing raw status values", () => {
    const { container } = render(<StoreOrderTracking shipping={{ ...shipping, status: "provider_internal_status", serviceName: " ", trackingCode: " ", trackingUrl: null, postedAt: "invalid", updatedAt: null, events: [{ status: "internal_event", occurredAt: "invalid", description: "Atualização recebida." }] }}/>);
    expect(screen.getByText("Envio em atualização")).toBeInTheDocument();
    expect(screen.getByText("Atualização da entrega")).toBeInTheDocument();
    expect(screen.getAllByText("Data não disponível")).toHaveLength(2);
    expect(container.querySelector("time")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("provider_internal_status");
    expect(container).not.toHaveTextContent("internal_event");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each(["constructor", "__proto__", "toString"])("handles the unknown status %s safely", status => {
    render(<StoreOrderTracking shipping={{ ...shipping, status, events: [{ ...shipping.events[0], status }] }}/>);
    expect(screen.getByText("Envio em atualização")).toBeInTheDocument();
    expect(screen.getByText("Atualização da entrega")).toBeInTheDocument();
  });

  it.each([
    ["quoted", "Envio em conferência"], ["cart", "Envio em preparação"],
    ["purchased", "Envio em preparação"], ["review", "Envio em conferência"],
  ])("humanizes the pre-shipping status %s without suggesting posting", (status, label) => {
    render(<StoreOrderTracking shipping={{ ...shipping, status, postedAt: null, events: [] }}/>);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText("Postado")).not.toBeInTheDocument();
    expect(screen.queryByText("Postagem confirmada")).not.toBeInTheDocument();
    expect(screen.queryByText(status, { exact: true })).not.toBeInTheDocument();
  });

  it.each([false, true])("shows every volume's code and safe link instead of a single summary code (compact: %s)", compact => {
    render(<StoreOrderTracking shipping={{ ...shipping, parcels }} compact={compact}/>);
    expect(screen.getAllByRole("group")).toHaveLength(2);
    parcels.forEach((parcel, index) => {
      const group = screen.getByRole("group", { name: `Volume ${index + 1}` });
      expect(within(group).getByText(parcel.trackingCode!)).toBeInTheDocument();
      expect(within(group).getByRole("button", { name: `Copiar código de rastreamento do volume ${index + 1}` })).toBeInTheDocument();
      const link = within(group).getByRole("link", { name: `Acompanhar volume ${index + 1} na transportadora` });
      expect(link).toHaveAttribute("href", parcel.trackingUrl);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
    expect(screen.getByRole("group", { name: "Volume 1" })).toHaveTextContent("Postado");
    expect(screen.getByRole("group", { name: "Volume 2" })).toHaveTextContent("Aguardando postagem");
    expect(screen.queryByText(shipping.trackingCode!)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it.each([[], [parcels[0]]].map(optionalParcels => ({ optionalParcels })))("preserves the existing summary UI for zero or one optional parcel: $optionalParcels", ({ optionalParcels }) => {
    render(<StoreOrderTracking shipping={{ ...shipping, parcels: optionalParcels }}/>);
    expect(screen.getByText(shipping.trackingCode!)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar código de rastreamento" })).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("copies each volume independently and keeps feedback within that volume", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<StoreOrderTracking shipping={{ ...shipping, parcels }}/>);
    const first = screen.getByRole("group", { name: "Volume 1" });
    const second = screen.getByRole("group", { name: "Volume 2" });
    fireEvent.click(within(second).getByRole("button"));
    await waitFor(() => expect(within(second).getByRole("status")).toHaveTextContent("Código copiado."));
    expect(within(first).getByRole("status")).toBeEmptyDOMElement();
    expect(writeText).toHaveBeenNthCalledWith(1, parcels[1].trackingCode);
    fireEvent.click(within(first).getByRole("button"));
    await waitFor(() => expect(within(first).getByRole("status")).toHaveTextContent("Código copiado."));
    expect(writeText).toHaveBeenNthCalledWith(2, parcels[0].trackingCode);
  });

  it.each([
    "javascript:alert(1)", "http://carrier.example/track", "//carrier.example/track",
    "/private/label.pdf", "https://user:secret@carrier.example/track", "not a URL",
  ])("validates each volume URL separately: %s", trackingUrl => {
    render(<StoreOrderTracking shipping={{ ...shipping, parcels: [parcels[0], { ...parcels[1], trackingUrl }] }}/>);
    expect(within(screen.getByRole("group", { name: "Volume 1" })).getByRole("link")).toHaveAttribute("href", parcels[0].trackingUrl);
    const second = screen.getByRole("group", { name: "Volume 2" });
    expect(within(second).queryByRole("link")).not.toBeInTheDocument();
    expect(within(second).getByText(parcels[1].trackingCode!)).toBeInTheDocument();
    expect(within(second).getByRole("button")).toBeInTheDocument();
  });

  it("handles partially available volume tracking without exposing parcel labels or private IDs", () => {
    const privateParcels = [
      { ...parcels[0], trackingCode: null, labelUrl: "https://private.example/first-label.pdf" },
      { ...parcels[1], trackingCode: null, trackingUrl: null, labelUrl: "https://private.example/second-label.pdf" },
    ];
    const { container } = render(<StoreOrderTracking shipping={{ ...shipping, trackingCode: null, trackingUrl: null, parcels: privateParcels }}/>);
    expect(within(screen.getByRole("group", { name: "Volume 1" })).getByRole("link")).toBeInTheDocument();
    const second = screen.getByRole("group", { name: "Volume 2" });
    expect(within(second).getByText("O rastreamento deste volume ainda não está disponível.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("O rastreamento ainda não está disponível. Aguarde a atualização da transportadora.")).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain("private.example");
    expect(container).not.toHaveTextContent("parcel-1");
    expect(container).not.toHaveTextContent("parcel-2");
  });

  it("explains awaiting movements without promising an already available tracking code", () => {
    render(<StoreOrderTracking shipping={{ ...shipping, status: "awaiting_tracking", parcels }}/>);
    expect(screen.getByText(/Aguardando novas movimentações da transportadora/)).toBeInTheDocument();
    expect(screen.queryByText(/O código e as movimentações aparecerão aqui/)).not.toBeInTheDocument();
  });

  it("renders descriptions as text and never renders unexpected private shipment fields", () => {
    const publicShipping = { ...shipping, labelUrl: "https://private.example/label.pdf", address: "Endereço privado", events: [{ ...shipping.events[0], description: '<img src=x onerror="alert(1)">' }] };
    const { container } = render(<StoreOrderTracking shipping={publicShipping}/>);
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain("private.example");
    expect(container).not.toHaveTextContent("Endereço privado");
    expect(screen.queryByRole("link", { name: /etiqueta/i })).not.toBeInTheDocument();
  });
});

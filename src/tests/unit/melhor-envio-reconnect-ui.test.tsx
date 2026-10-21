import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MelhorEnvioReconnectBoundary } from "@/components/shipping/MelhorEnvioReconnectBoundary";
import { MelhorEnvioOAuthCompletion } from "@/components/shipping/MelhorEnvioOAuthCompletion";
import { MelhorEnvioQuoteLabelActions } from "@/components/quotes/MelhorEnvioQuoteLabelActions";
import { PricingCalculator } from "@/components/pricing/PricingCalculator";
import { demoVariants, platformPresets } from "@/domain/pricing/defaults";
import { melhorEnvioAwareFetch, requestMelhorEnvioReconnect } from "@/lib/melhor-envio/browser-request";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
class Channel {
  static instances: Channel[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  close = vi.fn();
  postMessage = vi.fn();
  constructor(public name: string) { Channel.instances.push(this); }
}
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("BroadcastChannel", Channel); Channel.instances = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("Melhor Envio reconnect without losing the current quote", () => {
  it("detects the legacy Unauthenticated response, preserves the body and never replays requests", async () => {
    const payload = { ok: false, error: "Unauthenticated." };
    const fetcher = vi.fn().mockImplementation(async () => Response.json(payload, { status: 502 }));
    vi.stubGlobal("fetch", fetcher);
    render(<MelhorEnvioReconnectBoundary><input aria-label="Rascunho" defaultValue="Minha arte" /></MelhorEnvioReconnectBoundary>);
    let response: Response;
    await act(async () => { response = await melhorEnvioAwareFetch("/api/shipping/melhor-envio/quote", { method: "POST" }); });
    expect(await response!.json()).toEqual(payload);
    act(() => requestMelhorEnvioReconnect());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(screen.getByLabelText("Rascunho")).toHaveValue("Minha arte");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([[401, { ok: false }], [502, { error: "Permissões insuficientes", httpStatus: 403 }], [422, { error: "CEP inválido" }]])("does not open for platform-session, permission or validation error %s", async (status, data) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(data, { status })));
    render(<MelhorEnvioReconnectBoundary>Orçamento</MelhorEnvioReconnectBoundary>);
    await act(async () => { await melhorEnvioAwareFetch("/api/shipping/melhor-envio/quote"); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows a useful blocked-popup message", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    render(<MelhorEnvioReconnectBoundary>Orçamento</MelhorEnvioReconnectBoundary>);
    act(() => requestMelhorEnvioReconnect());
    fireEvent.click(screen.getByRole("button", { name: "Reconectar Melhor Envio" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Permita pop-ups");
  });
  it("uses an attempt-specific channel, reports success and retains fields without retrying purchase", async () => {
    const popup = { location: { href: "about:blank" }, close: vi.fn(), closed: true };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const fetcher = vi.fn().mockResolvedValue(Response.json({ authUrl: "https://www.melhorenvio.com.br/oauth/authorize" }));
    vi.stubGlobal("fetch", fetcher);
    render(<MelhorEnvioReconnectBoundary><input aria-label="Rascunho" defaultValue="Pedido preservado" /></MelhorEnvioReconnectBoundary>);
    act(() => requestMelhorEnvioReconnect());
    fireEvent.click(screen.getByRole("button", { name: "Reconectar Melhor Envio" }));
    await waitFor(() => expect(popup.location.href).toContain("melhorenvio.com.br"));
    const redirect = new URL(fetcher.mock.calls[0][0], "https://app.test").searchParams.get("redirectPath");
    expect(redirect).toBe(`/melhor-envio/oauth/complete?attempt=${Channel.instances[0].name.split(":")[1]}`);
    act(() => Channel.instances[0].onmessage?.({ data: "connected" }));
    expect(screen.getByRole("dialog", { name: "Melhor Envio conectado" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao orçamento" }));
    expect(screen.getByLabelText("Rascunho")).toHaveValue("Pedido preservado");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("opens the modal from a saved quote's shipping quotation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ ok: false, code: "melhor_envio_oauth_invalid", reconnectRequired: true, error: "Unauthenticated." }, { status: 502 })));
    render(<MelhorEnvioReconnectBoundary><MelhorEnvioQuoteLabelActions quoteId="quote" quoteShippingTotal={0} shipments={[]} /></MelhorEnvioReconnectBoundary>);
    fireEvent.click(screen.getByRole("button", { name: "Cotar Melhor Envio" }));
    expect(await screen.findByRole("dialog", { name: "Reconectar Melhor Envio" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cotar Melhor Envio" })).not.toBeDisabled();
  });
  it("only announces completion to its own attempt", () => {
    const attempt = "70b23630-9dc0-447f-9aef-acf4642db663";
    render(<MelhorEnvioOAuthCompletion attempt={attempt} status="connected" />);
    expect(Channel.instances[0].name).toBe(`melhor-envio-oauth:${attempt}`);
    expect(Channel.instances[0].postMessage).toHaveBeenCalledWith("connected");
  });
  it("opens from the actual pricing calculator and keeps entered postal codes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ ok: false, error: "Unauthenticated." }, { status: 502 })));
    render(<PricingCalculator variants={demoVariants} platforms={platformPresets} defaultOriginPostalCode="12212650" activeShippingServices={{ correios: false, melhorEnvio: true }} />);
    fireEvent.click(screen.getByText("Frete e calculo"));
    const destination = screen.getByLabelText(/CEP destino/i);
    fireEvent.change(destination, { target: { value: "11696202" } });
    fireEvent.click(screen.getByRole("button", { name: "Calcular frete" }));
    expect(await screen.findByRole("dialog", { name: "Reconectar Melhor Envio" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(destination).toHaveValue("11696-202");
  });
});

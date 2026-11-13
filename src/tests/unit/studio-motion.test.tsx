import React from "react";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { studioHeartbeatScale, STUDIO_HEARTBEAT_PERIOD_MS, useStudioMotion } from "@/components/commerce/use-studio-motion";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function animation(reduced = false) {
  const callbacks = new Map<number, FrameRequestCallback>(); let serial = 0, time = 0;
  const media = { matches: reduced, addEventListener: vi.fn<(event: string, listener: () => void) => void>(), removeEventListener: vi.fn() };
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.set(++serial, callback); return serial; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  const frame = (delta = 1000 / 60) => act(() => { time += delta; const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(time)); });
  return { callbacks, frame, media };
}
function Example({ enabled = true }: { enabled?: boolean }) {
  const { ref, active } = useStudioMotion(enabled);
  return <section ref={ref} aria-label="Vitrine" data-moving={active}><span data-studio-float data-testid="product"/></section>;
}

describe("studio heartbeat motion", () => {
  it("has two gentle beats followed by a quiet interval, never shrinking the product", () => {
    expect(studioHeartbeatScale(0)).toBe(1);
    expect(studioHeartbeatScale(300)).toBeCloseTo(1.035, 6);
    expect(studioHeartbeatScale(780)).toBeCloseTo(1.022, 6);
    expect(studioHeartbeatScale(500)).toBe(1);
    expect(studioHeartbeatScale(1500)).toBe(1);
    expect(studioHeartbeatScale(STUDIO_HEARTBEAT_PERIOD_MS)).toBe(1);
  });
  it("stays continuous at 60/120Hz, beat boundaries and cycle boundaries", () => {
    for (const interval of [1000 / 60, 1000 / 120]) {
      let previous = studioHeartbeatScale(0);
      for (let time = interval; time < STUDIO_HEARTBEAT_PERIOD_MS * 3; time += interval) {
        const next = studioHeartbeatScale(time);
        expect(next).toBeGreaterThanOrEqual(1); expect(next).toBeLessThanOrEqual(1.035);
        expect(Math.abs(next - previous)).toBeLessThan(.0052); previous = next;
      }
    }
    for (const boundary of [120, 480, 560, 1000, 2400]) expect(Math.abs(studioHeartbeatScale(boundary - .01) - studioHeartbeatScale(boundary + .01))).toBeLessThan(.000001);
  });
  it("does not track the mouse and animates on touch devices without a fine-pointer query", () => {
    const { callbacks, frame } = animation();
    const { unmount } = render(<Example/>), node = screen.getByRole("region"), product = screen.getByTestId("product");
    for (let i = 0; i < 19; i++) frame();
    const before = product.style.transform;
    expect(before).toMatch(/^scale\(1\.0/);
    fireEvent(node, Object.assign(new Event("pointermove"), { pointerType: "mouse", clientX: 1000, clientY: 500 }));
    expect(product.style.transform).toBe(before); expect(node.style.getPropertyValue("--studio-x")).toBe("");
    expect(vi.mocked(window.matchMedia)).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(callbacks.size).toBe(1); unmount(); expect(callbacks.size).toBe(0);
  });
  it("freezes and resumes the same phase without catching up paused or hidden time", () => {
    const { callbacks, frame } = animation();
    const { rerender } = render(<Example/>); for (let i = 0; i < 18; i++) frame();
    const product = screen.getByTestId("product"), before = product.style.transform;
    rerender(<Example enabled={false}/>); frame(60000); expect(callbacks.size).toBe(0); expect(product.style.transform).toBe(before);
    rerender(<Example/>); frame(); expect(product.style.transform).toBe(before); frame(); expect(product.style.transform).not.toBe(before);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true); fireEvent(document, new Event("visibilitychange")); expect(callbacks.size).toBe(0);
    frame(60000); vi.spyOn(document, "hidden", "get").mockReturnValue(false); fireEvent(document, new Event("visibilitychange")); expect(callbacks.size).toBe(1);
  });
  it("suspends outside the viewport and removes motion when reduced motion is requested", () => {
    const { callbacks, frame, media } = animation(); let intersect: IntersectionObserverCallback;
    vi.stubGlobal("IntersectionObserver", class { constructor(callback: IntersectionObserverCallback) { intersect = callback; } observe() {} disconnect() {} });
    render(<Example/>); for (let i = 0; i < 18; i++) frame();
    act(() => intersect([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver)); expect(callbacks.size).toBe(0);
    act(() => intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver)); expect(callbacks.size).toBe(1);
    media.matches = true; act(() => media.addEventListener.mock.calls[0][1]());
    expect(callbacks.size).toBe(0); expect(screen.getByTestId("product").style.transform).toBe(""); expect(screen.getByRole("region")).toHaveAttribute("data-moving", "false");
  });
  it("never starts a frame loop if disabled or reduced motion is already enabled", () => {
    const { callbacks } = animation(true); render(<Example/>); expect(callbacks.size).toBe(0);
    cleanup(); const normal = animation(); render(<Example enabled={false}/>); expect(normal.callbacks.size).toBe(0); expect(screen.getByRole("region")).toHaveAttribute("data-moving", "false");
  });
});

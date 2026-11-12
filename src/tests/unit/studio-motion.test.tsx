import React from "react";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { smoothStudioCoordinate, studioFloatOffset, useStudioMotion } from "@/components/commerce/use-studio-motion";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("smooth studio pointer layer", () => {
  it("eases across refresh rates without snapping or overshooting", () => {
    const advance = (steps: number) => Array.from({ length: steps }).reduce<number>(value => smoothStudioCoordinate(value, 8, 1000 / steps), 0);
    expect(advance(60)).toBeCloseTo(advance(120), 8);
    expect(smoothStudioCoordinate(0, 8, 1000 / 60)).toBeGreaterThan(0);
    expect(smoothStudioCoordinate(0, 8, 1000 / 60)).toBeLessThan(1.1);
    expect(smoothStudioCoordinate(8, 0, 1000 / 60)).toBeGreaterThan(6);
  });
  it("has continuous subpixel idle motion through both turning points and the loop boundary", () => {
    for (const interval of [1000 / 60, 1000 / 120]) {
      let previous = studioFloatOffset(0);
      for (let time = interval; time < 14000; time += interval) {
        const next = studioFloatOffset(time);
        expect(Math.abs(next - previous)).toBeLessThan(.15);
        expect(next).toBeLessThanOrEqual(0);
        previous = next;
      }
    }
    expect(studioFloatOffset(0)).toBeCloseTo(studioFloatOffset(6800), 8);
  });
  it("keeps the same motion clock when the mouse settles or leaves, and cancels frames on unmount", () => {
    const callbacks = new Map<number, FrameRequestCallback>(); let serial = 0, time = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.set(++serial, callback); return serial; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: !query.includes("reduced"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    function Example() { const { ref } = useStudioMotion(true); return <section ref={ref} aria-label="Pointer layer"><span data-studio-float data-testid="float"/></section>; }
    const { unmount } = render(<Example/>); const node = screen.getByRole("region");
    vi.spyOn(node, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 1000, height: 500 } as DOMRect);
    const frame = () => act(() => { time += 1000 / 60; const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(time)); });
    fireEvent(node, Object.assign(new Event("pointermove"), { pointerType: "mouse", clientX: 1000, clientY: 500 }));
    frame(); const first = parseFloat(node.style.getPropertyValue("--studio-x"));
    expect(first).toBeGreaterThan(0); expect(first).toBeLessThan(1.1);
    for (let i = 0; i < 80; i++) frame();
    expect(callbacks.size).toBe(1); expect(node.style.getPropertyValue("--studio-x")).toBe("8.0000px");
    const float = screen.getByTestId("float"), stationary = float.style.transform;
    frame(); expect(float.style.transform).not.toBe(stationary);
    fireEvent(node, new Event("pointerleave")); frame();
    expect(parseFloat(node.style.getPropertyValue("--studio-x"))).toBeGreaterThan(6);
    for (let i = 0; i < 80; i++) frame();
    expect(callbacks.size).toBe(1); expect(node.style.getPropertyValue("--studio-x")).toBe("0.0000px");
    const outside = float.style.transform; frame(); expect(float.style.transform).not.toBe(outside);
    fireEvent(node, Object.assign(new Event("pointermove"), { pointerType: "mouse", clientX: 1000, clientY: 500 }));
    unmount(); expect(callbacks.size).toBe(0);
  });
  it("freezes and resumes without catching up hidden time or restarting the float phase", () => {
    const callbacks = new Map<number, FrameRequestCallback>(); let serial = 0, time = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.set(++serial, callback); return serial; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: !query.includes("reduced"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    function Example({ enabled }: { enabled: boolean }) { const { ref } = useStudioMotion(enabled); return <section ref={ref}><span data-studio-float data-testid="float"/></section>; }
    const { rerender } = render(<Example enabled/>);
    const frame = () => act(() => { time += 1000 / 60; const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(time)); });
    for (let index = 0; index < 70; index++) frame();
    const float = screen.getByTestId("float"), before = float.style.transform;
    rerender(<Example enabled={false}/>); time += 60000;
    expect(callbacks.size).toBe(0); expect(float.style.transform).toBe(before);
    rerender(<Example enabled/>); frame();
    expect(float.style.transform).toBe(before);
    frame(); expect(float.style.transform).not.toBe(before);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    fireEvent(document, new Event("visibilitychange")); expect(callbacks.size).toBe(0);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    fireEvent(document, new Event("visibilitychange")); expect(callbacks.size).toBe(1);
  });
});

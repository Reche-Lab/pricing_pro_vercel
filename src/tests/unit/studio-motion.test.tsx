import React from "react";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { smoothStudioCoordinate, useStudioMotion } from "@/components/commerce/use-studio-motion";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("smooth studio pointer layer", () => {
  it("eases across refresh rates without snapping or overshooting", () => {
    const advance = (steps: number) => Array.from({ length: steps }).reduce<number>(value => smoothStudioCoordinate(value, 8, 1000 / steps), 0);
    expect(advance(60)).toBeCloseTo(advance(120), 8);
    expect(smoothStudioCoordinate(0, 8, 1000 / 60)).toBeGreaterThan(0);
    expect(smoothStudioCoordinate(0, 8, 1000 / 60)).toBeLessThan(1.1);
    expect(smoothStudioCoordinate(8, 0, 1000 / 60)).toBeGreaterThan(6);
  });
  it("returns gently on pointer leave, stops after settling and cleans pending frames", () => {
    const callbacks = new Map<number, FrameRequestCallback>(); let serial = 0, time = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.set(++serial, callback); return serial; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: !query.includes("reduced"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    function Example() { const { ref } = useStudioMotion(true); return <section ref={ref} aria-label="Pointer layer"/>; }
    const { unmount } = render(<Example/>); const node = screen.getByRole("region");
    vi.spyOn(node, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 1000, height: 500 } as DOMRect);
    const frame = () => act(() => { time += 1000 / 60; const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(time)); });
    fireEvent(node, Object.assign(new Event("pointermove"), { pointerType: "mouse", clientX: 1000, clientY: 500 }));
    frame(); const first = parseFloat(node.style.getPropertyValue("--studio-x"));
    expect(first).toBeGreaterThan(0); expect(first).toBeLessThan(1.1);
    for (let i = 0; i < 80; i++) frame();
    expect(callbacks.size).toBe(0); expect(node.style.getPropertyValue("--studio-x")).toBe("8.0000px");
    fireEvent(node, new Event("pointerleave")); frame();
    expect(parseFloat(node.style.getPropertyValue("--studio-x"))).toBeGreaterThan(6);
    for (let i = 0; i < 80; i++) frame();
    expect(callbacks.size).toBe(0); expect(node.style.getPropertyValue("--studio-x")).toBe("0.0000px");
    fireEvent(node, Object.assign(new Event("pointermove"), { pointerType: "mouse", clientX: 1000, clientY: 500 }));
    unmount(); expect(callbacks.size).toBe(0);
  });
});

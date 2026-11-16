import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crossfadeMockupCanvas } from "@/components/commerce/mockup-crossfade";

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
function canvas() {
  const draws: { image: unknown; alpha: number; operation: string }[] = [];
  const context = { globalAlpha: 1, globalCompositeOperation: "source-over", clearRect: vi.fn(), drawImage: vi.fn((image: unknown) => draws.push({ image, alpha: context.globalAlpha, operation: context.globalCompositeOperation })) };
  const element = { width: 256, height: 256, dataset: {}, getContext: () => context } as unknown as HTMLCanvasElement;
  return { element, context, draws };
}
beforeEach(() => {
  frames.clear(); nextFrame = 0; media.matches = false;
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
  vi.stubGlobal("matchMedia", () => media);
  vi.spyOn(document, "createElement").mockImplementation(() => canvas().element);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
function advance(time: number) { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time)); }
describe("opaque-to-opaque mockup crossfade", () => {
  it("blends the old and new pixels with complementary alpha, rather than fading the product away", () => {
    const target = canvas(), next = canvas().element, complete = vi.fn();
    crossfadeMockupCanvas(target.element, next, 600, complete);
    expect(target.draws).toHaveLength(0);
    advance(300);
    expect(target.draws).toHaveLength(2);
    expect(target.draws[0]).toMatchObject({ alpha: .5, operation: "source-over" });
    expect(target.draws[1]).toEqual({ image: next, alpha: .5, operation: "lighter" });
    expect(target.draws[0].alpha + target.draws[1].alpha).toBe(1);
    expect(complete).not.toHaveBeenCalled();
    advance(600);
    expect(target.draws.at(-1)).toEqual({ image: next, alpha: 1, operation: "source-over" });
    expect(complete).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
    expect(target.element.dataset.mockupTransition).toBe("idle");
  });
  it("cancels stale frames without drawing over a newer artwork or reporting completion", () => {
    const target = canvas(), complete = vi.fn(), controller = crossfadeMockupCanvas(target.element, canvas().element, 600, complete);
    const lateFrame = [...frames.values()][0];
    controller.cancel(); lateFrame(400);
    expect(target.draws).toHaveLength(0); expect(complete).not.toHaveBeenCalled(); expect(frames.size).toBe(0);
  });
  it("finishes immediately on interaction or when reduced motion is enabled mid-blend", () => {
    const target = canvas(), next = canvas().element, complete = vi.fn();
    const controller = crossfadeMockupCanvas(target.element, next, 600, complete);
    media.matches = true;
    media.addEventListener.mock.calls[0][1]();
    controller.finish(); advance(600);
    expect(target.draws.at(-1)).toEqual({ image: next, alpha: 1, operation: "source-over" });
    expect(complete).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
    expect(media.removeEventListener).toHaveBeenCalled();
  });
  it("does not animate with reduced motion or when canvas sizes differ", () => {
    const target = canvas(), next = canvas().element, complete = vi.fn();
    media.matches = true; crossfadeMockupCanvas(target.element, next, 600, complete);
    expect(complete).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
    media.matches = false; next.width = 640;
    crossfadeMockupCanvas(target.element, next, 600, complete);
    expect(target.element.width).toBe(640); expect(complete).toHaveBeenCalledTimes(2); expect(frames.size).toBe(0);
  });
});

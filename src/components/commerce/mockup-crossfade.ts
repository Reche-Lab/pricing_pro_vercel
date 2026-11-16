export type MockupTransition = { cancel: () => void; finish: () => void };

export function crossfadeMockupCanvas(target: HTMLCanvasElement, next: HTMLCanvasElement, durationMs: number, onComplete: () => void): MockupTransition {
  const context = target.getContext("2d");
  const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const copy = () => {
    if (target.width !== next.width || target.height !== next.height) { target.width = next.width; target.height = next.height; }
    if (context) {
      context.globalAlpha = 1; context.globalCompositeOperation = "source-over";
      context.clearRect(0, 0, target.width, target.height); context.drawImage(next, 0, 0);
    }
    target.dataset.mockupTransition = "idle";
  };
  if (!context || !Number.isFinite(durationMs) || durationMs <= 0 || media?.matches || target.width !== next.width || target.height !== next.height) {
    copy(); onComplete(); return { cancel() {}, finish() {} };
  }
  const previous = document.createElement("canvas"); previous.width = target.width; previous.height = target.height;
  const snapshot = previous.getContext("2d");
  if (!snapshot) { copy(); onComplete(); return { cancel() {}, finish() {} }; }
  snapshot.drawImage(target, 0, 0);
  let active = true, frame = 0;
  const start = performance.now();
  const cleanup = () => { cancelAnimationFrame(frame); media?.removeEventListener("change", reduced); target.dataset.mockupTransition = "idle"; };
  const finish = () => { if (!active) return; active = false; cleanup(); copy(); onComplete(); };
  const reduced = () => { if (media?.matches) finish(); };
  const draw = (time: number) => {
    if (!active) return;
    const progress = Math.min(1, Math.max(0, (time - start) / durationMs));
    if (progress === 1) { finish(); return; }
    const mix = progress * progress * (3 - 2 * progress);
    context.clearRect(0, 0, target.width, target.height);
    // Complementary premultiplied alpha keeps opaque product pixels opaque throughout.
    context.globalCompositeOperation = "source-over"; context.globalAlpha = 1 - mix; context.drawImage(previous, 0, 0);
    context.globalCompositeOperation = "lighter"; context.globalAlpha = mix; context.drawImage(next, 0, 0);
    context.globalAlpha = 1; context.globalCompositeOperation = "source-over";
    frame = requestAnimationFrame(draw);
  };
  target.dataset.mockupTransition = "blending";
  media?.addEventListener("change", reduced);
  frame = requestAnimationFrame(draw);
  return { finish, cancel() { if (!active) return; active = false; cleanup(); } };
}

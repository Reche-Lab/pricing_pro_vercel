"use client";
import { useEffect, useRef, useState } from "react";

export function smoothStudioCoordinate(current: number, target: number, elapsedMs: number) {
  return current + (target - current) * (1 - Math.exp(-Math.min(64, Math.max(0, elapsedMs)) / 120));
}

export function studioFloatOffset(elapsedMs: number) {
  return (Math.cos((elapsedMs % 6800) / 6800 * Math.PI * 2) - 1) * 9;
}

/** One eligible frame loop combines pointer easing and idle float on the same image layer. */
export function useStudioMotion(enabled: boolean) {
  const ref = useRef<HTMLElement>(null);
  const elapsed = useRef(0);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || !window.matchMedia) return;
    const imageLayer = node.querySelector<HTMLElement>("[data-studio-float]");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame: number | null = null;
    let tracking = false, inView = true, disposed = false;
    let x = parseFloat(node.style.getPropertyValue("--studio-x")) || 0, y = parseFloat(node.style.getPropertyValue("--studio-y")) || 0;
    let targetX = x, targetY = y, previousTime: number | null = null;
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      previousTime = null;
    };
    const tick = (time: number) => {
      if (disposed || !tracking) { stop(); return; }
      const delta = previousTime === null ? 0 : Math.min(32, Math.max(0, time - previousTime));
      elapsed.current += delta;
      previousTime = time;
      x = smoothStudioCoordinate(x, targetX, delta || 1000 / 60); y = smoothStudioCoordinate(y, targetY, delta || 1000 / 60);
      const settled = Math.abs(targetX - x) < .005 && Math.abs(targetY - y) < .005;
      if (settled) { x = targetX; y = targetY; }
      const pointerX = `${x.toFixed(4)}px`, pointerY = `${y.toFixed(4)}px`;
      if (node.style.getPropertyValue("--studio-x") !== pointerX) node.style.setProperty("--studio-x", pointerX);
      if (node.style.getPropertyValue("--studio-y") !== pointerY) node.style.setProperty("--studio-y", pointerY);
      if (imageLayer) imageLayer.style.transform = `translate3d(${pointerX}, ${(y + studioFloatOffset(elapsed.current)).toFixed(4)}px, 0)`;
      frame = requestAnimationFrame(tick);
    };
    const start = () => { if (frame === null && tracking) frame = requestAnimationFrame(tick); };
    const leave = () => { targetX = 0; targetY = 0; start(); };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const bounds = node.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      targetX = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1)) * 8;
      targetY = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1)) * 6;
      start();
    };
    const configure = () => {
      if (disposed) return;
      const allowed = enabled && !reduce.matches && fine.matches && inView && !document.hidden;
      if (allowed && !tracking) {
        node.addEventListener("pointermove", move, { passive: true });
        node.addEventListener("pointerleave", leave);
        tracking = true;
        leave();
      }
      if (!allowed && tracking) {
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerleave", leave);
        tracking = false;
      }
      if (!allowed) stop();
      if (reduce.matches) {
        node.style.removeProperty("--studio-x"); node.style.removeProperty("--studio-y");
        imageLayer?.style.removeProperty("transform"); elapsed.current = 0; x = 0; y = 0;
      }
      setActive(allowed);
    };
    const observer = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; configure(); })
      : null;
    observer?.observe(node);
    reduce.addEventListener("change", configure);
    fine.addEventListener("change", configure);
    document.addEventListener("visibilitychange", configure);
    configure();
    return () => {
      disposed = true;
      observer?.disconnect();
      stop();
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", leave);
      reduce.removeEventListener("change", configure);
      fine.removeEventListener("change", configure);
      document.removeEventListener("visibilitychange", configure);
    };
  }, [enabled]);
  return { ref, active: enabled && active };
}

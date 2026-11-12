"use client";
import { useEffect, useRef, useState } from "react";

export function smoothStudioCoordinate(current: number, target: number, elapsedMs: number) {
  return current + (target - current) * (1 - Math.exp(-Math.min(64, Math.max(0, elapsedMs)) / 120));
}

/** Time-based easing runs only while the pointer layer is settling, never as an idle loop. */
export function useStudioMotion(enabled: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || !window.matchMedia) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame: number | null = null;
    let tracking = false, inView = true, disposed = false;
    let x = parseFloat(node.style.getPropertyValue("--studio-x")) || 0, y = parseFloat(node.style.getPropertyValue("--studio-y")) || 0;
    let targetX = x, targetY = y, previousTime = 0;
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      previousTime = 0;
    };
    const tick = (time: number) => {
      if (disposed || !tracking) { stop(); return; }
      const elapsed = previousTime ? time - previousTime : 1000 / 60;
      previousTime = time;
      x = smoothStudioCoordinate(x, targetX, elapsed); y = smoothStudioCoordinate(y, targetY, elapsed);
      const settled = Math.abs(targetX - x) < .005 && Math.abs(targetY - y) < .005;
      if (settled) { x = targetX; y = targetY; }
      node.style.setProperty("--studio-x", `${x.toFixed(4)}px`);
      node.style.setProperty("--studio-y", `${y.toFixed(4)}px`);
      if (settled) { frame = null; previousTime = 0; }
      else frame = requestAnimationFrame(tick);
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
      if (reduce.matches) { node.style.removeProperty("--studio-x"); node.style.removeProperty("--studio-y"); x = 0; y = 0; }
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

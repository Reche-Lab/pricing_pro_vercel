"use client";
import { useEffect, useRef, useState } from "react";

/** Pointer writes are coalesced in one frame; no React render or idle animation loop per move. */
export function useStudioMotion(enabled: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || !window.matchMedia) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame: number | null = null;
    let tracking = false, inView = true, disposed = false, x = 0, y = 0;
    const reset = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      node.style.removeProperty("--studio-x");
      node.style.removeProperty("--studio-y");
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const bounds = node.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1)) * 8;
      y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1)) * 6;
      if (frame === null) frame = requestAnimationFrame(() => {
        node.style.setProperty("--studio-x", `${x}px`);
        node.style.setProperty("--studio-y", `${y}px`);
        frame = null;
      });
    };
    const configure = () => {
      if (disposed) return;
      const allowed = enabled && !reduce.matches && fine.matches && inView && !document.hidden;
      if (allowed && !tracking) {
        node.addEventListener("pointermove", move, { passive: true });
        node.addEventListener("pointerleave", reset);
        tracking = true;
      }
      if (!allowed && tracking) {
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerleave", reset);
        tracking = false;
      }
      if (!allowed) reset();
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
      reset();
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", reset);
      reduce.removeEventListener("change", configure);
      fine.removeEventListener("change", configure);
      document.removeEventListener("visibilitychange", configure);
    };
  }, [enabled]);
  return { ref, active: enabled && active };
}

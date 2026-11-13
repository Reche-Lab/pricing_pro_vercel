"use client";
import { useEffect, useRef, useState } from "react";

export const STUDIO_HEARTBEAT_PERIOD_MS = 2400;

export function studioHeartbeatScale(elapsedMs: number) {
  const phase = Math.max(0, elapsedMs) % STUDIO_HEARTBEAT_PERIOD_MS;
  const beat = (start: number, duration: number, amplitude: number) => {
    const position = (phase - start) / duration;
    return position > 0 && position < 1 ? Math.sin(position * Math.PI) ** 2 * amplitude : 0;
  };
  return 1 + beat(120, 360, .035) + beat(560, 440, .022);
}

/** Two smooth beats share one clock; pausing never advances the hidden phase. */
export function useStudioMotion(enabled: boolean) {
  const ref = useRef<HTMLElement>(null);
  const elapsed = useRef(0);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || !window.matchMedia) return;
    const imageLayer = node.querySelector<HTMLElement>("[data-studio-float]");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame: number | null = null, previousTime: number | null = null;
    let running = false, inView = true, disposed = false;
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      previousTime = null;
    };
    const tick = (time: number) => {
      if (disposed || !running) { stop(); return; }
      if (previousTime !== null) elapsed.current += Math.min(64, Math.max(0, time - previousTime));
      previousTime = time;
      if (imageLayer) imageLayer.style.transform = `scale(${studioHeartbeatScale(elapsed.current).toFixed(6)})`;
      frame = requestAnimationFrame(tick);
    };
    const configure = () => {
      if (disposed) return;
      running = enabled && Boolean(imageLayer) && !reduce.matches && inView && !document.hidden;
      if (running && frame === null) frame = requestAnimationFrame(tick);
      if (!running) stop();
      if (reduce.matches) { imageLayer?.style.removeProperty("transform"); elapsed.current = 0; }
      setActive(running);
    };
    const observer = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; configure(); })
      : null;
    observer?.observe(node);
    reduce.addEventListener("change", configure);
    document.addEventListener("visibilitychange", configure);
    configure();
    return () => {
      disposed = true;
      observer?.disconnect();
      stop();
      reduce.removeEventListener("change", configure);
      document.removeEventListener("visibilitychange", configure);
    };
  }, [enabled]);
  return { ref, active: enabled && active };
}

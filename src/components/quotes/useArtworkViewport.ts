"use client";

import { useEffect, useState, type RefObject } from "react";
import { fitArtworkViewport } from "@/domain/artwork/framing";

export function useArtworkViewport(ref: RefObject<HTMLDivElement | null>, width: number, height: number) {
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const style = window.getComputedStyle(element);
      const size = {
        width: Math.max(0, element.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0")),
        height: Math.max(0, element.clientHeight - parseFloat(style.paddingTop || "0") - parseFloat(style.paddingBottom || "0"))
      };
      setAvailable(current => current.width === size.width && current.height === size.height ? current : size);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [ref]);
  return { available, fitted: fitArtworkViewport(width, height, available.width, available.height) };
}

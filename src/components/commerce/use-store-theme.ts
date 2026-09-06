"use client";
import { useEffect, useState } from "react";
export function accentForeground(hex: string) {
  const rgb = hex
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((value) => {
      const color = parseInt(value, 16) / 255;
      return color <= 0.04045
        ? color / 12.92
        : ((color + 0.055) / 1.055) ** 2.4;
    }) ?? [0, 0, 0];
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return luminance > 0.179 ? "#111111" : "#ffffff";
}
export function useStoreTheme(
  slug: string,
  initial: "light" | "dark" | "system" = "system",
) {
  const [theme, setTheme] = useState<"light" | "dark">(
    initial === "dark" ? "dark" : "light",
  );
  const key = `commerce-theme:${slug}`;
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const update = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(key);
      } catch {
        /* Storage can be blocked. */
      }
      setTheme(
        saved === "dark" || saved === "light"
          ? saved
          : initial === "system"
            ? media?.matches
              ? "dark"
              : "light"
            : initial,
      );
    };
    update();
    media?.addEventListener("change", update);
    window.addEventListener("storage", update);
    return () => {
      media?.removeEventListener("change", update);
      window.removeEventListener("storage", update);
    };
  }, [key, initial]);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      /* The in-memory preference still works. */
    }
  }
  return { theme, toggle };
}

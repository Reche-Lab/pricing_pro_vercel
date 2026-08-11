export function createRetouchedArtworkFileName(fileName: string, timestamp: number) {
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "arte";
  return `${base}-retoque-${timestamp}.webp`;
}

export function sampledRgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((value) => Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`;
}

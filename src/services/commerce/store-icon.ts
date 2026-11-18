import sharp from "sharp";
import type { StoreSettings } from "@/domain/commerce/schemas";
import { getServerEnv } from "@/lib/env/server";

const maxBytes = 5 * 1024 * 1024;

// Never turn a public favicon request into a proxy for arbitrary merchant URLs.
export function ownedStoreIconSource(tenantId: string, settings: StoreSettings, storageUrl: string) {
  if (!/^[a-f0-9-]{36}$/i.test(tenantId)) return null;
  const origin = new URL(storageUrl).origin;
  for (const value of [settings.faviconUrl, settings.logoUrl]) {
    if (!value) continue;
    try {
      const url = new URL(value);
      const prefix = `/storage/v1/object/public/commerce-media/${tenantId}/`;
      const file = url.pathname.slice(prefix.length);
      if (url.origin === origin && !url.username && !url.password && !url.search && !url.hash &&
        url.pathname.startsWith(prefix) && /^(?:icon|logo)\/[a-f0-9-]{36}\.webp$/i.test(file)) return url.href;
    } catch { /* An old external logo is not a server-side fetch target. */ }
  }
  return null;
}

export async function renderStoreIcon(tenantId: string, settings: StoreSettings) {
  const storageUrl = getServerEnv().SUPABASE_URL;
  if (!storageUrl) return null;
  const source = ownedStoreIconSource(tenantId, settings, storageUrl);
  if (!source) return null;
  const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(5000) });
  if (!response.ok || !response.body) throw new Error("Store icon storage unavailable.");
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body.cancel();
    throw new Error("Store icon exceeds size limit.");
  }
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) throw new Error("Store icon exceeds size limit.");
      parts.push(next.value);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(parts);
  const image = sharp(bytes, { limitInputPixels: 25000000 });
  const metadata = await image.metadata();
  if (!["png", "jpeg", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("Invalid store icon format.");
  return image.rotate().resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

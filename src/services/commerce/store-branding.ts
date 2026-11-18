import { createHash } from "node:crypto";
import type { Metadata } from "next";
import type { StoreSettings } from "@/domain/commerce/schemas";
import { commerceStoreUrl } from "@/domain/commerce/domains";

export function storeIconVersion(settings: StoreSettings) {
  return createHash("sha256").update(settings.faviconUrl || settings.logoUrl || "").digest("hex").slice(0, 16);
}

export function storeIconUrl(slug: string, settings: StoreSettings, origin?: string) {
  return `${commerceStoreUrl(slug, origin)}/icon.png?v=${storeIconVersion(settings)}`;
}

export function storeBrandMetadata(slug: string, settings: StoreSettings, origin?: string): Pick<Metadata, "icons" | "manifest"> {
  const url = storeIconUrl(slug, settings, origin);
  const present = Boolean(settings.faviconUrl || settings.logoUrl);
  return {
    icons: {
      icon: present ? [{ url, type: "image/png", sizes: "512x512" }] : [],
      shortcut: present ? [{ url, type: "image/png" }] : [],
      apple: present ? [{ url, sizes: "512x512" }] : [],
    },
    manifest: `${commerceStoreUrl(slug, origin)}/site.webmanifest`,
  };
}

export function storeWebManifest(slug: string, settings: StoreSettings, origin?: string) {
  const root = new URL(commerceStoreUrl(slug, origin));
  const scope = `${root.pathname.replace(/\/$/, "")}/`;
  return {
    id: scope, name: settings.name, short_name: settings.name.slice(0, 32),
    description: settings.description, lang: "pt-BR", start_url: scope, scope,
    display: "standalone", theme_color: settings.accent,
    icons: settings.faviconUrl || settings.logoUrl
      ? [{ src: storeIconUrl(slug, settings, origin), type: "image/png", sizes: "512x512", purpose: "any" }] : [],
  };
}

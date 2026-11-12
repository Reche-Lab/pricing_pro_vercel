// Only the platform operator can authorize host-to-tenant bindings, after Vercel/DNS verification.
export function commerceDomains(raw = process.env.COMMERCE_CUSTOM_DOMAINS || ""): Record<string, string> {
  if (!raw.trim()) return {};
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return {}; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value);
  if (entries.length > 1000 || entries.some(([host, slug]) =>
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
    typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug))) return {};
  return Object.fromEntries(entries);
}

export function commerceHostSlug(host: string | null, domains = commerceDomains()) {
  if (!host) return null;
  return Object.hasOwn(domains, host.toLowerCase()) ? domains[host.toLowerCase()] : null;
}

export function commerceStoreUrl(slug: string, appUrl = process.env.APP_URL || "http://localhost:3000", domains = commerceDomains()) {
  const host = Object.keys(domains).find(key => domains[key] === slug);
  return host ? `https://${host}` : `${new URL(appUrl).origin}/loja/${encodeURIComponent(slug)}`;
}

export function commerceDomainRoute(host: string | null, path: string, domains = commerceDomains()) {
  const slug = commerceHostSlug(host, domains);
  if (!slug) return null;
  const primaryHost = Object.keys(domains).find(key => domains[key] === slug)!;
  if (host?.toLowerCase() !== primaryHost) return { slug, type: "redirect" as const, path, host: primaryHost };
  if (path.startsWith("/_next/") || /^\/(?:favicon\.ico|site\.webmanifest|mockups\/|brands\/|studio\/)/.test(path)) return { slug, type: "next" as const };
  if (path.startsWith(`/api/store/${slug}/`)) return { slug, type: "next" as const };
  if (path.startsWith("/api/") || path.startsWith("/commerce/")) return { slug, type: "reject" as const };
  if (path === "/sitemap.xml" || path === "/robots.txt") return { slug, type: "rewrite" as const, path: `/loja/${slug}${path}` };
  if (path === `/loja/${slug}` || path.startsWith(`/loja/${slug}/`)) return { slug, type: "redirect" as const, path: path.slice(`/loja/${slug}`.length) || "/" };
  if (path.startsWith("/loja/")) return { slug, type: "reject" as const };
  return { slug, type: "rewrite" as const, path: `/loja/${slug}${path === "/" ? "" : path}` };
}

export function commercePlatformRedirect(path: string, domains = commerceDomains()) {
  const match = path.match(/^\/loja\/([a-z0-9][a-z0-9-]{0,99})(\/.*)?$/);
  if (!match) return null;
  const host = Object.keys(domains).find(key => domains[key] === match[1]);
  return host ? { host, path: match[2] || "/" } : null;
}

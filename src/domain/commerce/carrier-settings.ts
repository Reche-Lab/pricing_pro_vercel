export function isProductionCommerceCarrier(settings: Record<string, unknown>) {
  try {
    const url = new URL(typeof settings.api_base_url === "string" && settings.api_base_url ? settings.api_base_url : "https://www.melhorenvio.com.br/api/v2");
    return settings.environment !== "sandbox" && ["https://www.melhorenvio.com.br", "https://melhorenvio.com.br"].includes(url.origin) &&
      !url.username && !url.password && !url.search && !url.hash && /^\/api\/v2\/?$/.test(url.pathname);
  } catch { return false; }
}

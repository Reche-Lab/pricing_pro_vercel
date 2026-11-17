export const STORE_PRIVATE_PATHS = ["/api/", "/commerce/", "/conta", "/carrinho", "/checkout", "/pedidos", "/orcamento", "/orcamentos"];
export const PLATFORM_PRIVATE_PATHS = ["/api/", "/commerce/", "/q/", "/superadmin", "/settings", "/finance", "/dashboard", "/pricing", "/products", "/quotes", "/customers", "/users", "/billing", "/audit", "/onboarding", "/loja/*/conta", "/loja/*/checkout", "/loja/*/carrinho", "/loja/*/pedidos", "/loja/*/orcamento", "/loja/*/orcamentos"];
export function publicCrawlerRules(disallow: string[]) {
  // Search and general crawlers share every exclusion; a specific bot rule must not bypass private paths.
  return [{ userAgent: "*", allow: "/", disallow }, { userAgent: "OAI-SearchBot", allow: "/", disallow }];
}
export function storeRobotsText(base: string) {
  return `${publicCrawlerRules(STORE_PRIVATE_PATHS).map(rule => `User-agent: ${rule.userAgent}\nAllow: /\n${rule.disallow.map(path => `Disallow: ${path}`).join("\n")}`).join("\n\n")}\nSitemap: ${base}/sitemap.xml\n`;
}

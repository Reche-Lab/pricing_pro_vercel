import type { MetadataRoute } from "next";
import { commerceSiteOrigin } from "@/services/commerce/store-seo";

export default function robots(): MetadataRoute.Robots {
  const origin = commerceSiteOrigin();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/commerce/", "/q/", "/superadmin", "/settings", "/finance", "/dashboard", "/pricing", "/products", "/quotes", "/customers", "/users", "/billing", "/audit", "/onboarding", "/loja/*/conta", "/loja/*/checkout", "/loja/*/carrinho", "/loja/*/pedidos"] },
    sitemap: `${origin}/sitemap.xml`
  };
}

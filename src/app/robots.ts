import type { MetadataRoute } from "next";
import { commerceSiteOrigin } from "@/services/commerce/store-seo";
import { PLATFORM_PRIVATE_PATHS, publicCrawlerRules } from "@/domain/commerce/robots";

export default function robots(): MetadataRoute.Robots {
  const origin = commerceSiteOrigin();
  return {
    rules: publicCrawlerRules(PLATFORM_PRIVATE_PATHS),
    sitemap: `${origin}/sitemap.xml`
  };
}

"use client";
import { useEffect, useRef } from "react";
import { analyticsCommercePayload, type AnalyticsParameters } from "@/domain/commerce/analytics";
import { useStoreAnalytics } from "./StoreAnalytics";
import type { cartView, publicCommerceProduct } from "@/repositories/commerce";

export function StoreAnalyticsScreen({ path, quoting, cart, products }: { path: string[]; quoting: boolean; cart: Awaited<ReturnType<typeof cartView>> | null; products: ReturnType<typeof publicCommerceProduct>[] }) {
  const analytics = useStoreAnalytics(), previous = useRef("");
  const pathKey = JSON.stringify(path);
  useEffect(() => {
    analytics.setPage(JSON.parse(pathKey));
    analytics.setTestMode(cart?.payments?.payment_environment === "test");
    if (!analytics.active) { previous.current = ""; return; }
    const key = `${analytics.scope}:${pathKey}:${quoting}`;
    if (previous.current === key) return;
    const params: AnalyticsParameters = { customer_state: cart ? cart.customer ? "identified" : "guest" : "unknown", journey: quoting ? "quote" : "purchase" };
    if (!analytics.track("page_view", params)) return;
    previous.current = key;
    if (!path.length) analytics.track("view_item_list", analyticsCommercePayload(products.slice(0, 20).map(product => ({ productId: product.id, name: product.name, quantity: 1, totalCents: product.unitCents }))));
  }, [analytics, pathKey, quoting, cart, products, path]);
  useEffect(() => {
    if (!analytics.active || !cart || cart.payments?.payment_environment === "test") return;
    if (quoting) analytics.once("quote_start", "quote_start", { journey: "quote", customer_state: cart.customer ? "identified" : "guest" });
    if (!cart.lines.length || !cart.calculation) return;
    const params = { ...analyticsCommercePayload(cart.calculation.items), customer_state: cart.customer ? "identified" as const : "guest" as const, journey: quoting ? "quote" as const : "purchase" as const };
    if (path[0] === "carrinho") analytics.once(`view_cart:${cart.revision}`, "view_cart", params);
    if (path[0] === "checkout") analytics.once(`begin_checkout:${cart.revision}`, "begin_checkout", params);
  }, [analytics, cart, path, quoting]);
  return null;
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { cartView } from "@/repositories/commerce";
import { storeRequest } from "./store-http";
type Cart = Awaited<ReturnType<typeof cartView>>;
export function useBuyerCart(api: string, enabled: boolean) {
  const [state, setState] = useState<{ api: string; cart: Cart | null; error: string }>({ api, cart: null, error: "" });
  const active = useRef(false), sequence = useRef(0), scope = useRef({ api, enabled });
  scope.current = { api, enabled };
  const refresh = useCallback(async () => {
    if (!enabled || !active.current || scope.current.api !== api || !scope.current.enabled) return;
    const request = ++sequence.current;
    setState(current => ({ api, cart: current.api === api ? current.cart : null, error: "" }));
    try {
      const cart: Cart = await storeRequest(`${api}/cart`);
      if (active.current && request === sequence.current && scope.current.api === api && scope.current.enabled) {
        setState({ api, cart, error: "" });
        return cart;
      }
    } catch (cause) {
      if (active.current && request === sequence.current && scope.current.api === api && scope.current.enabled) {
        const unauthorized = cause && typeof cause === "object" && "status" in cause && [401, 403].includes(Number(cause.status));
        setState(current => ({ api, cart: !unauthorized && current.api === api ? current.cart : null, error: cause instanceof Error ? cause.message : "Não foi possível recuperar sua conta." }));
      }
      throw cause;
    }
  }, [api, enabled]);
  useEffect(() => {
    active.current = true;
    if (enabled) void refresh().catch(() => {});
    return () => { active.current = false; };
  }, [enabled, refresh]);
  const reset = useCallback(() => {
    if (!active.current || scope.current.api !== api || !scope.current.enabled) return;
    sequence.current++; setState({ api, cart: null, error: "" });
  }, [api]);
  const current = enabled && state.api === api ? state : null;
  return { cart: current?.cart ?? null, error: current?.error ?? "", refresh, reset };
}

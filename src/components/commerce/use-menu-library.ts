"use client";
import { useEffect, useState } from "react";
import type { LibraryResult } from "@/domain/commerce/library";
import { storeRequest } from "./store-http";

type MenuLibraryState = { api: string; data: LibraryResult | null; loading: boolean; error: string };
export function useMenuLibrary(api: string, enabled: boolean) {
  const [state, setState] = useState<MenuLibraryState | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled || !api) return;
    let active = true;
    setState({ api, data: null, loading: true, error: "" });
    void storeRequest(api)
      .then((data: LibraryResult) => { if (active) setState({ api, data, loading: false, error: "" }); })
      .catch(error => { if (active) setState({ api, data: null, loading: false, error: error instanceof Error ? error.message : "Não foi possível carregar a biblioteca." }); });
    return () => { active = false; };
  }, [api, enabled, revision]);
  // A late response from another store or from the private preview must never populate this menu.
  const current = state?.api === api ? state : { data: null, loading: enabled && Boolean(api), error: "" };
  return { ...current, reload: () => setRevision(value => value + 1) };
}

"use client";
import { useEffect, useState } from "react";
import type { LibraryResult } from "@/domain/commerce/library";
import { storeRequest } from "./store-http";
export function useCommerceLibrary(
  api: string,
  query: string,
  initial?: LibraryResult,
) {
  const [data, setData] = useState<LibraryResult | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      void storeRequest(`${api}${query ? `?${query}` : ""}`)
        .then((result) => {
          if (active) setData(result);
        })
        .catch((error) => {
          if (active)
            setError(
              error instanceof Error
                ? error.message
                : "Não foi possível carregar a biblioteca.",
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, query, revision]);
  return {
    data,
    loading,
    error,
    reload: () => setRevision((value) => value + 1),
  };
}

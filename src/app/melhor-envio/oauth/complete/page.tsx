import React from "react";
import { MelhorEnvioOAuthCompletion } from "@/components/shipping/MelhorEnvioOAuthCompletion";

export const metadata = { robots: { index: false, follow: false } };

export default async function MelhorEnvioOAuthCompletePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <MelhorEnvioOAuthCompletion attempt={typeof params.attempt === "string" ? params.attempt : ""} status={params.melhor_envio === "connected" ? "connected" : "error"} />;
}

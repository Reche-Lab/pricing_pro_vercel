"use client";

import React, { type ReactNode } from "react";
import { OAuthReconnectBoundary } from "@/components/integrations/OAuthReconnectBoundary";
import { OLIST_CONNECTED_EVENT, OLIST_RECONNECT_EVENT } from "@/lib/olist/browser-request";

export function OlistReconnectBoundary({ children }: { children: ReactNode }) {
  return <OAuthReconnectBoundary name="Olist" label="Olist/Tiny" authEndpoint="/api/olist/auth-url"
    reconnectEvent={OLIST_RECONNECT_EVENT} connectedEvent={OLIST_CONNECTED_EVENT}
    channelPrefix="olist-oauth" completionPath="/olist/oauth/complete" settingsLabel="Configurações > Olist"
    successDescription="Conexão restabelecida. Volte à ação que estava realizando e tente novamente. Nenhum pedido, nota ou cadastro foi reenviado automaticamente.">
    {children}
  </OAuthReconnectBoundary>;
}

"use client";

import React, { type ReactNode } from "react";
import { OAuthReconnectBoundary } from "@/components/integrations/OAuthReconnectBoundary";
import { MELHOR_ENVIO_CONNECTED_EVENT, MELHOR_ENVIO_RECONNECT_EVENT } from "@/lib/melhor-envio/browser-request";

export function MelhorEnvioReconnectBoundary({ children }: { children: ReactNode }) {
  return <OAuthReconnectBoundary name="Melhor Envio" label="Melhor Envio" authEndpoint="/api/melhor-envio/auth-url"
    reconnectEvent={MELHOR_ENVIO_RECONNECT_EVENT} connectedEvent={MELHOR_ENVIO_CONNECTED_EVENT}
    channelPrefix="melhor-envio-oauth" completionPath="/melhor-envio/oauth/complete" settingsLabel="Configurações > Melhor Envio"
    successDescription="Conexão restabelecida. Seus dados foram mantidos. Volte à cotação ou ação e tente novamente. Nenhuma compra ou emissão de etiqueta foi reenviada automaticamente.">
    {children}
  </OAuthReconnectBoundary>;
}

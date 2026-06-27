import { NextResponse } from "next/server";
import {
  consumeOAuthState,
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent,
  updateIntegrationCredentials
} from "@/repositories/integrations";
import { exchangeMelhorEnvioAuthorizationCode } from "@/services/melhor-envio/melhor-envio";
import type { MelhorEnvioCredentials, MelhorEnvioSettings } from "@/services/melhor-envio/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return redirectWithStatus(request, "error", error);
  if (!code || !state) return redirectWithStatus(request, "error", "missing_code_or_state");

  const oauthState = await consumeOAuthState(state, "melhor_envio");
  if (!oauthState) return redirectWithStatus(request, "error", "invalid_or_expired_state");

  const connection = await getIntegrationConnection(oauthState.user_id, oauthState.tenant_id, "melhor_envio");
  if (!connection) return redirectWithStatus(request, "error", "integration_not_configured");

  try {
    const currentCredentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(connection);
    const settings = connection.settings as MelhorEnvioSettings;
    const token = await exchangeMelhorEnvioAuthorizationCode(code, settings, currentCredentials);
    const nextCredentials: MelhorEnvioCredentials = {
      ...currentCredentials,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? currentCredentials.refreshToken
    };

    await updateIntegrationCredentials(oauthState.user_id, oauthState.tenant_id, {
      provider: "melhor_envio",
      credentials: nextCredentials,
      status: "active"
    });
    await logIntegrationEvent(oauthState.user_id, oauthState.tenant_id, {
      provider: "melhor_envio",
      operation: "oauth.authorization_code",
      status: "success",
      metadata: {
        tokenType: token.token_type,
        expiresIn: token.expires_in,
        scope: token.scope
      }
    });

    return redirectWithStatus(request, "connected");
  } catch (callbackError) {
    await logIntegrationEvent(oauthState.user_id, oauthState.tenant_id, {
      provider: "melhor_envio",
      operation: "oauth.authorization_code",
      status: "error",
      message: callbackError instanceof Error ? callbackError.message : "Unknown Melhor Envio OAuth error"
    });
    return redirectWithStatus(
      request,
      "error",
      callbackError instanceof Error ? callbackError.message : "unknown_oauth_error"
    );
  }
}

function redirectWithStatus(request: Request, status: "connected" | "error", message?: string) {
  const target = new URL("/settings", request.url);
  target.searchParams.set("melhor_envio", status);
  if (message) target.searchParams.set("message", message.slice(0, 140));
  return NextResponse.redirect(target);
}

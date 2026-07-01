import { NextResponse } from "next/server";
import {
  consumeOAuthState,
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent,
  updateIntegrationCredentials
} from "@/repositories/integrations";
import { exchangeOlistAuthorizationCode } from "@/services/olist/olist";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return redirectWithStatus(request, "error", error);
  if (!code || !state) return redirectWithStatus(request, "error", "missing_code_or_state");

  const oauthState =
    (await consumeOAuthState(state, "olist")) ?? (await consumeOAuthState(state, "olist_crm"));
  if (!oauthState) return redirectWithStatus(request, "error", "invalid_or_expired_state");

  const connection = await getIntegrationConnection(oauthState.user_id, oauthState.tenant_id, oauthState.provider);
  if (!connection) return redirectWithStatus(request, "error", "integration_not_configured");

  try {
    const currentCredentials = decryptIntegrationCredentials<OlistCredentials>(connection);
    const settings = connection.settings as OlistSettings;
    const token = await exchangeOlistAuthorizationCode(code, settings, currentCredentials);
    const nextCredentials: OlistCredentials = {
      ...currentCredentials,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? currentCredentials.refreshToken
    };

    await updateIntegrationCredentials(oauthState.user_id, oauthState.tenant_id, {
      provider: oauthState.provider,
      credentials: nextCredentials,
      status: "active"
    });
    await logIntegrationEvent(oauthState.user_id, oauthState.tenant_id, {
      provider: oauthState.provider,
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
      provider: oauthState.provider,
      operation: "oauth.authorization_code",
      status: "error",
      message: callbackError instanceof Error ? callbackError.message : "Unknown Olist OAuth error"
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
  target.searchParams.set("olist", status);
  if (message) target.searchParams.set("message", message.slice(0, 140));
  return NextResponse.redirect(target);
}

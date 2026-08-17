import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_LEGAL_TERM_VERSION } from "@/domain/legal/terms";
import { sessionCookieName, verifySessionToken } from "@/lib/auth/session-token";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAgentApi = path.startsWith("/api/agent/v1/");
  const debugId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  if (isAgentApi) requestHeaders.set("x-agent-debug-id", debugId);

  if (isAgentApi) {
    console.info("Agent API ingress.", {
      debugId,
      method: request.method,
      path,
      source: request.headers.get("x-agent-source"),
      userAgent: request.headers.get("user-agent"),
      contentLength: request.headers.get("content-length"),
      hasAuthorization: Boolean(request.headers.get("authorization"))
    });
  }

  const token = request.cookies.get(sessionCookieName())?.value;
  const session = token ? await verifySessionToken(token) : null;
  const acceptanceMissing = Boolean(
    session?.requiresTerms && session.acceptedTermsVersion !== ACTIVE_LEGAL_TERM_VERSION
  );
  if (acceptanceMissing && requiresAcceptedTerms(path)) {
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, code: "legal_terms_required", error: "Aceite os termos vigentes antes de continuar." },
        { status: 428 }
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/terms";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (isAgentApi) response.headers.set("x-agent-debug-id", debugId);
  return response;
}

function requiresAcceptedTerms(path: string): boolean {
  if (path.startsWith("/api/")) {
    return ![
      "/api/auth/",
      "/api/invite/",
      "/api/access-requests/",
      "/api/legal/",
      "/api/public/",
      "/api/agent/",
      "/api/billing/mercado-pago/webhook",
      "/api/melhor-envio/oauth/callback",
      "/api/olist/oauth/callback"
    ].some((prefix) => path.startsWith(prefix));
  }
  return ["/dashboard", "/onboarding", "/pricing", "/products", "/quotes", "/customers", "/packaging", "/platforms", "/shipping", "/settings", "/billing", "/users", "/audit", "/superadmin"].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|site.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"]
};

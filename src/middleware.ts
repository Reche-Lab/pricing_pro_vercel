import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const debugId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-agent-debug-id", debugId);

  console.info("Agent API ingress.", {
    debugId,
    method: request.method,
    path: request.nextUrl.pathname,
    source: request.headers.get("x-agent-source"),
    userAgent: request.headers.get("user-agent"),
    contentLength: request.headers.get("content-length"),
    hasAuthorization: Boolean(request.headers.get("authorization"))
  });

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-agent-debug-id", debugId);
  return response;
}

export const config = {
  matcher: ["/api/agent/v1/:path*"]
};

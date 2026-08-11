import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/client";

export type PublicRateLimitRule = {
  action: string;
  limit: number;
  windowSeconds: number;
};

export async function enforcePublicRateLimit(request: Request, token: string, rule: PublicRateLimitRule) {
  const address = getPublicClientAddress(request);
  const keyHash = createHash("sha256").update(`${token}\0${address}`).digest("hex");
  await getPool().query("delete from public_request_limits where expires_at < now() - interval '1 day'");
  const result = await getPool().query<{ request_count: number; expires_at: string }>(
    `
      insert into public_request_limits (
        key_hash,
        action,
        window_started_at,
        request_count,
        expires_at
      )
      values (
        $1,
        $2,
        to_timestamp(floor(extract(epoch from now()) / $4::int) * $4::int),
        1,
        to_timestamp(floor(extract(epoch from now()) / $4::int) * $4::int) + ($4::int || ' seconds')::interval
      )
      on conflict (key_hash, action, window_started_at) do update
        set request_count = public_request_limits.request_count + 1
        where public_request_limits.request_count < $3
      returning request_count, expires_at::text
    `,
    [keyHash, rule.action, rule.limit, rule.windowSeconds]
  );
  if (result.rows[0]) return null;
  return NextResponse.json(
    { ok: false, error: "Muitas solicitações para este link. Aguarde e tente novamente." },
    { status: 429, headers: { "retry-after": String(rule.windowSeconds), "cache-control": "no-store" } }
  );
}

export function getPublicClientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

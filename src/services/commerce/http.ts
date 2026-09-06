import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getSessionProfile } from "@/repositories/users";
import { CommerceError } from "@/domain/commerce/commerce";
import {
  commerceEnabled,
  createBuyerSession,
  findBuyerSession,
  getCommerceStore,
} from "@/repositories/commerce";

export async function requireCommerceAdmin() {
  if (!commerceEnabled())
    throw new CommerceError(
      "O módulo de loja está desativado neste ambiente.",
      404,
    );
  const session = await getCurrentSession();
  if (!session) throw new CommerceError("Entre na conta administrativa.", 401);
  const profile = await getSessionProfile(session.userId, session.tenantId);
  if (
    !profile ||
    (!profile.is_super_admin && !["owner", "admin"].includes(profile.role))
  )
    throw new CommerceError(
      "Somente administradores podem configurar a loja.",
      403,
    );
  return { session, profile };
}
export function checkCommerceOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : new URL(request.url).origin;
  const local =
    process.env.NODE_ENV !== "production" &&
    origin === new URL(request.url).origin;
  if (!origin || (origin !== expected && !local))
    throw new CommerceError("Origem da solicitação não autorizada.", 403);
}
export async function readCommerceBody<T>(
  request: Request,
  schema: z.ZodType<T>,
  limit = 128 * 1024,
): Promise<T> {
  const reader = request.body?.getReader();
  if (!reader) throw new CommerceError("Dados ausentes.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > limit) {
      await reader.cancel();
      throw new CommerceError("Arquivo ou solicitação muito grande.", 413);
    }
    chunks.push(part.value);
  }
  let json: unknown;
  try {
    json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CommerceError("Dados inválidos.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    throw new CommerceError(
      parsed.error.issues[0]?.message ?? "Confira os campos informados.",
    );
  return parsed.data;
}
export const buyerCookieName = (tenantId: string) =>
  `commerce_${tenantId.replaceAll("-", "")}`;
export async function setBuyerCookie(tenantId: string, token: string) {
  (await cookies()).set(buyerCookieName(tenantId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 86400,
  });
}
export async function buyerContext(
  slug: string,
  create = false,
  allowPaused = false,
) {
  const store = await getCommerceStore(slug, allowPaused);
  if (!store) throw new CommerceError("Loja indisponível.", 404);
  const token = (await cookies()).get(buyerCookieName(store.tenant_id))?.value;
  let session = await findBuyerSession(store.tenant_id, token);
  if (!session && create) {
    const created = await createBuyerSession(store.tenant_id);
    session = created.session;
    await setBuyerCookie(store.tenant_id, created.token);
  }
  if (!session)
    throw new CommerceError("Abra o carrinho para iniciar sua sessão.", 401);
  return { store, session };
}
export function commerceJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
export function commerceFailure(error: unknown, operation: string) {
  const debugId = crypto.randomUUID();
  console.error("Commerce operation failed.", {
    debugId,
    operation,
    status: error instanceof CommerceError ? error.status : 500,
    errorType: error instanceof Error ? error.name : "unknown",
  });
  return commerceJson(
    {
      ok: false,
      debugId,
      error:
        error instanceof CommerceError
          ? error.message
          : "Não foi possível concluir. Tente novamente ou informe o código ao atendimento.",
    },
    error instanceof CommerceError ? error.status : 500,
  );
}

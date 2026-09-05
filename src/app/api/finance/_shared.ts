import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getSessionProfile, userHasPermission } from "@/repositories/users";
import { FinancialIndicatorError } from "@/domain/finance/indicators";

export async function requireFinancePermission(permission: string) {
  const session = await getCurrentSession();
  if (!session) return { response: NextResponse.json({ ok: false, error: "Sessão expirada." }, { status: 401 }) } as const;
  const [profile, allowed] = await Promise.all([
    getSessionProfile(session.userId, session.tenantId),
    userHasPermission(session.userId, session.tenantId, permission)
  ]);
  const isTenantAdmin = profile?.is_super_admin || profile?.role === "owner" || profile?.role === "admin";
  if (!isTenantAdmin || !allowed) {
    return { response: NextResponse.json({ ok: false, error: "O Financeiro está temporariamente restrito aos administradores do tenant." }, { status: 403 }) } as const;
  }
  return { session } as const;
}

export function financeError(error: unknown, operation: string) {
  const debugId = crypto.randomUUID();
  const message = error instanceof Error ? error.message : "Erro financeiro inesperado.";
  console.error("Financial API request failed.", { debugId, operation, message, stack: error instanceof Error ? error.stack : undefined });
  return NextResponse.json({ ok: false, debugId, error: message }, { status: error instanceof FinancialIndicatorError ? 400 : 500 });
}

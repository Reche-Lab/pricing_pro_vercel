import { CommerceError } from "@/domain/commerce/commerce";
import { getCurrentSession } from "@/lib/auth/session";
import { getSessionProfile, userHasPermission } from "@/repositories/users";
import { commerceEnabled } from "@/repositories/commerce";

export type OrderPermission = "commerce:orders:read" | "commerce:orders:manage" | "commerce:artworks:write";
export async function getCommerceOrderAccess(profile: NonNullable<Awaited<ReturnType<typeof getSessionProfile>>>) {
  if (!commerceEnabled()) return { read: false, manage: false, artworks: false, configure: false };
  const admin = profile.is_super_admin || ["owner", "admin"].includes(profile.role);
  const [read, manage, artworks] = admin ? [true, true, true] : await Promise.all(
    (["commerce:orders:read", "commerce:orders:manage", "commerce:artworks:write"] as const)
      .map(permission => userHasPermission(profile.user_id, profile.tenant_id, permission))
  );
  return { read, manage: read && manage, artworks: read && artworks, configure: admin };
}
export async function requireCommerceOrderAccess(permission: OrderPermission = "commerce:orders:read") {
  if (!commerceEnabled()) throw new CommerceError("O módulo de loja está desativado.", 404);
  const session = await getCurrentSession();
  if (!session) throw new CommerceError("Entre na plataforma para acessar os pedidos.", 401);
  const profile = await getSessionProfile(session.userId, session.tenantId);
  if (!profile) throw new CommerceError("Sua associação com esta empresa não está ativa.", 403);
  const access = await getCommerceOrderAccess(profile);
  const allowed = permission === "commerce:orders:manage" ? access.manage : permission === "commerce:artworks:write" ? access.artworks : access.read;
  if (!allowed) throw new CommerceError("Seu perfil não tem permissão para esta ação nos pedidos da loja.", 403);
  return { session, profile, access };
}

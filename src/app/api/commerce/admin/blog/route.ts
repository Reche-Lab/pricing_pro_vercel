import { CommerceError } from "@/domain/commerce/commerce";
import { blogSaveSchema } from "@/domain/commerce/blog-settings";
import { blogAdminStore, blogMigrationMissing, readBlogAdmin, saveBlog } from "@/repositories/commerce-blog";
import { checkCommerceOrigin, commerceFailure, commerceJson, readCommerceBody, requireCommerceAdmin } from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";

export const dynamic = "force-dynamic";
function failure(error: unknown, operation: string) {
  return commerceFailure(blogMigrationMissing(error) ? new CommerceError("Aplique a migration 0086_commerce_blog.sql antes de salvar o blog.", 503) : error, operation);
}
export async function GET() {
  try {
    const { session } = await requireCommerceAdmin();
    const store = await blogAdminStore(session.tenantId);
    return commerceJson(await readBlogAdmin(session.tenantId, store.slug, store.name));
  } catch (error) { return failure(error, "admin.blog.read"); }
}
export async function PUT(request: Request) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceAdmin();
    const blocked = await enforcePublicRateLimit(request, session.tenantId, { action: "commerce.blog.save", limit: 40, windowSeconds: 600 });
    if (blocked) return blocked;
    const input = await readCommerceBody(request, blogSaveSchema);
    const store = await blogAdminStore(session.tenantId);
    const data = await saveBlog(session.userId, session.tenantId, store.slug, store.name, input);
    return commerceJson({ ...data, message: input.action === "settings" ? "Apresentação do blog salva." : input.status === "published" ? "Artigo salvo e publicado." : input.status === "archived" ? "Artigo arquivado e removido da loja." : "Rascunho salvo. Ele aparece somente na prévia administrativa." });
  } catch (error) { return failure(error, "admin.blog.save"); }
}

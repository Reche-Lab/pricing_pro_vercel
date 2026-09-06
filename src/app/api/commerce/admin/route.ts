import { storeAdminSchema } from "@/domain/commerce/schemas";
import { getCommerceAdmin, saveCommerceStore } from "@/repositories/commerce";
import {
  checkCommerceOrigin,
  commerceFailure,
  commerceJson,
  readCommerceBody,
  requireCommerceAdmin,
} from "@/services/commerce/http";
export async function GET() {
  try {
    const { session } = await requireCommerceAdmin();
    return commerceJson(
      await getCommerceAdmin(session.userId, session.tenantId),
    );
  } catch (error) {
    return commerceFailure(error, "admin.read");
  }
}
export async function PUT(request: Request) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceAdmin();
    const input = await readCommerceBody(request, storeAdminSchema);
    await saveCommerceStore(session.userId, session.tenantId, input);
    return commerceJson({ ok: true });
  } catch (error) {
    return commerceFailure(error, "admin.save");
  }
}

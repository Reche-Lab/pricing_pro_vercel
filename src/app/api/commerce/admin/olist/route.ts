import { commerceOlistSettingsSchema } from "@/domain/commerce/olist";
import { getCommerceOlistAdmin, saveCommerceOlistSettings } from "@/repositories/commerce-olist";
import { checkCommerceOrigin, commerceFailure, commerceJson, readCommerceBody, requireCommerceAdmin } from "@/services/commerce/http";

export async function GET() {
  try { const { session } = await requireCommerceAdmin(); return commerceJson(await getCommerceOlistAdmin(session.tenantId)); }
  catch (error) { return commerceFailure(error, "olist.settings.read"); }
}
export async function PUT(request: Request) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceAdmin();
    await saveCommerceOlistSettings(session.tenantId, session.userId, await readCommerceBody(request, commerceOlistSettingsSchema));
    return commerceJson({ ok: true, ...(await getCommerceOlistAdmin(session.tenantId)) });
  } catch (error) { return commerceFailure(error, "olist.settings.save"); }
}

import { libraryCommandSchema, libraryQuerySchema } from "@/domain/commerce/library";
import { mutateCommerceLibrary, readCommerceLibrary } from "@/repositories/commerce-library";
import { checkCommerceOrigin, requireCommerceAdmin, readCommerceBody, commerceJson, commerceFailure } from "@/services/commerce/http";
import { CommerceError } from "@/domain/commerce/commerce";
export async function GET(request: Request) {
  try {
    const { session } = await requireCommerceAdmin();
    const input = libraryQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!input.success) throw new CommerceError("Confira os filtros da biblioteca.");
    return commerceJson(await readCommerceLibrary(session.tenantId, input.data, "admin"));
  } catch (error) { return commerceFailure(error, "admin.library.read"); }
}
export async function POST(request: Request) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceAdmin();
    return commerceJson(await mutateCommerceLibrary(session.tenantId, session.userId, await readCommerceBody(request, libraryCommandSchema)));
  } catch (error) { return commerceFailure(error, "admin.library.save"); }
}

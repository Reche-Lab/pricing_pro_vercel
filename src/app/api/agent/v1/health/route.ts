import { withAgentAuthGet } from "../_shared";

export async function GET(request: Request) {
  return withAgentAuthGet(request, "products:read", async (context) => ({
    body: {
      ok: true,
      tenant: {
        id: context.tenantId,
        slug: context.tenantSlug,
        name: context.tenantName
      },
      apiKey: {
        id: context.apiKeyId,
        name: context.keyName,
        scopes: context.scopes
      }
    }
  }));
}

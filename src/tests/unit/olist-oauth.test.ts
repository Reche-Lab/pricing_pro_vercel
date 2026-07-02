import { describe, expect, it } from "vitest";
import { buildOlistAuthUrl } from "@/services/olist/olist";

describe("olist oauth", () => {
  it("normalizes the legacy olist ERP host to the Tiny OpenID authorization host", () => {
    const url = buildOlistAuthUrl(
      {
        app_base_url: "https://erp.olist.com",
        authorize_path: "/oauth/authorize",
        scopes: ["customers", "quotes"]
      },
      { clientId: "client-id", clientSecret: "client-secret" },
      "state-123"
    );

    expect(url).toContain("https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth");
    expect(url).toContain("client_id=client-id");
    expect(url).toContain("state=state-123");
    expect(url).toContain("scope=openid");
    expect(url).not.toContain("erp.olist.com");
  });

  it("normalizes the legacy host even when the saved value includes a path", () => {
    const url = buildOlistAuthUrl(
      {
        app_base_url: "https://erp.olist.com/oauth",
        authorize_path: "/authorize"
      },
      { clientId: "client-id", clientSecret: "client-secret" },
      "state-456"
    );

    expect(url).toContain("https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth");
    expect(url).not.toContain("erp.olist.com");
  });
});

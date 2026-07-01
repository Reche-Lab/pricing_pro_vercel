import { describe, expect, it } from "vitest";
import { buildOlistAuthUrl } from "@/services/olist/olist";

describe("olist oauth", () => {
  it("normalizes the legacy olist ERP host to the Tiny ERP authorization host", () => {
    const url = buildOlistAuthUrl(
      {
        app_base_url: "https://erp.olist.com",
        authorize_path: "/oauth/authorize",
        scopes: ["customers", "quotes"]
      },
      { clientId: "client-id", clientSecret: "client-secret" },
      "state-123"
    );

    expect(url).toContain("https://erp.tiny.com.br/oauth/authorize");
    expect(url).toContain("client_id=client-id");
    expect(url).toContain("state=state-123");
    expect(url).not.toContain("erp.olist.com");
  });
});

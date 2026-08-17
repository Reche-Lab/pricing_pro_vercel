import { describe, expect, it } from "vitest";
import { createAccessRequestToken, hashAccessRequestToken, normalizeWhatsapp } from "@/domain/access-requests/tokens";
import { renderLegalTermHtml } from "@/domain/legal/terms";

describe("tenant access request", () => {
  it("normalizes Brazilian mobile and landline numbers to E.164", () => {
    expect(normalizeWhatsapp("(12) 99700-3322")).toBe("+5512997003322");
    expect(normalizeWhatsapp("+55 (11) 3333-4444")).toBe("+551133334444");
  });

  it("rejects phone numbers outside the supported length", () => {
    expect(normalizeWhatsapp("123")).toBe(null);
    expect(normalizeWhatsapp("1234567890123456")).toBe(null);
  });

  it("creates opaque tokens and stable non-reversible hashes", () => {
    const token = createAccessRequestToken();
    expect(token.length).toBeGreaterThan(30);
    expect(hashAccessRequestToken(token)).toHaveLength(64);
    expect(hashAccessRequestToken(token)).toBe(hashAccessRequestToken(token));
    expect(hashAccessRequestToken(token)).not.toContain(token);
  });
});

describe("legal term rendering", () => {
  it("escapes supplied markup and highlights numbered headings", () => {
    const html = renderLegalTermHtml("1. Responsabilidade\nTexto <script>alert(1)</script>\n\nOutro bloco");
    expect(html).toContain("<strong>1. Responsabilidade</strong>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

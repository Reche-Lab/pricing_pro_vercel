import { describe, expect, it } from "vitest";
import { commerceSitemapEntries } from "@/services/commerce/sitemap";
import {
  campaignIsVisible,
  libraryCommandSchema,
  librarySlug,
  librarySearch,
  assertCategoryParent,
} from "@/domain/commerce/library";
const root = "11111111-1111-4111-8111-111111111111",
  child = "22222222-2222-4222-8222-222222222222";
describe("campaign library rules", () => {
  it("normalizes accents and reserves bounded URL-safe slugs", () => {
    expect(librarySlug("Consciência Negra")).toBe("consciencia-negra");
    expect(librarySlug(" Outubro  ROSA! ")).toBe("outubro-rosa");
    expect(librarySlug(`${"a".repeat(79)} b`)).not.toMatch(/-$/);
  });
  it("keeps keywords searchable after a long artwork description", () => {
    expect(
      librarySearch(["Flores", "Descrição ".repeat(95), "prevenção"].join(" ")),
    ).toContain("prevencao");
  });
  it("includes optional library and campaign pages without changing non-library stores", () => {
    const origin = "https://example.test";
    expect(commerceSitemapEntries("sample", [], origin)).toHaveLength(2);
    const entries = commerceSitemapEntries("sample", [], origin, {
      campaigns: ["outubro-rosa"],
    });
    expect(entries.map((entry) => entry.url)).toContain(
      `${origin}/loja/sample/campanhas/outubro-rosa`,
    );
    expect(entries).toHaveLength(5);
  });
  it("compares campaign dates chronologically with different ISO precision", () => {
    expect(
      libraryCommandSchema.safeParse({
        action: "campaign.save",
        name: "Campanha",
        slug: "campanha",
        description: "",
        coverUrl: "",
        status: "draft",
        featured: false,
        startsAt: "2026-11-01T00:00:00Z",
        endsAt: "2026-11-01T00:00:00.500Z",
      }).success,
    ).toBe(true);
  });
  it("enforces two category levels without cycles or foreign parents", () => {
    const rows = [
      { id: root, parent_id: null },
      { id: child, parent_id: root },
    ];
    expect(() => assertCategoryParent(rows, null, root)).not.toThrow();
    expect(() => assertCategoryParent(rows, root, child)).toThrow();
    expect(() => assertCategoryParent(rows, null, child)).toThrow();
    expect(() =>
      assertCategoryParent(rows, root, "33333333-3333-4333-8333-333333333333"),
    ).toThrow();
  });
  it("does not expose drafts, archives or campaigns outside their window", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    expect(
      campaignIsVisible(
        {
          status: "published",
          starts_at: now.toISOString(),
          ends_at: "2026-11-01T00:00:00Z",
        },
        now,
      ),
    ).toBe(true);
    expect(
      campaignIsVisible(
        { status: "draft", starts_at: null, ends_at: null },
        now,
      ),
    ).toBe(false);
    expect(
      campaignIsVisible(
        { status: "published", starts_at: null, ends_at: now.toISOString() },
        now,
      ),
    ).toBe(false);
    expect(
      campaignIsVisible(
        {
          status: "published",
          starts_at: "2026-10-02T00:00:00Z",
          ends_at: null,
        },
        now,
      ),
    ).toBe(false);
  });
  it("rejects arbitrary paths, cross-tenant arguments, invalid dates and duplicate bindings", () => {
    expect(
      libraryCommandSchema.safeParse({
        action: "settings",
        enabled: true,
        tenantId: root,
      }).success,
    ).toBe(false);
    expect(
      libraryCommandSchema.safeParse({
        action: "campaign.save",
        name: "Campanha",
        slug: "../secret",
        description: "",
        coverUrl: "",
        status: "draft",
        featured: false,
        startsAt: null,
        endsAt: null,
      }).success,
    ).toBe(false);
    const command = {
      action: "campaign.save",
      name: "Campanha",
      slug: "campanha",
      description: "",
      coverUrl: "",
      status: "published",
      featured: true,
      startsAt: "2026-11-01T00:00:00Z",
      endsAt: "2026-10-01T00:00:00Z",
    };
    expect(libraryCommandSchema.safeParse(command).success).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db/client";
import { commerceTransaction } from "@/repositories/commerce";
import { readBlogAdmin, readPublicBlog, saveBlog } from "@/repositories/commerce-blog";
import { articleContent, blogSaveSchema, defaultBlogSettings } from "@/domain/commerce/blog-settings";
import { groundShopArticles } from "@/content/ground-shop-blog";

vi.mock("@/lib/db/client", () => ({ getPool: vi.fn() }));
vi.mock("@/repositories/commerce", () => ({ commerceTransaction: vi.fn() }));
const query = vi.fn(), write = vi.fn();
const tenant = "11111111-1111-4111-8111-111111111111", actor = "22222222-2222-4222-8222-222222222222";
const article = groundShopArticles[0];
const command = { action: "article" as const, slug: article.slug, revision: 0, status: "published" as const, content: articleContent(article) };
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(getPool).mockReturnValue({ query } as never);
  query.mockResolvedValue({ rows: [{ settings: null, revision: null, posts: [] }] });
  write.mockImplementation(async (sql: string) => sql.startsWith("select revision") ? { rowCount: 0, rows: [] } : sql.startsWith("select count") ? { rowCount: 1, rows: [{ count: 0 }] } : { rowCount: 1, rows: [{ revision: 1 }] });
  vi.mocked(commerceTransaction).mockImplementation(async cb => cb({ query: write } as never));
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("tenant-scoped editable blog", () => {
  it("preserves Ground Shop seeds before migration and gives no other tenant its content", async () => {
    query.mockRejectedValueOnce({ code: "42P01" });
    const fallback = await readBlogAdmin(tenant, "ground-shop", "Ground Shop");
    expect(fallback.migrationRequired).toBe(true); expect(fallback.posts).toHaveLength(8);
    const other = await readBlogAdmin(tenant, "other", "Outra loja");
    expect(other.posts).toEqual([]); expect(other.settings.enabled).toBe(false);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("where p.tenant_id=$1::uuid"), [tenant]);
  });
  it("overrides text/image/dates and never resurrects draft or archived seed content", async () => {
    const row = { slug: article.slug, content: { ...articleContent(article), title: "Atualizado", image: "https://media.test/novo.webp" }, status: "draft", revision: 3, created_at: article.published, published_at: article.published, updated_at: "2026-11-25T10:00:00Z" };
    query.mockResolvedValue({ rows: [{ settings: null, revision: null, posts: [row] }] });
    const publicBlog = await readPublicBlog(tenant, "ground-shop", "Ground Shop");
    expect(publicBlog.articles.find(a => a.slug === article.slug)).toBeUndefined();
    const preview = await readPublicBlog(tenant, "ground-shop", "Ground Shop", true);
    expect(preview.articles[0]).toMatchObject({ title: "Atualizado", image: "https://media.test/novo.webp", updated: "2026-11-25T10:00:00.000Z" });
    query.mockResolvedValue({ rows: [{ settings: null, revision: null, posts: [{ ...row, status: "archived" }] }] });
    expect((await readPublicBlog(tenant, "ground-shop", "Ground Shop", true)).articles).toHaveLength(7);
  });
  it("saves settings and content using session ownership, typed SQL and a content-free audit log", async () => {
    await saveBlog(actor, tenant, "ground-shop", "Ground Shop", command);
    write.mockResolvedValue({ rowCount: 1, rows: [{ revision: 2 }] });
    await saveBlog(actor, tenant, "ground-shop", "Ground Shop", { ...command, revision: 2 });
    for (const revision of [0, 2]) await saveBlog(actor, tenant, "ground-shop", "Ground Shop", { action: "settings", revision, settings: defaultBlogSettings("ground-shop", "Ground Shop") });
    for (const [sql, parameters] of write.mock.calls as [string, unknown[]][]) {
      expect(parameters[0]).toBe(tenant);
      const placeholders = [...new Set([...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1])))].sort((a, b) => a - b);
      expect(placeholders).toEqual(parameters.map((_, i) => i + 1));
    }
    const audit = write.mock.calls.filter(([sql]) => String(sql).startsWith("insert into audit_logs"));
    expect(audit).toHaveLength(4); expect(audit[0][1][1]).toBe(actor);
    expect(audit[0][1][3]).not.toContain(article.intro);
    expect(write.mock.calls.find(([sql]) => String(sql).startsWith("insert into commerce_blog_posts"))?.[1][5]).toBe(article.published);
    expect(write.mock.calls.some(([sql]) => String(sql).includes("revision=$6::integer"))).toBe(true);
  });
  it("refuses concurrent edits, missing publication data and caller-controlled tenant fields", async () => {
    write.mockImplementation(async (sql: string) => sql.startsWith("update commerce_blog") ? { rowCount: 0 } : { rowCount: 1, rows: [{ revision: 4 }] });
    await expect(saveBlog(actor, tenant, "ground-shop", "Ground Shop", { ...command, revision: 3 })).rejects.toMatchObject({ status: 409 });
    expect(write.mock.calls.some(([sql]) => String(sql).startsWith("insert into audit_logs"))).toBe(false);
    await expect(saveBlog(actor, tenant, "ground-shop", "Ground Shop", { ...command, content: { ...command.content, image: "" } })).rejects.toThrow("imagem de capa");
    expect(blogSaveSchema.safeParse({ ...command, tenantId: "other" }).success).toBe(false);
    expect(blogSaveSchema.safeParse({ ...command, content: { ...command.content, image: "javascript:alert(1)" } }).success).toBe(false);
    expect(blogSaveSchema.safeParse({ ...command, content: { ...command.content, sources: [{ title: "Fonte", url: "https://user:secret@site.test" }] } }).success).toBe(false);
  });
});

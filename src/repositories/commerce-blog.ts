import { getPool } from "@/lib/db/client";
import { commerceTransaction } from "./commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import { storeBlogEnabled } from "@/domain/commerce/blog";
import { groundShopArticles } from "@/content/ground-shop-blog";
import { articlePublicationIssues, blogContentSchema, blogSaveSchema, blogSettingsSchema, defaultBlogSettings, type BlogAdminData, type BlogPost, type BlogSave, type PublicBlog } from "@/domain/commerce/blog-settings";

type StoredPost = { slug: string; content: unknown; status: BlogPost["status"]; revision: number; published_at: string | null; created_at: string; updated_at: string };
type Row = { settings: unknown; revision: number | null; posts: StoredPost[]; updated_at?: string | null };
export const blogMigrationMissing = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "42P01");

export async function readBlogAdmin(tenantId: string, slug: string, name: string): Promise<BlogAdminData> {
  const seeds: BlogPost[] = storeBlogEnabled(slug) ? groundShopArticles.map(article => ({ article, revision: 0, status: "published" })) : [];
  const defaults = { settings: defaultBlogSettings(slug, name), revision: 0, posts: seeds, migrationRequired: false };
  let row: Row | undefined;
  try {
    row = (await getPool().query<Row>(`select s.settings,s.revision,s.updated_at::text,
      (select coalesce(jsonb_agg(p order by p.created_at,p.slug),'[]'::jsonb) from commerce_blog_posts p where p.tenant_id=$1::uuid) as posts
      from (select $1::uuid as tenant_id) t left join commerce_blog_settings s on s.tenant_id=t.tenant_id`, [tenantId])).rows[0];
  } catch (error) {
    if (blogMigrationMissing(error)) return { ...defaults, migrationRequired: true };
    throw error;
  }
  const posts = new Map(seeds.map(post => [post.article.slug, post]));
  for (const post of row?.posts ?? []) {
    const content = blogContentSchema.parse(post.content);
    posts.set(post.slug, { revision: post.revision, status: post.status, article: {
      ...content, slug: post.slug,
      published: new Date(post.published_at ?? post.created_at).toISOString(), updated: new Date(post.updated_at).toISOString(),
    } });
  }
  return { settings: row?.settings ? blogSettingsSchema.parse(row.settings) : defaults.settings, revision: row?.revision ?? 0, posts: [...posts.values()], migrationRequired: false, ...(row?.updated_at ? { updated: new Date(row.updated_at).toISOString() } : {}) };
}

export async function readPublicBlog(tenantId: string, slug: string, name: string, preview = false): Promise<PublicBlog> {
  const data = await readBlogAdmin(tenantId, slug, name);
  return { settings: data.settings, articles: data.posts.filter(post => preview ? post.status !== "archived" : post.status === "published").map(post => post.article), ...(data.updated ? { updated: data.updated } : {}) };
}

export async function blogAdminStore(tenantId: string) {
  const store = (await getPool().query<{ slug: string; name: string }>(`select t.slug,coalesce(s.settings->>'name',t.name) as name
    from commerce_stores s join tenants t on t.id=s.tenant_id where s.tenant_id=$1`, [tenantId])).rows[0];
  if (!store) throw new CommerceError("Salve a loja antes de configurar o blog.", 404);
  return store;
}

export async function saveBlog(actor: string, tenantId: string, slug: string, name: string, raw: BlogSave) {
  const input = blogSaveSchema.parse(raw);
  if (input.action === "article" && input.status === "published") {
    const missing = articlePublicationIssues(input.content);
    if (missing.length) throw new CommerceError(`Antes de publicar, preencha: ${missing.join(", ")}.`);
  }
  if (input.action === "settings" && input.settings.heroImage && !input.settings.heroAlt) throw new CommerceError("Descreva a imagem de abertura antes de salvar.");
  const seeds = storeBlogEnabled(slug) ? groundShopArticles : [];
  await commerceTransaction(async client => {
    // Serialize the post-count limit and edits with the store's existing ownership boundary.
    const store = await client.query("select tenant_id from commerce_stores where tenant_id=$1 for update", [tenantId]);
    if (!store.rowCount) throw new CommerceError("Loja não encontrada.", 404);
    let result;
    if (input.action === "settings") {
      result = input.revision === 0
        ? await client.query(`insert into commerce_blog_settings(tenant_id,settings,updated_by) values($1::uuid,$2::jsonb,$3::uuid)
          on conflict(tenant_id) do nothing returning revision`, [tenantId, JSON.stringify(input.settings), actor])
        : await client.query(`update commerce_blog_settings set settings=$2::jsonb,updated_by=$3::uuid,revision=revision+1,updated_at=now()
          where tenant_id=$1::uuid and revision=$4::integer returning revision`, [tenantId, JSON.stringify(input.settings), actor, input.revision]);
    } else {
      const current = await client.query<{ revision: number }>("select revision from commerce_blog_posts where tenant_id=$1 and slug=$2", [tenantId, input.slug]);
      if (!current.rowCount && input.revision !== 0) throw new CommerceError("O artigo mudou. Recarregue antes de salvar.", 409);
      const seed = seeds.find(article => article.slug === input.slug);
      if (!current.rowCount && !seed) {
        const count = await client.query<{ count: number }>(`select count(*)::integer as count from
          (select slug from commerce_blog_posts where tenant_id=$1::uuid union select unnest($2::text[])) all_posts`, [tenantId, seeds.map(article => article.slug)]);
        if (count.rows[0].count >= 100) throw new CommerceError("O blog permite até 100 artigos por loja.");
      }
      const parameters = [tenantId, input.slug, JSON.stringify(input.content), input.status, actor];
      result = input.revision === 0 ? await client.query(`insert into commerce_blog_posts(tenant_id,slug,content,status,updated_by,published_at)
        values($1::uuid,$2::text,$3::jsonb,$4::text,$5::uuid,coalesce($6::timestamptz,case when $4::text='published' then now() end))
        on conflict(tenant_id,slug) do nothing returning revision`, [...parameters, seed?.published ?? null])
        : await client.query(`update commerce_blog_posts set content=$3::jsonb,status=$4::text,updated_by=$5::uuid,revision=revision+1,updated_at=now(),
          published_at=coalesce(published_at,case when $4::text='published' then now() end)
          where tenant_id=$1::uuid and slug=$2::text and revision=$6::integer returning revision`, [...parameters, input.revision]);
    }
    if (!result?.rowCount) throw new CommerceError("Este conteúdo foi alterado em outra aba. Recarregue antes de salvar para não sobrescrever alterações.", 409);
    await client.query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type,metadata) values($1,$2,$3,'commerce_blog',$4)", [tenantId, actor, `commerce.blog.${input.action}.save`, JSON.stringify(input.action === "article" ? { slug: input.slug, status: input.status } : { enabled: input.settings.enabled })]);
  });
  console.info("Commerce blog saved.", { tenantId, action: input.action, ...(input.action === "article" ? { slug: input.slug, status: input.status } : {}) });
  return readBlogAdmin(tenantId, slug, name);
}

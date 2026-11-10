import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/client";
import { CommerceError } from "@/domain/commerce/commerce";
import {
  assertCategoryParent,
  librarySearch,
  type LibraryArtwork,
  type LibraryCategory,
  type LibraryCampaign,
  type LibraryCommand,
  type LibraryQuery,
  type LibraryResult,
} from "@/domain/commerce/library";
import {
  commerceProducts,
  commerceTransaction,
  geometryHash,
} from "./commerce";

const productJoins = `join commerce_products cp on cp.tenant_id=lp.tenant_id and cp.id=lp.product_id
  join product_variants v on v.tenant_id=cp.tenant_id and v.id=cp.variant_id
  join products p on p.tenant_id=v.tenant_id and p.id=v.product_id`;
const activeProduct = `cp.active and v.active and p.active and v.deleted_at is null and p.deleted_at is null and cp.snapshot->>'personalized'='true'`;
const visibleCategory = `(a.category_id is null or exists(select 1 from commerce_art_categories c left join commerce_art_categories parent on parent.tenant_id=c.tenant_id and parent.id=c.parent_id where c.tenant_id=a.tenant_id and c.id=a.category_id and c.active and (c.parent_id is null or parent.active)))`;
const compatible = `exists(select 1 from commerce_library_products lp ${productJoins} where lp.tenant_id=a.tenant_id and lp.artwork_id=a.id and ${activeProduct})`;
const visibleArt = `a.status='published' and ${visibleCategory} and ${compatible}`;
const campaignWindow = `c.status='published' and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>now())`;
type Client = Pick<PoolClient, "query">;
export async function lockLibrary(client: Client, tenantId: string) {
  await client.query(
    "select pg_advisory_xact_lock(hashtext('commerce-library'),hashtext($1))",
    [tenantId],
  );
}

export async function readCommerceLibrary(
  tenantId: string,
  input: LibraryQuery,
  mode: "public" | "preview" | "admin" = "public",
): Promise<LibraryResult> {
  const admin = mode === "admin",
    preview = mode === "preview";
  const connection = (
    await getPool().query(
      "select art_library_enabled from commerce_stores where tenant_id=$1",
      [tenantId],
    )
  ).rows[0];
  if (!connection || (!admin && !preview && !connection.art_library_enabled))
    throw new CommerceError("Biblioteca indisponível.", 404);
  const categories = (
    await getPool().query<LibraryCategory>(
      `select id,name,slug,parent_id,active,sort_order,revision from commerce_art_categories c where tenant_id=$1 ${admin || preview ? "" : "and active and (parent_id is null or exists(select 1 from commerce_art_categories p where p.tenant_id=c.tenant_id and p.id=c.parent_id and p.active))"} order by sort_order,name,id`,
      [tenantId],
    )
  ).rows;
  const campaigns = (
    await getPool().query<LibraryCampaign>(
      `select c.id,c.name,c.slug,c.description,c.cover_url,c.status,c.featured,c.starts_at::text,c.ends_at::text,c.sort_order,c.revision,
    (select count(*)::int from commerce_library_campaign_artworks ca join commerce_library_artworks a on a.tenant_id=ca.tenant_id and a.id=ca.artwork_id where ca.tenant_id=c.tenant_id and ca.campaign_id=c.id and ${admin ? "true" : preview ? `a.status<>'archived' and ${compatible}` : visibleArt}) as artwork_count
    from commerce_art_campaigns c where c.tenant_id=$1 ${admin ? "" : preview ? "and c.status<>'archived'" : `and ${campaignWindow}`} order by c.sort_order,c.name,c.id`,
      [tenantId],
    )
  ).rows.filter((c) => admin || (c.artwork_count ?? 0) > 0);
  const productIds = `array(select lp.product_id from commerce_library_products lp ${admin ? "" : productJoins} where lp.tenant_id=a.tenant_id and lp.artwork_id=a.id ${admin ? "" : `and ${activeProduct}`} order by lp.product_id)`;
  const where = `a.tenant_id=$1 and ${admin ? "true" : preview ? `a.status<>'archived' and ${compatible}` : visibleArt}
    and ($2::text='' or a.search_text like '%'||$2||'%' or exists(select 1 from commerce_art_categories sc where sc.tenant_id=a.tenant_id and (sc.id=a.category_id or sc.id=(select parent_id from commerce_art_categories where tenant_id=a.tenant_id and id=a.category_id)) and replace(sc.slug,'-',' ') like '%'||$2||'%') or exists(select 1 from commerce_library_campaign_artworks ca join commerce_art_campaigns c on c.tenant_id=ca.tenant_id and c.id=ca.campaign_id where ca.tenant_id=a.tenant_id and ca.artwork_id=a.id and replace(c.slug,'-',' ') like '%'||$2||'%' ${admin ? "" : preview ? "and c.status<>'archived'" : `and ${campaignWindow}`}))
    and ($3::uuid is null or a.category_id=$3::uuid or a.category_id in(select id from commerce_art_categories where tenant_id=$1 and parent_id=$3::uuid))
    and ($4::text is null or exists(select 1 from commerce_library_campaign_artworks ca join commerce_art_campaigns c on c.tenant_id=ca.tenant_id and c.id=ca.campaign_id where ca.tenant_id=a.tenant_id and ca.artwork_id=a.id and c.slug=$4 ${admin ? "" : preview ? "and c.status<>'archived'" : `and ${campaignWindow}`}))
    and ($5::uuid is null or exists(select 1 from commerce_library_products where tenant_id=a.tenant_id and artwork_id=a.id and product_id=$5::uuid))
    and ($6::text='all' or a.status=$6) and ($7::uuid is null or a.id=$7::uuid)`;
  const params = [
    tenantId,
    librarySearch(input.q).replace(/[\\%_]/g, "\\$&"),
    input.category ?? null,
    input.campaign ?? null,
    input.product ?? null,
    admin ? input.status : "all",
    input.artwork ?? null,
  ];
  const total = (
    await getPool().query<{ total: number }>(
      `select count(*)::int as total from commerce_library_artworks a where ${where}`,
      params,
    )
  ).rows[0].total;
  const artworks = (
    await getPool().query<LibraryArtwork>(
      `select a.id,a.title,a.description,a.tags,a.category_id,a.status,a.editable,a.version,a.revision,a.file_name,a.width,a.height,${admin ? "a.license_note," : ""}
    ${productIds} as product_ids, array(select ca.campaign_id from commerce_library_campaign_artworks ca join commerce_art_campaigns c on c.tenant_id=ca.tenant_id and c.id=ca.campaign_id where ca.tenant_id=a.tenant_id and ca.artwork_id=a.id ${admin ? "" : preview ? "and c.status<>'archived'" : `and ${campaignWindow}`}) as campaign_ids
    ${admin ? ",coalesce((select jsonb_agg(jsonb_build_object('product_id',lp.product_id,'initial_crop',lp.initial_crop)) from commerce_library_products lp where lp.tenant_id=a.tenant_id and lp.artwork_id=a.id),'[]'::jsonb) as bindings" : ""}
    from commerce_library_artworks a where ${where} order by a.sort_order,a.created_at desc,a.id limit 24 offset $8`,
      [...params, (input.page - 1) * 24],
    )
  ).rows;
  return {
    enabled: connection.art_library_enabled,
    categories,
    campaigns,
    artworks,
    total,
    page: input.page,
    pageSize: 24,
  };
}

export async function librarySource(
  tenantId: string,
  id: string,
  mode: "public" | "preview" | "admin",
  client: Client = getPool(),
) {
  const row = (
    await client.query(
      `select a.* from commerce_library_artworks a where a.tenant_id=$1 and a.id=$2 and ${mode === "admin" ? "true" : mode === "preview" ? `a.status<>'archived' and ${compatible}` : `${visibleArt} and exists(select 1 from commerce_stores s where s.tenant_id=a.tenant_id and s.art_library_enabled)`}`,
      [tenantId, id],
    )
  ).rows[0];
  if (!row)
    throw new CommerceError("Arte não encontrada ou indisponível.", 404);
  return row;
}

async function verifyLinks(
  client: Client,
  tenantId: string,
  categoryId: string | null,
  campaignIds: string[],
  productIds: string[],
  artworkId: string,
) {
  if (
    categoryId &&
    !(
      await client.query(
        "select id from commerce_art_categories where tenant_id=$1 and id=$2",
        [tenantId, categoryId],
      )
    ).rowCount
  )
    throw new CommerceError("Categoria não encontrada nesta loja.");
  if (
    campaignIds.length !==
    (
      await client.query(
        "select id from commerce_art_campaigns where tenant_id=$1 and id=any($2::uuid[])",
        [tenantId, campaignIds],
      )
    ).rowCount
  )
    throw new CommerceError("Campanha não encontrada nesta loja.");
  const products = await commerceProducts(tenantId, client);
  const existing = (
    await client.query<{ product_id: string }>(
      "select product_id from commerce_library_products where tenant_id=$1 and artwork_id=$2",
      [tenantId, artworkId],
    )
  ).rows;
  if (
    productIds.some(
      (id) =>
        !existing.some((binding) => binding.product_id === id) &&
        !products.some(
          (product) =>
            product.id === id && product.personalized && product.geometry,
        ),
    )
  )
    throw new CommerceError(
      "Vincule somente produtos personalizados publicados e com geometria configurada.",
    );
}
export async function saveLibraryLinks(
  client: Client,
  tenantId: string,
  id: string,
  categoryId: string | null,
  campaignIds: string[],
  productIds: string[],
) {
  await verifyLinks(client, tenantId, categoryId, campaignIds, productIds, id);
  await client.query(
    "delete from commerce_library_campaign_artworks where tenant_id=$1 and artwork_id=$2",
    [tenantId, id],
  );
  await client.query(
    "insert into commerce_library_campaign_artworks(tenant_id,artwork_id,campaign_id) select $1,$2,unnest($3::uuid[])",
    [tenantId, id, campaignIds],
  );
  await client.query(
    "delete from commerce_library_products where tenant_id=$1 and artwork_id=$2 and not(product_id=any($3::uuid[]))",
    [tenantId, id, productIds],
  );
  await client.query(
    "insert into commerce_library_products(tenant_id,artwork_id,product_id) select $1,$2,unnest($3::uuid[]) on conflict do nothing",
    [tenantId, id, productIds],
  );
}
export async function auditLibrary(
  client: Client,
  tenantId: string,
  userId: string,
  action: string,
  id: string,
  metadata: Record<string, unknown> = {},
) {
  await client.query(
    "insert into audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) values($1,$2,$3,'commerce_library',$4,$5)",
    [
      tenantId,
      userId,
      `commerce.library.${action}`,
      id,
      JSON.stringify(metadata),
    ],
  );
}

export async function mutateCommerceLibrary(
  tenantId: string,
  userId: string,
  input: LibraryCommand,
) {
  try {
    return await commerceTransaction(async (client) => {
      await lockLibrary(client, tenantId);
      if (
        !(
          await client.query(
            "select tenant_id from commerce_stores where tenant_id=$1",
            [tenantId],
          )
        ).rowCount
      )
        throw new CommerceError(
          "Salve a loja antes de organizar o acervo.",
          409,
        );
      let entityId = tenantId;
      if (input.action === "settings")
        await client.query(
          "update commerce_stores set art_library_enabled=$2 where tenant_id=$1",
          [tenantId, input.enabled],
        );
      else if (input.action === "starter") {
        for (const [name, slug] of [
          ["Conscientização", "conscientizacao"],
          ["Estampas e ilustrações", "estampas-ilustracoes"],
        ])
          await client.query(
            "insert into commerce_art_categories(tenant_id,name,slug) values($1,$2,$3) on conflict(tenant_id,slug) do nothing",
            [tenantId, name, slug],
          );
        const parent = (
          await client.query(
            "select id from commerce_art_categories where tenant_id=$1 and slug='conscientizacao'",
            [tenantId],
          )
        ).rows[0];
        const roots = (
          await client.query<LibraryCategory>(
            "select id,parent_id from commerce_art_categories where tenant_id=$1",
            [tenantId],
          )
        ).rows;
        assertCategoryParent(roots, null, parent.id);
        for (const [name, slug] of [
          ["Saúde", "saude"],
          ["Diversidade e inclusão", "diversidade-inclusao"],
        ])
          await client.query(
            "insert into commerce_art_categories(tenant_id,name,slug,parent_id) values($1,$2,$3,$4) on conflict(tenant_id,slug) do nothing",
            [tenantId, name, slug, parent.id],
          );
        for (const [name, slug] of [
          ["Setembro Amarelo", "setembro-amarelo"],
          ["Outubro Rosa", "outubro-rosa"],
          ["Novembro Azul", "novembro-azul"],
          ["Consciência Negra", "consciencia-negra"],
        ])
          await client.query(
            "insert into commerce_art_campaigns(tenant_id,name,slug) values($1,$2,$3) on conflict(tenant_id,slug) do nothing",
            [tenantId, name, slug],
          );
      } else if (input.action === "category.save") {
        const rows = (
          await client.query<LibraryCategory>(
            "select id,parent_id from commerce_art_categories where tenant_id=$1",
            [tenantId],
          )
        ).rows;
        assertCategoryParent(rows, input.id ?? null, input.parentId);
        if (!input.id && rows.length >= 200)
          throw new CommerceError("Limite de 200 categorias atingido.");
        const result = input.id
          ? await client.query(
              "update commerce_art_categories set name=$3,slug=$4,parent_id=$5,active=$6,revision=revision+1 where tenant_id=$1 and id=$2 and revision=$7 returning id",
              [
                tenantId,
                input.id,
                input.name,
                input.slug,
                input.parentId,
                input.active,
                input.revision,
              ],
            )
          : await client.query(
              "insert into commerce_art_categories(tenant_id,name,slug,parent_id,active) values($1,$2,$3,$4,$5) returning id",
              [tenantId, input.name, input.slug, input.parentId, input.active],
            );
        if (!result.rowCount)
          throw new CommerceError(
            "A categoria mudou. Atualize antes de salvar.",
            409,
          );
        entityId = result.rows[0].id;
      } else if (input.action === "campaign.save") {
        if (
          input.status === "published" &&
          (!input.id ||
            !(
              await client.query(
                `select a.id from commerce_library_campaign_artworks ca join commerce_library_artworks a on a.tenant_id=ca.tenant_id and a.id=ca.artwork_id where ca.tenant_id=$1 and ca.campaign_id=$2 and ${visibleArt} limit 1`,
                [tenantId, input.id],
              )
            ).rowCount)
        )
          throw new CommerceError(
            "Salve como rascunho e vincule pelo menos uma arte publicada com produto disponível antes de publicar a campanha.",
          );
        if (
          !input.id &&
          Number(
            (
              await client.query(
                "select count(*)::int as total from commerce_art_campaigns where tenant_id=$1",
                [tenantId],
              )
            ).rows[0].total,
          ) >= 200
        )
          throw new CommerceError("Limite de 200 campanhas atingido.");
        const values = [
          tenantId,
          input.name,
          input.slug,
          input.description,
          input.coverUrl,
          input.status,
          input.featured,
          input.startsAt,
          input.endsAt,
        ];
        const result = input.id
          ? await client.query(
              "update commerce_art_campaigns set name=$2,slug=$3,description=$4,cover_url=$5,status=$6,featured=$7,starts_at=$8,ends_at=$9,revision=revision+1 where tenant_id=$1 and id=$10 and revision=$11 returning id",
              [...values, input.id, input.revision],
            )
          : await client.query(
              "insert into commerce_art_campaigns(tenant_id,name,slug,description,cover_url,status,featured,starts_at,ends_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
              values,
            );
        if (!result.rowCount)
          throw new CommerceError(
            "A campanha mudou. Atualize antes de salvar.",
            409,
          );
        entityId = result.rows[0].id;
      } else if (input.action === "artwork.save") {
        await saveLibraryLinks(
          client,
          tenantId,
          input.id,
          input.categoryId,
          input.campaignIds,
          input.productIds,
        );
        const result = await client.query(
          "update commerce_library_artworks set title=$3,description=$4,tags=$5,category_id=$6,status=$7,editable=$8,license_note=$9,search_text=$10,revision=revision+1,updated_at=now() where tenant_id=$1 and id=$2 and revision=$11 returning id",
          [
            tenantId,
            input.id,
            input.title,
            input.description,
            input.tags,
            input.categoryId,
            input.status,
            input.editable,
            input.licenseNote,
            librarySearch(
              [input.title, input.description, ...input.tags].join(" "),
            ),
            input.revision,
          ],
        );
        if (!result.rowCount)
          throw new CommerceError(
            "A arte mudou. Atualize antes de salvar.",
            409,
          );
        entityId = input.id;
      } else if (input.action === "binding.save") {
        const product = (await commerceProducts(tenantId, client)).find(
          (p) => p.id === input.productId,
        );
        if (!product?.geometry)
          throw new CommerceError("Produto indisponível.", 404);
        const update = await client.query(
          "update commerce_library_artworks set revision=revision+1,updated_at=now() where tenant_id=$1 and id=$2 and revision=$3 returning id",
          [tenantId, input.artworkId, input.revision],
        );
        if (!update.rowCount)
          throw new CommerceError(
            "A arte mudou. Atualize antes de enquadrar.",
            409,
          );
        const binding = await client.query(
          "update commerce_library_products set initial_crop=$4 where tenant_id=$1 and artwork_id=$2 and product_id=$3 returning artwork_id",
          [
            tenantId,
            input.artworkId,
            input.productId,
            JSON.stringify({
              ...input.crop,
              geometryHash: geometryHash(product),
            }),
          ],
        );
        if (!binding.rowCount)
          throw new CommerceError("Vincule este produto à arte primeiro.", 409);
        entityId = input.artworkId;
      } else if (input.action === "delete") {
        const table =
          input.kind === "category"
            ? "commerce_art_categories"
            : "commerce_art_campaigns";
        const result = await client.query(
          `delete from ${table} where tenant_id=$1 and id=$2 and revision=$3 returning id`,
          [tenantId, input.id, input.revision],
        );
        if (!result.rowCount)
          throw new CommerceError(
            "O registro mudou. Atualize a listagem.",
            409,
          );
        entityId = input.id;
      } else if (input.action === "reorder") {
        const table =
          input.kind === "category"
            ? "commerce_art_categories"
            : "commerce_art_campaigns";
        const current = (
          await client.query(`select id from ${table} where tenant_id=$1`, [
            tenantId,
          ])
        ).rows;
        if (
          current.length !== input.ids.length ||
          current.some((row) => !input.ids.includes(row.id))
        )
          throw new CommerceError(
            "A lista mudou. Atualize antes de ordenar.",
            409,
          );
        await client.query(
          `update ${table} t set sort_order=items.position::int,revision=revision+1 from unnest($2::uuid[]) with ordinality items(id,position) where t.tenant_id=$1 and t.id=items.id`,
          [tenantId, input.ids],
        );
      }
      await auditLibrary(client, tenantId, userId, input.action, entityId);
      return { id: entityId };
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    if (code === "23505")
      throw new CommerceError(
        "Esse endereço já está em uso. Escolha outro identificador.",
        409,
      );
    if (code === "23503")
      throw new CommerceError(
        "Este registro possui vínculos. Remova-os ou arquive o conteúdo em vez de excluir.",
        409,
      );
    throw error;
  }
}

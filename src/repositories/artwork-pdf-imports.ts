import { withTenantContext, getPool } from "@/lib/db/client";
import type { PublicArtworkContext } from "@/repositories/public-artworks";
import { MAX_ARTWORKS_PER_ITEM } from "@/domain/artwork/pdf-import";

type PdfImportInput = {
  tenantId: string; quoteId: string; itemId: string; fileName: string; pageCount: number;
  fileSize: number; storagePath: string; userId: string | null; publicUpload: boolean;
};

export async function createArtworkPdfImport(input: PdfImportInput) {
  if (!input.userId) throw new Error("Usuário responsável não informado.");
  return withTenantContext(input.userId, input.tenantId, async (client) => {
    const item = await client.query("select id from quote_items where tenant_id = $1 and quote_id = $2 and id = $3 limit 1", [input.tenantId, input.quoteId, input.itemId]);
    if (!item.rows[0]) throw new Error("Item do orçamento não encontrado.");
    const result = await client.query<{ id: string }>(
      `insert into artwork_pdf_imports (tenant_id, quote_id, quote_item_id, original_file_name, page_count, file_size, storage_path, created_by, public_upload)
       values ($1, $2, $3, $4, $5, $6, $7, $8, false) returning id`,
      [input.tenantId, input.quoteId, input.itemId, input.fileName, input.pageCount, input.fileSize, input.storagePath, input.userId]
    );
    await client.query(`insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata) values ($1, $2, 'artworks.pdf_import.create', 'artwork_pdf_import', $3, $4)`, [input.tenantId, input.userId, result.rows[0].id, JSON.stringify({ quoteId: input.quoteId, itemId: input.itemId, pageCount: input.pageCount, fileName: input.fileName })]);
    return result.rows[0];
  });
}

export async function createPublicArtworkPdfImport(context: PublicArtworkContext, input: Omit<PdfImportInput, "tenantId" | "quoteId" | "itemId" | "userId" | "publicUpload">) {
  const client = await getPool().connect();
  try {
    const result = await client.query<{ id: string }>(
      `insert into artwork_pdf_imports (tenant_id, quote_id, quote_item_id, original_file_name, page_count, file_size, storage_path, created_by, public_upload)
       select $1, $2, $3, $4, $5, $6, $7, null, true
       where exists (select 1 from quotes q where q.id = $2 and q.tenant_id = $1 and q.public_token_hash = $8
         and q.public_token_expires_at > now() and q.public_link_revoked_at is null and q.status in ('draft', 'sent')) returning id`,
      [context.tenantId, context.quoteId, context.itemId, input.fileName, input.pageCount, input.fileSize, input.storagePath, context.tokenHash]
    );
    if (!result.rows[0]) throw new Error("Este orçamento não está mais disponível para alterações.");
    await recordPublicEvent(client, context, "artworks.public_pdf_import.create", result.rows[0].id, { pageCount: input.pageCount, fileName: input.fileName });
    return result.rows[0];
  } finally { client.release(); }
}

type PdfPageInput = {
  importId: string; pageNumber: number; artworkName: string; fileName: string; mimeType: string;
  fileSize: number; dataUrl: string; storagePath: string; productionQuantity: number;
};

export async function addArtworkPdfPage(userId: string, tenantId: string, quoteId: string, itemId: string, input: PdfPageInput) {
  return withTenantContext(userId, tenantId, async (client) => {
    const source = await lockImport(client, tenantId, quoteId, itemId, input.importId, false);
    await assertPageCapacity(client, tenantId, quoteId, itemId, input.importId, input.pageNumber, source.page_count, input.productionQuantity);
    const artwork = await insertPage(client, { tenantId, quoteId, itemId, userId, ...input });
    await client.query(`insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata) values ($1, $2, 'artworks.pdf_page.add', 'quote_item_artwork', $3, $4)`, [tenantId, userId, artwork.id, JSON.stringify({ importId: input.importId, pageNumber: input.pageNumber, productionQuantity: input.productionQuantity })]);
    return artwork;
  });
}

export async function addPublicArtworkPdfPage(context: PublicArtworkContext, input: PdfPageInput) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const available = await client.query("select id from quotes where id = $1 and tenant_id = $2 and public_token_hash = $3 and public_token_expires_at > now() and public_link_revoked_at is null and status in ('draft', 'sent') for update", [context.quoteId, context.tenantId, context.tokenHash]);
    if (!available.rows[0]) throw new Error("Este orçamento não está mais disponível para alterações.");
    const source = await lockImport(client, context.tenantId, context.quoteId, context.itemId, input.importId, true);
    await assertPageCapacity(client, context.tenantId, context.quoteId, context.itemId, input.importId, input.pageNumber, source.page_count, input.productionQuantity);
    const artwork = await insertPage(client, { tenantId: context.tenantId, quoteId: context.quoteId, itemId: context.itemId, userId: null, ...input });
    await recordPublicEvent(client, context, "artworks.public_pdf_page.add", artwork.id, { importId: input.importId, pageNumber: input.pageNumber, productionQuantity: input.productionQuantity });
    await client.query("commit");
    return artwork;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}

async function lockImport(client: import("pg").PoolClient, tenantId: string, quoteId: string, itemId: string, importId: string, publicUpload: boolean) {
  const result = await client.query<{ page_count: number }>(
    `select page_count from artwork_pdf_imports where tenant_id = $1 and quote_id = $2 and quote_item_id = $3 and id = $4 and public_upload = $5 for update`,
    [tenantId, quoteId, itemId, importId, publicUpload]
  );
  if (!result.rows[0]) throw new Error("Lote de PDF não encontrado.");
  return result.rows[0];
}

async function assertPageCapacity(client: import("pg").PoolClient, tenantId: string, quoteId: string, itemId: string, importId: string, pageNumber: number, sourcePages: number, productionQuantity: number) {
  if (pageNumber < 1 || pageNumber > sourcePages) throw new Error("Página inválida para este PDF.");
  const [count, allocation] = await Promise.all([
    client.query<{ count: number }>("select count(*)::int as count from quote_item_artworks where tenant_id = $1 and quote_id = $2 and quote_item_id = $3", [tenantId, quoteId, itemId]),
    client.query<{ item_quantity: number; allocated: number }>(
      `select qi.quantity as item_quantity,
              coalesce(sum(a.production_quantity) filter (where a.source_pdf_import_id = $4), 0)::int as allocated
       from quote_items qi
       left join quote_item_artworks a on a.quote_item_id = qi.id and a.tenant_id = qi.tenant_id
       where qi.tenant_id = $1 and qi.quote_id = $2 and qi.id = $3
       group by qi.quantity`, [tenantId, quoteId, itemId, importId]
    )
  ]);
  if ((count.rows[0]?.count ?? 0) >= MAX_ARTWORKS_PER_ITEM) throw new Error(`Cada item pode ter no máximo ${MAX_ARTWORKS_PER_ITEM} artes.`);
  const distribution = allocation.rows[0];
  if (!distribution || distribution.allocated + productionQuantity > distribution.item_quantity) throw new Error("A soma das cópias importadas ultrapassa a quantidade do item.");
}

async function insertPage(client: import("pg").PoolClient, input: PdfPageInput & { tenantId: string; quoteId: string; itemId: string; userId: string | null }) {
  const result = await client.query<{ id: string }>(
    `insert into quote_item_artworks (tenant_id, quote_id, quote_item_id, artwork_name, file_name, mime_type, file_size, data_url, storage_path, created_by, source_kind, source_pdf_import_id, source_pdf_page, production_quantity)
     values ($1, $2, $3, $4, $5, $6, $7, null, $8, $9, 'pdf_page', $10, $11, $12) returning id`,
    [input.tenantId, input.quoteId, input.itemId, input.artworkName, input.fileName, input.mimeType, input.fileSize, input.storagePath, input.userId, input.importId, input.pageNumber, input.productionQuantity]
  );
  return result.rows[0];
}

async function recordPublicEvent(client: import("pg").PoolClient, context: PublicArtworkContext, action: string, entityId: string, metadata: Record<string, unknown>) {
  await client.query(`insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata) values ($1, null, $2, 'quote_item_artwork', $3, $4)`, [context.tenantId, action, entityId, JSON.stringify({ quoteId: context.quoteId, itemId: context.itemId, publicLink: true, ...metadata })]);
}

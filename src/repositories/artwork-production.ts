import { withTenantContext } from "@/lib/db/client";
import { ARTWORK_AI_GENERATION_LIMIT } from "@/domain/artwork/ai-generation-limit";
import {
  DEFAULT_ARTWORK_PROFILE,
  type ArtworkProductionProfile,
  type PreparedArtwork
} from "@/services/artwork/production";

export type ArtworkProductionRow = {
  id: string;
  quote_item_id: string;
  artwork_name: string | null;
  file_name: string;
  data_url: string | null;
  storage_path: string | null;
  prepared_data_url: string | null;
  prepared_storage_path: string | null;
  target_diameter_mm: string | null;
  bleed_mm: string | null;
  safe_margin_mm: string | null;
  dpi: number | null;
  quality_status: "pending" | "warning" | "ready";
  approval_status: "pending" | "approved" | "rejected";
  preparation_notes: string | null;
  source_kind: "upload" | "openrouter";
  ai_prompt: string | null;
  approved_at: string | null;
  prepared_at: string | null;
  production_quantity: number | null;
  crop_scale: string;
  crop_offset_x: string;
  crop_offset_y: string;
  rotation_degrees: string;
  quantity: number;
  item_description: string;
  variant_print_diameter_mm: string | null;
  width_cm: string | null;
  length_cm: string | null;
};

export async function getArtworkProductionProfile(userId: string, tenantId: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<{
      page_width_mm: string; page_height_mm: string; margin_mm: string; bleed_mm: string;
      safe_margin_mm: string; gap_mm: string; dpi: number;
      layout_mode: ArtworkProductionProfile["layoutMode"]; draw_cut_lines: boolean;
    }>("select * from artwork_production_profiles where tenant_id = $1 limit 1", [tenantId]);
    return mapProfile(result.rows[0]);
  });
}

export async function saveArtworkProductionProfile(
  userId: string,
  tenantId: string,
  profile: ArtworkProductionProfile
) {
  return withTenantContext(userId, tenantId, async (client) => {
    await client.query(
      `
        insert into artwork_production_profiles (
          tenant_id, page_width_mm, page_height_mm, margin_mm, bleed_mm,
          safe_margin_mm, gap_mm, dpi, layout_mode, draw_cut_lines
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        on conflict (tenant_id) do update set
          page_width_mm = excluded.page_width_mm,
          page_height_mm = excluded.page_height_mm,
          margin_mm = excluded.margin_mm,
          bleed_mm = excluded.bleed_mm,
          safe_margin_mm = excluded.safe_margin_mm,
          gap_mm = excluded.gap_mm,
          dpi = excluded.dpi,
          layout_mode = excluded.layout_mode,
          draw_cut_lines = excluded.draw_cut_lines,
          updated_at = now()
      `,
      [tenantId, profile.pageWidthMm, profile.pageHeightMm, profile.marginMm, profile.bleedMm, profile.safeMarginMm, profile.gapMm, profile.dpi, profile.layoutMode, profile.drawCutLines]
    );
    await client.query(
      `insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
       values ($1, $2, 'artwork_profile.update', 'tenant', $1, $3)`,
      [tenantId, userId, JSON.stringify(profile)]
    );
    return profile;
  });
}

export async function getArtworkProductionData(userId: string, tenantId: string, quoteId: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const quote = await client.query<{ id: string; status: string }>(
      "select id, status from quotes where tenant_id = $1 and id = $2 limit 1",
      [tenantId, quoteId]
    );
    if (!quote.rows[0]) return null;

    const items = await client.query<{ id: string; description: string; quantity: number }>(
      "select id, description, quantity from quote_items where tenant_id = $1 and quote_id = $2 order by created_at",
      [tenantId, quoteId]
    );

    const profileResult = await client.query<{
      page_width_mm: string;
      page_height_mm: string;
      margin_mm: string;
      bleed_mm: string;
      safe_margin_mm: string;
      gap_mm: string;
      dpi: number;
      layout_mode: ArtworkProductionProfile["layoutMode"];
      draw_cut_lines: boolean;
    }>("select * from artwork_production_profiles where tenant_id = $1 limit 1", [tenantId]);

    const artworks = await client.query<ArtworkProductionRow>(
      `
        select
          a.id,
          a.quote_item_id,
          a.artwork_name,
          a.file_name,
          a.data_url,
          a.storage_path,
          a.prepared_data_url,
          a.prepared_storage_path,
          a.target_diameter_mm,
          a.bleed_mm,
          a.safe_margin_mm,
          a.dpi,
          a.quality_status,
          a.approval_status,
          a.preparation_notes,
          a.source_kind,
          a.ai_prompt,
          a.approved_at::text,
          a.prepared_at::text,
          a.production_quantity,
          a.crop_scale,
          a.crop_offset_x,
          a.crop_offset_y,
          a.rotation_degrees,
          qi.quantity,
          qi.description as item_description,
          to_jsonb(pv)->>'print_diameter_mm' as variant_print_diameter_mm,
          pv.width_cm,
          pv.length_cm
        from quote_item_artworks a
        join quote_items qi on qi.id = a.quote_item_id and qi.tenant_id = a.tenant_id
        left join product_variants pv on pv.id = qi.product_variant_id and pv.tenant_id = qi.tenant_id
        where a.tenant_id = $1 and a.quote_id = $2
        order by qi.created_at, a.created_at
      `,
      [tenantId, quoteId]
    );

    const printJobs = await client.query<{
      id: string; status: "generated" | "printed" | "cancelled"; page_count: number;
      copy_count: number; storage_path: string | null; created_at: string; printed_at: string | null;
    }>(
      `select id, status, page_count, copy_count, storage_path, created_at::text, printed_at::text
       from artwork_print_jobs where tenant_id = $1 and quote_id = $2 order by created_at desc limit 20`,
      [tenantId, quoteId]
    );

    return { quote: quote.rows[0], items: items.rows, profile: mapProfile(profileResult.rows[0]), artworks: artworks.rows, printJobs: printJobs.rows };
  });
}

export async function getArtworkPreparationSource(
  userId: string,
  tenantId: string,
  quoteId: string,
  itemId: string,
  artworkId: string
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<ArtworkProductionRow>(
      `
        select a.*, qi.quantity, qi.description as item_description,
          to_jsonb(pv)->>'print_diameter_mm' as variant_print_diameter_mm,
          pv.width_cm, pv.length_cm
        from quote_item_artworks a
        join quote_items qi on qi.id = a.quote_item_id and qi.tenant_id = a.tenant_id
        join quotes q on q.id = a.quote_id and q.tenant_id = a.tenant_id
        left join product_variants pv on pv.id = qi.product_variant_id and pv.tenant_id = qi.tenant_id
        where a.tenant_id = $1 and a.quote_id = $2 and a.quote_item_id = $3 and a.id = $4
        limit 1
      `,
      [tenantId, quoteId, itemId, artworkId]
    );
    return result.rows[0] ?? null;
  });
}

export async function savePreparedArtwork(input: {
  userId: string;
  tenantId: string;
  quoteId: string;
  itemId: string;
  artworkId: string;
  diameterMm: number;
  profile: ArtworkProductionProfile;
  prepared: PreparedArtwork;
  preparedDataUrl: string | null;
  preparedStoragePath: string | null;
  crop: { scale: number; offsetX: number; offsetY: number; rotationDegrees: number };
}) {
  return withTenantContext(input.userId, input.tenantId, async (client) => {
    await assertInternalArtworkEditingAllowed(client, input.tenantId, input.quoteId, input.itemId);
    const result = await client.query<ArtworkProductionRow>(
      `
        update quote_item_artworks
        set original_width_px = $5,
            original_height_px = $6,
            target_diameter_mm = $7,
            bleed_mm = $8,
            safe_margin_mm = $9,
            dpi = $10,
            prepared_data_url = $11,
            prepared_storage_path = $12,
            prepared_file_name = regexp_replace(file_name, '\\.[^.]+$', '') || '-producao.png',
            prepared_width_px = $13,
            prepared_height_px = $14,
            quality_status = $15,
            approval_status = 'pending',
            preparation_notes = $16,
            crop_scale = $17,
            crop_offset_x = $18,
            crop_offset_y = $19,
            rotation_degrees = $20,
            prepared_at = now(),
            approved_at = null,
            approved_by = null,
            version = version + 1
        where tenant_id = $1 and quote_id = $2 and quote_item_id = $3 and id = $4
        returning *
      `,
      [
        input.tenantId,
        input.quoteId,
        input.itemId,
        input.artworkId,
        input.prepared.originalWidthPx,
        input.prepared.originalHeightPx,
        input.diameterMm,
        input.profile.bleedMm,
        input.profile.safeMarginMm,
        input.profile.dpi,
        input.preparedDataUrl,
        input.preparedStoragePath,
        input.prepared.widthPx,
        input.prepared.heightPx,
        input.prepared.qualityStatus,
        input.prepared.notes,
        input.crop.scale,
        input.crop.offsetX,
        input.crop.offsetY,
        input.crop.rotationDegrees
      ]
    );
    if (!result.rows[0]) throw new Error("Arte não encontrada.");
    await client.query(
      `insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
       values ($1, $2, 'artworks.prepare', 'quote_item_artwork', $3, $4)`,
      [input.tenantId, input.userId, input.artworkId, JSON.stringify({ quoteId: input.quoteId, diameterMm: input.diameterMm, qualityStatus: input.prepared.qualityStatus })]
    );
    return result.rows[0];
  });
}

export async function setArtworkApproval(input: {
  userId: string;
  tenantId: string;
  quoteId: string;
  itemId: string;
  artworkId: string;
  status: "approved" | "rejected";
  productionQuantity?: number | null;
}) {
  return withTenantContext(input.userId, input.tenantId, async (client) => {
    await assertInternalArtworkEditingAllowed(client, input.tenantId, input.quoteId, input.itemId);
    const result = await client.query<{ id: string }>(
      `
        update quote_item_artworks
        set approval_status = $6,
            production_quantity = case when $6 = 'approved' then $7 else production_quantity end,
            approved_by = case when $6 = 'approved' then $5::uuid else null end,
            approved_at = case when $6 = 'approved' then now() else null end
        where tenant_id = $1 and quote_id = $2 and quote_item_id = $3 and id = $4
          and (prepared_data_url is not null or prepared_storage_path is not null)
        returning id
      `,
      [input.tenantId, input.quoteId, input.itemId, input.artworkId, input.userId, input.status, input.productionQuantity ?? null]
    );
    if (!result.rows[0]) throw new Error("Prepare a arte antes de aprová-la.");
    await client.query(
      `insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
       values ($1, $2, 'artworks.approval', 'quote_item_artwork', $3, $4)`,
      [input.tenantId, input.userId, input.artworkId, JSON.stringify({ quoteId: input.quoteId, status: input.status })]
    );
    return result.rows[0];
  });
}

async function assertInternalArtworkEditingAllowed(client: import("pg").PoolClient, tenantId: string, quoteId: string, itemId: string) {
  const result = await client.query<{
    status: string; public_accepted_at: string | null; edit_reopened_at: string | null;
    edit_relocked_at: string | null; external_olist_invoice_id: string | null;
  }>(
    `select q.status, to_jsonb(q)->>'public_accepted_at' as public_accepted_at,
            to_jsonb(q)->>'edit_reopened_at' as edit_reopened_at,
            to_jsonb(q)->>'edit_relocked_at' as edit_relocked_at,
            to_jsonb(q)->>'external_olist_invoice_id' as external_olist_invoice_id
     from quotes q join quote_items qi on qi.quote_id = q.id and qi.tenant_id = q.tenant_id
     where q.tenant_id = $1 and q.id = $2 and qi.id = $3 for update of q, qi`,
    [tenantId, quoteId, itemId]
  );
  const quote = result.rows[0];
  if (!quote) throw new Error("Item do orçamento não encontrado.");
  if (quote.external_olist_invoice_id) throw new Error("Orçamento com nota fiscal Olist não pode ser editado.");
  const reopened = Boolean(quote.edit_reopened_at) && (!quote.edit_relocked_at || new Date(quote.edit_reopened_at as string).getTime() > new Date(quote.edit_relocked_at).getTime());
  if ((quote.public_accepted_at || quote.status === "accepted") && !reopened) throw new Error("Orçamento aceito pelo cliente está fechado para edição.");
}

export async function recordArtworkPrintJob(input: {
  userId: string;
  tenantId: string;
  quoteId: string;
  pageCount: number;
  copyCount: number;
  profile: ArtworkProductionProfile;
  artworks: Array<{ id: string; quantity: number; diameterMm: number }>;
  storagePath: string | null;
}) {
  return withTenantContext(input.userId, input.tenantId, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into artwork_print_jobs (
         tenant_id, quote_id, page_count, copy_count, profile_snapshot,
         artwork_snapshot, storage_path, created_by
       ) values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [input.tenantId, input.quoteId, input.pageCount, input.copyCount, JSON.stringify(input.profile), JSON.stringify(input.artworks), input.storagePath, input.userId]
    );
    await client.query(
      `insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
       values ($1, $2, 'artworks.print_pdf.generate', 'quote', $3, $4)`,
      [input.tenantId, input.userId, input.quoteId, JSON.stringify({ printJobId: result.rows[0].id, pageCount: input.pageCount, copyCount: input.copyCount })]
    );
    return result.rows[0];
  });
}

export async function markArtworkPrintJobPrinted(userId: string, tenantId: string, quoteId: string, jobId: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<{ id: string }>(
      `update artwork_print_jobs set status = 'printed', printed_at = now()
       where tenant_id = $1 and quote_id = $2 and id = $3 and status = 'generated' returning id`,
      [tenantId, quoteId, jobId]
    );
    if (!result.rows[0]) throw new Error("Lote de impressão não encontrado ou já concluído.");
    await client.query(
      `insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
       values ($1, $2, 'artworks.print_job.printed', 'quote', $3, $4)`,
      [tenantId, userId, quoteId, JSON.stringify({ printJobId: jobId })]
    );
    return result.rows[0];
  });
}

export async function listInlineQuoteArtworks(userId: string, tenantId: string, quoteId: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<{ id: string; quote_item_id: string; file_name: string; mime_type: string; data_url: string }>(
      `select id, quote_item_id, file_name, mime_type, data_url
       from quote_item_artworks
       where tenant_id = $1 and quote_id = $2 and data_url is not null`,
      [tenantId, quoteId]
    );
    return result.rows;
  });
}

export async function moveArtworkToStorage(userId: string, tenantId: string, artworkId: string, storagePath: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    await client.query(
      `update quote_item_artworks set storage_path = $3, data_url = null where tenant_id = $1 and id = $2`,
      [tenantId, artworkId, storagePath]
    );
  });
}

export async function markArtworkAsGenerated(input: {
  userId: string;
  tenantId: string;
  artworkId: string;
  referenceArtworkId?: string | null;
  prompt: string;
}) {
  return withTenantContext(input.userId, input.tenantId, async (client) => {
    await client.query(
      `update quote_item_artworks
       set source_kind = 'openrouter', ai_prompt = $4
       where tenant_id = $1 and id = $2 and created_by = $3`,
      [input.tenantId, input.artworkId, input.userId, input.prompt]
    );
    await client.query(
      `insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
       values ($1, $2, 'artwork.ai_generate', 'quote_item_artwork', $3, $4)`,
      [input.tenantId, input.userId, input.artworkId, JSON.stringify({
        referenceArtworkId: input.referenceArtworkId ?? null,
        hasReference: Boolean(input.referenceArtworkId),
        promptLength: input.prompt.length
      })]
    );
  });
}

export async function reserveArtworkAiGenerationAttempt(input: {
  userId: string;
  tenantId: string;
  quoteId: string;
  itemId: string;
}) {
  return withTenantContext(input.userId, input.tenantId, async (client) => {
    await assertInternalArtworkEditingAllowed(client, input.tenantId, input.quoteId, input.itemId);
    const result = await client.query<{ artwork_ai_attempts: number }>(
      `update quote_items
       set artwork_ai_attempts = artwork_ai_attempts + 1
       where tenant_id = $1 and quote_id = $2 and id = $3 and artwork_ai_attempts < $4
       returning artwork_ai_attempts`,
      [input.tenantId, input.quoteId, input.itemId, ARTWORK_AI_GENERATION_LIMIT]
    );
    const attemptsUsed = result.rows[0]?.artwork_ai_attempts;
    if (!attemptsUsed) return null;
    const attemptsRemaining = ARTWORK_AI_GENERATION_LIMIT - attemptsUsed;
    await client.query(
      `insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
       values ($1, $2, 'artworks.ai_attempt_reserved', 'quote_item', $3, $4)`,
      [input.tenantId, input.userId, input.itemId, JSON.stringify({ quoteId: input.quoteId, attemptsUsed, attemptsRemaining })]
    );
    return { attemptsUsed, attemptsRemaining };
  });
}

export function resolveArtworkDiameterMm(row: Pick<ArtworkProductionRow, "target_diameter_mm" | "variant_print_diameter_mm" | "width_cm" | "length_cm">) {
  const candidates = [row.target_diameter_mm, row.variant_print_diameter_mm]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (candidates[0]) return candidates[0];
  const packageDimensionCm = Math.max(Number(row.width_cm || 0), Number(row.length_cm || 0));
  return packageDimensionCm > 0 ? packageDimensionCm * 10 : null;
}

function mapProfile(row: {
  page_width_mm: string;
  page_height_mm: string;
  margin_mm: string;
  bleed_mm: string;
  safe_margin_mm: string;
  gap_mm: string;
  dpi: number;
  layout_mode: ArtworkProductionProfile["layoutMode"];
  draw_cut_lines: boolean;
} | undefined): ArtworkProductionProfile {
  if (!row) return DEFAULT_ARTWORK_PROFILE;
  return {
    pageWidthMm: Number(row.page_width_mm),
    pageHeightMm: Number(row.page_height_mm),
    marginMm: Number(row.margin_mm),
    bleedMm: Number(row.bleed_mm),
    safeMarginMm: Number(row.safe_margin_mm),
    gapMm: Number(row.gap_mm),
    dpi: row.dpi,
    layoutMode: row.layout_mode,
    drawCutLines: row.draw_cut_lines
  };
}

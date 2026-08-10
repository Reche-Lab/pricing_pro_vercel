import { createHash } from "crypto";
import { getArtworkAiAttemptsRemaining, normalizeArtworkAiGenerationLimit } from "@/domain/artwork/ai-generation-limit";
import { getPool } from "@/lib/db/client";
import { DEFAULT_ARTWORK_PROFILE, type ArtworkProductionProfile, type PreparedArtwork } from "@/services/artwork/production";

export type PublicArtworkContext = {
  quoteId: string;
  tenantId: string;
  tokenHash: string;
  itemId: string;
  itemDescription: string;
  itemQuantity: number;
  diameterMm: number | null;
  artworkCount: number;
  aiAttempts: number;
  aiGenerationLimit: number;
  profile: ArtworkProductionProfile;
  artwork: {
    id: string;
    data_url: string | null;
    storage_path: string | null;
    target_diameter_mm: string | null;
  } | null;
};

export async function getPublicArtworkContext(token: string, itemId: string, artworkId?: string | null) {
  const client = await getPool().connect();
  try {
    const result = await client.query<{
      quote_id: string; tenant_id: string; item_id: string; description: string; quantity: number;
      print_diameter_mm: string | null; width_cm: string | null; length_cm: string | null; artwork_count: number; artwork_ai_attempts: number; artwork_ai_generation_limit: number;
    }>(
      `select q.id as quote_id, q.tenant_id, qi.id as item_id, qi.description, qi.quantity,
              to_jsonb(pv)->>'print_diameter_mm' as print_diameter_mm, pv.width_cm, pv.length_cm,
              (select count(*)::int from quote_item_artworks count_art
               where count_art.quote_id = q.id and count_art.quote_item_id = qi.id) as artwork_count,
              coalesce((to_jsonb(qi)->>'artwork_ai_attempts')::integer, 0) as artwork_ai_attempts,
              coalesce((to_jsonb(t)->>'artwork_ai_generation_limit')::integer, 3) as artwork_ai_generation_limit
       from quotes q
       join quote_items qi on qi.quote_id = q.id and qi.tenant_id = q.tenant_id
       join tenants t on t.id = q.tenant_id
       left join product_variants pv on pv.id = qi.product_variant_id and pv.tenant_id = q.tenant_id
       where q.public_token_hash = $1 and q.public_token_expires_at > now()
         and q.status in ('draft', 'sent') and qi.id = $2
       limit 1`,
      [hashToken(token), itemId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const [profileResult, artworkResult] = await Promise.all([
      client.query<{
        page_width_mm: string; page_height_mm: string; margin_mm: string; bleed_mm: string;
        safe_margin_mm: string; gap_mm: string; dpi: number;
        layout_mode: ArtworkProductionProfile["layoutMode"]; draw_cut_lines: boolean;
      }>("select * from artwork_production_profiles where tenant_id = $1 limit 1", [row.tenant_id]),
      artworkId
        ? client.query<{ id: string; data_url: string | null; storage_path: string | null; target_diameter_mm: string | null }>(
            `select id, data_url, storage_path, target_diameter_mm
             from quote_item_artworks
             where tenant_id = $1 and quote_id = $2 and quote_item_id = $3 and id = $4 limit 1`,
            [row.tenant_id, row.quote_id, row.item_id, artworkId]
          )
        : Promise.resolve({ rows: [] })
    ]);
    if (artworkId && !artworkResult.rows[0]) return null;
    const explicitDiameter = Number(artworkResult.rows[0]?.target_diameter_mm || row.print_diameter_mm || 0);
    const packageDiameter = Math.max(Number(row.width_cm || 0), Number(row.length_cm || 0)) * 10;
    return {
      quoteId: row.quote_id,
      tenantId: row.tenant_id,
      tokenHash: hashToken(token),
      itemId: row.item_id,
      itemDescription: row.description,
      itemQuantity: row.quantity,
      diameterMm: explicitDiameter > 0 ? explicitDiameter : packageDiameter > 0 ? packageDiameter : null,
      artworkCount: row.artwork_count,
      aiAttempts: row.artwork_ai_attempts,
      aiGenerationLimit: normalizeArtworkAiGenerationLimit(row.artwork_ai_generation_limit),
      profile: mapProfile(profileResult.rows[0]),
      artwork: artworkResult.rows[0] ?? null
    } satisfies PublicArtworkContext;
  } finally {
    client.release();
  }
}

export async function reservePublicArtworkAiAttempt(context: PublicArtworkContext) {
  const client = await getPool().connect();
  try {
    const limit = normalizeArtworkAiGenerationLimit(context.aiGenerationLimit);
    const result = await client.query<{ artwork_ai_attempts: number }>(
      `update quote_items qi
       set artwork_ai_attempts = qi.artwork_ai_attempts + 1
       from quotes q
       where qi.tenant_id = $1 and qi.quote_id = $2 and qi.id = $3
         and qi.artwork_ai_attempts < $5
         and q.id = qi.quote_id and q.tenant_id = qi.tenant_id
         and q.public_token_hash = $4 and q.public_token_expires_at > now()
         and q.status in ('draft', 'sent')
       returning qi.artwork_ai_attempts`,
      [context.tenantId, context.quoteId, context.itemId, context.tokenHash, limit]
    );
    const current = result.rows[0] ?? (await client.query<{ artwork_ai_attempts: number }>(
      "select artwork_ai_attempts from quote_items where tenant_id = $1 and quote_id = $2 and id = $3 limit 1",
      [context.tenantId, context.quoteId, context.itemId]
    )).rows[0];
    const attemptsUsed = current?.artwork_ai_attempts ?? 0;
    const attemptsRemaining = getArtworkAiAttemptsRemaining(attemptsUsed, limit);
    if (!result.rows[0]) return { reserved: false, limit, attemptsUsed, attemptsRemaining };
    await recordPublicEvent(client, context, "artworks.public_ai_attempt_reserved", context.itemId, { limit, attemptsUsed, attemptsRemaining });
    return { reserved: true, limit, attemptsUsed, attemptsRemaining };
  } finally {
    client.release();
  }
}

export async function addPublicArtwork(input: {
  context: PublicArtworkContext;
  artworkName: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string;
  storagePath: string | null;
}) {
  if (input.context.artworkCount >= 10) throw new Error("Cada item pode ter no máximo 10 versões de arte.");
  const client = await getPool().connect();
  try {
    const result = await client.query<{ id: string }>(
      `insert into quote_item_artworks (
         tenant_id, quote_id, quote_item_id, artwork_name, file_name, mime_type,
         file_size, data_url, storage_path, created_by
       ) select $1, $2, $3, $4, $5, $6, $7, $8, $9, null
       where exists (
         select 1 from quotes q where q.id = $2 and q.tenant_id = $1
           and q.public_token_hash = $10 and q.public_token_expires_at > now()
           and q.status in ('draft', 'sent')
       )
       returning id`,
      [input.context.tenantId, input.context.quoteId, input.context.itemId, input.artworkName,
        input.fileName, input.mimeType, input.fileSize, input.storagePath ? null : input.dataUrl, input.storagePath, input.context.tokenHash]
    );
    if (!result.rows[0]) throw new Error("Este orçamento não está mais disponível para alterações.");
    await recordPublicEvent(client, input.context, "artworks.public_upload", result.rows[0].id, { mimeType: input.mimeType, fileSize: input.fileSize });
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function savePublicPreparedArtwork(input: {
  context: PublicArtworkContext;
  artworkId: string;
  diameterMm: number;
  prepared: PreparedArtwork;
  preparedDataUrl: string | null;
  preparedStoragePath: string | null;
  crop: { scale: number; offsetX: number; offsetY: number; rotationDegrees: number };
}) {
  const client = await getPool().connect();
  try {
    const result = await client.query<{ id: string }>(
      `update quote_item_artworks
       set original_width_px = $5, original_height_px = $6, target_diameter_mm = $7,
           bleed_mm = $8, safe_margin_mm = $9, dpi = $10, prepared_data_url = $11,
           prepared_storage_path = $12,
           prepared_file_name = regexp_replace(file_name, '\\.[^.]+$', '') || '-producao.png',
           prepared_width_px = $13, prepared_height_px = $14, quality_status = $15,
           approval_status = 'pending', preparation_notes = $16, crop_scale = $17,
           crop_offset_x = $18, crop_offset_y = $19, rotation_degrees = $20,
           prepared_at = now(), approved_at = null, approved_by = null, version = version + 1
       where tenant_id = $1 and quote_id = $2 and quote_item_id = $3 and id = $4
         and exists (
           select 1 from quotes q where q.id = $2 and q.tenant_id = $1
             and q.public_token_hash = $21 and q.public_token_expires_at > now()
             and q.status in ('draft', 'sent')
         )
       returning id`,
      [input.context.tenantId, input.context.quoteId, input.context.itemId, input.artworkId,
        input.prepared.originalWidthPx, input.prepared.originalHeightPx, input.diameterMm,
        input.context.profile.bleedMm, input.context.profile.safeMarginMm, input.context.profile.dpi,
        input.preparedDataUrl, input.preparedStoragePath, input.prepared.widthPx, input.prepared.heightPx,
        input.prepared.qualityStatus, input.prepared.notes, input.crop.scale, input.crop.offsetX,
        input.crop.offsetY, input.crop.rotationDegrees, input.context.tokenHash]
    );
    if (!result.rows[0]) throw new Error("Arte não encontrada.");
    await recordPublicEvent(client, input.context, "artworks.public_prepare", input.artworkId, { diameterMm: input.diameterMm, qualityStatus: input.prepared.qualityStatus });
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function selectPublicArtwork(context: PublicArtworkContext, artworkId: string) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const available = await client.query(
      `select id from quotes where id = $1 and tenant_id = $2 and public_token_hash = $3
       and public_token_expires_at > now() and status in ('draft', 'sent') for update`,
      [context.quoteId, context.tenantId, context.tokenHash]
    );
    if (!available.rows[0]) throw new Error("Este orçamento não está mais disponível para alterações.");
    await client.query(
      `update quote_item_artworks set approval_status = 'rejected', approved_at = null, approved_by = null
       where tenant_id = $1 and quote_id = $2 and quote_item_id = $3 and id <> $4`,
      [context.tenantId, context.quoteId, context.itemId, artworkId]
    );
    const result = await client.query<{ id: string }>(
      `update quote_item_artworks
       set approval_status = 'approved', approved_at = now(), approved_by = null, production_quantity = $5
       where tenant_id = $1 and quote_id = $2 and quote_item_id = $3 and id = $4
         and (prepared_data_url is not null or prepared_storage_path is not null)
       returning id`,
      [context.tenantId, context.quoteId, context.itemId, artworkId, context.itemQuantity]
    );
    if (!result.rows[0]) throw new Error("Reenquadre e prepare esta arte antes de aprová-la.");
    await recordPublicEvent(client, context, "artworks.public_approval", artworkId, { status: "approved", quantity: context.itemQuantity });
    await client.query("commit");
    return result.rows[0];
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function markPublicArtworkAsGenerated(context: PublicArtworkContext, artworkId: string, prompt: string, referenceArtworkId?: string | null) {
  const client = await getPool().connect();
  try {
    await client.query(
      `update quote_item_artworks set source_kind = 'openrouter', ai_prompt = $4
       where tenant_id = $1 and quote_id = $2 and id = $3`,
      [context.tenantId, context.quoteId, artworkId, prompt]
    );
    await recordPublicEvent(client, context, "artworks.public_ai_generate", artworkId, {
      referenceArtworkId: referenceArtworkId ?? null,
      hasReference: Boolean(referenceArtworkId),
      promptLength: prompt.length
    });
  } finally {
    client.release();
  }
}

async function recordPublicEvent(client: import("pg").PoolClient, context: PublicArtworkContext, action: string, artworkId: string, metadata: Record<string, unknown>) {
  await client.query(
    `insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, null, $2, 'quote_item_artwork', $3, $4)`,
    [context.tenantId, action, artworkId, JSON.stringify({ quoteId: context.quoteId, itemId: context.itemId, publicLink: true, ...metadata })]
  );
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function mapProfile(row: {
  page_width_mm: string; page_height_mm: string; margin_mm: string; bleed_mm: string;
  safe_margin_mm: string; gap_mm: string; dpi: number;
  layout_mode: ArtworkProductionProfile["layoutMode"]; draw_cut_lines: boolean;
} | undefined): ArtworkProductionProfile {
  if (!row) return DEFAULT_ARTWORK_PROFILE;
  return {
    pageWidthMm: Number(row.page_width_mm), pageHeightMm: Number(row.page_height_mm),
    marginMm: Number(row.margin_mm), bleedMm: Number(row.bleed_mm), safeMarginMm: Number(row.safe_margin_mm),
    gapMm: Number(row.gap_mm), dpi: row.dpi, layoutMode: row.layout_mode, drawCutLines: row.draw_cut_lines
  };
}

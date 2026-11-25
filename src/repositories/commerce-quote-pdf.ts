import { getPool } from "@/lib/db/client";
import { matchesOrderGeometryHash, type CommerceProduct } from "./commerce";
import type { QuoteItemArtworkRow, QuoteItemRow } from "./quotes";

/** Resolve private artwork references through the saved quote's owner and session. */
export async function buyerQuotePdfVisuals(tenantId: string, customerId: string, quoteId: string): Promise<Map<string, Partial<QuoteItemRow>>> {
  const result = await getPool().query<{
    item_id: string; preparation: string | null; product: CommerceProduct | null;
    artwork_id: string | null; storage_path: string | null; prepared_path: string | null; file_name: string | null;
    crop: { geometryHash?: string } | null; approved_at: string | null;
  }>(`select line->>'id' as item_id,line->>'preparation' as preparation,cp.snapshot as product,
      a.id as artwork_id,a.storage_path,a.prepared_path,a.file_name,a.crop,a.approved_at::text
    from commerce_buyer_quotes q cross join lateral jsonb_array_elements(q.snapshot->'lines') line
    left join commerce_products cp on cp.tenant_id=q.tenant_id and cp.id::text=line->>'productId'
    left join commerce_artworks a on a.tenant_id=q.tenant_id and a.session_id=q.session_id
      and a.id::text=line->>'artworkId' and a.product_id::text=line->>'productId'
    where q.tenant_id=$1 and q.customer_id=$2 and q.id=$3`, [tenantId, customerId, quoteId]);
  return new Map(result.rows.map(row => {
    const p = row.product, g = p?.geometry, m = p?.margins;
    const approved = row.preparation !== "team" && row.approved_at && row.prepared_path && p?.geometry && p.margins && matchesOrderGeometryHash(p, row.crop?.geometryHash);
    const geometry = { print_shape: g?.shape, print_width_mm: g ? String(g.widthMm) : null, print_height_mm: g ? String(g.heightMm) : null,
      print_corner_radius_mm: g ? String(g.cornerRadiusMm) : null, print_corner_style: g?.cornerStyle,
      print_shape_rotation_degrees: g ? String(g.rotationDegrees) : null, print_bleed_mm: m ? String(m.bleedMm) : null, print_safe_margin_mm: m ? String(m.safeMarginMm) : null };
    const artworks: QuoteItemArtworkRow[] = row.artwork_id ? [{ id: row.artwork_id, quote_item_id: row.item_id, artwork_name: null,
      file_name: row.file_name || "arte.png", mime_type: "image/png", file_size: 0, data_url: null, storage_path: row.storage_path,
      prepared_storage_path: row.prepared_path, approval_status: approved ? "approved" : "pending", is_active: true,
    }] : [];
    return [row.item_id, { ...geometry, product_image_url: p?.imageUrl, product_mockup: p?.artworkOptions?.mockup, artworks }];
  }));
}

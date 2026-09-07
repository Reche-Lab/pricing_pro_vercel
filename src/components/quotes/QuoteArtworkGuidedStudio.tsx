"use client";
import React, { useState } from "react";
import type { QuoteItemArtworkRow, QuoteItemRow } from "@/repositories/quotes";
import {
  resolvePrintGeometry,
  resolvePrintMargins,
} from "@/domain/artwork/geometry";
import { ArtworkGuidedStudio } from "./ArtworkGuidedStudio";
import type {
  ArtworkStudioAsset,
  ArtworkStudioStep,
} from "./artwork-studio-types";

export function QuoteArtworkGuidedStudio({
  quoteId,
  item,
  artwork,
  token,
  productionQuantity,
  initialStep,
  onClose,
  onChanged,
}: {
  quoteId: string;
  item: QuoteItemRow;
  artwork: QuoteItemArtworkRow;
  token?: string;
  productionQuantity: number;
  initialStep: ArtworkStudioStep;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [quantity] = useState(productionQuantity);
  const base = token
    ? `/api/public/quotes/${token}/items/${item.id}/artworks`
    : `/api/quotes/${quoteId}/items/${item.id}/artworks`;
  function imageUrl(id: string, prepared: boolean) {
    return token
      ? `/api/public/quotes/${token}/artworks/${id}${prepared ? "?kind=prepared" : ""}`
      : `${base}/${id}/file?kind=${prepared ? "prepared" : "original"}`;
  }
  function assetFor(row: QuoteItemArtworkRow): ArtworkStudioAsset {
    return {
      id: row.id,
      name: row.artwork_name || row.file_name,
      fileName: row.file_name,
      sourceUrl: row.data_url || imageUrl(row.id, false),
      preparedUrl:
        row.prepared_data_url ||
        (row.prepared_storage_path ? imageUrl(row.id, true) : undefined),
      draftUrl: `${base}/${row.id}/retouch-draft`,
      geometry: resolvePrintGeometry({ ...item, ...row }),
      margins: resolvePrintMargins({ ...item, ...row }),
      crop: {
        scale: Number(row.crop_scale || 1),
        offsetX: Number(row.crop_offset_x || 0),
        offsetY: Number(row.crop_offset_y || 0),
        rotationDegrees: Number(row.rotation_degrees || 0),
      },
      approved: row.approval_status === "approved",
      notes: row.preparation_notes || undefined,
    };
  }
  async function post(url: string, body?: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        data?.error || "Não foi possível salvar a arte. Tente novamente.",
      );
    return data;
  }
  return (
    <ArtworkGuidedStudio
      initialAsset={assetFor(artwork)}
      initialStep={initialStep}
      onClose={onClose}
      onRetouch={async (asset, file) => {
        const data = await post(base, {
          artworkName: `${asset.name} · retoque`,
          sourceKind: "retouch",
          parentArtworkId: asset.id,
          productionQuantity: quantity,
          artworkFile: file,
        });
        if (!data?.artwork?.id)
          throw new Error("O servidor não confirmou a nova versão da arte.");
        onChanged();
        return assetFor(data.artwork);
      }}
      onPrepare={async (asset, crop) => {
        const data = await post(`${base}/${asset.id}/prepare`, crop);
        onChanged();
        return {
          ...asset,
          crop,
          approved: false,
          preparedUrl:
            data?.artwork?.prepared_data_url ||
            `${imageUrl(asset.id, true)}&v=${Date.now()}`,
          notes: data?.artwork?.preparation_notes || undefined,
        };
      }}
      onApprove={async (asset) => {
        await post(
          `${base}/${asset.id}/approval`,
          token ? undefined : { status: "approved", productionQuantity: quantity },
        );
        onChanged();
      }}
    />
  );
}

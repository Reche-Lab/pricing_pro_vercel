import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/client";
import { getServerEnv } from "@/lib/env/server";
import { CommerceError } from "@/domain/commerce/commerce";
import {
  commerceVideoPath,
  type CommerceVideoInput,
  type ProductMedia,
} from "@/domain/commerce/product-media";
export type VideoUpload = {
  id: string;
  tenant_id: string;
  created_by: string;
  mime_type: string;
  file_size: number;
  status: "pending" | "ready";
  expires_at: Date | string;
};
export async function createVideoUpload(
  tenantId: string,
  userId: string,
  input: CommerceVideoInput,
) {
  const result = await getPool().query<VideoUpload>(
    "insert into commerce_video_uploads(tenant_id,created_by,file_name,mime_type,file_size) values($1,$2,$3,$4,$5) returning *",
    [tenantId, userId, input.fileName, input.mimeType, input.fileSize],
  );
  return result.rows[0];
}
export async function lockVideoUpload(
  client: PoolClient,
  tenantId: string,
  userId: string,
  uploadId: string,
) {
  const result = await client.query<VideoUpload>(
    "select * from commerce_video_uploads where id=$1 and tenant_id=$2 and created_by=$3 for update",
    [uploadId, tenantId, userId],
  );
  if (!result.rows[0])
    throw new CommerceError(
      "Envio de vídeo não encontrado para este usuário e loja.",
      404,
    );
  return result.rows[0];
}
export async function markVideoReady(client: PoolClient, upload: VideoUpload) {
  await client.query(
    "update commerce_video_uploads set status='ready',completed_at=now() where id=$1 and tenant_id=$2",
    [upload.id, upload.tenant_id],
  );
  await client.query(
    "insert into audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) values($1,$2,'commerce.video.upload','commerce_video',$3,$4)",
    [
      upload.tenant_id,
      upload.created_by,
      upload.id,
      JSON.stringify({ mimeType: upload.mime_type, bytes: upload.file_size }),
    ],
  );
}
export async function assertCommerceVideosReady(
  tenantId: string,
  products: { media?: ProductMedia[] }[],
) {
  const videos = products.flatMap(
    (p) => p.media?.filter((m) => m.kind === "video") ?? [],
  );
  if (!videos.length) return;
  const result = await getPool().query<VideoUpload>(
    "select * from commerce_video_uploads where tenant_id=$1 and id=any($2::uuid[]) and status='ready'",
    [tenantId, videos.map((v) => v.id)],
  );
  const base = `${getServerEnv().SUPABASE_URL?.replace(/\/$/, "")}/storage/v1/object/public/commerce-videos/`;
  for (const video of videos) {
    const upload = result.rows.find((row) => row.id === video.id);
    if (
      !upload ||
      video.url !==
        base + commerceVideoPath(tenantId, upload.id, upload.mime_type)
    )
      throw new CommerceError(
        "Um vídeo não foi validado ou pertence a outra loja. Envie-o novamente pela galeria.",
      );
  }
}

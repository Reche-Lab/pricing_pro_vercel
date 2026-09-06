import { fileTypeFromBuffer } from "file-type";
import { CommerceError } from "@/domain/commerce/commerce";
import {
  COMMERCE_VIDEO_BYTES,
  commerceVideoPath,
  type CommerceVideoInput,
  type ProductMedia,
} from "@/domain/commerce/product-media";
import { getServerEnv } from "@/lib/env/server";
import { commerceTransaction } from "@/repositories/commerce";
import {
  createVideoUpload,
  lockVideoUpload,
  markVideoReady,
} from "@/repositories/commerce-media";

function storage() {
  const env = getServerEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new CommerceError(
      "Configure o Supabase Storage para enviar os vídeos da loja.",
      503,
    );
  return {
    base: `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1`,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  };
}
async function storageRequest(
  url: string,
  init: RequestInit,
  operation: string,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new CommerceError(
      "O armazenamento não respondeu. Tente novamente.",
      503,
    );
  }
  if (!response.ok) {
    console.error("Commerce video storage failed.", {
      operation,
      status: response.status,
    });
    throw new CommerceError(
      "Não foi possível processar o vídeo no Storage. Confira a migration 0064 e tente novamente.",
      502,
    );
  }
  return response;
}
export async function beginCommerceVideo(
  tenantId: string,
  userId: string,
  input: CommerceVideoInput,
) {
  const { base, headers } = storage();
  const upload = await createVideoUpload(tenantId, userId, input);
  const path = commerceVideoPath(tenantId, upload.id, input.mimeType);
  const response = await storageRequest(
    `${base}/object/upload/sign/commerce-video-staging/${path}`,
    {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "x-upsert": "false",
      },
      body: "{}",
    },
    "sign",
  );
  const result = await response.json();
  if (
    typeof result.url !== "string" ||
    !result.url.startsWith(
      `/object/upload/sign/commerce-video-staging/${path}?`,
    )
  )
    throw new CommerceError(
      "O Storage não retornou uma autorização válida para o vídeo.",
      502,
    );
  const signedUrl = `${base}${result.url}`;
  if (!new URL(signedUrl).searchParams.get("token"))
    throw new CommerceError("Autorização de envio ausente.", 502);
  console.info("Commerce video upload authorized.", {
    tenantId,
    uploadId: upload.id,
    bytes: input.fileSize,
    mimeType: input.mimeType,
  });
  return { uploadId: upload.id, signedUrl };
}
export async function validateCommerceVideo(
  response: Response,
  declaredSize: number,
  mimeType: string,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new CommerceError("Vídeo vazio ou indisponível.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (Number(response.headers.get("content-length")) > COMMERCE_VIDEO_BYTES)
      throw new CommerceError("O vídeo deve ter até 20 MB.", 413);
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > COMMERCE_VIDEO_BYTES || size > declaredSize)
        throw new CommerceError(
          "O tamanho real do vídeo excede o autorizado.",
          413,
        );
      chunks.push(next.value);
    }
    if (!size || size !== declaredSize)
      throw new CommerceError(
        "O vídeo chegou incompleto. Envie o arquivo novamente.",
      );
    const bytes = Buffer.concat(chunks);
    let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
    try {
      detected = await fileTypeFromBuffer(bytes);
    } catch {
      /* Invalid or truncated container. */
    }
    if (
      !detected ||
      !["video/mp4", "video/webm"].includes(detected.mime) ||
      detected.mime !== mimeType
    )
      throw new CommerceError(
        "O conteúdo não corresponde a um vídeo MP4 ou WebM válido.",
      );
    return bytes;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export async function completeCommerceVideo(
  tenantId: string,
  userId: string,
  uploadId: string,
): Promise<ProductMedia> {
  const { base, headers } = storage();
  const result = await commerceTransaction(async (client) => {
    // A row lock makes completion idempotent, including requests from two tabs.
    const upload = await lockVideoUpload(client, tenantId, userId, uploadId);
    const path = commerceVideoPath(tenantId, upload.id, upload.mime_type);
    const media: ProductMedia = {
      id: upload.id,
      kind: "video",
      url: `${base}/object/public/commerce-videos/${path}`,
    };
    if (upload.status === "ready") return { media, path };
    if (new Date(upload.expires_at).getTime() <= Date.now())
      throw new CommerceError(
        "O prazo do envio expirou. Selecione o vídeo novamente.",
        410,
      );
    const source = await storageRequest(
      `${base}/object/authenticated/commerce-video-staging/${path}`,
      { headers },
      "read-private",
    );
    const bytes = await validateCommerceVideo(
      source,
      upload.file_size,
      upload.mime_type,
    );
    // Only validated bytes reach the public bucket. Retrying after a DB failure
    // writes the same immutable staging file, never browser-controlled content.
    await storageRequest(
      `${base}/object/commerce-videos/${path}`,
      {
        method: "POST",
        headers: {
          ...headers,
          "content-type": upload.mime_type,
          "x-upsert": "true",
          "cache-control": "max-age=31536000",
        },
        body: bytes,
      },
      "publish",
    );
    await markVideoReady(client, upload);
    return { media, path };
  });
  console.info("Commerce video ready.", { tenantId, uploadId });
  // Cleanup is best-effort after commit, so a cleanup failure never loses a
  // successfully published video. No signed URL or storage credential is logged.
  try {
    await storageRequest(
      `${base}/object/commerce-video-staging`,
      {
        method: "DELETE",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: [result.path] }),
      },
      "cleanup",
    );
  } catch {
    console.warn("Commerce video staging cleanup pending.", {
      tenantId,
      uploadId,
    });
  }
  return result.media;
}

import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { CommerceError } from "@/domain/commerce/commerce";
import {
  librarySearch,
  type libraryUploadSchema,
  type LibraryCrop,
} from "@/domain/commerce/library";
import { normalizePublicArtworkUpload } from "@/services/artwork/public-upload";
import {
  uploadArtworkObject,
  downloadArtworkObject,
  deleteArtworkObject,
  encodeDataUrl,
} from "@/services/storage/artwork-storage";
import {
  commerceProducts,
  commerceTransaction,
  geometryHash,
  type BuyerSession,
} from "@/repositories/commerce";
import {
  auditLibrary,
  librarySource,
  lockLibrary,
  saveLibraryLinks,
} from "@/repositories/commerce-library";

export async function uploadLibraryArtwork(
  tenantId: string,
  userId: string,
  input: z.infer<typeof libraryUploadSchema>,
) {
  const paths: string[] = [];
  try {
    const file = await normalizePublicArtworkUpload({
      dataUrl: input.dataUrl,
      declaredMimeType: input.mimeType,
      declaredSize: input.fileSize,
      originalFileName: input.fileName,
    }).catch((error) => {
      throw new CommerceError(
        error instanceof Error
          ? error.message
          : "Imagem inválida. Use PNG, JPEG ou WebP de até 3 MB.",
      );
    });
    const bytes =
      file.bytes.length <= 3145728
        ? file.bytes
        : await sharp(file.bytes).webp({ quality: 90 }).toBuffer();
    if (bytes.length > 3145728)
      throw new CommerceError(
        "Reduza a resolução da imagem: o arquivo preparado precisa ter até 3 MB.",
      );
    const thumbnail = await sharp(bytes)
      .resize(480, 480, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const metadata = await sharp(bytes).metadata();
    const id = randomUUID();
    for (const [name, data] of [
      ["source", bytes],
      ["thumb", thumbnail],
    ] as const) {
      const path = await uploadArtworkObject({
        path: `${tenantId}/commerce/library/${id}/${name}.webp`,
        contentType: "image/webp",
        bytes: data,
      });
      if (!path)
        throw new CommerceError(
          "Configure o armazenamento privado de artes antes de enviar arquivos.",
          503,
        );
      paths.push(path);
    }
    await commerceTransaction(async (client) => {
      await lockLibrary(client, tenantId);
      if (
        Number(
          (
            await client.query(
              "select count(*)::int as total from commerce_library_artworks where tenant_id=$1",
              [tenantId],
            )
          ).rows[0].total,
        ) >= 5000
      )
        throw new CommerceError(
          "Limite de 5.000 artes por loja atingido.",
          429,
        );
      const title =
        input.fileName
          .replace(/\.[^.]+$/, "")
          .slice(0, 120)
          .trim() || "Nova arte";
      await client.query(
        `insert into commerce_library_artworks(id,tenant_id,category_id,title,search_text,storage_path,thumbnail_path,file_name,width,height,content_hash,license_note)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          id,
          tenantId,
          input.categoryId,
          title,
          librarySearch(title),
          paths[0],
          paths[1],
          file.fileName,
          metadata.width,
          metadata.height,
          createHash("sha256").update(bytes).digest("hex"),
          input.licenseNote,
        ],
      );
      await saveLibraryLinks(
        client,
        tenantId,
        id,
        input.categoryId,
        input.campaignIds,
        input.productIds,
      );
      await auditLibrary(client, tenantId, userId, "artwork.upload", id, {
        bytes: bytes.length,
      });
    });
    paths.length = 0;
    return { id };
  } finally {
    for (const path of paths) await deleteArtworkObject(path);
  }
}

async function selectionSource(
  tenantId: string,
  artworkId: string,
  productId: string,
  preview: boolean,
) {
  const art = await librarySource(
    tenantId,
    artworkId,
    preview ? "preview" : "public",
  );
  const product = (await commerceProducts(tenantId)).find(
    (p) => p.id === productId && p.personalized && p.geometry,
  );
  const binding = (
    await getPool().query(
      "select initial_crop from commerce_library_products where tenant_id=$1 and artwork_id=$2 and product_id=$3",
      [tenantId, artworkId, productId],
    )
  ).rows[0];
  if (!product || !binding)
    throw new CommerceError(
      "Esta arte não está disponível para o produto escolhido.",
      409,
    );
  const file = await downloadArtworkObject(art.storage_path);
  if (
    !file ||
    file.bytes.length > 3145728 ||
    createHash("sha256").update(file.bytes).digest("hex") !== art.content_hash
  )
    throw new CommerceError(
      "O original da arte não está disponível. Avise a loja.",
      409,
    );
  const crop =
    binding.initial_crop?.geometryHash === geometryHash(product)
      ? binding.initial_crop
      : null;
  return { art, product, file, crop };
}
export async function previewLibrarySelection(
  tenantId: string,
  artworkId: string,
  productId: string,
) {
  const { art, file, crop } = await selectionSource(
    tenantId,
    artworkId,
    productId,
    true,
  );
  return {
    fileName: art.file_name,
    mimeType: "image/webp",
    fileSize: file.bytes.length,
    dataUrl: encodeDataUrl("image/webp", file.bytes),
    initialCrop: crop as LibraryCrop | null,
    editingAllowed: art.editable,
    title: art.title,
  };
}
export async function selectLibraryArtwork(
  tenantId: string,
  session: BuyerSession,
  artworkId: string,
  productId: string,
) {
  const { art, file } = await selectionSource(
    tenantId,
    artworkId,
    productId,
    false,
  );
  let path: string | null = null;
  try {
    path = await uploadArtworkObject({
      path: `${tenantId}/commerce/${session.id}/${randomUUID()}.webp`,
      contentType: "image/webp",
      bytes: file.bytes,
    });
    if (!path)
      throw new CommerceError("Armazenamento de artes indisponível.", 503);
    const selected = await commerceTransaction(async (client) => {
      await lockLibrary(client, tenantId);
      const current = await librarySource(
        tenantId,
        artworkId,
        "public",
        client,
      );
      if (current.version !== art.version)
        throw new CommerceError(
          "A arte foi atualizada. Selecione novamente.",
          409,
        );
      const locked = await client.query(
        "select id from commerce_sessions where tenant_id=$1 and id=$2 and expires_at>now() for update",
        [tenantId, session.id],
      );
      if (!locked.rowCount) throw new CommerceError("Sessão expirada.", 401);
      const count = Number(
        (
          await client.query(
            "select count(*)::int as total from commerce_artworks where tenant_id=$1 and session_id=$2",
            [tenantId, session.id],
          )
        ).rows[0].total,
      );
      if (count >= 40)
        throw new CommerceError(
          "Limite de 40 versões de arte nesta sessão atingido.",
          429,
        );
      const product = (await commerceProducts(tenantId, client)).find(
        (p) => p.id === productId && p.personalized && p.geometry,
      );
      const binding = (
        await client.query(
          "select initial_crop from commerce_library_products where tenant_id=$1 and artwork_id=$2 and product_id=$3",
          [tenantId, artworkId, productId],
        )
      ).rows[0];
      if (!product || !binding)
        throw new CommerceError(
          "O produto ou o vínculo mudou. Atualize a página.",
          409,
        );
      const crop =
        binding.initial_crop?.geometryHash === geometryHash(product)
          ? binding.initial_crop
          : null;
      return (
        await client.query(
          `insert into commerce_artworks(tenant_id,session_id,product_id,storage_path,file_name,content_hash,library_artwork_id,library_version,initial_crop,editing_allowed)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id,file_name,editing_allowed,initial_crop`,
          [
            tenantId,
            session.id,
            productId,
            path,
            current.file_name,
            current.content_hash,
            artworkId,
            current.version,
            crop ? JSON.stringify(crop) : null,
            current.editable,
          ],
        )
      ).rows[0];
    });
    path = null;
    console.info("Commerce library artwork selected.", {
      tenantId,
      productId,
      artworkId,
      version: art.version,
      sessionId: session.id,
      copiedArtworkId: selected.id,
    });
    return { artwork: selected, title: art.title };
  } finally {
    await deleteArtworkObject(path);
  }
}

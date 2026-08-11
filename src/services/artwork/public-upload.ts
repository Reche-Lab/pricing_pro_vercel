import sharp from "sharp";
import { decodeDataUrl, encodeDataUrl } from "@/services/storage/artwork-storage";

const MAX_SOURCE_BYTES = 3 * 1024 * 1024;
const MAX_STORED_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 25_000_000;
const MAX_DIMENSION = 10_000;
const allowedFormats = new Set(["png", "jpeg", "webp"]);
const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isSafePublicArtworkContentType(value: string) {
  return allowedMimeTypes.has(value.split(";")[0]?.trim().toLowerCase());
}

export async function normalizePublicArtworkUpload(input: {
  dataUrl: string;
  declaredMimeType: string;
  declaredSize: number;
  originalFileName: string;
}) {
  const decoded = decodeDataUrl(input.dataUrl);
  if (!allowedMimeTypes.has(decoded.contentType) || decoded.contentType !== input.declaredMimeType) {
    throw new Error("O tipo real do arquivo não corresponde a PNG, JPEG ou WebP.");
  }
  if (decoded.bytes.length !== input.declaredSize || decoded.bytes.length > MAX_SOURCE_BYTES) {
    throw new Error("O tamanho real da imagem é inválido ou excede 3 MB.");
  }

  const image = sharp(Buffer.from(decoded.bytes), { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS });
  const metadata = await image.metadata();
  if (!metadata.format || !allowedFormats.has(metadata.format)) throw new Error("O conteúdo do arquivo não é uma imagem PNG, JPEG ou WebP válida.");
  if (!metadata.width || !metadata.height || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    throw new Error("A imagem excede as dimensões máximas permitidas.");
  }
  if ((metadata.pages ?? 1) > 1) throw new Error("Imagens animadas não são permitidas.");

  let bytes = await image.rotate().webp({ lossless: true, effort: 4 }).toBuffer();
  if (bytes.length > MAX_STORED_BYTES) {
    bytes = await sharp(Buffer.from(decoded.bytes), { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .webp({ quality: 95, smartSubsample: true, effort: 4 })
      .toBuffer();
  }
  if (bytes.length > MAX_STORED_BYTES) throw new Error("A imagem normalizada excede o limite seguro de 5 MB.");

  const baseName = safeBaseName(input.originalFileName);
  return {
    bytes,
    contentType: "image/webp" as const,
    dataUrl: encodeDataUrl("image/webp", bytes),
    fileName: `${baseName || "arte"}.webp`,
    fileSize: bytes.length,
    width: metadata.width,
    height: metadata.height
  };
}

function safeBaseName(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

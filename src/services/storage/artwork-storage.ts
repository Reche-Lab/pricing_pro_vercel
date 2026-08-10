import { getServerEnv } from "@/lib/env/server";

const BUCKET = "artwork-production";

export function artworkStorageConfigured() {
  const env = getServerEnv();
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function uploadArtworkObject(input: {
  path: string;
  contentType: string;
  bytes: Uint8Array;
}) {
  const env = getServerEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const response = await fetch(storageObjectUrl(env.SUPABASE_URL, input.path), {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": input.contentType,
      "x-upsert": "true"
    },
    body: Buffer.from(input.bytes)
  });
  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`Não foi possível salvar o arquivo no Supabase Storage (${response.status}). ${payload.slice(0, 300)}`);
  }
  return input.path;
}

export async function downloadArtworkObject(path: string) {
  const env = getServerEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const response = await fetch(storageObjectUrl(env.SUPABASE_URL, path), {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Arquivo privado não encontrado no Supabase Storage (${response.status}).`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "application/octet-stream" };
}

export async function deleteArtworkObject(path: string | null | undefined) {
  if (!path) return;
  const env = getServerEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  await fetch(storageObjectUrl(env.SUPABASE_URL, path), {
    method: "DELETE",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
  }).catch(() => null);
}

export function decodeDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("Arquivo codificado inválido.");
  return { contentType: match[1], bytes: new Uint8Array(Buffer.from(match[2], "base64")) };
}

export function encodeDataUrl(contentType: string, bytes: Uint8Array) {
  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function loadArtworkDataUrl(dataUrl: string | null | undefined, storagePath: string | null | undefined) {
  if (dataUrl) return dataUrl;
  if (!storagePath) throw new Error("O arquivo da arte não está disponível.");
  const stored = await downloadArtworkObject(storagePath);
  if (!stored) throw new Error("Configure o Supabase Storage para acessar esta arte.");
  return encodeDataUrl(stored.contentType, stored.bytes);
}

function storageObjectUrl(baseUrl: string, path: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${encodedPath}`;
}

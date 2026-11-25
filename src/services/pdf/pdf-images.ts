import { request } from "node:https";
import { isIP } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { mockupSideSchema } from "@/domain/commerce/artwork-options";
import { isPublicSmtpAddress, resolveSmtpAddress } from "@/services/email/smtp-network";

const MAX_BYTES = 5 * 1024 * 1024;
export const PDF_IMAGE_PIXELS = 20_000_000;

/** Public media only: pin DNS, prohibit redirects/credentials and bound time and size. */
export async function loadPdfImageBytes(value: string | null | undefined): Promise<Buffer | null> {
  if (!value) return null;
  try {
    if (value.startsWith("data:")) {
      if (value.length > MAX_BYTES * 1.4) return null;
      const data = /^data:image\/(?:png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(value);
      return data ? Buffer.from(data[1], "base64") : null;
    }
    if (value.startsWith("/mockups/")) {
      const side = { baseUrl: value, maskUrl: "", overlayUrl: "", x: 0, y: 0, width: 1, height: 1 };
      if (!mockupSideSchema.safeParse(side).success) return null;
      return await readFile(path.join(process.cwd(), "public", value.slice(1)));
    }
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") return null;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const address = isIP(host) ? host : await resolveSmtpAddress(host);
    if (!isPublicSmtpAddress(address)) return null;
    return await new Promise<Buffer>((resolve, reject) => {
      const req = request({ hostname: address, servername: isIP(host) ? undefined : host, port: 443, method: "GET",
        path: `${url.pathname}${url.search}`, headers: { host: url.host, accept: "image/png,image/jpeg,image/webp" },
        rejectUnauthorized: true, minVersion: "TLSv1.2", agent: false,
      }, response => {
        if (response.statusCode !== 200 || Number(response.headers["content-length"] ?? 0) > MAX_BYTES) { response.destroy(); reject(new Error("Image unavailable")); return; }
        const chunks: Buffer[] = []; let size = 0;
        response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > MAX_BYTES) req.destroy(new Error("Image too large")); else chunks.push(chunk); });
        response.on("error", reject); response.on("end", () => resolve(Buffer.concat(chunks)));
      });
      const timeout = setTimeout(() => req.destroy(new Error("Image timeout")), 5000);
      req.on("close", () => clearTimeout(timeout)); req.on("error", reject); req.end();
    });
  } catch { return null; }
}

export async function pdfImagePng(value: string | null | undefined) {
  const bytes = await loadPdfImageBytes(value);
  if (!bytes) return null;
  try {
    const image = sharp(bytes, { limitInputPixels: PDF_IMAGE_PIXELS, animated: false });
    const metadata = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format ?? "")) return null;
    return await image.rotate().resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch { return null; }
}

import crypto from "node:crypto";
import { getServerEnv } from "@/lib/env/server";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export function encryptTenantSecret(value: unknown): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const plaintext = JSON.stringify(value);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptTenantSecret<T>(encryptedValue: string): T {
  const [ivRaw, tagRaw, encryptedRaw] = encryptedValue.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted tenant secret format.");
  }

  const iv = Buffer.from(ivRaw, "base64url");
  const tag = Buffer.from(tagRaw, "base64url");
  const encrypted = Buffer.from(encryptedRaw, "base64url");
  const decipher = crypto.createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");

  return JSON.parse(decrypted) as T;
}

function key(): Buffer {
  return crypto.createHash("sha256").update(getServerEnv().APP_ENCRYPTION_KEY).digest();
}

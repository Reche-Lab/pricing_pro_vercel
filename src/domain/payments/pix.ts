import { isValidCnpj, isValidCpf, onlyDigits } from "@/lib/validation/documents";

export const PIX_KEY_TYPES = ["cpf", "cnpj", "email", "phone", "random"] as const;

export type PixKeyType = (typeof PIX_KEY_TYPES)[number];

export type PixPaymentSnapshot = {
  keyType: PixKeyType;
  key: string;
  beneficiaryName: string | null;
};

const PIX_KEY_LABELS: Record<PixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  phone: "Telefone",
  random: "Chave aleatória"
};

export function pixKeyTypeLabel(type: PixKeyType): string {
  return PIX_KEY_LABELS[type];
}

export function normalizePixKey(type: PixKeyType, value: string): string {
  const trimmed = value.trim();
  if (type === "cpf" || type === "cnpj") return onlyDigits(trimmed);
  if (type === "email") return trimmed.toLowerCase();
  if (type === "phone") {
    const digits = onlyDigits(trimmed);
    if (!digits) return "";
    return `+${digits.startsWith("55") ? digits : `55${digits}`}`;
  }
  return trimmed.toLowerCase();
}

export function isValidPixKey(type: PixKeyType, value: string): boolean {
  const normalized = normalizePixKey(type, value);
  if (!normalized) return false;
  if (type === "cpf") return isValidCpf(normalized);
  if (type === "cnpj") return isValidCnpj(normalized);
  if (type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && normalized.length <= 77;
  if (type === "phone") return /^\+[1-9]\d{9,14}$/.test(normalized);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized);
}

export function buildPixPaymentSnapshot(input: {
  keyType: PixKeyType;
  key: string;
  beneficiaryName?: string | null;
}): PixPaymentSnapshot {
  const key = normalizePixKey(input.keyType, input.key);
  if (!isValidPixKey(input.keyType, key)) {
    throw new Error(`A chave Pix do tipo ${pixKeyTypeLabel(input.keyType)} é inválida.`);
  }

  return {
    keyType: input.keyType,
    key,
    beneficiaryName: input.beneficiaryName?.trim() || null
  };
}

export function parsePixPaymentSnapshot(value: unknown): PixPaymentSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!PIX_KEY_TYPES.includes(record.keyType as PixKeyType) || typeof record.key !== "string") return null;

  try {
    return buildPixPaymentSnapshot({
      keyType: record.keyType as PixKeyType,
      key: record.key,
      beneficiaryName: typeof record.beneficiaryName === "string" ? record.beneficiaryName : null
    });
  } catch {
    return null;
  }
}

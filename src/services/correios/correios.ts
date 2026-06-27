import type {
  CorreiosCredentials,
  CorreiosPayload,
  CorreiosQuoteInput,
  CorreiosQuoteResult,
  CorreiosSettings
} from "./types";

const DEFAULT_API_BASE_URL = "https://api.correios.com.br";
const DEFAULT_SERVICES = {
  sedex: "04162",
  pac: "04669"
};

export function buildCorreiosPayload(input: CorreiosQuoteInput, settings: CorreiosSettings): CorreiosPayload {
  const serviceCode = settings.servicos?.[input.service] ?? DEFAULT_SERVICES[input.service];
  const contrato = settings.contrato_correios ?? "";
  const packages = Array.from({ length: input.packaging.boxesNeeded }, (_, index) => {
    const grossWeightKg = Math.max(0.3, input.packaging.grossWeightPerBoxKg);

    return {
      coProduto: serviceCode,
      nuRequisicao: `${Date.now()}_${index}`,
      nuContrato: contrato,
      nuDR: 74,
      cepOrigem: onlyDigits(input.originPostalCode),
      cepDestino: onlyDigits(input.destinationPostalCode),
      psObjeto: String(Math.ceil(grossWeightKg * 1000)),
      comprimento: String(Math.max(16, input.packaging.box.lengthCm)),
      largura: String(Math.max(11, input.packaging.box.widthCm)),
      altura: String(Math.max(2, input.packaging.box.heightCm)),
      diametro: "0",
      servicosAdicionais: [],
      criterios: [],
      vlDeclarado: String(input.declaredValue ?? 0)
    };
  });

  return {
    idLote: String(Date.now()),
    parametrosProduto: packages
  };
}

export function normalizeCorreiosResponse(raw: unknown): CorreiosQuoteResult {
  if (!Array.isArray(raw)) {
    return { totalFrete: 0, raw };
  }

  const totalFinal = sumMoney(raw, "pcFinal");
  const totalProduto = sumMoney(raw, "pcProduto");

  return {
    totalFrete: totalFinal > 0 ? totalFinal : totalProduto,
    raw
  };
}

export async function quoteCorreiosShipping(
  input: CorreiosQuoteInput,
  settings: CorreiosSettings,
  credentials: CorreiosCredentials
): Promise<CorreiosQuoteResult> {
  const baseUrl = (settings.api_base_url || DEFAULT_API_BASE_URL).replace(/\/$/, "");
  const payload = buildCorreiosPayload(input, settings);
  const response = await fetch(`${baseUrl}/preco/v1/nacional/`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${credentials.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Correios returned a non-JSON response.");
  }

  if (!response.ok) {
    const message = extractCorreiosError(data) ?? `Correios request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return normalizeCorreiosResponse(data);
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function sumMoney(rows: unknown[], key: string): number {
  let sum = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object" || !(key in row)) continue;
    const raw = String((row as Record<string, unknown>)[key] ?? "").trim();
    if (!raw) continue;
    const normalized = raw.replace(/\./g, "").replace(",", ".");
    const value = Number(normalized);
    if (Number.isFinite(value)) sum += value;
  }
  return sum;
}

function extractCorreiosError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  if (typeof record.causa === "string") return record.causa;
  if (Array.isArray(record.msgs) && typeof record.msgs[0] === "string") return record.msgs[0];
  return null;
}

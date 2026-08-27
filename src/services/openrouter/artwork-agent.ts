import { getServerEnv } from "@/lib/env/server";
import { geometryLabel, type PrintGeometry } from "@/domain/artwork/geometry";

type CreativeSuggestions = {
  concept: string;
  composition: string;
  palette: string[];
  typography: string;
  productionWarnings: string[];
  generationPrompt: string;
};

export async function suggestArtworkDirection(input: {
  brief: string;
  product: string;
  geometry?: PrintGeometry;
  diameterMm?: number;
  referenceDataUrl?: string | null;
}): Promise<CreativeSuggestions> {
  const env = getServerEnv();
  assertConfigured(env.OPENROUTER_API_KEY);
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: buildArtworkSuggestionPrompt(input)
    }
  ];
  if (input.referenceDataUrl) content.push({ type: "image_url", image_url: { url: input.referenceDataUrl } });

  const response = await openRouterFetch("/chat/completions", {
    model: env.OPENROUTER_TEXT_MODEL,
    temperature: 0.6,
    messages: [
      { role: "system", content: "Você é um diretor de arte especializado em produtos personalizados para impressão e corte. Respeite o formato final, preserve legibilidade, contraste e área segura." },
      { role: "user", content }
    ]
  });
  const text = readMessageText(response);
  return parseSuggestions(text);
}

export async function generateArtworkImage(input: {
  prompt: string;
  geometry?: PrintGeometry;
  diameterMm?: number;
  referenceDataUrl?: string | null;
}) {
  const env = getServerEnv();
  assertConfigured(env.OPENROUTER_API_KEY);
  const productionPrompt = buildArtworkGenerationPrompt(input);
  const body: Record<string, unknown> = {
    model: env.OPENROUTER_IMAGE_MODEL,
    prompt: productionPrompt,
    n: 1,
    aspect_ratio: imageAspectRatio(input.geometry),
    quality: "high",
    output_format: "png"
  };
  if (input.referenceDataUrl) {
    body.input_references = [{ type: "image_url", image_url: { url: input.referenceDataUrl } }];
  }
  const response = await openRouterFetch("/images", body);
  const record = asRecord(response);
  const first = Array.isArray(record?.data) ? asRecord(record.data[0]) : null;
  if (!first || typeof first.b64_json !== "string") throw new Error("O OpenRouter não retornou uma imagem válida.");
  const mimeType = typeof first.media_type === "string" ? first.media_type : "image/png";
  return { dataUrl: `data:${mimeType};base64,${first.b64_json}`, prompt: productionPrompt };
}

export function buildArtworkSuggestionPrompt(input: {
  brief: string;
  product: string;
  geometry?: PrintGeometry;
  diameterMm?: number;
  referenceDataUrl?: string | null;
}) {
  const referenceInstruction = input.referenceDataUrl
    ? "Analise a imagem de referência como a versão atual. Proponha melhorias coerentes com o pedido, preserve os elementos que não foram mencionados e descreva claramente o que deve mudar."
    : "Crie a direção a partir do briefing, pois não há imagem de referência.";
  return `Crie uma direção de arte para ${formatDescription(input)} (${input.product}). ${geometryInstruction(input.geometry)} ${referenceInstruction} Briefing ou alterações solicitadas: ${input.brief}. A composição deve considerar o contorno e a orientação do produto. Evite texto pequeno e elementos importantes próximos ao corte. Responda somente JSON válido com concept, composition, palette (array), typography, productionWarnings (array) e generationPrompt.`;
}

export function buildArtworkGenerationPrompt(input: {
  prompt: string;
  geometry?: PrintGeometry;
  diameterMm?: number;
  referenceDataUrl?: string | null;
}) {
  const referenceInstruction = input.referenceDataUrl
    ? "Use a imagem de referência como base da nova versão. Preserve composição, identidade, textos e elementos que não tenham sido explicitamente alterados. Aplique somente as mudanças solicitadas e não redesenhe arbitrariamente a arte."
    : "Crie uma arte original a partir da solicitação, sem depender de uma imagem anterior.";
  return `${referenceInstruction}\nSolicitação: ${input.prompt}\n${geometryInstruction(input.geometry, input.diameterMm)}\nCrie a imagem respeitando exatamente a proporção e a orientação do formato final. Mantenha a composição centralizada e os elementos importantes dentro da margem segura. A parte visível termina no limite da sangria, mas o mesmo fundo, cores e texturas devem continuar sem interrupção por toda a margem externa até o corte efetivo, evitando qualquer borda branca. Não inclua linha de corte na imagem. Sem mockup e sem fotografia do produto.`;
}

function formatDescription(input: { geometry?: PrintGeometry; diameterMm?: number }) {
  if (input.geometry) return `um produto com ${geometryLabel(input.geometry).toLocaleLowerCase("pt-BR")}`;
  if (input.diameterMm) return `um produto circular de ${input.diameterMm} mm`;
  return "o formato de impressão informado";
}

function geometryInstruction(geometry?: PrintGeometry, legacyDiameterMm?: number) {
  if (!geometry) return legacyDiameterMm
    ? `Formato geométrico: circular. Tamanho final de corte: ${legacyDiameterMm} mm de diâmetro.`
    : "";
  const shapeLabels: Record<PrintGeometry["shape"], string> = {
    circle: "circular",
    square: "quadrado",
    rectangle: "retangular",
    triangle: "triangular",
    hexagon: "hexagonal"
  };
  const size = geometry.shape === "circle"
    ? `${geometry.widthMm} mm de diâmetro`
    : `${geometry.widthMm} mm de largura por ${geometry.heightMm} mm de altura`;
  const corners = geometry.shape === "circle"
    ? ""
    : geometry.cornerStyle === "rounded"
      ? ` Cantos arredondados com raio de ${geometry.cornerRadiusMm} mm.`
      : " Cantos e pontas retos.";
  const orientation = geometry.rotationDegrees
    ? ` Orientação do contorno: ${geometry.rotationDegrees} graus.`
    : "";
  return `Formato geométrico: ${shapeLabels[geometry.shape]}. Tamanho final de corte: ${size}.${corners}${orientation}`;
}

function imageAspectRatio(geometry?: PrintGeometry) {
  if (!geometry) return "1:1";
  const ratio = geometry.widthMm / geometry.heightMm;
  if (ratio > 1.2) return "3:2";
  if (ratio < 0.83) return "2:3";
  return "1:1";
}

async function openRouterFetch(path: string, body: Record<string, unknown>) {
  const env = getServerEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    console.info("OpenRouter artwork request prepared.", { path, model: body.model, hasReference: Boolean(body.input_references) });
    const response = await fetch(`${env.OPENROUTER_BASE_URL.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "content-type": "application/json",
        "HTTP-Referer": env.APP_URL,
        "X-OpenRouter-Title": "Pricing Pro"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    console.info("OpenRouter artwork response received.", { path, status: response.status, ok: response.ok });
    if (!response.ok) {
      const message = readError(payload) || `OpenRouter respondeu com status ${response.status}.`;
      throw new Error(message);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function parseSuggestions(text: string): CreativeSuggestions {
  const json = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  const parsed = asRecord(JSON.parse(json));
  if (!parsed) throw new Error("O assistente não retornou sugestões estruturadas.");
  return {
    concept: String(parsed.concept || ""),
    composition: String(parsed.composition || ""),
    palette: Array.isArray(parsed.palette) ? parsed.palette.map(String).slice(0, 8) : [],
    typography: String(parsed.typography || ""),
    productionWarnings: Array.isArray(parsed.productionWarnings) ? parsed.productionWarnings.map(String).slice(0, 8) : [],
    generationPrompt: String(parsed.generationPrompt || "")
  };
}

function readMessageText(payload: unknown) {
  const record = asRecord(payload);
  const choice = Array.isArray(record?.choices) ? asRecord(record.choices[0]) : null;
  const message = asRecord(choice?.message);
  if (typeof message?.content !== "string") throw new Error("O OpenRouter não retornou texto válido.");
  return message.content;
}

function readError(payload: unknown) {
  const error = asRecord(asRecord(payload)?.error);
  return typeof error?.message === "string" ? error.message : "";
}

function assertConfigured(apiKey: string) {
  if (!apiKey) throw new Error("Configure OPENROUTER_API_KEY para usar o assistente criativo.");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export type ProductAliasSource = "manual" | "ai";

export type ProductSearchAlias = {
  alias: string;
  normalizedAlias: string;
  source: ProductAliasSource;
};

export type ProductSearchCandidate = {
  product_id: string;
  product_name: string;
  product_slug: string;
  product_category: string;
  product_description: string | null;
  variant_id: string;
  variant_name: string;
  variant_description: string | null;
  sku: string | null;
  unit_weight_kg: string;
  height_cm: string | null;
  width_cm: string | null;
  length_cm: string | null;
  print_width_mm?: string | null;
  print_height_mm?: string | null;
  aliases?: ProductSearchAlias[] | null;
};

export type ProductMatchReason = "id" | "sku" | "alias" | "name" | "category" | "fuzzy" | "catalog";

export type RankedProduct<T extends ProductSearchCandidate = ProductSearchCandidate> = T & {
  confidence: number;
  matchedBy: ProductMatchReason;
  matchedAlias: string | null;
};

type AliasInput = { alias: string; source?: ProductAliasSource };

export function normalizeProductSearchTerm(value: string) {
  let normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2");

  normalized = normalized.replace(
    /\b(\d+(?:\.\d+)?)\s*(?:centimetros?|centimetro|cms?|cm)\b/g,
    (_, raw: string) => `${formatMillimeters(Number(raw) * 10)}mm`
  );
  normalized = normalized.replace(
    /\b(\d+(?:\.\d+)?)\s*(?:milimetros?|milimetro|mms?|mm)\b/g,
    (_, raw: string) => `${formatMillimeters(Number(raw))}mm`
  );
  // In product searches, a bare decimal such as "3.5" conventionally means centimetres.
  normalized = normalized.replace(/\b(\d{1,3})\.(\d+)\b/g, (_, whole: string, fraction: string) => {
    return `${formatMillimeters(Number(`${whole}.${fraction}`) * 10)}mm`;
  });

  return normalized
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/(\d+)\s+mm\b/g, "$1mm")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeProductAliases(values: AliasInput[], limit = 30): ProductSearchAlias[] {
  const unique = new Map<string, ProductSearchAlias>();
  for (const value of values) {
    const alias = value.alias.trim().replace(/\s+/g, " ").slice(0, 120);
    const normalizedAlias = normalizeProductSearchTerm(alias);
    if (alias.length < 2 || normalizedAlias.length < 2 || unique.has(normalizedAlias)) continue;
    unique.set(normalizedAlias, {
      alias,
      normalizedAlias,
      source: value.source === "ai" ? "ai" : "manual"
    });
    if (unique.size >= limit) break;
  }
  return Array.from(unique.values());
}

export function rankProductCandidates<T extends ProductSearchCandidate>(
  candidates: T[],
  rawQuery: string
): RankedProduct<T>[] {
  const query = normalizeProductSearchTerm(rawQuery);
  if (!query) {
    return [...candidates]
      .sort(catalogSort)
      .map((candidate) => ({ ...candidate, confidence: 1, matchedBy: "catalog", matchedAlias: null }));
  }

  return candidates
    .map((candidate) => scoreCandidate(candidate, query))
    .filter((candidate): candidate is RankedProduct<T> => candidate !== null)
    .sort((left, right) => right.confidence - left.confidence || catalogSort(left, right));
}

export function productSearchRequiresClarification(matches: RankedProduct[]) {
  if (matches.length < 2) return false;
  const [first, second] = matches;
  if (first.confidence >= 0.98 && ["id", "sku", "alias"].includes(first.matchedBy)) return false;
  return first.confidence < 0.72 || first.confidence - second.confidence < 0.08;
}

function scoreCandidate<T extends ProductSearchCandidate>(candidate: T, query: string): RankedProduct<T> | null {
  const sku = normalizeProductSearchTerm(candidate.sku ?? "");
  const ids = [candidate.variant_id, candidate.product_id].map(normalizeProductSearchTerm);
  if (ids.includes(query)) return match(candidate, 1, "id");
  if (sku && sku === query) return match(candidate, 1, "sku");

  const aliases = candidate.aliases ?? [];
  const exactAlias = aliases.find((alias) => alias.normalizedAlias === query);
  if (exactAlias) return match(candidate, 1, "alias", exactAlias.alias);

  const productName = normalizeProductSearchTerm(candidate.product_name);
  const variantName = normalizeProductSearchTerm(candidate.variant_name);
  const combinedName = normalizeProductSearchTerm(`${candidate.product_name} ${candidate.variant_name}`);
  const category = normalizeProductSearchTerm(candidate.product_category);
  const descriptions = [candidate.product_description, candidate.variant_description]
    .filter((value): value is string => Boolean(value))
    .map(normalizeProductSearchTerm);
  const geometryTerms = geometrySearchTerms(candidate);
  const nameTerms = [combinedName, productName, variantName, ...geometryTerms].filter(Boolean);
  const aliasTerms = aliases.map((alias) => alias.normalizedAlias);

  if (nameTerms.includes(query)) return match(candidate, 0.98, "name");
  const containingName = nameTerms.find((term) => term.includes(query) || query.includes(term));
  if (containingName) return match(candidate, 0.94, "name");
  if (category === query || category.includes(query)) return match(candidate, 0.9, "category");

  const searchableTerms = [sku, ...nameTerms, category, ...descriptions, ...aliasTerms].filter(Boolean);
  const queryTokens = query.split(" ");
  const documentTokens = Array.from(new Set(searchableTerms.flatMap((term) => term.split(" "))));
  const tokenScore = averageBestTokenScore(queryTokens, documentTokens);
  const fullScore = Math.max(...searchableTerms.map((term) => diceCoefficient(query, term)), 0);
  let score = Math.max(0.35 + fullScore * 0.55, 0.5 + tokenScore * 0.45);

  const queryDimensions = dimensionTokens(query);
  if (queryDimensions.length > 0) {
    const productDimensions = new Set(searchableTerms.flatMap(dimensionTokens));
    const exactDimensions = queryDimensions.every((dimension) => productDimensions.has(dimension));
    score += exactDimensions ? 0.08 : -0.3;
  }

  const bestAlias = aliases
    .map((alias) => ({ alias, score: diceCoefficient(query, alias.normalizedAlias) }))
    .sort((left, right) => right.score - left.score)[0];
  const reason: ProductMatchReason = bestAlias?.score >= fullScore && bestAlias.score >= 0.45
    ? "alias"
    : "fuzzy";
  if (score < 0.58) return null;
  return match(candidate, Math.min(0.96, score), reason, reason === "alias" ? bestAlias.alias.alias : null);
}

function match<T extends ProductSearchCandidate>(
  candidate: T,
  confidence: number,
  matchedBy: ProductMatchReason,
  matchedAlias: string | null = null
): RankedProduct<T> {
  return {
    ...candidate,
    confidence: Number(confidence.toFixed(3)),
    matchedBy,
    matchedAlias
  };
}

function geometrySearchTerms(candidate: ProductSearchCandidate) {
  const width = Number(candidate.print_width_mm);
  const height = Number(candidate.print_height_mm);
  const values: string[] = [];
  if (Number.isFinite(width) && width > 0) values.push(`${formatMillimeters(width)}mm`);
  if (Number.isFinite(height) && height > 0 && height !== width) values.push(`${formatMillimeters(height)}mm`);
  return values;
}

function dimensionTokens(value: string) {
  return value.match(/\b\d+(?:\.\d+)?mm\b/g) ?? [];
}

function averageBestTokenScore(queryTokens: string[], documentTokens: string[]) {
  if (queryTokens.length === 0 || documentTokens.length === 0) return 0;
  return queryTokens.reduce((total, queryToken) => {
    return total + Math.max(...documentTokens.map((documentToken) => diceCoefficient(queryToken, documentToken)), 0);
  }, 0) / queryTokens.length;
}

function diceCoefficient(left: string, right: string) {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (leftPairs.length === 0 || rightPairs.length === 0) return left === right ? 1 : 0;
  const counts = new Map<string, number>();
  for (const pair of rightPairs) counts.set(pair, (counts.get(pair) ?? 0) + 1);
  let intersection = 0;
  for (const pair of leftPairs) {
    const count = counts.get(pair) ?? 0;
    if (count > 0) {
      intersection += 1;
      counts.set(pair, count - 1);
    }
  }
  return (2 * intersection) / (leftPairs.length + rightPairs.length);
}

function bigrams(value: string) {
  const compact = ` ${value.replace(/\s+/g, " ")} `;
  return Array.from({ length: Math.max(0, compact.length - 1) }, (_, index) => compact.slice(index, index + 2));
}

function formatMillimeters(value: number) {
  return Number(value.toFixed(3)).toString();
}

function catalogSort(left: ProductSearchCandidate, right: ProductSearchCandidate) {
  return left.product_name.localeCompare(right.product_name, "pt-BR")
    || left.variant_name.localeCompare(right.variant_name, "pt-BR")
    || (left.sku ?? "").localeCompare(right.sku ?? "", "pt-BR");
}

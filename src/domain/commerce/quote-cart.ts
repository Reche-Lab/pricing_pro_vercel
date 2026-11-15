import type { CartLine } from "./schemas";
import { CommerceError, commerceSelectionError, distributeQuantity } from "./commerce";

type QuoteProduct = { id: string; minQuantity: number; maxQuantity: number; maxArtworks: number; personalized: boolean };
function validate(lines: CartLine[], product: QuoteProduct) {
  const error = commerceSelectionError(lines.filter(line => line.productId === product.id), product);
  if (error) throw new CommerceError(error.replace("para consultar a entrega", "para este produto"));
  if (lines.length > 40) throw new CommerceError("O orçamento permite até 40 grupos de produtos/artes.");
  return lines;
}
export function changeQuoteQuantity(lines: readonly CartLine[], id: string, quantity: number, product: QuoteProduct) {
  if (!Number.isInteger(quantity) || quantity < 1 || !lines.some(line => line.id === id && line.productId === product.id)) throw new CommerceError("Informe uma quantidade inteira válida.");
  return validate(lines.map(line => line.id === id ? { ...line, quantity } : { ...line }), product);
}
export function addQuoteProduct(lines: readonly CartLine[], product: QuoteProduct, quantity: number, artworks: number) {
  if (!product.personalized && artworks !== 1) throw new CommerceError("Este produto não permite múltiplas artes.");
  const quantities = distributeQuantity(quantity, artworks);
  const existing = !product.personalized && lines.find(line => line.productId === product.id);
  if (existing) return changeQuoteQuantity(lines, existing.id, existing.quantity + quantity, product);
  return validate([...lines, ...quantities.map((count, index) => ({ id: crypto.randomUUID(), productId: product.id, quantity: count, artworkName: product.personalized ? `Arte ${lines.filter(line => line.productId === product.id).length + index + 1}` : "", artworkId: null, preparation: "customer" as const }))], product);
}
export type RemovedQuoteLine = { line: CartLine; index: number; after: string };
export const quoteCartFingerprint = (lines: readonly CartLine[]) => JSON.stringify(lines.map(line => [line.id, line.productId, line.quantity, line.artworkName, line.artworkId, line.preparation ?? "customer"]));
export function restoreRemovedQuoteLine(current: readonly CartLine[], removed: RemovedQuoteLine) {
  if (quoteCartFingerprint(current) !== removed.after || current.some(line => line.id === removed.line.id)) throw new CommerceError("O orçamento mudou. Adicione o produto novamente para preservar suas alterações.");
  const next = [...current]; next.splice(removed.index, 0, removed.line); return next;
}

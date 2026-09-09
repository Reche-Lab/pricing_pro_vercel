export class QuoteItemEditError extends Error {}

// Existing IDs are ownership claims; only items without an ID may be inserted.
export function validateQuoteItemEdit(
  currentItems: ReadonlyArray<{ id: string }>,
  requestedItems: ReadonlyArray<{ id?: string | null }>,
  expectedItemIds?: string[]
) {
  if (!requestedItems.length) throw new QuoteItemEditError("O orçamento precisa ter ao menos um produto.");
  if (requestedItems.length > 50) throw new QuoteItemEditError("O orçamento pode ter no máximo 50 itens.");
  const currentIds = new Set(currentItems.map(item => item.id));
  const retainedIds = new Set<string>();
  let addedCount = 0;
  for (const item of requestedItems) {
    if (!item.id) {
      addedCount += 1;
      continue;
    }
    if (!currentIds.has(item.id)) throw new QuoteItemEditError("O item não pertence a este orçamento.");
    if (retainedIds.has(item.id)) throw new QuoteItemEditError("Item repetido na edição do orçamento.");
    retainedIds.add(item.id);
  }
  const removedIds = [...currentIds].filter(id => !retainedIds.has(id));
  if (expectedItemIds || addedCount || removedIds.length) {
    const expected = new Set(expectedItemIds);
    if (!expectedItemIds || expected.size !== currentIds.size || expectedItemIds.length !== expected.size
      || [...currentIds].some(id => !expected.has(id))) {
      throw new QuoteItemEditError("Os itens do orçamento foram alterados. Recarregue a página antes de salvar.");
    }
  }
  return { addedCount, removedIds };
}

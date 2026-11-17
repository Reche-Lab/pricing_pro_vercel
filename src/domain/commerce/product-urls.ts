export type CommerceProductLink = { id: string; slug?: string };

export function commerceProductPath<T extends CommerceProductLink>(base: string, product: T) {
  return `${base}/produto/${encodeURIComponent(product.slug || product.id)}`;
}

export function findCommerceProduct<T extends CommerceProductLink>(products: readonly T[], reference: string | undefined): T | undefined {
  if (!reference) return;
  return products.find(product => product.slug === reference)
    ?? products.find(product => product.id === reference || /^[0-9a-f-]{36}$/i.test(reference) && product.id.toLowerCase() === reference.toLowerCase());
}

export function productRedirectUrl(base: string, product: CommerceProductLink, query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) for (const entry of Array.isArray(value) ? value : [value]) params.append(key, entry);
  }
  const search = params.toString();
  return `${commerceProductPath(base, product)}${search ? `?${search}` : ""}`;
}

import type { CartLine } from "./schemas";

export function pendingCartArtworks(lines: CartLine[], products: { id: string; personalized: boolean; name: string }[], artworks: { id: string; approved_at: unknown; crop?: unknown }[]) {
  return lines.flatMap(line => {
    const product = products.find(product => product.id === line.productId);
    if (!product?.personalized) return [];
    const artwork = artworks.find(art => art.id === line.artworkId);
    const reason = !artwork ? "Enviar arte" : line.preparation !== "team" && (!artwork.approved_at || !artwork.crop) ? "Enquadrar e aprovar arte" : null;
    return reason ? [{ lineId: line.id, name: product.name, artworkName: line.artworkName, reason }] : [];
  });
}

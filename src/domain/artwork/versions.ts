export type ArtworkVersionOrder = { id: string; parent_artwork_id?: string | null; is_active?: boolean };

export function sortActiveArtworkVersions<T extends ArtworkVersionOrder>(all: T[]) {
  const positions = new Map(all.map((artwork, index) => [artwork.id, index]));
  const byId = new Map(all.map((artwork) => [artwork.id, artwork]));
  function originPosition(artwork: T) {
    let current = artwork;
    const visited = new Set<string>();
    while (current.parent_artwork_id && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = byId.get(current.parent_artwork_id);
      if (!parent) break;
      current = parent;
    }
    return positions.get(current.id) ?? positions.get(artwork.id) ?? 0;
  }
  return all
    .filter((artwork) => artwork.is_active !== false)
    .sort((left, right) => originPosition(left) - originPosition(right));
}

/** Root-relative assets cannot be network URLs, even after URL normalization. */
export function localImageSource(path: string | null, demo = false): string | null {
  if (!path || /[\u0000-\u0020\\]/.test(path)) return null;
  if (/^\/(?!\/)/.test(path)) return path;
  if (demo && /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/]+=*$/.test(path)) return path;
  return null;
}

export function isStorageImagePath(path: string) {
  return /^(profiles|campaigns|characters|npcs|world_regions|world_cities|world_locations|battle_maps|campaign_mural)\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(
    path,
  );
}

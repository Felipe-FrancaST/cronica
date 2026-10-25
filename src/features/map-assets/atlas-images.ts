import { ResourceCache } from '@/lib/resource-cache';
import { getSupabase } from '@/lib/supabase/client';
import type { AtlasDocument } from '@/features/atlas/types';
import { assetUrls, getMapAssets } from './repository';
const cache = new ResourceCache<HTMLImageElement>(8 * 60 * 1000, 96);
export type AssetImages = Record<string, HTMLImageElement>;
export function atlasAssetIds(doc: AtlasDocument) {
  return [
    ...new Set(
      doc.objects.flatMap((o) =>
        (o.kind === 'symbol' || o.kind === 'token') && o.asset_id ? [o.asset_id] : [],
      ),
    ),
  ].sort();
}
export async function loadAtlasImages(doc: AtlasDocument, identity?: string): Promise<AssetImages> {
  return loadMapAssetImages(atlasAssetIds(doc), identity);
}
export async function loadMapAssetImages(ids: string[], identity?: string): Promise<AssetImages> {
  if (!ids.length) return {};
  if (ids.length > 96) throw new Error('Use até 96 imagens diferentes por mapa.');
  const user = identity || (await getSupabase().auth.getUser()).data.user?.id;
  if (!user) throw new Error('Entre na sua conta para carregar as imagens do mapa.');
  let batch: Promise<Record<string, string>> | undefined;
  const sources = () => (batch ??= getMapAssets(ids).then((rows) => assetUrls(rows)));
  const entries = await Promise.all(
    ids.map(
      async (id) =>
        [
          id,
          await cache.get(user + ':' + id, async () => {
            const url = (await sources())[id];
            if (!url) throw new Error('Uma imagem do mapa não está disponível na sua biblioteca.');
            return new Promise<HTMLImageElement>((resolve, reject) => {
              const image = new Image(),
                timer = setTimeout(() => {
                  image.src = '';
                  reject(new Error('A imagem demorou para carregar. Tente novamente.'));
                }, 20000);
              image.crossOrigin = 'anonymous';
              image.onload = () => {
                clearTimeout(timer);
                resolve(image);
              };
              image.onerror = () => {
                clearTimeout(timer);
                reject(new Error('Não foi possível carregar uma imagem do mapa.'));
              };
              image.src = url;
            });
          }),
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
}

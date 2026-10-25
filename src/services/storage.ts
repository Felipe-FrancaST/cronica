import { getSupabase } from '@/lib/supabase/client';
import { localImageSource, isStorageImagePath } from '@/lib/media-path';
import { ResourceCache } from '@/lib/resource-cache';
// URLs last 15 minutes. Reuse them for at most 10 minutes, within this session.
const images = new ResourceCache<string | null>(10 * 60 * 1000, 256, Boolean);
let imageIdentity: string | null = null;
let imageEpoch = 0;
export function setMediaIdentity(identity: string | null) {
  if (identity === imageIdentity) return;
  imageIdentity = identity;
  imageEpoch++;
  images.clear();
}
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export type MediaType =
  | 'profiles'
  | 'campaigns'
  | 'characters'
  | 'npcs'
  | 'world_regions'
  | 'world_cities'
  | 'world_locations'
  | 'battle_maps'
  | 'campaign_mural';
export function validateImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Use uma imagem JPG, PNG ou WebP.');
  if (file.size > MAX_IMAGE_SIZE) throw new Error('A imagem deve ter no máximo 5 MB.');
  if (!file.size) throw new Error('A imagem está vazia. Escolha outro arquivo.');
}
export async function uploadImage(
  file: File,
  type: MediaType,
  id: string,
  demo: boolean,
): Promise<string> {
  validateImage(file);
  if (demo)
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error('Não foi possível ler a imagem. Escolha o arquivo novamente.'));
      reader.readAsDataURL(file);
    });
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
  const path = `${type}/${id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await getSupabase()
    .storage.from('campaign-media')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
export async function resolveImage(path: string, demo: boolean) {
  const local = localImageSource(path, demo);
  if (local) return local;
  if (!isStorageImagePath(path)) return null;
  const epoch = imageEpoch;
  const src = await images.get(path, async () => {
    const { data, error } = await getSupabase()
      .storage.from('campaign-media')
      .createSignedUrl(path, 900);
    return error ? null : data.signedUrl;
  });
  return epoch === imageEpoch ? src : null;
}

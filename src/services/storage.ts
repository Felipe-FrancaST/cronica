import { getSupabase } from '@/lib/supabase/client';
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
      reader.onerror = reject;
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
  if (path.startsWith('/') || (demo && path.startsWith('data:image/'))) return path;
  const { data, error } = await getSupabase()
    .storage.from('campaign-media')
    .createSignedUrl(path, 900);
  if (error) return null;
  return data.signedUrl;
}

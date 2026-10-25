import { getSupabase } from '@/lib/supabase/client';
import { loadAtlasImages } from '@/features/map-assets/atlas-images';
import { loadMural, saveMural } from '@/features/mural/repository';
import type { MuralItem } from '@/features/mural/types';
import { exportAtlasCanvas } from './render';
import type { AtlasMap } from './types';
export interface MuralPublication {
  id: string;
  key: string;
  image?: Blob;
  path?: string;
  item?: MuralItem;
}
async function imageBlob(map: AtlasMap, tokens: boolean) {
  await document.fonts.ready;
  const width = Math.min(2048, (4096 * map.width) / map.height);
  const canvas = exportAtlasCanvas(
    map.document,
    width,
    tokens,
    await loadAtlasImages(map.document),
  );
  const image = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar a imagem do mapa.'))),
      'image/webp',
      0.86,
    ),
  );
  if (image.size > 5 * 1024 * 1024)
    throw new Error('A imagem ultrapassou 5 MB. Reduza o tamanho do mapa antes de enviar.');
  return image;
}
async function findPublished(job: MuralPublication, map: AtlasMap, session: string, demo: boolean) {
  if (demo)
    return (await loadMural(map.campaign_id, true, true, session)).find((i) => i.id === job.id);
  const { data, error } = await getSupabase()
    .from('campaign_mural_items')
    .select('*')
    .eq('id', job.id)
    .eq('campaign_id', map.campaign_id)
    .abortSignal(AbortSignal.timeout(12000))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as MuralItem | null;
}
export async function publishAtlasToMural(
  job: MuralPublication,
  map: AtlasMap,
  session: string,
  title: string,
  tokens: boolean,
  demo: boolean,
  progress: (status: string) => void,
) {
  if (job.item) return job.item;
  progress('Conferindo o mural…');
  const existing = await findPublished(job, map, session, demo);
  if (existing) {
    job.item = existing;
    return existing;
  }
  progress('Preparando a imagem…');
  job.image ??= await imageBlob(map, tokens);
  if (!job.path) {
    if (demo)
      job.path = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Não foi possível preparar a imagem.'));
        reader.readAsDataURL(job.image!);
      });
    else {
      const path = `campaign_mural/${map.campaign_id}/${job.id}.webp`;
      progress('Enviando a imagem…');
      const { error } = await getSupabase()
        .storage.from('campaign-media')
        .upload(path, job.image, { contentType: job.image.type, upsert: false });
      if (
        error &&
        String((error as { statusCode?: string }).statusCode) !== '409' &&
        !/already exists|duplicate/i.test(error.message)
      )
        throw new Error(error.message);
      job.path = path;
    }
  }
  const now = new Date().toISOString();
  const item: MuralItem = {
    id: job.id,
    campaign_id: map.campaign_id,
    adventure_session_id: session,
    kind: 'image',
    title: title.trim(),
    description: '',
    image_path: job.path,
    source_location_id: null,
    source_npc_id: null,
    visible_to_players: true,
    pinned: false,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  };
  progress('Publicando no mural…');
  try {
    job.item = await saveMural(item, null, demo);
  } catch (error) {
    const published = await findPublished(job, map, session, demo);
    if (!published) throw error;
    job.item = published;
  }
  return job.item;
}

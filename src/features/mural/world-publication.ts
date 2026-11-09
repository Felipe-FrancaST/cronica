import type { WorldEntry } from '@/types';
import { worldMuralSummary } from '@/lib/world-hierarchy';
import { getSupabase } from '@/lib/supabase/client';
import { uid, now } from '@/lib/utils';
import { resolveImage, uploadImage } from '@/services/storage';
import { saveMural } from './repository';
import type { MuralItem } from './types';

/** Copy world art into the Mural's own storage area. A private world's signed
 * URL must never be reused on a player-visible card; it would stop resolving. */
export async function copyWorldImageToMural(
  path: string | null,
  campaignId: string,
  demo: boolean,
) {
  if (!path) return null;
  if (path.startsWith('campaign_mural/')) return path;
  const source = await resolveImage(path, demo);
  if (!source)
    throw new Error('A imagem deste lugar não está disponível. Troque a imagem e tente novamente.');
  const response = await fetch(source, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Não foi possível preparar a imagem para o Mural.');
  const blob = await response.blob();
  const contentType = blob.type.toLowerCase().split(';')[0];
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType))
    throw new Error('A imagem precisa estar em JPG, PNG ou WebP.');
  const extension =
    contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  return uploadImage(
    new File([blob], `mundo.${extension}`, { type: contentType }),
    'campaign_mural',
    campaignId,
    demo,
  );
}

export async function discardMuralImage(path: string | null, demo: boolean) {
  if (!demo && path?.startsWith('campaign_mural/')) {
    await getSupabase().storage.from('campaign-media').remove([path]);
  }
}

/** Publishing is a deliberately public snapshot, never a copy of GM secrets. */
export async function publishWorldToMural({
  entry,
  sessionId,
  title,
  visible,
  demo,
}: {
  entry: WorldEntry;
  sessionId: string;
  title: string;
  visible: boolean;
  demo: boolean;
}) {
  const cleanedTitle = title.trim();
  if (!cleanedTitle) throw new Error('Informe um título para o cartão.');
  if (!sessionId) throw new Error('Selecione uma sessão do Mural.');
  let uploaded: string | null = null;
  try {
    const image = await copyWorldImageToMural(entry.image_path, entry.campaign_id, demo);
    if (image !== entry.image_path) uploaded = image;
    const timestamp = now();
    const item: MuralItem = {
      id: uid(),
      campaign_id: entry.campaign_id,
      adventure_session_id: sessionId,
      kind: 'location',
      title: cleanedTitle,
      description: worldMuralSummary(entry),
      image_path: image,
      source_location_id: entry.kind === 'location' ? entry.id : null,
      source_npc_id: null,
      visible_to_players: visible,
      pinned: false,
      sort_order: 0,
      created_at: timestamp,
      updated_at: timestamp,
    };
    return await saveMural(item, null, demo);
  } catch (error) {
    if (uploaded) await discardMuralImage(uploaded, demo).catch(() => {});
    throw error;
  }
}

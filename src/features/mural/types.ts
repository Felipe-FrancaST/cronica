import { z } from 'zod';
export const MURAL_KINDS = ['location', 'npc', 'image', 'note'] as const;
export type MuralKind = (typeof MURAL_KINDS)[number];
export const MURAL_LABELS: Record<MuralKind, string> = {
  location: 'Local',
  npc: 'NPC',
  image: 'Imagem',
  note: 'Nota',
};
export interface MuralItem {
  adventure_session_id?: string;
  id: string;
  campaign_id: string;
  kind: MuralKind;
  title: string;
  description: string;
  image_path: string | null;
  source_location_id: string | null;
  source_npc_id: string | null;
  visible_to_players: boolean;
  pinned: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
const draftSchema = z.object({
  adventure_session_id: z.string().uuid().optional(),
  id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  kind: z.enum(MURAL_KINDS),
  title: z
    .string()
    .trim()
    .min(1, 'Dê um título ao cartão.')
    .max(180, 'O título deve ter até 180 caracteres.'),
  description: z.string().max(12000, 'A descrição deve ter até 12.000 caracteres.'),
  image_path: z.string().nullable(),
  source_location_id: z.string().uuid().nullable(),
  source_npc_id: z.string().uuid().nullable(),
  visible_to_players: z.boolean(),
  pinned: z.boolean(),
  sort_order: z.number().int().min(0).max(10000),
});
export function muralPayload(item: MuralItem, demo = false) {
  // An explicit public projection: fields from a sheet or private world notes never enter the payload.
  const parsed = draftSchema.safeParse(item);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const data = parsed.data;
  if (
    data.image_path &&
    !(
      (data.image_path.length <= 1024 &&
        /^(?:\/images\/[\w/-]+\.(?:jpg|jpeg|png|webp)|(?:campaign_mural|campaigns|npcs|world_regions|world_cities|world_locations|battle_maps)\/[\da-f-]{36}\/[\w-]+\.(?:jpg|jpeg|png|webp))$/i.test(
          data.image_path,
        )) ||
      (demo && /^data:image\/(jpeg|png|webp);base64,/.test(data.image_path))
    )
  )
    throw new Error('Use uma imagem enviada para esta campanha.');
  if (data.kind === 'image' && !data.image_path)
    throw new Error('Escolha uma imagem para este cartão.');
  if (
    (data.source_location_id && data.kind !== 'location') ||
    (data.source_npc_id && data.kind !== 'npc')
  )
    throw new Error('Vínculo inválido para o tipo do cartão.');
  return data;
}
export function sortMuralItems(items: MuralItem[]) {
  return [...items].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      a.sort_order - b.sort_order ||
      a.id.localeCompare(b.id),
  );
}

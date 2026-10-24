import { getSupabase } from '@/lib/supabase/client';
import type { Character, Workspace } from '@/types';
import {
  characterRest,
  inspirationCount,
  type RestKind,
  type RestResult,
} from '@/systems/dnd5e/character-rest';
import { rulesFor } from '@/features/sessions/types';
export async function executeCharacterRest(
  c: Character,
  kind: RestKind,
  hitDice: Record<string, number>,
  client: string,
  demo: boolean,
  userId: string,
): Promise<RestResult> {
  if (!demo) {
    const { data, error } = await getSupabase().rpc('rest_character', {
      p_character_id: c.id,
      p_kind: kind,
      p_hit_dice: hitDice,
      p_client_id: client,
    });
    if (error) throw new Error(error.message);
    return data as RestResult;
  }
  const w = JSON.parse(localStorage.getItem('cronica:demo:v1') || 'null') as Workspace | null;
  if (!w) throw new Error('Reabra a demonstração.');
  const current = w.characters.find((v) => v.id === c.id)!,
    gm = w.campaigns.some((v) => v.id === c.campaign_id && v.owner_id === userId);
  if (!gm && (current.owner_id !== userId || !rulesFor(w.rules, c.campaign_id).players_can_rest))
    throw new Error('Somente o mestre pode executar descansos nesta campanha.');
  const done = characterRest(current.sheet, kind, hitDice);
  current.sheet = done.sheet;
  current.updated_at = new Date().toISOString();
  localStorage.setItem('cronica:demo:v1', JSON.stringify(w));
  return done.result;
}
export async function changeInspiration(
  c: Character,
  delta: number,
  client: string,
  demo: boolean,
  userId: string,
): Promise<{ count: number; updated_at: string }> {
  if (!demo) {
    const { data, error } = await getSupabase().rpc('change_character_inspiration', {
      p_character_id: c.id,
      p_delta: delta,
      p_client_id: client,
    });
    if (error) throw new Error(error.message);
    return data as { count: number; updated_at: string };
  }
  const w = JSON.parse(localStorage.getItem('cronica:demo:v1') || 'null') as Workspace | null;
  if (!w) throw new Error('Reabra a demonstração.');
  const current = w.characters.find((v) => v.id === c.id)!,
    gm = w.campaigns.some((v) => v.id === c.campaign_id && v.owner_id === userId);
  if (!gm && (delta > 0 || current.owner_id !== userId))
    throw new Error('Somente o mestre pode conceder inspiração.');
  const count = inspirationCount(current.sheet) + delta;
  if (count < 0 || count > 99) throw new Error('Não há inspiração disponível, ou o limite é 99.');
  current.sheet = {
    ...current.sheet,
    inspiration_count: count,
    details: { ...current.sheet.details, inspiration: count > 0 },
  };
  current.updated_at = new Date().toISOString();
  localStorage.setItem('cronica:demo:v1', JSON.stringify(w));
  return { count, updated_at: current.updated_at };
}

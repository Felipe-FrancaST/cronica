import { getSupabase } from '@/lib/supabase/client';
import type { DiceRoll, RollOptions } from './dice';
import { parseDiceExpression } from './dice';
export async function rollBattleDice(
  mapId: string,
  options: RollOptions,
  clientId: string,
): Promise<DiceRoll> {
  const { expression } = parseDiceExpression(options.expression);
  const { data, error } = await getSupabase().rpc('roll_battle_dice', {
    p_map_id: mapId,
    p_expression: expression,
    p_client_id: clientId,
    p_label: options.label ?? '',
    p_visibility: options.visibility ?? 'public',
    p_mode: options.mode ?? 'normal',
    p_request_id: options.requestId ?? null,
    p_effect_id: options.effectId ?? null,
  });
  if (error)
    throw new Error(
      ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code)
        ? 'Aplique a migração 010 para habilitar as rolagens.'
        : error.message,
    );
  return data as DiceRoll;
}
export async function loadDiceHistory(campaignId: string, mapIds?: string[]): Promise<DiceRoll[]> {
  if (mapIds && !mapIds.length) return [];
  let query = getSupabase()
    .from('battle_dice_rolls')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(40);
  if (mapIds) query = query.in('map_id', mapIds);
  const { data, error } = await query;
  if (error) throw error;
  return data as DiceRoll[];
}

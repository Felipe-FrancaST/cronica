import { getSupabase } from '@/lib/supabase/client';
import type { WorkspaceRepository } from '@/types';
import { loadWorkspace } from './workspace-reader';
const worldTables = {
  region: 'world_regions',
  city: 'world_cities',
  location: 'world_locations',
} as const;
type RawRow = Record<string, unknown>;
function requireResult<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}
function confirmedVersion(data: unknown) {
  const row = (Array.isArray(data) ? data[0] : data) as RawRow | null;
  if (!row || typeof row.updated_at !== 'string' || typeof row.created_at !== 'string')
    throw new Error(
      'Não foi possível confirmar a versão salva. Atualize o registro antes de tentar novamente.',
    );
  return { updated_at: row.updated_at, created_at: row.created_at };
}
export const supabaseRepository: WorkspaceRepository = {
  load: loadWorkspace,
  async saveCampaign(c, expected = null) {
    const result = confirmedVersion(
      requireResult(
        await getSupabase().rpc('save_campaign_checked', {
          p_payload: c,
          p_expected_updated_at: expected,
        }),
      ),
    );
    c.updated_at = result.updated_at;
    c.created_at = result.created_at;
  },
  async deleteCampaign(id) {
    requireResult(
      await getSupabase().from('campaigns').delete().eq('id', id).select('id').single(),
    );
  },
  async addMember(campaignId, email) {
    requireResult(
      await getSupabase().rpc('add_campaign_member_by_email', {
        p_campaign_id: campaignId,
        p_email: email.trim(),
      }),
    );
  },
  async removeMember(id) {
    requireResult(
      await getSupabase().from('campaign_members').delete().eq('id', id).select('id').single(),
    );
  },
  async saveCharacter(c) {
    const result = requireResult(
      await getSupabase().rpc('save_character', {
        p_payload: c,
        p_expected_updated_at: c.updated_at,
      }),
    ) as RawRow;
    if (typeof result.updated_at === 'string') c.updated_at = result.updated_at;
  },
  async deleteCharacter(id) {
    requireResult(
      await getSupabase().from('characters').delete().eq('id', id).select('id').single(),
    );
  },
  async saveWorld(w, expected = null) {
    const result = confirmedVersion(
      requireResult(
        await getSupabase().rpc('save_world_entry_checked', {
          p_payload: w,
          p_expected_updated_at: expected,
        }),
      ),
    );
    w.updated_at = result.updated_at;
    w.created_at = result.created_at;
  },
  async deleteWorld(w) {
    requireResult(
      await getSupabase().from(worldTables[w.kind]).delete().eq('id', w.id).select('id').single(),
    );
  },
  async saveNpc(n) {
    requireResult(
      await getSupabase().rpc('save_npc', {
        p_payload: { ...n, expected_updated_at: n.updated_at },
      }),
    );
    const fresh = requireResult(
      await getSupabase().from('npcs').select('updated_at').eq('id', n.id).single(),
    ) as { updated_at: string };
    n.updated_at = fresh.updated_at;
  },
  async deleteNpc(id) {
    requireResult(await getSupabase().from('npcs').delete().eq('id', id).select('id').single());
  },
  async saveProfile(p) {
    requireResult(
      await getSupabase()
        .from('profiles')
        .update({ name: p.name, avatar_path: p.avatar_path })
        .eq('id', p.id)
        .select('id')
        .single(),
    );
  },
  async savePreferences(preferences) {
    const result = await getSupabase().rpc('update_profile_preferences', {
      p_preferences: preferences,
    });
    if (result.error && ['PGRST202', '42883'].includes(result.error.code))
      throw new Error(
        'As novas configurações precisam da atualização SQL 033. Solicite ao administrador a aplicação desse arquivo.',
      );
    return requireResult(result);
  },
};

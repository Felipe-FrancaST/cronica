import { getSupabase } from '@/lib/supabase/client';
import type {
  Workspace,
  WorkspaceRepository,
  Character,
  Npc,
  WorldEntry,
  Member,
  RpgSystem,
} from '@/types';
import { getSystem } from '@/systems/registry';
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
const rows = (values: unknown) => (values ?? []) as RawRow[];
export const supabaseRepository: WorkspaceRepository = {
  async load(): Promise<Workspace> {
    const s = getSupabase();
    const queries = [
      s.from('profiles').select('*'),
      s.from('rpg_systems').select('*').eq('active', true),
      s.from('campaigns').select('*').order('created_at', { ascending: false }),
      s.from('campaign_members').select('*'),
      s
        .from('characters')
        .select(
          '*, character_attributes(*), character_skills(*), character_inventory(*), character_spells(*)',
        ),
      ...Object.values(worldTables).map((table) => s.from(table).select('*')),
      ...Object.values(worldTables).map((table) => s.from(`${table}_private`).select('*')),
      s.from('npcs').select('*, npc_stats(*), npc_attacks(*), npc_spells(*)'),
      s.from('campaign_rules').select('*'),
    ];
    const results = await Promise.all(queries);
    const values = results.map((r, i) =>
      i === 12 && r.error && ['42P01', 'PGRST205'].includes(r.error.code) ? [] : requireResult(r),
    );
    const characters = rows(values[4]).map((row) => {
      const system = (values[1] as unknown as RpgSystem[]).find((s) => s.id === row.rpg_system_id);
      if (!system) throw new Error('O sistema desta ficha não está disponível.');
      const attributes = rows(row.character_attributes);
      const skills = rows(row.character_skills);
      const inventory = rows(row.character_inventory).map((i) => ({
        id: i.id,
        ...(i.data as RawRow),
      }));
      const spells = rows(row.character_spells).map((i) => ({ id: i.id, ...(i.data as RawRow) }));
      return {
        ...row,
        sheet: getSystem(system.slug).hydrateSheet({
          data: row.system_data as RawRow,
          attributes: attributes as unknown as { ability: string; score: number }[],
          skills: skills as unknown as { skill: string; proficiency: number }[],
          inventory,
          spells,
        }),
      } as unknown as Character;
    });
    const world = (Object.keys(worldTables) as (keyof typeof worldTables)[]).flatMap(
      (kind, index) =>
        rows(values[5 + index]).map((row) => {
          const secret = rows(values[8 + index]).find((p) => p.entry_id === row.id);
          return {
            type: '',
            location: '',
            notes: '',
            region_id: null,
            population: null,
            government: '',
            ...row,
            kind,
            secrets: secret?.secrets,
            private_notes: secret?.private_notes,
          } as WorldEntry;
        }),
    );
    const npcs = rows(values[11]).map((row) => {
      const stats = Array.isArray(row.npc_stats) ? row.npc_stats[0] : row.npc_stats;
      return {
        ...row,
        ...(stats as RawRow),
        id: row.id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        attacks: rows(row.npc_attacks).map((a) => ({ id: a.id, ...(a.data as RawRow) })),
        spells: rows(row.npc_spells).map((a) => ({ id: a.id, ...(a.data as RawRow) })),
      } as unknown as Npc;
    });
    return {
      profiles: values[0],
      systems: values[1],
      campaigns: values[2],
      members: values[3] as unknown as Member[],
      characters,
      world,
      npcs,
      rules: values[12],
    } as unknown as Workspace;
  },
  async saveCampaign(c) {
    const { error } = await getSupabase().from('campaigns').upsert(c);
    if (error) throw new Error(error.message);
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
  async saveWorld(w) {
    requireResult(await getSupabase().rpc('save_world_entry', { p_payload: w }));
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
    const { error } = await getSupabase()
      .from('profiles')
      .update({ name: p.name, avatar_path: p.avatar_path, preferences: p.preferences })
      .eq('id', p.id);
    if (error) throw new Error(error.message);
  },
};

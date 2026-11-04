import { getSupabase } from '@/lib/supabase/client';
import { readAllRows, readRelatedRows } from '@/lib/paginated-query';
import { getSystem } from '@/systems/registry';
import type {
  Character,
  Npc,
  RpgSystem,
  Workspace,
  WorkspaceLoadOptions,
  WorldEntry,
} from '@/types';

type Row = Record<string, unknown>;
const worldTables = {
  region: 'world_regions',
  city: 'world_cities',
  location: 'world_locations',
} as const;
const allResources = [
  'profiles',
  'systems',
  'campaigns',
  'members',
  'rules',
  'summaries',
  'characters',
  'npcs',
  'world',
];

export async function loadWorkspace(options: WorkspaceLoadOptions = {}): Promise<Workspace> {
  const client = getSupabase();
  const resources = new Set(options.resources ?? allResources);
  const sections = new Set(options.sections ?? ['characters', 'npcs', 'world']);
  const previous = options.previous;
  const scan = (table: string, columns = '*', campaign = false, order = 'id') =>
    readAllRows<Row>((from, to) => {
      let query = client.from(table).select(columns, { count: 'exact' });
      if (campaign && options.campaignId) query = query.eq('campaign_id', options.campaignId);
      return query.order(order).range(from, to);
    });
  const related = (table: string, field: string, ids: string[], columns = '*', order = 'id') =>
    readRelatedRows<Row>(ids, (chunk, from, to) =>
      client
        .from(table)
        .select(columns, { count: 'exact' })
        .in(field, chunk)
        .order(order)
        .range(from, to),
    );
  async function summaries() {
    const result = await client.rpc('get_workspace_summaries');
    if (result.error)
      throw new Error(
        ['PGRST202', '42883'].includes(result.error.code)
          ? 'Aplique a atualização SQL 047 para carregar esta versão do Crônica.'
          : result.error.message,
      );
    return result.data as Workspace['summaries'];
  }
  const [profiles, systems, campaigns, members, rules, counts] = await Promise.all([
    resources.has('profiles') || !previous
      ? scan('profiles', 'id,name,email,avatar_path,preferences,created_at')
      : previous.profiles,
    resources.has('systems') || !previous
      ? readAllRows<Row>((from, to) =>
          client
            .from('rpg_systems')
            .select('id,name,slug,version,description,active', { count: 'exact' })
            .eq('active', true)
            .order('id')
            .range(from, to),
        )
      : previous.systems,
    resources.has('campaigns') || !previous
      ? readAllRows<Row>((from, to) =>
          client
            .from('campaigns')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .order('id')
            .range(from, to),
        )
      : previous.campaigns,
    resources.has('members') || !previous
      ? scan('campaign_members', 'id,campaign_id,user_id,status,created_at')
      : previous.members,
    resources.has('rules') || !previous
      ? scan('campaign_rules', '*', false, 'campaign_id')
      : (previous.rules ?? []),
    resources.has('summaries') || !previous ? summaries() : previous.summaries,
  ]);
  const activeSystems = systems as unknown as RpgSystem[];
  const characters = async (): Promise<Character[]> => {
    if (!sections.has('characters')) return [];
    if (previous && !resources.has('characters')) return previous.characters;
    const base = await scan('characters', '*', true);
    const ids = base.map((row) => String(row.id));
    const [attributes, skills, inventory, spells] = await Promise.all([
      related('character_attributes', 'character_id', ids, 'id,character_id,ability,score'),
      related('character_skills', 'character_id', ids, 'id,character_id,skill,proficiency'),
      related('character_inventory', 'character_id', ids, 'id,character_id,data'),
      related('character_spells', 'character_id', ids, 'id,character_id,data'),
    ]);
    const group = (rows: Row[]) => {
      const byId = new Map<string, Row[]>();
      for (const row of rows) {
        const id = String(row.character_id);
        const list = byId.get(id) ?? [];
        list.push(row);
        byId.set(id, list);
      }
      return byId;
    };
    const [attrs, trained, items, magic] = [attributes, skills, inventory, spells].map(group);
    return base.map((row) => {
      const system = activeSystems.find((s) => s.id === row.rpg_system_id);
      if (!system) throw new Error('O sistema desta ficha não está disponível.');
      const id = String(row.id);
      return {
        ...row,
        sheet: getSystem(system.slug).hydrateSheet({
          data: row.system_data as Row,
          attributes: (attrs.get(id) ?? []) as unknown as { ability: string; score: number }[],
          skills: (trained.get(id) ?? []) as unknown as { skill: string; proficiency: number }[],
          inventory: (items.get(id) ?? []).map((i) => ({ id: i.id, ...(i.data as Row) })),
          spells: (magic.get(id) ?? []).map((i) => ({ id: i.id, ...(i.data as Row) })),
        }),
      } as unknown as Character;
    });
  };
  const world = async (): Promise<WorldEntry[]> => {
    if (!sections.has('world')) return [];
    if (previous && !resources.has('world')) return previous.world;
    return (
      await Promise.all(
        Object.entries(worldTables).map(async ([kind, table]) => {
          const base = await scan(table, '*', true);
          const secrets = await related(
            table + '_private',
            'entry_id',
            base.map((r) => String(r.id)),
            'entry_id,secrets,private_notes',
            'entry_id',
          );
          const byId = new Map(secrets.map((s) => [s.entry_id, s]));
          return base.map(
            (row) =>
              ({
                type: '',
                location: '',
                notes: '',
                region_id: null,
                population: null,
                government: '',
                ...row,
                kind,
                secrets: byId.get(row.id)?.secrets,
                private_notes: byId.get(row.id)?.private_notes,
              }) as WorldEntry,
          );
        }),
      )
    ).flat();
  };
  const npcs = async (): Promise<Npc[]> => {
    if (!sections.has('npcs')) return [];
    if (previous && !resources.has('npcs')) return previous.npcs;
    const base = await scan('npcs', '*', true);
    const ids = base.map((r) => String(r.id));
    const [stats, attacks, spells] = await Promise.all([
      related('npc_stats', 'npc_id', ids, '*', 'npc_id'),
      related('npc_attacks', 'npc_id', ids, 'id,npc_id,data'),
      related('npc_spells', 'npc_id', ids, 'id,npc_id,data'),
    ]);
    const statsById = new Map(stats.map((row) => [row.npc_id, row]));
    const group = (rows: Row[]) => {
      const result = new Map<unknown, Row[]>();
      for (const row of rows) {
        const list = result.get(row.npc_id) ?? [];
        list.push(row);
        result.set(row.npc_id, list);
      }
      return result;
    };
    const attacksById = group(attacks),
      spellsById = group(spells);
    return base.map(
      (row) =>
        ({
          ...row,
          ...statsById.get(row.id),
          id: row.id,
          created_at: row.created_at,
          updated_at: row.updated_at,
          attacks: (attacksById.get(row.id) ?? []).map((a) => ({ id: a.id, ...(a.data as Row) })),
          spells: (spellsById.get(row.id) ?? []).map((a) => ({ id: a.id, ...(a.data as Row) })),
        }) as unknown as Npc,
    );
  };
  const [characterRows, worldRows, npcRows] = await Promise.all([characters(), world(), npcs()]);
  return {
    profiles,
    systems,
    campaigns,
    members,
    rules,
    summaries: counts,
    characters: characterRows,
    world: worldRows,
    npcs: npcRows,
  } as Workspace;
}

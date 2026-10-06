import type {
  Workspace,
  WorkspaceRepository,
  Campaign,
  Character,
  WorldEntry,
  Npc,
  Profile,
} from '@/types';
import { createDemoWorkspace, DEMO_USER_ID } from '@/lib/demo-data';
import { uid, now } from '@/lib/utils';
import { dnd5e } from '@/systems/dnd5e';
const KEY = 'cronica:demo:v1';
function read(): Workspace {
  try {
    const value = localStorage.getItem(KEY);
    if (value) return JSON.parse(value) as Workspace;
  } catch {
    /* Start a new explicit demo if browser data was corrupted. */
  }
  const seed = createDemoWorkspace();
  localStorage.setItem(KEY, JSON.stringify(seed));
  return seed;
}
function update(fn: (data: Workspace) => void) {
  const data = read();
  fn(data);
  localStorage.setItem(KEY, JSON.stringify(data));
}
export function accessibleWorkspace(data: Workspace, userId: string): Workspace {
  const master = new Set(data.campaigns.filter((c) => c.owner_id === userId).map((c) => c.id));
  const access = new Set([
    ...master,
    ...data.members.filter((m) => m.user_id === userId).map((m) => m.campaign_id),
  ]);
  const campaigns = data.campaigns.filter((c) => access.has(c.id));
  const characters = data.characters.filter(
    (c) => master.has(c.campaign_id) || (c.owner_id === userId && access.has(c.campaign_id)),
  );
  return {
    ...data,
    campaigns,
    members: data.members.filter((m) => access.has(m.campaign_id)),
    characters,
    world: data.world
      .filter(
        (w) => master.has(w.campaign_id) || (access.has(w.campaign_id) && w.visible_to_players),
      )
      .map((w) =>
        master.has(w.campaign_id) ? w : { ...w, secrets: undefined, private_notes: undefined },
      ),
    npcs: data.npcs.filter(
      (n) => master.has(n.campaign_id) || (access.has(n.campaign_id) && n.visible_to_players),
    ),
  };
}
function upsert<T extends { id: string }>(values: T[], value: T) {
  const i = values.findIndex((x) => x.id === value.id);
  if (i < 0) values.push(value);
  else values[i] = value;
}
function owner(data: Workspace, campaignId: string) {
  if (!data.campaigns.some((c) => c.id === campaignId && c.owner_id === DEMO_USER_ID))
    throw new Error('Apenas o mestre desta campanha pode fazer esta alteração.');
}
function canEditCharacter(data: Workspace, character: Character) {
  const current = data.characters.find((c) => c.id === character.id);
  if (
    current &&
    (current.campaign_id !== character.campaign_id || current.owner_id !== character.owner_id)
  )
    throw new Error('O vínculo do personagem não pode ser alterado.');
  if (data.campaigns.some((c) => c.id === character.campaign_id && c.owner_id === DEMO_USER_ID))
    return;
  const rules = data.rules?.find((r) => r.campaign_id === character.campaign_id);
  if (
    rules?.players_can_edit_sheets === false ||
    (!current && rules?.players_can_create_characters === false)
  )
    throw new Error('A edição de fichas é controlada pelo mestre.');
  if (rules?.lock_player_level && character.sheet.level !== rules.party_level)
    throw new Error('O nível é definido pelo mestre nas regras da campanha.');
  if (
    character.owner_id === DEMO_USER_ID &&
    data.members.some((m) => m.campaign_id === character.campaign_id && m.user_id === DEMO_USER_ID)
  )
    return;
  throw new Error('Você não tem acesso a este personagem.');
}
export const demoRepository: WorkspaceRepository = {
  async load() {
    return accessibleWorkspace(read(), DEMO_USER_ID);
  },
  async saveCampaign(c: Campaign) {
    update((d) => {
      const current = d.campaigns.find((x) => x.id === c.id);
      if (current) owner(d, c.id);
      if (c.owner_id !== DEMO_USER_ID) throw new Error('Mestre inválido.');
      upsert(d.campaigns, c);
    });
  },
  async deleteCampaign(id) {
    update((d) => {
      owner(d, id);
      d.campaigns = d.campaigns.filter((x) => x.id !== id);
      d.members = d.members.filter((x) => x.campaign_id !== id);
      d.characters = d.characters.filter((x) => x.campaign_id !== id);
      d.world = d.world.filter((x) => x.campaign_id !== id);
      d.npcs = d.npcs.filter((x) => x.campaign_id !== id);
    });
  },
  async addMember(campaignId, email) {
    update((d) => {
      owner(d, campaignId);
      const p = d.profiles.find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
      if (!p) throw new Error('Este usuário ainda não possui uma conta.');
      if (p.id === DEMO_USER_ID) throw new Error('Você já é o mestre desta campanha.');
      if (d.members.some((m) => m.campaign_id === campaignId && m.user_id === p.id))
        throw new Error('Este jogador já está na campanha.');
      d.members.push({
        id: uid(),
        campaign_id: campaignId,
        user_id: p.id,
        status: 'active',
        created_at: now(),
      });
    });
  },
  async removeMember(id) {
    update((d) => {
      const m = d.members.find((m) => m.id === id);
      if (m) {
        owner(d, m.campaign_id);
        d.members = d.members.filter((x) => x.id !== id);
      }
    });
  },
  async saveCharacter(c: Character) {
    update((d) => {
      canEditCharacter(d, c);
      const errors = dnd5e.validate(c);
      if (errors.length) throw new Error(errors.join(' '));
      upsert(d.characters, c);
    });
  },
  async deleteCharacter(id) {
    update((d) => {
      const c = d.characters.find((x) => x.id === id);
      if (c) {
        canEditCharacter(d, c);
        d.characters = d.characters.filter((x) => x.id !== id);
      }
    });
  },
  async saveWorld(w: WorldEntry) {
    update((d) => {
      owner(d, w.campaign_id);
      const existing = d.world.find((x) => x.id === w.id);
      if (existing && existing.campaign_id !== w.campaign_id) throw new Error('Campanha inválida.');
      upsert(d.world, w);
    });
  },
  async deleteWorld(w: WorldEntry) {
    update((d) => {
      owner(d, w.campaign_id);
      d.world = d.world.filter((x) => x.id !== w.id);
      d.world.forEach((x) => {
        if (x.region_id === w.id) x.region_id = null;
      });
    });
  },
  async saveNpc(n: Npc) {
    update((d) => {
      owner(d, n.campaign_id);
      const existing = d.npcs.find((x) => x.id === n.id);
      if (existing && existing.campaign_id !== n.campaign_id) throw new Error('Campanha inválida.');
      upsert(d.npcs, n);
    });
  },
  async deleteNpc(id) {
    update((d) => {
      const n = d.npcs.find((x) => x.id === id);
      if (n) {
        owner(d, n.campaign_id);
        d.npcs = d.npcs.filter((x) => x.id !== id);
      }
    });
  },
  async saveProfile(p: Profile) {
    update((d) => {
      if (p.id !== DEMO_USER_ID) throw new Error('Perfil inválido.');
      upsert(d.profiles, p);
    });
  },
};
export function resetDemo() {
  localStorage.removeItem(KEY);
}

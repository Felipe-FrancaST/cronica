import { getSupabase } from '@/lib/supabase/client';
import { DEMO_USER_ID } from '@/lib/demo-data';
import { normalizeSpellResources } from '@/systems/dnd5e/spellcasting';
import type { Workspace } from '@/types';
import type { MuralItem } from '@/features/mural/types';
import { defaultRules, type CampaignSession, type CampaignRules, type SessionEvent } from './types';

const key = (cid: string) => `cronica:sessions:v1:${cid}`;
const eventsKey = (cid: string) => `cronica:session-events:v1:${cid}`;
function read<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(name) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
function put(name: string, value: unknown, cid: string) {
  localStorage.setItem(name, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('cronica:sessions-change', { detail: cid }));
}
function demoGM(cid: string) {
  const w = read<Workspace | null>('cronica:demo:v1', null);
  if (!w?.campaigns.some((c) => c.id === cid && c.owner_id === DEMO_USER_ID))
    throw new Error('Somente o mestre pode alterar esta campanha.');
  return w;
}
export function sessionError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (['42P01', 'PGRST202', 'PGRST205'].includes(error.code || ''))
    throw new Error('Aplique a migração 016 no Supabase para habilitar Sessões e Regras.');
  if (error.code === '23505')
    throw new Error('Já existe uma sessão com este número ou outra sessão está ativa.');
  throw new Error(error.message);
}
async function rpc<T>(name: string, params: Record<string, unknown>) {
  const { data, error } = await getSupabase().rpc(name, params);
  sessionError(error);
  return (Array.isArray(data) ? data[0] : data) as T;
}
export function demoSessionEvent(
  cid: string,
  sid: string | undefined,
  kind: string,
  title: string,
  description = '',
  image: string | null = null,
  visible = true,
) {
  if (
    !sid ||
    !read<CampaignSession[]>(key(cid), []).some((s) => s.id === sid && s.status === 'active')
  )
    return;
  const event: SessionEvent = {
    id: crypto.randomUUID(),
    campaign_id: cid,
    adventure_session_id: sid,
    kind,
    title,
    description,
    image_path: image,
    visibility: visible ? 'players' : 'gm',
    data: {},
    created_at: new Date().toISOString(),
  };
  put(eventsKey(cid), [event, ...read<SessionEvent[]>(eventsKey(cid), [])], cid);
}
export async function loadCampaignSessions(cid: string, demo: boolean, master: boolean) {
  if (demo) {
    let items = read<CampaignSession[]>(key(cid), []);
    const muralKey = `cronica:mural:v1:${cid}`,
      cards = read<MuralItem[]>(muralKey, []);
    if (!items.length && cards.length && master) {
      const stamp = new Date().toISOString();
      const s: CampaignSession = {
        id: crypto.randomUUID(),
        campaign_id: cid,
        name: 'Mesa existente',
        number: 1,
        status: 'planned',
        summary: '',
        created_by: DEMO_USER_ID,
        created_at: stamp,
        updated_at: stamp,
        started_at: null,
        ended_at: null,
      };
      items = [s];
      put(key(cid), items, cid);
      localStorage.setItem(
        muralKey,
        JSON.stringify(cards.map((c) => ({ ...c, adventure_session_id: s.id }))),
      );
    }
    return items
      .filter((s) => master || s.status !== 'planned')
      .sort((a, b) => b.number - a.number);
  }
  const { data, error } = await getSupabase()
    .from('campaign_sessions')
    .select('*')
    .eq('campaign_id', cid)
    .order('number', { ascending: false });
  sessionError(error);
  return (data ?? []) as CampaignSession[];
}
export async function saveSession(
  cid: string,
  name: string,
  number: number,
  demo: boolean,
  previous?: CampaignSession,
) {
  if (
    !name.trim() ||
    name.trim().length > 120 ||
    !Number.isInteger(number) ||
    number < 1 ||
    number > 100000
  )
    throw new Error('Informe um nome (até 120 caracteres) e um número positivo para a sessão.');
  if (!demo)
    return rpc<CampaignSession>('save_campaign_session', {
      p_campaign_id: cid,
      p_name: name.trim(),
      p_number: number,
      p_session_id: previous?.id ?? null,
      p_expected_updated_at: previous?.updated_at ?? null,
    });
  demoGM(cid);
  const all = read<CampaignSession[]>(key(cid), []);
  if (all.some((s) => s.number === number && s.id !== previous?.id))
    throw new Error('Já existe uma sessão com este número.');
  if (
    previous &&
    !all.some(
      (s) => s.id === previous.id && s.status === 'planned' && s.updated_at === previous.updated_at,
    )
  )
    throw new Error('A sessão mudou. Atualize a lista.');
  const stamp = new Date().toISOString(),
    s: CampaignSession = {
      id: crypto.randomUUID(),
      campaign_id: cid,
      number,
      name: name.trim(),
      status: 'planned',
      summary: '',
      created_by: DEMO_USER_ID,
      created_at: stamp,
      started_at: null,
      ended_at: null,
      ...previous,
      updated_at: stamp,
    };
  s.number = number;
  s.name = name.trim();
  put(key(cid), [...all.filter((x) => x.id !== s.id), s], cid);
  return s;
}
export async function changeSession(
  s: CampaignSession,
  operation: 'start' | 'end',
  demo: boolean,
  summary = '',
) {
  if (!demo)
    return rpc<CampaignSession>(
      operation === 'start' ? 'start_campaign_session' : 'end_campaign_session',
      operation === 'start' ? { p_session_id: s.id } : { p_session_id: s.id, p_summary: summary },
    );
  demoGM(s.campaign_id);
  const all = read<CampaignSession[]>(key(s.campaign_id), []),
    current = all.find((x) => x.id === s.id);
  if (!current || current.status !== (operation === 'start' ? 'planned' : 'active'))
    throw new Error('A sessão mudou. Atualize a lista.');
  if (operation === 'start' && all.some((x) => x.status === 'active'))
    throw new Error('Encerre a sessão atual antes de iniciar outra.');
  const stamp = new Date().toISOString();
  if (operation === 'end')
    demoSessionEvent(s.campaign_id, s.id, 'session_ended', 'Sessão encerrada', summary);
  const next: CampaignSession = {
    ...current,
    status: operation === 'start' ? 'active' : 'ended',
    started_at: operation === 'start' ? stamp : current.started_at,
    ended_at: operation === 'end' ? stamp : null,
    summary: operation === 'end' ? summary : current.summary,
    updated_at: stamp,
  };
  put(
    key(s.campaign_id),
    all.map((x) => (x.id === s.id ? next : x)),
    s.campaign_id,
  );
  if (operation === 'start') {
    demoSessionEvent(s.campaign_id, s.id, 'session_started', `Sessão ${s.number} iniciada`, s.name);
    for (const c of read<MuralItem[]>(`cronica:mural:v1:${s.campaign_id}`, []).filter(
      (c) => c.adventure_session_id === s.id,
    ))
      demoSessionEvent(
        s.campaign_id,
        s.id,
        'mural_initial',
        c.title,
        c.description,
        c.image_path,
        c.visible_to_players,
      );
  }
  return next;
}
export async function loadSessionEvents(
  s: CampaignSession,
  demo: boolean,
  master: boolean,
  offset = 0,
) {
  if (demo)
    return read<SessionEvent[]>(eventsKey(s.campaign_id), [])
      .filter((e) => e.adventure_session_id === s.id && (master || e.visibility === 'players'))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
      .slice(offset, offset + 50);
  const { data, error } = await getSupabase()
    .from('campaign_session_events')
    .select('*')
    .eq('adventure_session_id', s.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + 49);
  sessionError(error);
  return (data ?? []) as SessionEvent[];
}
export async function addSessionNote(
  s: CampaignSession,
  title: string,
  description: string,
  image: string | null,
  visible: boolean,
  demo: boolean,
) {
  if (demo) {
    demoGM(s.campaign_id);
    if (s.status !== 'active') throw new Error('Inicie a sessão primeiro.');
    demoSessionEvent(s.campaign_id, s.id, 'note', title, description, image, visible);
    return;
  }
  await rpc('add_campaign_session_note', {
    p_session_id: s.id,
    p_title: title,
    p_description: description,
    p_image_path: image,
    p_visible: visible,
  });
}
export async function confirmDeath(
  s: CampaignSession,
  id: string,
  kind: 'character' | 'npc',
  demo: boolean,
) {
  if (!demo) {
    await rpc('confirm_campaign_session_death', {
      p_session_id: s.id,
      p_entity_id: id,
      p_kind: kind,
    });
    return;
  }
  const w = demoGM(s.campaign_id);
  const value = (kind === 'character' ? w.characters : w.npcs).find(
    (x) => x.id === id && x.campaign_id === s.campaign_id,
  );
  if (!value || s.status !== 'active')
    throw new Error('Selecione um personagem desta sessão ativa.');
  if (kind === 'character') {
    const c = w.characters.find((x) => x.id === id)!;
    c.sheet.hp_current = 0;
    c.sheet.death_failures = 3;
    c.updated_at = new Date().toISOString();
  } else {
    const n = w.npcs.find((x) => x.id === id)!;
    n.status = 'Morto';
    n.updated_at = new Date().toISOString();
  }
  localStorage.setItem('cronica:demo:v1', JSON.stringify(w));
  demoSessionEvent(
    s.campaign_id,
    s.id,
    `${kind}_death`,
    `${value.name} morreu`,
    'Morte confirmada pelo mestre.',
    kind === 'character'
      ? w.characters.find((x) => x.id === id)!.portrait_path
      : w.npcs.find((x) => x.id === id)!.image_path,
    kind === 'character' || w.npcs.find((x) => x.id === id)!.visible_to_players,
  );
}
export async function saveRules(r: CampaignRules, demo: boolean) {
  if (!demo)
    return rpc<CampaignRules>('save_campaign_rules', {
      p_campaign_id: r.campaign_id,
      p_rules: r,
      p_expected_updated_at: r.updated_at,
    });
  const w = demoGM(r.campaign_id),
    previous = (w.rules ?? []).find((x) => x.campaign_id === r.campaign_id);
  if (previous && previous.updated_at !== r.updated_at)
    throw new Error('As regras mudaram. Atualize antes de salvar.');
  if (!Number.isInteger(r.party_level) || r.party_level < 1 || r.party_level > 20)
    throw new Error('O nível deve estar entre 1 e 20.');
  const result = { ...defaultRules(r.campaign_id), ...r, updated_at: new Date().toISOString() };
  w.rules = [...(w.rules ?? []).filter((x) => x.campaign_id !== r.campaign_id), result];
  if (r.lock_player_level)
    w.characters = w.characters.map((c) =>
      c.campaign_id === r.campaign_id
        ? {
            ...c,
            sheet: normalizeSpellResources({
              ...c.sheet,
              level: r.party_level,
              hit_dice_used: Math.min(c.sheet.hit_dice_used, r.party_level),
            }),
            updated_at: result.updated_at,
          }
        : c,
    );
  localStorage.setItem('cronica:demo:v1', JSON.stringify(w));
  return result;
}
export async function copyMap(mapId: string, target: string, name: string) {
  return rpc<{ id: string }>('copy_battle_map_to_session', {
    p_map_id: mapId,
    p_session_id: target,
    p_name: name,
  });
}
export async function copyMural(s: CampaignSession, target: string, demo: boolean) {
  if (!demo)
    return rpc<number>('copy_campaign_mural_to_session', {
      p_source_session: s.id,
      p_target_session: target,
    });
  demoGM(s.campaign_id);
  const all = read<MuralItem[]>(`cronica:mural:v1:${s.campaign_id}`, []);
  if (all.some((c) => c.adventure_session_id === target))
    throw new Error('O Mural de destino deve estar vazio.');
  if (
    !read<CampaignSession[]>(key(s.campaign_id), []).some(
      (x) => x.id === target && x.status !== 'ended' && x.id !== s.id,
    )
  )
    throw new Error('Escolha outra sessão em preparação ou em andamento.');
  const copies = all
    .filter((c) => c.adventure_session_id === s.id)
    .map((c) => ({
      ...c,
      id: crypto.randomUUID(),
      adventure_session_id: target,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
  localStorage.setItem(`cronica:mural:v1:${s.campaign_id}`, JSON.stringify([...all, ...copies]));
  window.dispatchEvent(new CustomEvent('cronica:mural-change', { detail: s.campaign_id }));
  return copies.length;
}

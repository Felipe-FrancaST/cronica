import { getSupabase } from '@/lib/supabase/client';
import { DEMO_USER_ID } from '@/lib/demo-data';
import type { Workspace } from '@/types';
import { mapRecord, validateDocument } from './model';
import type { AtlasDocument, AtlasMap, AtlasSummary } from './types';
const KEY = 'cronica:atlas:maps:v1';
const summaryColumns =
  'id,campaign_id,name,revision,thumbnail,width,height,template,created_at,updated_at';
export class AtlasConflict extends Error {}
function fail(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (['42P01', 'PGRST202', 'PGRST205'].includes(error.code ?? ''))
    throw new Error('Aplique a migração 034 no Supabase para habilitar a Oficina de mapas.');
  if (error.code === '40001') throw new AtlasConflict(error.message);
  throw new Error(error.message);
}
function demoMaps(): AtlasMap[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function assertDemoOwner(cid: string) {
  let w: Workspace | null = null;
  try {
    w = JSON.parse(localStorage.getItem('cronica:demo:v1') ?? 'null');
  } catch {
    /* handled below */
  }
  if (!w?.campaigns.some((c) => c.id === cid && c.owner_id === DEMO_USER_ID))
    throw new Error('Somente o mestre desta campanha pode gerenciar seus mapas.');
}
function persist(maps: AtlasMap[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(maps));
  } catch {
    throw new Error(
      'O armazenamento da demonstração está cheio. Exporte seus mapas e remova os que não usa.',
    );
  }
}
export async function listAtlasMaps(
  campaignId: string | undefined,
  search: string,
  page: number,
  demo: boolean,
): Promise<{ items: AtlasSummary[]; total: number }> {
  if (demo) {
    const w = JSON.parse(localStorage.getItem('cronica:demo:v1') ?? 'null') as Workspace | null;
    const own = new Set(w?.campaigns.filter((c) => c.owner_id === DEMO_USER_ID).map((c) => c.id));
    const maps = demoMaps()
      .filter(
        (m) =>
          own.has(m.campaign_id) &&
          (!campaignId || m.campaign_id === campaignId) &&
          m.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')),
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
    return {
      items: maps.slice(page * 12, page * 12 + 12).map(({ document: _, ...m }) => m),
      total: maps.length,
    };
  }
  let q = getSupabase()
    .from('campaign_atlas_maps')
    .select(summaryColumns, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .order('id');
  if (campaignId) q = q.eq('campaign_id', campaignId);
  if (search.trim())
    q = q.ilike(
      'name',
      `%${search
        .trim()
        .slice(0, 120)
        .replace(/[\\%_]/g, '\\$&')}%`,
    );
  const { data, error, count } = await q.range(page * 12, page * 12 + 11);
  fail(error);
  return { items: (data ?? []) as AtlasSummary[], total: count ?? 0 };
}
export async function getAtlasMap(
  id: string,
  campaignId: string,
  demo: boolean,
): Promise<AtlasMap> {
  if (demo) {
    assertDemoOwner(campaignId);
    const map = demoMaps().find((m) => m.id === id && m.campaign_id === campaignId);
    if (!map) throw new Error('O mapa não existe ou não está disponível.');
    return { ...map, document: validateDocument(map.document) };
  }
  const { data, error } = await getSupabase()
    .from('campaign_atlas_maps')
    .select('*')
    .eq('id', id)
    .eq('campaign_id', campaignId)
    .single();
  fail(error);
  if (!data) throw new Error('O mapa não existe ou não está disponível.');
  return { ...data, document: validateDocument(data.document) } as AtlasMap;
}
export async function saveAtlasMap(
  map: AtlasMap,
  document: AtlasDocument,
  thumbnail: string | null,
  demo: boolean,
): Promise<AtlasMap> {
  document = validateDocument(document);
  if (demo) {
    assertDemoOwner(map.campaign_id);
    const maps = demoMaps(),
      current = maps.find((m) => m.id === map.id);
    if (current && current.revision !== map.revision) {
      if (
        current.revision === map.revision + 1 &&
        JSON.stringify(current.document) === JSON.stringify(document)
      )
        return current;
      throw new AtlasConflict('Este mapa mudou em outra janela. Recarregue ou salve uma cópia.');
    }
    if (!current && map.revision !== 0)
      throw new AtlasConflict('Este mapa foi removido. Salve uma cópia.');
    if (!current && maps.filter((m) => m.campaign_id === map.campaign_id).length >= 100)
      throw new Error('Limite de 100 mapas por campanha.');
    const next = {
      ...map,
      document,
      name: document.title,
      width: document.width,
      height: document.height,
      template: document.template,
      thumbnail,
      revision: (current?.revision ?? 0) + 1,
      updated_at: new Date().toISOString(),
    };
    persist([...maps.filter((m) => m.id !== map.id), next]);
    return next;
  }
  const { data, error } = await getSupabase().rpc('save_campaign_atlas', {
    p_id: map.id,
    p_campaign_id: map.campaign_id,
    p_document: document,
    p_expected_revision: map.revision || null,
    p_thumbnail: thumbnail,
  });
  fail(error);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.id || !Number.isInteger(result.revision))
    throw new Error('Não foi possível confirmar o mapa salvo.');
  return result as AtlasMap;
}
export async function deleteAtlasMap(map: AtlasSummary, demo: boolean) {
  if (demo) {
    assertDemoOwner(map.campaign_id);
    const maps = demoMaps(),
      current = maps.find((m) => m.id === map.id);
    if (!current || current.revision !== map.revision)
      throw new AtlasConflict('O mapa mudou. Atualize a lista antes de excluir.');
    persist(maps.filter((m) => m.id !== map.id));
    return;
  }
  const { error } = await getSupabase().rpc('delete_campaign_atlas', {
    p_id: map.id,
    p_expected_revision: map.revision,
  });
  fail(error);
}
export async function createAtlasMap(
  campaignId: string,
  doc: AtlasDocument,
  thumbnail: string | null,
  demo: boolean,
  id?: string,
) {
  const record = mapRecord(campaignId, doc);
  if (id) record.id = id;
  return saveAtlasMap(record, doc, thumbnail, demo);
}
export interface AtlasDraft {
  base_revision: number;
  document: AtlasDocument;
  updated_at: string;
}
export function atlasTabId() {
  try {
    let id = sessionStorage.getItem('cronica:atlas:tab');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('cronica:atlas:tab', id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
export const draftKey = (userId: string, campaignId: string, id: string, tab = '') =>
  `cronica:atlas:draft:${userId}:${campaignId}:${id}${tab ? `:${tab}` : ''}`;
export function findAtlasDraft(
  prefix: string,
  currentKey: string,
): { key: string; draft: AtlasDraft } | null {
  try {
    const own = readAtlasDraft(currentKey);
    if (own) return { key: currentKey, draft: own };
    const candidates = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || (key !== prefix && !key.startsWith(`${prefix}:`))) continue;
      const draft = readAtlasDraft(key);
      if (draft) candidates.push({ key, draft });
    }
    return (
      candidates.sort((a, b) => b.draft.updated_at.localeCompare(a.draft.updated_at))[0] ?? null
    );
  } catch {
    return null;
  }
}
export function readAtlasDraft(key: string): AtlasDraft | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!raw || !Number.isInteger(raw.base_revision)) return null;
    return { ...raw, document: validateDocument(raw.document) };
  } catch {
    return null;
  }
}
export function writeAtlasDraft(key: string, draft: AtlasDraft): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}
export function clearAtlasDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* A server save remains valid when local storage is blocked. */
  }
}

import { getSupabase } from '@/lib/supabase/client';
import type { Workspace } from '@/types';
import { rulesFor, type CampaignSession } from '@/features/sessions/types';
import type { MuralItem } from './types';
import {
  annotationSchema,
  ANNOTATION_LIMIT,
  type AnnotationDelta,
  type AnnotationPayload,
  type MuralAnnotation,
} from './annotation-model';
export const annotationStorageKey = (id: string) => `cronica:mural:annotations:v1:${id}`;
interface DemoState {
  revision: number;
  reset_revision: number;
  image_path: string;
  annotations: MuralAnnotation[];
}
function demoState(item: MuralItem): DemoState {
  let state: DemoState | null = null;
  try {
    state = JSON.parse(localStorage.getItem(annotationStorageKey(item.id)) ?? 'null');
  } catch {
    /* optional demo storage */
  }
  return state?.image_path === item.image_path
    ? state
    : {
        revision: (state?.revision ?? 0) + 1,
        reset_revision: (state?.revision ?? 0) + 1,
        image_path: item.image_path!,
        annotations: [],
      };
}
function demoWrite(item: MuralItem, state: DemoState) {
  localStorage.setItem(annotationStorageKey(item.id), JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('cronica:mural-annotation-change', { detail: item.id }));
}
function demoPermissions(item: MuralItem, user: string) {
  const w = JSON.parse(localStorage.getItem('cronica:demo:v1') ?? 'null') as Workspace | null;
  const owner = w?.campaigns.some((c) => c.id === item.campaign_id && c.owner_id === user) ?? false;
  const sessions = JSON.parse(
    localStorage.getItem(`cronica:sessions:v1:${item.campaign_id}`) ?? '[]',
  ) as CampaignSession[];
  const active = sessions.some((s) => s.id === item.adventure_session_id && s.status !== 'ended');
  return {
    owner,
    can_write:
      active && (owner || !!rulesFor(w?.rules, item.campaign_id).players_can_annotate_mural),
  };
}
function fail(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (['42P01', 'PGRST202', 'PGRST205'].includes(error.code ?? ''))
    throw new Error('Aplique a migração 046 para habilitar as marcações no mural.');
  throw new Error(error.message);
}
export async function getMuralAnnotations(
  item: MuralItem,
  after: number,
  demo: boolean,
  user: string,
): Promise<AnnotationDelta> {
  if (demo) {
    const state = demoState(item),
      snapshot = after <= 0 || after < state.reset_revision || after > state.revision;
    return {
      revision: state.revision,
      snapshot,
      image_path: item.image_path!,
      can_write: demoPermissions(item, user).can_write,
      annotations: state.annotations.filter((a) => (snapshot ? !a.deleted : a.version > after)),
    };
  }
  const { data, error } = await getSupabase()
    .rpc('get_mural_annotations', { p_item_id: item.id, p_after: after })
    .abortSignal(AbortSignal.timeout(12000));
  fail(error);
  return data as AnnotationDelta;
}
export async function addMuralAnnotation(
  item: MuralItem,
  id: string,
  payload: AnnotationPayload,
  demo: boolean,
  user: string,
) {
  const parsed = annotationSchema.safeParse(payload);
  if (!parsed.success) throw new Error('A marcação contém dados inválidos.');
  if (demo) {
    if (!demoPermissions(item, user).can_write)
      throw new Error('O mestre não permite novas marcações neste mapa.');
    const state = demoState(item),
      old = state.annotations.find((a) => a.id === id);
    if (old) return old;
    if (state.annotations.filter((a) => !a.deleted).length >= ANNOTATION_LIMIT)
      throw new Error('Limite de 1.000 marcações neste mapa.');
    const row: MuralAnnotation = {
      id,
      item_id: item.id,
      campaign_id: item.campaign_id,
      author_id: user,
      payload: parsed.data,
      version: ++state.revision,
      deleted: false,
      created_at: new Date().toISOString(),
    };
    state.annotations.push(row);
    demoWrite(item, state);
    return row;
  }
  const { data, error } = await getSupabase()
    .rpc('add_mural_annotation', {
      p_item_id: item.id,
      p_id: id,
      p_image_path: item.image_path,
      p_payload: parsed.data,
    })
    .abortSignal(AbortSignal.timeout(12000));
  fail(error);
  return data as MuralAnnotation;
}
export async function eraseMuralAnnotation(
  item: MuralItem,
  id: string,
  demo: boolean,
  user: string,
) {
  if (demo) {
    const permission = demoPermissions(item, user),
      state = demoState(item),
      row = state.annotations.find((a) => a.id === id);
    if (!permission.can_write || (row && row.author_id !== user && !permission.owner))
      throw new Error('Você não pode apagar esta marcação.');
    if (row && !row.deleted) {
      row.deleted = true;
      row.version = ++state.revision;
      demoWrite(item, state);
    }
    return;
  }
  const { error } = await getSupabase()
    .rpc('erase_mural_annotation', { p_item_id: item.id, p_id: id })
    .abortSignal(AbortSignal.timeout(12000));
  fail(error);
}
export async function clearMuralAnnotations(item: MuralItem, demo: boolean, user: string) {
  if (demo) {
    const permission = demoPermissions(item, user);
    if (!permission.owner || !permission.can_write)
      throw new Error('Somente o mestre pode limpar as marcações.');
    const state = demoState(item);
    state.revision++;
    state.annotations.forEach((a) => {
      a.deleted = true;
      a.version = state.revision;
    });
    demoWrite(item, state);
    return;
  }
  const { error } = await getSupabase()
    .rpc('clear_mural_annotations', { p_item_id: item.id })
    .abortSignal(AbortSignal.timeout(12000));
  fail(error);
}

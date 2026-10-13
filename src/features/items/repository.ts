import { getSupabase } from '@/lib/supabase/client';
import { DEMO_USER_ID } from '@/lib/demo-data';
import type { Workspace } from '@/types';
import type { CampaignItem, ItemDelivery } from './types';
import { grantedInventoryItem, itemDefinitionErrors } from './model';

export interface ItemCollection {
  items: CampaignItem[];
  deliveries: ItemDelivery[];
}
const key = (cid: string) => `cronica:items:v1:${cid}`;
function demoRead(cid: string): ItemCollection {
  try {
    return JSON.parse(localStorage.getItem(key(cid)) ?? 'null') ?? { items: [], deliveries: [] };
  } catch {
    return { items: [], deliveries: [] };
  }
}
function demoMaster(cid: string) {
  const w = JSON.parse(localStorage.getItem('cronica:demo:v1') ?? 'null') as Workspace | null;
  if (!w?.campaigns.some((c) => c.id === cid && c.owner_id === DEMO_USER_ID))
    throw new Error('Somente o mestre pode alterar os itens desta campanha.');
  return w;
}
function changed(cid: string, data: ItemCollection) {
  localStorage.setItem(key(cid), JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('cronica:items-change', { detail: cid }));
}
function fail(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (['42P01', 'PGRST202', 'PGRST205'].includes(error.code ?? ''))
    throw new Error(
      'Aplique a migração 025 no Supabase para habilitar o catálogo de itens da campanha.',
    );
  throw new Error(error.message);
}
async function rpc<T>(name: string, args: Record<string, unknown>) {
  const { data, error } = await getSupabase().rpc(name, args);
  fail(error);
  return data as T;
}
async function rows<T>(table: string, cid: string) {
  const all: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await getSupabase()
      .from(table)
      .select('*')
      .eq('campaign_id', cid)
      .order('created_at')
      .order('id')
      .range(offset, offset + 499);
    fail(error);
    const page = (data ?? []) as T[];
    all.push(...page);
    if (page.length < 500) return all;
  }
}
export async function loadCampaignItems(cid: string, demo: boolean): Promise<ItemCollection> {
  if (demo) return demoRead(cid);
  const [items, deliveries, secrets] = await Promise.all([
    rows<CampaignItem>('campaign_items', cid),
    rows<ItemDelivery>('campaign_item_deliveries', cid),
    getSupabase().from('campaign_item_private').select('*').eq('campaign_id', cid),
  ]);
  fail(secrets.error);
  return {
    items: items.map((item) => ({
      ...item,
      private_notes: secrets.data?.find((s) => s.item_id === item.id)?.notes,
    })),
    deliveries,
  };
}
export async function saveCampaignItem(item: CampaignItem, demo: boolean) {
  const errors = itemDefinitionErrors(item.data);
  if (errors.length) throw new Error(errors.join(' '));
  if (!demo)
    return rpc<CampaignItem>('save_campaign_item', {
      p_payload: item,
      p_expected_version: item.version || null,
    });
  demoMaster(item.campaign_id);
  const collection = demoRead(item.campaign_id);
  const old = collection.items.find((i) => i.id === item.id);
  if (old && old.version !== item.version)
    throw new Error('Este item mudou em outra janela. Reabra antes de salvar.');
  const next = {
    ...structuredClone(item),
    name: item.data.name.trim(),
    data: { ...structuredClone(item.data), name: item.data.name.trim() },
    version: (old?.version ?? 0) + 1,
    updated_at: new Date().toISOString(),
  };
  collection.items = old
    ? collection.items.map((i) => (i.id === item.id ? next : i))
    : [...collection.items, next];
  changed(item.campaign_id, collection);
  return next;
}
export async function giveCampaignItem(
  item: CampaignItem,
  characterId: string,
  quantity: number,
  requestId: string,
  demo: boolean,
) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999)
    throw new Error('Entregue de 1 a 9.999 unidades.');
  if (!demo)
    return rpc<ItemDelivery>('give_campaign_item', {
      p_item_id: item.id,
      p_character_id: characterId,
      p_quantity: quantity,
      p_request_id: requestId,
      p_expected_version: item.version,
    });
  const w = demoMaster(item.campaign_id),
    collection = demoRead(item.campaign_id);
  const prior = collection.deliveries.find((d) => d.id === requestId);
  if (prior) {
    if (
      prior.item_id !== item.id ||
      prior.character_id !== characterId ||
      prior.quantity !== quantity
    )
      throw new Error('Solicitação de entrega inválida.');
    return prior;
  }
  const current = collection.items.find((i) => i.id === item.id),
    character = w.characters.find(
      (c) => c.id === characterId && c.campaign_id === item.campaign_id,
    );
  if (!current || current.archived || !character)
    throw new Error('Escolha um item ativo e um personagem desta campanha.');
  if (current.version !== item.version)
    throw new Error('O item mudou. Atualize antes de entregar.');
  if ((current.data.charges ?? 0) > 0 && quantity > 1)
    throw new Error(
      'Entregue cada item com cargas separadamente para preservar sua reserva individual.',
    );
  const inventory = grantedInventoryItem(current, quantity);
  character.sheet.inventory.push(inventory);
  character.updated_at = new Date().toISOString();
  localStorage.setItem('cronica:demo:v1', JSON.stringify(w));
  const delivery: ItemDelivery = {
    id: requestId,
    campaign_id: item.campaign_id,
    item_id: item.id,
    character_id: characterId,
    inventory_id: inventory.id,
    item_name: item.name,
    quantity,
    definition_version: item.version,
    created_at: new Date().toISOString(),
  };
  collection.deliveries.push(delivery);
  changed(item.campaign_id, collection);
  return delivery;
}
export async function rechargeCampaignItem(
  cid: string,
  inventoryId: string,
  expectedCharacterTime: string,
  demo: boolean,
) {
  if (!demo)
    return rpc('recharge_campaign_item', {
      p_inventory_id: inventoryId,
      p_expected_updated_at: expectedCharacterTime,
    });
  const w = demoMaster(cid);
  const character = w.characters.find(
    (c) => c.campaign_id === cid && c.sheet.inventory.some((i) => i.id === inventoryId),
  );
  if (!character || character.updated_at !== expectedCharacterTime)
    throw new Error('A ficha mudou. Atualize antes de restaurar as cargas.');
  const item = character.sheet.inventory.find((i) => i.id === inventoryId)!;
  if (!item.charges || item.recharge === 'none') throw new Error('Este item não permite recarga.');
  item.charges_used = 0;
  character.updated_at = new Date().toISOString();
  localStorage.setItem('cronica:demo:v1', JSON.stringify(w));
  window.dispatchEvent(new CustomEvent('cronica:items-change', { detail: cid }));
}

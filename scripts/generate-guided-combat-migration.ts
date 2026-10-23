import { readFileSync, writeFileSync } from 'node:fs';
import { readMigration } from './migration-sources.mjs';
// Migration 037 is self-contained. Historical migrations are read, never rewritten.
function extract(source: string, name: string) {
  const escaped = name.replaceAll('.', '\\.');
  const match = source.match(
    new RegExp(`create(?: or replace)? function ${escaped}\\([^]*?end \\$\\$;`),
  );
  if (!match) throw new Error(`Missing SQL function: ${name}`);
  return match[0];
}
const v25 = readMigration('202610130025_campaign_items.sql');
const parts = [
  '-- 037: PHB 2014 sheet validation and guided combat. Apply after 036.\n-- Additive, repeatable, and small enough for the SQL Editor.\nbegin;',
];
let core = extract(v25, 'public.resolve_battle_action_v9')
  .replace('public.resolve_battle_action_v9(', 'private.battle_resolve_guided_core(')
  .replace(
    "if r.id is null or not private.is_campaign_owner(r.campaign_id) then raise exception 'Apenas o mestre desta campanha pode decidir.' using errcode='42501'; end if;",
    "if r.id is null then raise exception 'Tentativa inexistente.';end if;",
  )
  .replace(
    'spend=p_success or s.failed_actions_consume;',
    "spend=p_success or s.failed_actions_consume or coalesce((opts->>'guided')::boolean,false);",
  );
parts.push(core);
let itemValidation = extract(v25, 'private.validate_campaign_item')
  .replace(
    "if fn->>'shape'='self' then",
    "if fn ? 'attackRoll' and jsonb_typeof(fn->'attackRoll')<>'boolean' then raise exception 'Configuração de ataque inválida.';end if;\n  if fn ? 'attack_bonus' and (jsonb_typeof(fn->'attack_bonus')<>'number' or abs((fn->>'attack_bonus')::numeric)>50 or (fn->>'attack_bonus')::numeric<>floor((fn->>'attack_bonus')::numeric)) then raise exception 'Bônus de ataque inválido.';end if;\n  if coalesce((fn->>'attackRoll')::boolean,false) and coalesce(fn->>'save','')<>'' then raise exception 'Escolha ataque ou salvaguarda nesta função.';end if;\n  if fn ? 'save_dc' and (jsonb_typeof(fn->'save_dc') is distinct from 'number' or (fn->>'save_dc')::numeric not between 1 and 40 or (fn->>'save_dc')::numeric<>floor((fn->>'save_dc')::numeric)) then raise exception 'A CD do item deve ser um inteiro de 1 a 40.';end if;\n  if fn->>'shape'='self' then",
  )
  .replace(
    "'halfOnSave','charge_cost'",
    "'halfOnSave','save_dc','attackRoll','attack_bonus','charge_cost'",
  );
parts.push(itemValidation);
let request = extract(v25, 'public.request_battle_action')
  .replace(
    'if exists(select 1 from public.battle_action_requests where token_id=t.id',
    "if exists(select 1 from public.battle_decisions where session_id=s.id and kind='concentration' and status='pending') then raise exception 'Aguarde os testes de concentração pendentes antes da próxima ação.';end if;\n if exists(select 1 from public.battle_action_requests where token_id=t.id",
  )
  .replace(
    "for i in lvl+1..rlevel loop dice=dice||'+'||(e->>'upcast'); end loop;",
    "for i in 1..((rlevel-lvl)/greatest(1,coalesce((e->>'upcastEvery')::integer,1))) loop dice=dice||'+'||(e->>'upcast'); end loop;",
  )
  .replace(
    'ids uuid[]; sp public.dnd_spells;',
    'ids uuid[]; attack_ids uuid[]; attack_count integer=1; sp public.dnd_spells;',
  )
  .replace(
    "target=coalesce(target,jsonb_build_object('x',t.x,'y',t.y));",
    `
 if coalesce((e->>'levelBeams')::boolean,false) then attack_count=case when (sheet->>'level')::integer>=17 then 4 when (sheet->>'level')::integer>=11 then 3 when (sheet->>'level')::integer>=5 then 2 else 1 end;
 else attack_count=coalesce((e->>'attackCount')::integer,1)+greatest(0,rlevel-lvl)*coalesce((e->>'attacksPerSlot')::integer,0);end if;
 if attack_count>1 then
  e=e||jsonb_build_object('attackCount',attack_count,'maxTargets',attack_count);
  if kind='spell' and entry->>'catalog_id'<>'rajada-mistica' then e=e||jsonb_build_object('onceBonus',private.dnd_spell_bonus(sheet,entry,e,rlevel));end if;
 end if;
 if kind='item' and (entry->>'catalog_id' in('acid','holy-water') or coalesce((e->>'attackRoll')::boolean,false)) then e=e||jsonb_build_object('attackRoll',true,'attackBonus',coalesce((e->>'attack_bonus')::integer,floor(((sheet->'abilities'->>'dex')::numeric-10)/2)::integer));end if;
 target=coalesce(target,jsonb_build_object('x',t.x,'y',t.y));`,
  )
  .replace('and cardinality(ids)<>1 then', 'and cardinality(ids)<1 then')
  .replace(
    "if exists(select 1 from public.battle_map_tokens q where q.id=any(ids) and not private.battle_in_effect(q,t,target,e,m.scale_per_cell*case when m.scale_unit='ft' then 0.3 else 1 end)) then",
    "if exists(select 1 from public.battle_map_tokens q where q.id=any(ids) and case when attack_count>1 then private.battle37_target_range(t,q,m)>coalesce((e->>'range')::numeric,0)+0.00001 else not private.battle_in_effect(q,t,target,e,m.scale_per_cell*case when m.scale_unit='ft' then 0.3 else 1 end) end) then",
  )
  .replace(
    ' insert into public.battle_action_requests(campaign_id',
    `
 if p_payload ? 'attack_targets' then
  if attack_count<=1 or jsonb_typeof(p_payload->'attack_targets')<>'array' or jsonb_array_length(p_payload->'attack_targets')<>attack_count then raise exception 'Escolha um alvo para cada raio.';end if;
  attack_ids=array(select value::uuid from jsonb_array_elements_text(p_payload->'attack_targets'));
  if exists(select 1 from unnest(attack_ids) id where not(id=any(ids))) then raise exception 'Os raios devem usar os alvos selecionados.';end if;
  e=e||jsonb_build_object('attackTargets',to_jsonb(attack_ids));
 end if;
 insert into public.battle_action_requests(campaign_id`,
  );
parts.push(request);
// A damaging spell attack has explicit metadata; automatic hits are never inferred from shape.
const profiles = JSON.parse(readFileSync('src/features/vtt/spell-effects.json', 'utf8'));
const periodic = new Set([
  'nuvem-de-adagas',
  'raio-lunar',
  'esquentar-metais',
  'convocar-relampagos',
  'praga-de-insetos',
  'nuvem-incendiaria',
  'toque-vampirico',
]);
for (const [id, p] of Object.entries(profiles) as [string, Record<string, unknown>][]) {
  if (p.attackRoll || p.attackCount || p.levelBeams || periodic.has(id))
    parts.push(
      `update public.dnd_spells set combat=combat||$profile$${JSON.stringify(p)}$profile$::jsonb where id='${id.replaceAll("'", "''")}';`,
    );
}
const spellCorrections = JSON.parse(readFileSync('src/systems/dnd5e/data/spells.json', 'utf8')) as {
  id: string;
  range: string;
  description: string;
}[];
for (const spell of spellCorrections.filter((sp) =>
  ['raio-guiado', 'arma-espiritual', 'nuvem-de-adagas'].includes(sp.id),
))
  parts.push(
    `update public.dnd_spells set data=data||$correction$${JSON.stringify({ range: spell.range, description: spell.description })}$correction$::jsonb where id='${spell.id}';`,
  );
parts.push(readFileSync('supabase/patches/guided-combat.sql', 'utf8'));
parts.push('commit;\n');
const sql = parts.join('\n\n');
if (Buffer.byteLength(sql) > 256 * 1024)
  throw new Error('Migration exceeds the SQL Editor budget.');
writeFileSync('supabase/migrations/202610230037_sheet_rules_and_guided_combat.sql', sql);

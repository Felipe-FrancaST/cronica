import { readSqlSource } from './migration-sources.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { ITEM_CATALOG } from '../src/systems/dnd5e/items';
import { combatFeatures } from '../src/systems/dnd5e/combat-features';
import { defaultSheet } from '../src/systems/dnd5e';
import { CLASSES } from '../src/systems/dnd5e/catalog';
import { CLASS_PATHS } from '../src/systems/dnd5e/progression-catalog';
import { withClassLevels } from '../src/systems/dnd5e/progression';

const quoted = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const root = 'supabase/migrations/';
const v9 = root + '202610040009_battle_actions.sql',
  v10 = root + '202610050010_battle_dice.sql',
  v11 = root + '202610050011_player_rolls_and_scenery.sql',
  v16 = root + '202610060017_multiclass_and_character_builds.sql';
function definition(file: string, name: string) {
  const source = readSqlSource(file);
  const start = source.search(
    new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\(`, 'i'),
  );
  if (start < 0) throw new Error(`Missing ${name}`);
  const opening = source.indexOf('$$', start),
    end = source.indexOf('$$;', opening + 2);
  if (end < 0) throw new Error(`Unclosed ${name}`);
  return source.slice(start, end + 3).replace(/^create function/i, 'create or replace function');
}
function patch(s: string, before: string, after: string) {
  if (!s.includes(before)) throw new Error('Missing patch anchor: ' + before.slice(0, 90));
  return s.replace(before, () => after);
}
let sql = readSqlSource('supabase/templates/v17-combat.sql'),
  seed = '';
for (const item of ITEM_CATALOG)
  seed += `insert into public.dnd_items values('${item.catalog_id}','${item.name.replaceAll("'", "''")}',${quoted(item)}) on conflict(id) do update set name=excluded.name,data=excluded.data;\n`;
const features = new Map<string, ReturnType<typeof combatFeatures>[number]>();
for (const id of Object.keys(CLASSES))
  for (const path of ['', ...CLASS_PATHS.filter((p) => p.class_id === id).map((p) => p.id)])
    for (const f of combatFeatures(
      withClassLevels(defaultSheet(), [{ class_id: id, level: 20, subclass_id: path }]),
      false,
    ))
      features.set(f.id, f);
for (const f of combatFeatures(
  withClassLevels(defaultSheet(), [{ class_id: 'barbarian', level: 1 }]),
  true,
))
  features.set(f.id, f);
for (const [id, f] of features)
  seed += `insert into public.dnd_combat_features values('${id}',${quoted(f)}) on conflict(id) do update set data=excluded.data;\n`;
sql = patch(sql, '-- CATALOG_SEED', seed);

let sheet = definition(v9, 'private.battle_sheet');
sheet = patch(
  sheet,
  "'{}'));",
  "'{}'),'inventory',coalesce((select jsonb_agg(data||jsonb_build_object('id',id) order by id) from public.character_inventory where character_id=t.character_id),'[]'),'raging',t.raging);",
);
const base = definition(v9, 'private.battle_weapon').replace(
  'private.battle_weapon(',
  'private.dnd_weapon_base(',
);
const weapon = `create or replace function private.battle_weapon(p_data jsonb,p_sheet jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare item alias for $1;s alias for $2;entry jsonb=item;begin
 if not(entry ? 'id') then select i into entry from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i-'id'=item limit 1;entry=coalesce(entry,item);end if;
 return private.dnd_weapon_effect(entry,s,'{}',coalesce((s->>'raging')::boolean,false));end $$;`;

let reference = definition(v16, 'public.validate_dnd_spell_reference');
reference = patch(
  reference,
  "if sheet ? 'class_levels' and coalesce(new.data->>'casting_mode','class')<>'bonus' then",
  "if coalesce(new.data->>'casting_mode','class')='class' and coalesce(new.data->>'granted_path','')='' and coalesce(new.data->>'granted_feature','')='' then",
);
let save = patch(
  definition(v16, 'public.save_character'),
  "coalesce((entry->>'quantity')::integer,0)<1",
  "coalesce((entry->>'quantity')::integer,0)<0",
);
let bonus = definition(v16, 'private.dnd_spell_bonus');
reference = patch(
  reference,
  "else origin->>'class_id' end) then raise exception",
  "else origin->>'class_id' end) and not private.dnd_expanded_spell(sheet,new.data) then raise exception",
);
bonus = patch(
  bonus,
  ' end loop;return bonus;',
  ` end loop;
 if entry->>'english_name'='Eldritch Blast' and origin='warlock' then
  for c in select value from jsonb_array_elements(private.dnd_levels(s)) loop
   if c->>'class_id'='warlock' and (c->>'level')::integer>=2 and c->'choices'->'invocations' ? 'agonizing-blast' then bonus=bonus+floor(((s->'abilities'->>'cha')::numeric-10)/2)::integer;end if;
  end loop;
 end if;return bonus;`,
);

let request = definition(v16, 'public.request_battle_action');
request = patch(
  request,
  'lvl integer=0; cname text;',
  "lvl integer=0; cname text; f jsonb; wopts jsonb=coalesce(p_payload->'weapon_options','{}'); units integer=coalesce((p_payload->>'feature_units')::integer,1); itemdef jsonb;",
);
request = patch(
  request,
  "if kind not in('weapon','spell','dash','disengage','dodge')",
  "if kind not in('weapon','spell','item','feature','dash','disengage','dodge')",
);
request = patch(
  request,
  " if kind in('weapon','spell') then",
  ` if kind='item' then
  if t.character_id is null then raise exception 'NPC usa os itens descritos na sua ficha.';end if;
  source=(p_payload->>'source_id')::uuid;
  select data||jsonb_build_object('id',id) into entry from public.character_inventory where id=source and character_id=t.character_id for update;
  select data into itemdef from public.dnd_items where id=entry->>'catalog_id';
  if entry is null or itemdef->'use' is null or (entry->>'quantity')::integer<1 or (itemdef ? 'charges' and coalesce((entry->>'charges_used')::integer,0)>=(itemdef->>'charges')::integer) then raise exception 'Item esgotado ou sem uso de combate definido.';end if;
  e=itemdef->'use'||jsonb_build_object('shape','single','origin','point','size',0,'width',1.5,'maxTargets',1,'timing','immediate','review',true,'damageType',case entry->>'catalog_id' when 'acid' then 'ácido' when 'holy-water' then 'radiante' else '' end,'item_catalog',entry->>'catalog_id');cname=entry->>'name';
 elsif kind='feature' then
  if t.character_id is null then raise exception 'NPC usa as habilidades descritas na própria ficha.';end if;
  f=private.dnd_feature_definition(sheet,p_payload->>'feature_id',units,t.raging);
  if f->>'operation'='surge' and t.surge_used then raise exception 'Surto de Ação só pode ser usado uma vez por turno.';end if;
  e=f||jsonb_build_object('shape',case when (f->>'self')::boolean then 'self' else 'single' end,'origin',case when (f->>'self')::boolean then 'self' else 'point' end,'size',0,'width',1.5,'maxTargets',1,'timing','immediate','review',f->>'operation'='manual');
  cost=f->>'cost';cname=f->>'name';entry=f;
 elsif kind in('weapon','spell') then`,
);
request = patch(
  request,
  "if t.character_id is not null then select data into entry from public.character_inventory where id=source and character_id=t.character_id and data->>'category'='weapon' and coalesce((data->>'quantity')::integer,0)>0;",
  `if t.character_id is not null then
    if source=t.id then entry=jsonb_build_object('id',source,'name','Ataque desarmado','catalog_id','unarmed','category','weapon','quantity',1,'damage','1 concussão','notes','');
    else select data||jsonb_build_object('id',id) into entry from public.character_inventory where id=source and character_id=t.character_id and data->>'category'='weapon' and coalesce((data->>'quantity')::integer,0)>0;end if;`,
);
request = patch(
  request,
  "   e=private.battle_weapon(entry,sheet); cname=entry->>'name';",
  `   perform private.dnd_check_weapon_options(t,entry,sheet,wopts,coalesce(p_payload->'target_ids','[]'));
   e=private.dnd_weapon_effect(entry,sheet,wopts,t.raging);entry=entry||jsonb_build_object('weapon_options',wopts);cname=entry->>'name';
   if coalesce((wopts->>'offhand')::boolean,false) then cost='bonus';end if;
   if coalesce((wopts->>'smite_level')::integer,0)>0 then rkind=coalesce(wopts->>'smite_kind','slot');rlevel=(wopts->>'smite_level')::integer;end if;
   if coalesce((wopts->>'sneak')::boolean,false) then e=e||'{"review":true,"note":"Ataque Furtivo: o mestre confirma vantagem ou aliado adjacente e ausência de desvantagem."}'::jsonb;end if;
   if coalesce((wopts->>'smite_special')::boolean,false) then e=e||'{"review":true,"note":"O mestre confirma que o alvo é morto-vivo ou ínfero para o dado radiante adicional."}'::jsonb;end if;`,
);
request = patch(
  request,
  '   perform private.battle_check_resource(t,entry,rkind,rlevel);',
  "   if t.raging then raise exception 'Não é possível conjurar enquanto a Fúria está ativa.';end if;\n   perform private.battle_check_resource(t,entry,rkind,rlevel);",
);
request = patch(
  request,
  "if cost='action' and t.action_used and not(kind='weapon' and t.attacks_remaining>0)",
  "if cost='action' and t.action_used and t.extra_actions=0 and not(kind='weapon' and t.attacks_remaining>0)",
);
request = patch(
  request,
  "   e=e||jsonb_build_object('dice',dice,",
  "   if e->>'kind'='healing' and lvl>0 then dice=private.dnd_healing_dice(sheet,dice);end if;\n   e=e||jsonb_build_object('dice',dice,",
);
request = patch(
  request,
  "if e->>'shape'='single' and (e->>'kind' in('damage','healing','temporary'))",
  "if e->>'shape'='single' and (e->>'kind' in('damage','healing','temporary') or kind in('item','feature','weapon'))",
);

request = patch(
  request,
  "   perform private.dnd_check_weapon_options(t,entry,sheet,wopts,coalesce(p_payload->'target_ids','[]'));",
  "   if entry->>'catalog_id'='net' and t.action_used and t.attacks_remaining>0 then raise exception 'A rede exige uma ação inteira; conclua os ataques desta ação antes de usá-la.';end if;\n   perform private.dnd_check_weapon_options(t,entry,sheet,wopts,coalesce(p_payload->'target_ids','[]'));",
);
let resolve = definition(v16, 'public.resolve_battle_action_v9');
resolve = patch(
  resolve,
  "opts jsonb=coalesce(p_resolution,'{}');",
  "opts jsonb=coalesce(p_resolution,'{}');f jsonb;units integer;itemdef jsonb;inv public.character_inventory;wopts jsonb;newdata jsonb;remaining integer;",
);
resolve = patch(
  resolve,
  " if r.kind='spell' and spend then",
  ` if r.kind='feature' and spend then
  f=private.dnd_feature_definition(sheet,e->>'id',(e->>'units')::integer,t.raging);
  if f->>'operation'='surge' and t.surge_used then raise exception 'Surto de Ação já utilizado neste turno.';end if;
  if coalesce(f->>'resource','')<>'' then
   update public.characters set system_data=jsonb_set(system_data,'{feature_uses}',coalesce(system_data->'feature_uses','{}')||jsonb_build_object(f->>'resource',coalesce((system_data->'feature_uses'->>(f->>'resource'))::integer,0)+(f->>'units')::integer)) where id=t.character_id;
  end if;
 elsif r.kind='item' and spend then
  select * into inv from public.character_inventory where id=r.source_id and character_id=t.character_id for update;
  select data into itemdef from public.dnd_items where id=inv.data->>'catalog_id';
  if inv.id is null or itemdef->'use' is null or (inv.data->>'quantity')::integer<1 then raise exception 'O item foi removido ou está esgotado.';end if;
  newdata=inv.data;
  if itemdef ? 'charges' then
   remaining=coalesce((inv.data->>'charges_used')::integer,0)+1;
   if remaining>(itemdef->>'charges')::integer then raise exception 'Este item não possui mais usos.';end if;
   newdata=newdata||jsonb_build_object('charges_used',remaining);
   if remaining=(itemdef->>'charges')::integer and (inv.data->>'quantity')::integer>1 then newdata=newdata||jsonb_build_object('quantity',(inv.data->>'quantity')::integer-1,'charges_used',0);end if;
  elsif coalesce((itemdef->'use'->>'consumed')::boolean,false) then newdata=newdata||jsonb_build_object('quantity',(inv.data->>'quantity')::integer-1);end if;
  update public.character_inventory set data=newdata where id=inv.id;
 elsif r.kind='weapon' and spend and t.character_id is not null then
  if r.source_id=t.id then entry=jsonb_build_object('id',t.id,'name','Ataque desarmado','catalog_id','unarmed','category','weapon','quantity',1,'damage','1 concussão','notes','');
  else select data||jsonb_build_object('id',id) into entry from public.character_inventory where id=r.source_id and character_id=t.character_id and data->>'category'='weapon' and (data->>'quantity')::integer>0 for update;end if;
  if entry is null then raise exception 'A arma foi removida ou está esgotada.';end if;
  wopts=coalesce(e->'entry'->'weapon_options','{}');
  perform private.dnd_check_weapon_options(t,entry,sheet,wopts,to_jsonb(r.target_ids));
  if p_success and r.resource_level>0 then
   if r.resource_kind='slot' then update public.characters set system_data=jsonb_set(system_data,'{slots_used}',coalesce(system_data->'slots_used','{}')||jsonb_build_object(r.resource_level::text,coalesce((system_data->'slots_used'->>r.resource_level::text)::integer,0)+1)) where id=t.character_id;
   elsif r.resource_kind='pact' then update public.characters set system_data=system_data||jsonb_build_object('pact_slots_used',coalesce((system_data->>'pact_slots_used')::integer,0)+1) where id=t.character_id;end if;
  end if;
  if nullif(entry->>'ammunition','') is not null then
   select * into inv from public.character_inventory where character_id=t.character_id and data->>'category'='ammunition' and data->>'ammunition'=entry->>'ammunition' and (data->>'quantity')::integer>0 order by id limit 1 for update;
   if inv.id is null then raise exception 'Munição compatível esgotada.';end if;
   update public.character_inventory set data=data||jsonb_build_object('quantity',(data->>'quantity')::integer-1) where id=inv.id;
  end if;
  update public.battle_map_tokens set weapon_attacked=weapon_attacked or (r.cost='action' and (private.dnd_weapon_traits(entry,sheet)->>'light')::boolean and not(private.dnd_weapon_traits(entry,sheet)->>'ranged')::boolean),
   sneak_used=sneak_used or (p_success and coalesce((wopts->>'sneak')::boolean,false)),hunter_used=hunter_used or (p_success and coalesce((wopts->>'hunter')::boolean,false)),
   rage_activity_at=case when raging and exists(select 1 from public.battle_map_tokens foe where foe.id=any(r.target_ids) and foe.faction in('enemy','ally') and foe.faction<>t.faction) then now() else rage_activity_at end where id=t.id;
 end if;
 if r.kind='spell' and spend then`,
);
resolve = patch(
  resolve,
  '    if t.action_used and t.attacks_remaining<=0 then',
  '    if t.action_used and t.attacks_remaining<=0 and t.extra_actions=0 then',
);
resolve = patch(
  resolve,
  'attacks=private.dnd_attack_count(sheet);',
  "attacks=case when e->'entry'->>'catalog_id'='net' then 1 else private.dnd_attack_count(sheet) end;",
);
resolve = patch(
  resolve,
  '    if not t.action_used then',
  '    if not t.action_used or t.attacks_remaining<=0 then',
);
resolve = patch(
  resolve,
  'set action_used=true,attacks_remaining=attacks-1 where id=t.id;',
  'set action_used=true,attacks_remaining=attacks-1,extra_actions=extra_actions-case when t.action_used and t.attacks_remaining<=0 then 1 else 0 end where id=t.id;',
);
resolve = patch(
  resolve,
  'else update public.battle_map_tokens set action_used=true,attacks_remaining=0,action_spell_level=',
  "else\n    if t.action_used and t.extra_actions=0 then raise exception 'A ação já foi utilizada.';end if;\n    update public.battle_map_tokens set action_used=true,attacks_remaining=case when t.action_used then t.attacks_remaining else 0 end,extra_actions=extra_actions-case when t.action_used then 1 else 0 end,action_spell_level=",
);
resolve = patch(
  resolve,
  '  else\n   if t.reaction_used then',
  "  elsif r.cost='reaction' then\n   if t.reaction_used then",
);
resolve = patch(
  resolve,
  "  if r.kind='dash' then",
  `  if r.kind='feature' then
   case e->>'operation'
    when 'rage' then
     update public.battle_map_tokens set raging=true,rage_started_round=s.round,rage_activity_at=null,rage_checked_at=now() where id=t.id;
     update public.battle_spell_effects set active=false where token_id=t.id and concentration and active;
    when 'end-rage' then update public.battle_map_tokens set raging=false where id=t.id;
    when 'surge' then update public.battle_map_tokens set extra_actions=extra_actions+1,surge_used=true where id=t.id;
    when 'dash' then update public.battle_map_tokens set movement_remaining=movement_remaining+movement_speed,movement_bonus=movement_bonus+movement_speed where id=t.id;
    when 'disengage' then update public.battle_map_tokens set disengaged=true where id=t.id;
    when 'dodge' then update public.battle_map_tokens set dodging=true where id=t.id;
    else outcomes=private.battle_apply_hp(r,t,e,opts);
   end case;
  elsif r.kind='dash' then`,
);
resolve = patch(
  resolve,
  "   if opts ? 'kind' then",
  "   if r.kind='item' then perform private.dnd_item_special(r,e);end if;\n   if opts ? 'kind' then",
);

let hp = definition(v9, 'private.battle_apply_hp').replace(
  'private.battle_apply_hp(',
  'private.battle_apply_hp_v11(',
);
hp = patch(hp, 'target_opts jsonb; minimum integer;', 'target_opts jsonb; minimum integer;');
hp = patch(
  hp,
  "  hp=coalesce((sheet->>'hp_current')::integer,0);",
  `  if kind='damage' and not(target_opts ? 'amount') then amount=greatest(0,least(100000,floor(private.dnd_damage_amount(t,sheet,e,roll,saved,opts)*multiplier)::integer));end if;
  hp=coalesce((sheet->>'hp_current')::integer,0);`,
);
hp = patch(
  hp,
  '  if afterhp=0 then update public.battle_spell_effects set active=false where token_id=t.id and concentration and active; end if;',
  `  if kind='damage' and amount>0 then
   update public.battle_map_tokens set rage_activity_at=case when raging then now() else rage_activity_at end where id=t.id;
   if t.character_id is not null then update public.characters set system_data=jsonb_set(system_data,'{conditions}',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(system_data->'conditions','[]')) v where v<>'Estável'),'[]')) where id=t.character_id;end if;
  end if;
  if kind='healing' and hp=0 and afterhp>0 and t.character_id is not null then
   update public.characters set system_data=system_data||jsonb_build_object('death_successes',0,'death_failures',0,'conditions',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(system_data->'conditions','[]')) v where v not in('Estável','Inconsciente')),'[]')) where id=t.character_id;
  end if;
  if afterhp=0 then update public.battle_spell_effects set active=false where token_id=t.id and concentration and active;update public.battle_map_tokens set raging=false where id=t.id;end if;`,
);
hp = patch(
  hp,
  " return jsonb_build_object('roll',roll,'affected',applied,'count',jsonb_array_length(applied));",
  ` if kind='healing' and r.kind='spell' and r.spell_level>0 and exists(select 1 from jsonb_array_elements(applied) v where v->>'token_id'<>a.id::text and (v->>'amount')::integer>0) then
  sheet=private.battle_sheet(a.id);
  if exists(select 1 from jsonb_array_elements(private.dnd_levels(sheet)) c where c->>'class_id'='cleric' and c->>'subclass_id'='life' and (c->>'level')::integer>=6) then
   hp=(sheet->>'hp_current')::integer;maxhp=private.battle_hp_max(sheet);afterhp=least(maxhp,hp+2+r.resource_level);temp=coalesce((sheet->>'hp_temp')::integer,0);
   update public.characters set system_data=system_data||jsonb_build_object('hp_current',afterhp) where id=a.character_id;
   insert into public.battle_action_effects(request_id,campaign_id,token_id,kind,amount,hp_before,hp_after,temp_before,temp_after,saved) values(r.id,r.campaign_id,a.id,'healing',afterhp-hp,hp,afterhp,temp,temp,false);
   applied=applied||jsonb_build_array(jsonb_build_object('token_id',a.id,'name',a.name,'kind','healing','amount',afterhp-hp,'saved',false));
  end if;
 end if;
 return jsonb_build_object('roll',roll,'affected',applied,'count',jsonb_array_length(applied));`,
);
const turn = patch(
  definition(v11, 'private.battle_turn_budget'),
  '  update public.battle_map_tokens set disengaged=false where id=old.active_token_id;',
  `  update public.battle_map_tokens t set raging=false where t.map_id in(select id from public.battle_maps where battle_session_id=new.id) and t.raging and (new.status<>'active' or new.round-coalesce(t.rage_started_round,new.round)>=10 or (private.battle_sheet(t.id)->>'hp_current')::integer<=0);
  update public.battle_map_tokens t set raging=case when private.dnd_class_level(private.battle_sheet(t.id),'barbarian')>=15 then raging else raging and coalesce(rage_activity_at,'-infinity')>=coalesce(rage_checked_at,old.turn_started_at) end,rage_checked_at=now(),disengaged=false where id=old.active_token_id;
  update public.battle_map_tokens set sneak_used=false,hunter_used=false where map_id in(select id from public.battle_maps where battle_session_id=new.id);
  update public.battle_map_tokens set extra_actions=0,surge_used=false,weapon_attacked=false where id=new.active_token_id;`,
);
let approve = patch(
  definition(v11, 'public.approve_battle_action'),
  "q.kind in('spell','weapon')",
  "q.kind in('spell','weapon','item','feature')",
);
approve = patch(
  approve,
  'kind text; expression text;',
  'kind text; expression text;parts jsonb;part jsonb;actor_sheet jsonb;barbarian integer;extra integer;critdef jsonb;',
);
approve = patch(
  approve,
  " kind=coalesce(opts->>'kind',q.definition->>'kind','utility');",
  ` kind=coalesce(opts->>'kind',q.definition->>'kind','utility');
 if p_success and expression is distinct from coalesce(q.definition->>'dice','') then
  update public.battle_action_requests set definition=definition-array['damageParts','rerollWeaponDice'] where id=q.id returning * into q;
 end if;
 if p_success and coalesce((opts->>'critical')::boolean,false) then
  if kind<>'damage' or q.definition->>'shape'<>'single' or coalesce(q.definition->>'save','')<>'' then raise exception 'Crítico é válido apenas para dano de ataque contra alvo único.';end if;
  actor_sheet=private.battle_sheet(q.token_id);barbarian=private.dnd_class_level(actor_sheet,'barbarian');extra=0;
  if q.kind in('weapon','opportunity') and not(private.dnd_weapon_traits(q.definition->'entry',actor_sheet)->>'ranged')::boolean then extra=case when barbarian>=17 then 3 when barbarian>=13 then 2 when barbarian>=9 then 1 else 0 end;end if;
  parts='[]';
  for part in select value from jsonb_array_elements(coalesce(q.definition->'damageParts','[]')) loop
   part=part||jsonb_build_object('dice',private.dnd_critical_expression(part->>'dice'));
   if jsonb_array_length(parts)=0 and extra>0 then part=part||jsonb_build_object('dice',(part->>'dice')||'+'||extra||'d'||substring(expression from '^\\d+d(\\d+)'));end if;
   parts=parts||jsonb_build_array(part);
  end loop;
  expression=private.dnd_critical_expression(expression);
  if jsonb_array_length(parts)>0 then select string_agg(p->>'dice','+' order by n) into expression from jsonb_array_elements(parts) with ordinality a(p,n);end if;
  critdef=q.definition||jsonb_build_object('dice',expression,'damageParts',parts,'rerollWeaponDice',coalesce((q.definition->>'rerollWeaponDice')::integer,0)*2,'critical',true);
  update public.battle_action_requests set definition=critdef where id=q.id returning * into q;
 end if;`,
);
let roll = definition(v11, 'public.roll_approved_battle_action');
roll = patch(
  roll,
  "detail=private.battle_roll_detail(expression,'normal');",
  'detail=private.dnd_attack_roll_detail(expression,permit.definition);',
);
roll = patch(
  roll,
  "permit.options||jsonb_build_object('dice',greatest(0,d.total)::text)",
  "permit.options||jsonb_build_object('dice',greatest(0,d.total)::text,'damage_parts',private.dnd_roll_damage_parts(detail->'terms',permit.definition->'damageParts'))",
);
let publicResolve = patch(
  definition(v10, 'public.resolve_battle_action'),
  "q.kind in('spell','weapon','opportunity')",
  "q.kind in('spell','weapon','item','feature','opportunity')",
);
publicResolve = patch(
  publicResolve,
  "opts=opts||jsonb_build_object('dice',greatest(0,r.total)::text);",
  "opts=opts||jsonb_build_object('dice',greatest(0,r.total)::text,'damage_parts',private.dnd_roll_damage_parts(r.terms,q.definition->'damageParts'));",
);

sql = patch(
  sql,
  '-- SQL_OVERRIDES',
  [
    base,
    sheet,
    weapon,
    reference,
    save,
    bonus,
    request,
    resolve,
    hp,
    turn,
    approve,
    roll,
    publicResolve,
  ].join('\n\n'),
);
writeFileSync(root + '202610070018_spell_access_combat_and_items.sql', sql);
console.log(
  'Migration 018 generated:',
  Buffer.byteLength(sql),
  'bytes',
  ITEM_CATALOG.length,
  'items',
  features.size,
  'features',
);

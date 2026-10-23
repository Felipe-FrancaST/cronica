-- 037: PHB 2014 sheet validation and guided combat. Apply after 036.
-- Additive, repeatable, and small enough for the SQL Editor.
begin;

create or replace function private.battle_resolve_guided_core(p_request_id uuid,p_success boolean,p_resolution jsonb default '{}') returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare r public.battle_action_requests; s public.battle_sessions; t public.battle_map_tokens; e jsonb; entry jsonb; sheet jsonb; outcomes jsonb='{}';
 spend boolean; attacks integer=1; opts jsonb=coalesce(p_resolution,'{}');f jsonb;units integer;itemdef jsonb;inv public.character_inventory;wopts jsonb;newdata jsonb;remaining integer;
begin
 select * into r from public.battle_action_requests where id=p_request_id;
 if r.id is null then raise exception 'Tentativa inexistente.';end if;
 select * into s from public.battle_sessions where id=r.session_id for update;
 perform 1 from public.campaigns where id=r.campaign_id for update; -- serialize HP/resources across maps of one campaign
 select * into r from public.battle_action_requests where id=p_request_id for update;
 if r.status<>'pending' then return r; end if; -- idempotent, including two browsers clicking simultaneously
 select * into t from public.battle_map_tokens where id=r.token_id for update;
 if s.status<>'active' or s.round<>r.round or s.turn_index<>r.turn_index or s.turn_started_at is distinct from r.turn_started_at then
  update public.battle_action_requests set status='expired',resolved_at=now() where id=r.id returning * into r; return r;
 end if;
 if r.kind<>'opportunity' and s.active_token_id is distinct from t.id then raise exception 'A tentativa pertence a outro turno.'; end if;
 sheet=private.battle_sheet(t.id); e=r.definition; spend=p_success or s.failed_actions_consume or coalesce((opts->>'guided')::boolean,false);
 if p_success and opts ? 'geometry' then
  if coalesce(opts->'geometry'->>'shape','') not in('single','self','sphere','cone','line','cube') or coalesce(opts->'geometry'->>'origin','') not in('point','self') or coalesce((opts->'geometry'->>'size')::numeric,-1)<0 or (opts->'geometry'->>'size')::numeric>10000 or coalesce((opts->'geometry'->>'width')::numeric,0)<=0 or (opts->'geometry'->>'width')::numeric>10000 then raise exception 'Formato ou dimensão da área inválido.'; end if;
  e=e||jsonb_build_object('shape',opts->'geometry'->>'shape','origin',opts->'geometry'->>'origin','size',(opts->'geometry'->>'size')::numeric,'width',(opts->'geometry'->>'width')::numeric);
 end if;
 if r.kind='feature' and spend then
  f=private.dnd_feature_definition(sheet,e->>'id',(e->>'units')::integer,t.raging);
  if f->>'operation'='surge' and t.surge_used then raise exception 'Surto de Ação já utilizado neste turno.';end if;
  if coalesce(f->>'resource','')<>'' then
   update public.characters set system_data=jsonb_set(system_data,'{feature_uses}',coalesce(system_data->'feature_uses','{}')||jsonb_build_object(f->>'resource',coalesce((system_data->'feature_uses'->>(f->>'resource'))::integer,0)+(f->>'units')::integer)) where id=t.character_id;
  end if;
 elsif r.kind='item' and spend then
  select * into inv from public.character_inventory where id=r.source_id and character_id=t.character_id for update;
  if inv.id is null then raise exception 'O item foi removido.';end if;
  if nullif(inv.data->>'campaign_item_id','') is not null then
   if (inv.data->>'definition_version')::integer is distinct from (e->>'item_version')::integer then raise exception 'A versão deste item mudou. Cancele a tentativa.';end if;
   itemdef=private.campaign_item_use(inv.data,e->>'item_function_id');
   newdata=inv.data||jsonb_build_object('quantity',(inv.data->>'quantity')::integer-(itemdef->>'quantity_cost')::integer,'charges_used',coalesce((inv.data->>'charges_used')::integer,0)+(itemdef->>'charge_cost')::integer);
  else
  select data into itemdef from public.dnd_items where id=inv.data->>'catalog_id';
  if inv.id is null or itemdef->'use' is null or (inv.data->>'quantity')::integer<1 then raise exception 'O item foi removido ou está esgotado.';end if;
  newdata=inv.data;
  if itemdef ? 'charges' then
   remaining=coalesce((inv.data->>'charges_used')::integer,0)+1;
   if remaining>(itemdef->>'charges')::integer then raise exception 'Este item não possui mais usos.';end if;
   newdata=newdata||jsonb_build_object('charges_used',remaining);
   if remaining=(itemdef->>'charges')::integer and (inv.data->>'quantity')::integer>1 then newdata=newdata||jsonb_build_object('quantity',(inv.data->>'quantity')::integer-1,'charges_used',0);end if;
  elsif coalesce((itemdef->'use'->>'consumed')::boolean,false) then newdata=newdata||jsonb_build_object('quantity',(inv.data->>'quantity')::integer-1);end if;

  end if;
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
 if r.kind='spell' and spend then
  if t.character_id is not null then select data into entry from public.character_spells where id=r.source_id and character_id=t.character_id;
  else select data into entry from public.npc_spells where id=r.source_id and npc_id=t.npc_id; end if;
  if entry is null then raise exception 'A magia foi retirada da ficha. Cancele esta tentativa.'; end if;
  entry=entry||jsonb_build_object('level',r.spell_level); perform private.battle_check_resource(t,entry,r.resource_kind,r.resource_level);
  if t.character_id is not null then
   perform 1 from public.characters where id=t.character_id for update;
   perform private.battle_check_resource(t,entry,r.resource_kind,r.resource_level);
   if r.resource_kind='slot' then update public.characters set system_data=jsonb_set(system_data,'{slots_used}',coalesce(system_data->'slots_used','{}')||jsonb_build_object(r.resource_level::text,coalesce((system_data->'slots_used'->>r.resource_level::text)::integer,0)+1)) where id=t.character_id;
   elsif r.resource_kind='pact' then update public.characters set system_data=system_data||jsonb_build_object('pact_slots_used',coalesce((system_data->>'pact_slots_used')::integer,0)+1) where id=t.character_id;
   elsif r.resource_kind='arcanum' then update public.characters set system_data=jsonb_set(system_data,'{arcanum_used}',coalesce(system_data->'arcanum_used','{}')||jsonb_build_object(r.resource_level::text,1)) where id=t.character_id;
   end if;
  end if;
 end if;
 if spend then
  if r.cost='action' then
   if r.kind='weapon' then
    if t.action_used and t.attacks_remaining<=0 and t.extra_actions=0 then raise exception 'Não há ataques restantes.'; end if;
    if not t.action_used or t.attacks_remaining<=0 then
     attacks=case when e->'entry'->>'catalog_id'='net' then 1 else private.dnd_attack_count(sheet) end;
    else attacks=t.attacks_remaining; end if;
    update public.battle_map_tokens set action_used=true,attacks_remaining=attacks-1,extra_actions=extra_actions-case when t.action_used and t.attacks_remaining<=0 then 1 else 0 end where id=t.id;
   else
    if t.action_used and t.extra_actions=0 then raise exception 'A ação já foi utilizada.';end if;
    update public.battle_map_tokens set action_used=true,attacks_remaining=case when t.action_used then t.attacks_remaining else 0 end,extra_actions=extra_actions-case when t.action_used then 1 else 0 end,action_spell_level=case when r.kind='spell' then r.spell_level else action_spell_level end where id=t.id; end if;
  elsif r.cost='bonus' then
   if t.bonus_used then raise exception 'A ação bônus já foi utilizada.'; end if;
   update public.battle_map_tokens set bonus_used=true,bonus_spell_cast=bonus_spell_cast or r.kind='spell' where id=t.id;
  elsif r.cost='reaction' then
   if t.reaction_used then raise exception 'A reação já foi utilizada.'; end if;
   update public.battle_map_tokens set reaction_used=true where id=t.id;
  end if;
 end if;
 if p_success then
  if r.kind='feature' then
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
  elsif r.kind='dash' then update public.battle_map_tokens set movement_remaining=movement_remaining+movement_speed,movement_bonus=movement_bonus+movement_speed where id=t.id;
  elsif r.kind='disengage' then update public.battle_map_tokens set disengaged=true where id=t.id;
  elsif r.kind='dodge' then update public.battle_map_tokens set dodging=true where id=t.id;
  else
   if r.kind='item' then perform private.dnd_item_special(r,e);end if;
   if opts ? 'kind' then
    if opts->>'kind' not in('damage','healing','temporary','utility') then raise exception 'Efeito inválido.'; end if;
    e=e||jsonb_build_object('kind',opts->>'kind');
   end if;
   if opts ? 'damageType' then e=e||jsonb_build_object('damageType',opts->>'damageType'); end if;
   if coalesce(e->>'timing','immediate')='immediate' or coalesce((opts->>'apply_now')::boolean,false) then outcomes=private.battle_apply_hp(r,t,e,opts); end if;
   if r.kind='spell' and (e ? 'pulseDice' or coalesce(e->>'timing','immediate')='trigger' or lower(coalesce(e->>'duration','')) not like 'instant%') then
    if coalesce((e->>'concentration')::boolean,false) then update public.battle_spell_effects set active=false where token_id=t.id and concentration and active; end if;
    insert into public.battle_spell_effects(request_id,campaign_id,map_id,token_id,name,definition,target,concentration,duration)
    values(r.id,r.campaign_id,r.map_id,t.id,r.name,case when e ? 'pulseDice' then e||jsonb_build_object('dice',e->>'pulseDice') else e end,r.target,coalesce((e->>'concentration')::boolean,false),coalesce(e->>'duration',''));
   end if;
  end if;
 end if;
 update public.battle_action_requests set status=case when p_success then 'success' else 'failure' end,resolution=outcomes||jsonb_build_object('resources_consumed',spend,'dice',coalesce(opts->>'dice',e->>'dice','')),
  resolved_by=auth.uid(),resolved_at=now() where id=r.id returning * into r;
 if r.movement_plan_id is not null then perform private.battle_finish_movement(r.movement_plan_id); end if;
 return r;
end $$;

create or replace function private.validate_campaign_item(p_data jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare d jsonb;fn jsonb;functions jsonb='[]';ids text[]='{}';key text;value numeric;
begin
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Definição de item inválida.';end if;
 select coalesce(jsonb_object_agg(k,v),'{}') into d from jsonb_each(p_data) e(k,v) where k=any(array['name','category','weight','cost_gp','notes','rarity','attunement','charges','weapon_type','weapon_attack_bonus','properties','versatile_damage','ammunition','armor_base','armor_type','damage','weapon_mode','weapon_range','weapon_ability','functions','bonuses','tags','recharge','passive_requires_equipped','image_path']);
 if jsonb_typeof(d->'name') is distinct from 'string' or length(trim(d->>'name')) not between 1 and 100 then raise exception 'Informe um nome de até 100 caracteres.';end if;
 d=jsonb_set(d,'{name}',to_jsonb(trim(d->>'name')));
 if coalesce(d->>'category','') not in('weapon','armor','gear','item','potion','ammunition','tool','focus','consumable','container','treasure','magic') then raise exception 'Categoria de item inválida.';end if;
 if jsonb_typeof(d->'notes') is distinct from 'string' or length(d->>'notes')>12000 or length(coalesce(d->>'rarity',''))>80 then raise exception 'Descrição ou raridade inválidas.';end if;
 foreach key in array array['weight','cost_gp','charges'] loop
  if jsonb_typeof(d->key) is distinct from 'number' then raise exception 'Informe números válidos para peso, preço e cargas.';end if;
  value=(d->>key)::numeric;
  if value<0 or value>(case key when 'weight' then 100000 when 'charges' then 999 else 1000000000 end) or key='charges' and value<>floor(value) then raise exception 'Peso, preço ou cargas fora do limite.';end if;
 end loop;
 if jsonb_typeof(d->'attunement') is distinct from 'boolean' or jsonb_typeof(d->'passive_requires_equipped') is distinct from 'boolean' then raise exception 'Requisitos do item inválidos.';end if;
 if d->>'recharge' not in('none','manual','short','long','dawn') then raise exception 'Condição de recarga inválida.';end if;
 if jsonb_typeof(d->'tags') is distinct from 'array' or jsonb_array_length(d->'tags')>12 then raise exception 'Use até 12 etiquetas.';end if;
 if exists(select 1 from jsonb_array_elements(d->'tags') t where jsonb_typeof(t)<>'string' or length(t#>>'{}')>40) then raise exception 'Etiquetas inválidas.';end if;
 if jsonb_typeof(d->'bonuses') is distinct from 'object' then raise exception 'Bônus do item inválidos.';end if;
 foreach key in array array['ac','attack','damage','speed'] loop
  if jsonb_typeof(d->'bonuses'->key) is distinct from 'number' then raise exception 'Bônus do item inválidos.';end if;
  value=(d->'bonuses'->>key)::numeric;
  if abs(value)>(case when key='speed' then 120 else 20 end) or key<>'speed' and value<>floor(value) then raise exception 'Bônus do item fora do limite.';end if;
 end loop;
 if d->>'category'='weapon' then
  perform private.item_dice_expression(substring(d->>'damage' from '^[0-9dD+\s-]+'));
  if d->>'weapon_type' not in('simple','martial') or d->>'weapon_mode' not in('melee','ranged') or coalesce((d->>'weapon_range')::numeric,1.5) not between 0 and 600 or abs(coalesce((d->>'weapon_attack_bonus')::numeric,0))>20 or coalesce((d->>'weapon_attack_bonus')::numeric,0)<>floor(coalesce((d->>'weapon_attack_bonus')::numeric,0)) then raise exception 'Configuração de arma inválida.';end if;
  if nullif(d->>'weapon_ability','') is not null and d->>'weapon_ability' not in('str','dex','con','int','wis','cha') then raise exception 'Atributo da arma inválido.';end if;
  if nullif(d->>'versatile_damage','') is not null then perform private.item_dice_expression(d->>'versatile_damage');end if;
 end if;
 if d->>'category'='armor' and (coalesce(d->>'armor_type','') not in('light','medium','heavy','shield') or jsonb_typeof(d->'armor_base') is distinct from 'number' or (d->>'armor_base')::numeric not between 0 and 50 or (d->>'armor_base')::numeric<>floor((d->>'armor_base')::numeric)) then raise exception 'Configuração de armadura inválida.';end if;
 if jsonb_typeof(d->'functions') is distinct from 'array' or jsonb_array_length(d->'functions')>12 then raise exception 'Use até 12 funções por item.';end if;
 for fn in select f.value from jsonb_array_elements(d->'functions') f loop
  if jsonb_typeof(fn) is distinct from 'object' or length(coalesce(fn->>'id','')) not between 1 and 80 or fn->>'id'=any(ids) or length(trim(coalesce(fn->>'name',''))) not between 1 and 80 then raise exception 'Identificador ou nome de função inválido.';end if;
  ids=array_append(ids,fn->>'id');
  if coalesce(fn->>'kind','') not in('healing','damage','temporary','utility') or coalesce(fn->>'cost','') not in('action','bonus','reaction','free') or coalesce(fn->>'shape','') not in('single','self','sphere','cone','line','cube') or coalesce(fn->>'origin','') not in('point','self') then raise exception 'Efeito, área ou ação da função inválidos.';end if;
  if fn->>'kind'<>'utility' then fn=jsonb_set(fn,'{dice}',to_jsonb(private.item_dice_expression(fn->>'dice')));else fn=jsonb_set(fn,'{dice}','""');end if;
  foreach key in array array['range','size','width','charge_cost','quantity_cost'] loop
   if jsonb_typeof(fn->key) is distinct from 'number' then raise exception 'Informe números válidos na função.';end if;
   value=(fn->>key)::numeric;
   if value<0 or value>(case when key in('charge_cost','quantity_cost') then 999 else 600 end) or key='width' and value<=0 or key in('charge_cost','quantity_cost') and value<>floor(value) then raise exception 'Área ou custo da função fora do limite.';end if;
  end loop;
  if (fn->>'charge_cost')::integer>(d->>'charges')::integer then raise exception 'O custo em cargas ultrapassa a capacidade do item.';end if;
  if jsonb_typeof(fn->'requires_equipped') is distinct from 'boolean' or jsonb_typeof(fn->'halfOnSave') is distinct from 'boolean' or jsonb_typeof(fn->'note') is distinct from 'string' or length(fn->>'note')>4000 or length(coalesce(fn->>'damageType',''))>40 or coalesce(fn->>'save','') not in('','FOR','DES','CON','INT','SAB','CAR') then raise exception 'Regras da função inválidas.';end if;
  if fn ? 'attackRoll' and jsonb_typeof(fn->'attackRoll')<>'boolean' then raise exception 'Configuração de ataque inválida.';end if;
  if fn ? 'attack_bonus' and (jsonb_typeof(fn->'attack_bonus')<>'number' or abs((fn->>'attack_bonus')::numeric)>50 or (fn->>'attack_bonus')::numeric<>floor((fn->>'attack_bonus')::numeric)) then raise exception 'Bônus de ataque inválido.';end if;
  if coalesce((fn->>'attackRoll')::boolean,false) and coalesce(fn->>'save','')<>'' then raise exception 'Escolha ataque ou salvaguarda nesta função.';end if;
  if fn ? 'save_dc' and (jsonb_typeof(fn->'save_dc') is distinct from 'number' or (fn->>'save_dc')::numeric not between 1 and 40 or (fn->>'save_dc')::numeric<>floor((fn->>'save_dc')::numeric)) then raise exception 'A CD do item deve ser um inteiro de 1 a 40.';end if;
  if fn->>'shape'='self' then fn=fn||'{"origin":"self","range":0}';end if;
  select jsonb_object_agg(k,v) into fn from jsonb_each(fn) e(k,v) where k=any(array['id','name','kind','dice','cost','range','shape','origin','size','width','damageType','save','halfOnSave','save_dc','attackRoll','attack_bonus','charge_cost','quantity_cost','requires_equipped','note']);
  functions=functions||jsonb_build_array(fn);
 end loop;
 return jsonb_set(d,'{functions}',functions);
end $$;

create or replace function public.request_battle_action(p_token_id uuid,p_payload jsonb,p_client_id uuid) returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens; m public.battle_maps; s public.battle_sessions; entry jsonb; e jsonb; sheet jsonb;
 result public.battle_action_requests; source uuid; kind text=p_payload->>'kind'; cost text='action'; rkind text='none'; rlevel integer=0;
 target jsonb=p_payload->'target'; ids uuid[]; attack_ids uuid[]; attack_count integer=1; sp public.dnd_spells; ability text; modifier integer; dice text; pulse_dice text; lvl integer=0; cname text; f jsonb; wopts jsonb=coalesce(p_payload->'weapon_options','{}'); units integer=coalesce((p_payload->>'feature_units')::integer,1); itemdef jsonb;
begin
 if auth.uid() is null or p_client_id is null then raise exception 'Entre na sua conta para agir.' using errcode='42501'; end if;
 select * into result from public.battle_action_requests where requested_by=auth.uid() and client_id=p_client_id;
 if result.id is not null then
  if not private.can_read_campaign(result.campaign_id) or not private.can_control_battle_token(result.token_id) then raise exception 'Você não tem mais acesso a esta tentativa.' using errcode='42501'; end if; return result;
 end if;
 select * into m from public.battle_maps where id=(select map_id from public.battle_map_tokens where id=p_token_id);
 select * into s from public.battle_sessions where id=m.battle_session_id for update;
 select * into t from public.battle_map_tokens where id=p_token_id for update;
 select * into result from public.battle_action_requests where requested_by=auth.uid() and client_id=p_client_id;
 if result.id is not null then
  if not private.can_read_campaign(result.campaign_id) or not private.can_control_battle_token(result.token_id) then raise exception 'Você não tem mais acesso a esta tentativa.' using errcode='42501'; end if; return result;
 end if;
 if t.id is null or not private.can_control_battle_token(t.id) then raise exception 'Você não controla esse personagem.' using errcode='42501'; end if;
 if s.status<>'active' or s.active_token_id is distinct from t.id then raise exception 'Aguarde o turno deste personagem.'; end if;
 if exists(select 1 from public.battle_action_requests q where q.session_id=s.id and q.status in('pending','approved') and (q.token_id=t.id or q.kind='opportunity')) then raise exception 'Aguarde a decisão do mestre sobre a tentativa pendente.'; end if;
 sheet=private.battle_sheet(t.id);
 if coalesce((sheet->>'hp_current')::integer,0)<=0 then raise exception 'Um personagem com 0 PV não pode executar esta ação.'; end if;
 if sheet->'conditions' ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado'] then raise exception 'A condição do personagem impede ações e reações.'; end if;
 if kind not in('weapon','spell','item','feature','dash','disengage','dodge') then raise exception 'Ação inválida.'; end if;
 if kind='item' then
  if t.character_id is null then raise exception 'NPC usa os itens descritos na sua ficha.';end if;
  source=(p_payload->>'source_id')::uuid;
  select data||jsonb_build_object('id',id) into entry from public.character_inventory where id=source and character_id=t.character_id for update;
  if entry is null then raise exception 'O item não está no inventário deste personagem.';end if;
  if nullif(entry->>'campaign_item_id','') is not null then
   e=private.campaign_item_use(entry,p_payload->>'item_function_id');
   cost=e->>'cost';cname=entry->>'name'||' · '||(e->>'name');
  else
  select data into itemdef from public.dnd_items where id=entry->>'catalog_id';
  if entry is null or itemdef->'use' is null or (entry->>'quantity')::integer<1 or (itemdef ? 'charges' and coalesce((entry->>'charges_used')::integer,0)>=(itemdef->>'charges')::integer) then raise exception 'Item esgotado ou sem uso de combate definido.';end if;
  e=itemdef->'use'||jsonb_build_object('shape','single','origin','point','size',0,'width',1.5,'maxTargets',1,'timing','immediate','review',true,'damageType',case entry->>'catalog_id' when 'acid' then 'ácido' when 'holy-water' then 'radiante' else '' end,'item_catalog',entry->>'catalog_id');cname=entry->>'name';

  end if;
 elsif kind='feature' then
  if t.character_id is null then raise exception 'NPC usa as habilidades descritas na própria ficha.';end if;
  f=private.dnd_feature_definition(sheet,p_payload->>'feature_id',units,t.raging);
  if f->>'operation'='surge' and t.surge_used then raise exception 'Surto de Ação só pode ser usado uma vez por turno.';end if;
  e=f||jsonb_build_object('shape',case when (f->>'self')::boolean then 'self' else 'single' end,'origin',case when (f->>'self')::boolean then 'self' else 'point' end,'size',0,'width',1.5,'maxTargets',1,'timing','immediate','review',f->>'operation'='manual');
  cost=f->>'cost';cname=f->>'name';entry=f;
 elsif kind in('weapon','spell') then
  source=(p_payload->>'source_id')::uuid;
  if kind='weapon' then
   if t.character_id is not null then
    if source=t.id then entry=jsonb_build_object('id',source,'name','Ataque desarmado','catalog_id','unarmed','category','weapon','quantity',1,'damage','1 concussão','notes','');
    else select data||jsonb_build_object('id',id) into entry from public.character_inventory where id=source and character_id=t.character_id and data->>'category'='weapon' and coalesce((data->>'quantity')::integer,0)>0;end if;
   else select data into entry from public.npc_attacks where id=source and npc_id=t.npc_id; end if;
   if entry is null then raise exception 'Esta arma não está na ficha do personagem.'; end if;
   if entry->>'catalog_id'='net' and t.action_used and t.attacks_remaining>0 then raise exception 'A rede exige uma ação inteira; conclua os ataques desta ação antes de usá-la.';end if;
   perform private.dnd_check_weapon_options(t,entry,sheet,wopts,coalesce(p_payload->'target_ids','[]'));
   e=private.dnd_weapon_effect(entry,sheet,wopts,t.raging);entry=entry||jsonb_build_object('weapon_options',wopts);cname=entry->>'name';
   if coalesce((wopts->>'offhand')::boolean,false) then cost='bonus';end if;
   if coalesce((wopts->>'smite_level')::integer,0)>0 then rkind=coalesce(wopts->>'smite_kind','slot');rlevel=(wopts->>'smite_level')::integer;end if;
   if coalesce((wopts->>'sneak')::boolean,false) then e=e||'{"review":true,"note":"Ataque Furtivo: o mestre confirma vantagem ou aliado adjacente e ausência de desvantagem."}'::jsonb;end if;
   if coalesce((wopts->>'smite_special')::boolean,false) then e=e||'{"review":true,"note":"O mestre confirma que o alvo é morto-vivo ou ínfero para o dado radiante adicional."}'::jsonb;end if;
  else
   if t.character_id is not null then select data into entry from public.character_spells where id=source and character_id=t.character_id;
   else select data into entry from public.npc_spells where id=source and npc_id=t.npc_id; end if;
   if entry is null then raise exception 'Esta magia não está na ficha do personagem.'; end if;
   select * into sp from public.dnd_spells where id=entry->>'catalog_id';
   e=case when sp.id is not null then sp.combat else '{"shape":"single","kind":"utility","range":9,"size":0,"width":1.5,"origin":"point","dice":"","review":true,"timing":"immediate","note":"Magia personalizada: o mestre configura os efeitos na aprovação."}'::jsonb end;
   lvl=coalesce(sp.level,(entry->>'level')::integer,0); entry=entry||jsonb_build_object('level',lvl);
   cname=coalesce(sp.name,entry->>'name'); rkind=coalesce(p_payload->>'resource_kind',case when lvl=0 then 'cantrip' else 'slot' end); rlevel=coalesce((p_payload->>'resource_level')::integer,lvl);
   if t.raging then raise exception 'Não é possível conjurar enquanto a Fúria está ativa.';end if;
   perform private.battle_check_resource(t,entry,rkind,rlevel);
   if lower(coalesce(sp.data->>'casting_time',entry->>'casting_time','1 ação')) like '%bônus%' then cost='bonus';
   elsif lower(coalesce(sp.data->>'casting_time',entry->>'casting_time','1 ação')) like '%rea%' then cost='reaction'; end if;
   if t.bonus_spell_cast and (cost<>'action' or lvl>0) then raise exception 'Após magia bônus, só um truque com tempo de 1 ação pode ser conjurado neste turno.'; end if;
   if cost='bonus' and t.action_spell_level>0 then raise exception 'Uma magia de ação de círculo 1 ou maior impede conjuração bônus neste turno.'; end if;
   ability=private.dnd_spell_ability(sheet,entry);
   modifier=floor((coalesce((sheet->'abilities'->>ability)::numeric,10)-10)/2);
   dice=coalesce(e->>'dice','');
   if e ? 'sizePerSlot' then e=e||jsonb_build_object('size',(e->>'size')::numeric+greatest(0,rlevel-lvl)*(e->>'sizePerSlot')::numeric); end if;
   if coalesce((e->>'cantripScale')::boolean,false) and lvl=0 then
    dice=regexp_replace(dice,'^(\d+)d',((substring(dice from '^\d+'))::integer*case when (sheet->>'level')::integer>=17 then 4 when (sheet->>'level')::integer>=11 then 3 when (sheet->>'level')::integer>=5 then 2 else 1 end)::text||'d');
   end if;
   if coalesce(e->>'upcast','')<>'' and rlevel>lvl then for i in 1..((rlevel-lvl)/greatest(1,coalesce((e->>'upcastEvery')::integer,1))) loop dice=dice||'+'||(e->>'upcast'); end loop; end if;
   if e ? 'pulseDice' then
    pulse_dice=e->>'pulseDice';
    if coalesce(e->>'pulseUpcast','')<>'' and rlevel>lvl then for i in lvl+1..rlevel loop pulse_dice=pulse_dice||'+'||(e->>'pulseUpcast'); end loop; end if;
    e=e||jsonb_build_object('pulseDice',pulse_dice);
   end if;
   if coalesce((e->>'ability')::boolean,false) then dice=dice||case when modifier>=0 then '+' else '' end||modifier; end if;
   if coalesce(e->>'dice','')<>'' and private.dnd_spell_bonus(sheet,entry,e,rlevel)<>0 then dice=dice||case when private.dnd_spell_bonus(sheet,entry,e,rlevel)>=0 then '+' else '' end||private.dnd_spell_bonus(sheet,entry,e,rlevel);end if;
   if e->>'kind'='healing' and lvl>0 then dice=private.dnd_healing_dice(sheet,dice);end if;
   e=e||jsonb_build_object('dice',dice,'concentration',coalesce(sp.concentration,false),'duration',coalesce(sp.data->>'duration',entry->>'duration',''),'description',coalesce(sp.data->>'description',entry->>'description',''),'casting_time',coalesce(sp.data->>'casting_time',entry->>'casting_time','1 ação'));
   if lower(e->>'casting_time') ~ '(minuto|hora)' then e=e||'{"review":true,"timing":"trigger","note":"Conjuração longa: o mestre acompanha o tempo e conclui o efeito somente após a duração necessária."}'::jsonb; end if;
  end if;
 elsif kind in('dash','disengage') and private.dnd_class_level(sheet,'rogue')>=2 and p_payload->>'cost'='bonus' then
  cost='bonus'; cname=case kind when 'dash' then 'Disparada (Ação Ardilosa)' else 'Desengajar (Ação Ardilosa)' end;
 else cname=case kind when 'dash' then 'Disparada' when 'disengage' then 'Desengajar' else 'Esquivar' end; end if;
 if cost='action' and t.action_used and t.extra_actions=0 and not(kind='weapon' and t.attacks_remaining>0) then raise exception 'A ação deste turno já foi utilizada.'; end if;
 if cost='bonus' and t.bonus_used then raise exception 'A ação bônus já foi utilizada.'; end if;
 if cost='reaction' and t.reaction_used then raise exception 'A reação já foi utilizada.'; end if;
 e=coalesce(e,'{"shape":"self","kind":"utility","origin":"self","range":0,"size":0,"dice":""}'::jsonb);
 
 if coalesce((e->>'levelBeams')::boolean,false) then attack_count=case when (sheet->>'level')::integer>=17 then 4 when (sheet->>'level')::integer>=11 then 3 when (sheet->>'level')::integer>=5 then 2 else 1 end;
 else attack_count=coalesce((e->>'attackCount')::integer,1)+greatest(0,rlevel-lvl)*coalesce((e->>'attacksPerSlot')::integer,0);end if;
 if attack_count>1 then
  e=e||jsonb_build_object('attackCount',attack_count,'maxTargets',attack_count);
  if kind='spell' and entry->>'catalog_id'<>'rajada-mistica' then e=e||jsonb_build_object('onceBonus',private.dnd_spell_bonus(sheet,entry,e,rlevel));end if;
 end if;
 if kind='item' and (entry->>'catalog_id' in('acid','holy-water') or coalesce((e->>'attackRoll')::boolean,false)) then e=e||jsonb_build_object('attackRoll',true,'attackBonus',coalesce((e->>'attack_bonus')::integer,floor(((sheet->'abilities'->>'dex')::numeric-10)/2)::integer));end if;
 target=coalesce(target,jsonb_build_object('x',t.x,'y',t.y));
 if jsonb_typeof(target->'x') is distinct from 'number' or jsonb_typeof(target->'y') is distinct from 'number' or (target->>'x')::numeric<>floor((target->>'x')::numeric) or (target->>'y')::numeric<>floor((target->>'y')::numeric) or (target->>'x')::integer<0 or (target->>'x')::integer>=m.width or (target->>'y')::integer<0 or (target->>'y')::integer>=m.height then raise exception 'Alvo fora do mapa.'; end if;
 if e->>'origin'<>'self' and private.battle_target_range(t,target,m)>coalesce((e->>'range')::numeric,0)+0.00001 then raise exception 'Alvo fora do alcance.'; end if;
 ids=array(select distinct value::uuid from jsonb_array_elements_text(coalesce(p_payload->'target_ids','[]')));
 if cardinality(ids)>coalesce((e->>'maxTargets')::integer,1) then raise exception 'Quantidade de alvos acima do limite da magia.'; end if;
 if exists(select 1 from unnest(ids) v where not exists(select 1 from public.battle_map_tokens q where q.id=v and q.map_id=t.map_id and private.can_read_battle_token(q.id))) then raise exception 'Alvo não pertence ao mapa ou não está visível.' using errcode='42501'; end if;
 if e->>'shape'='single' and (e->>'kind' in('damage','healing','temporary') or kind in('item','feature','weapon')) and cardinality(ids)<1 then raise exception 'Selecione uma criatura como alvo.'; end if;
 if exists(select 1 from public.battle_map_tokens q where q.id=any(ids) and case when attack_count>1 then private.battle37_target_range(t,q,m)>coalesce((e->>'range')::numeric,0)+0.00001 else not private.battle_in_effect(q,t,target,e,m.scale_per_cell*case when m.scale_unit='ft' then 0.3 else 1 end) end) then raise exception 'Alvo fora da área indicada.'; end if;

 if p_payload ? 'attack_targets' then
  if attack_count<=1 or jsonb_typeof(p_payload->'attack_targets')<>'array' or jsonb_array_length(p_payload->'attack_targets')<>attack_count then raise exception 'Escolha um alvo para cada raio.';end if;
  attack_ids=array(select value::uuid from jsonb_array_elements_text(p_payload->'attack_targets'));
  if exists(select 1 from unnest(attack_ids) id where not(id=any(ids))) then raise exception 'Os raios devem usar os alvos selecionados.';end if;
  e=e||jsonb_build_object('attackTargets',to_jsonb(attack_ids));
 end if;
 insert into public.battle_action_requests(campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,source_id,name,cost,resource_kind,resource_level,spell_level,target,target_ids,definition,round,turn_index,turn_started_at)
 values(t.campaign_id,s.id,t.map_id,t.id,auth.uid(),p_client_id,kind,source,cname,cost,rkind,rlevel,lvl,target,ids,e||jsonb_build_object('entry',entry,'actor_x',t.x,'actor_y',t.y),s.round,s.turn_index,s.turn_started_at) returning * into result;
 return result;
end $$;

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":9,"size":0,"width":1.5,"origin":"point","dice":"1d6","damageType":"perfurante","ability":false,"upcast":"","cantripScale":true,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":false,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","attackRoll":true}$profile$::jsonb where id='chicote-de-espinhos';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":36,"size":0,"width":1.5,"origin":"point","dice":"1d10","damageType":"fogo","ability":false,"upcast":"","cantripScale":true,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":false,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","attackRoll":true}$profile$::jsonb where id='lanca-de-fogo';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":9,"size":0,"width":1.5,"origin":"point","dice":"1d8","damageType":"fogo","ability":false,"upcast":"","cantripScale":true,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":false,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","attackRoll":true}$profile$::jsonb where id='produzir-chama';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":18,"size":0,"width":1.5,"origin":"point","dice":"1d8","damageType":"frio","ability":false,"upcast":"","cantripScale":true,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":false,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","attackRoll":true}$profile$::jsonb where id='raio-de-gelo';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":36,"size":0,"width":1.5,"origin":"point","dice":"1d10","damageType":"energia","ability":false,"upcast":"","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"Cada raio tem seu próprio alvo, ataque e dano. O número de raios aumenta nos níveis totais 5, 11 e 17.","attackRoll":true,"levelBeams":true}$profile$::jsonb where id='rajada-mistica';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":1.5,"size":0,"width":1.5,"origin":"point","dice":"1d8","damageType":"elétrico","ability":false,"upcast":"","cantripScale":true,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":false,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","attackRoll":true}$profile$::jsonb where id='toque-chocante';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":36,"size":0,"width":1.5,"origin":"point","dice":"1d8","damageType":"necrótico","ability":false,"upcast":"","cantripScale":true,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":false,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","attackRoll":true}$profile$::jsonb where id='toque-macabro';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":9,"size":0,"width":1.5,"origin":"point","dice":"1d12","damageType":"elétrico","ability":false,"upcast":"1d12","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"Ataque inicial guiado. O dano recorrente é sempre 1d12 e usa ação. O mestre encerra o elo se o conjurador usar outra ação, perder alcance ou houver cobertura total.","attackRoll":true,"pulseDice":"1d12","pulseCost":"action"}$profile$::jsonb where id='faisca-da-bruxa';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":1.5,"size":0,"width":1.5,"origin":"point","dice":"3d10","damageType":"necrótico","ability":false,"upcast":"1d10","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":false,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","attackRoll":true}$profile$::jsonb where id='infligir-ferimentos';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":27,"size":0,"width":1.5,"origin":"point","dice":"3d8","damageType":"fogo","ability":false,"upcast":"1d8","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"Escolha o tipo de dano no painel de aprovação.","attackRoll":true}$profile$::jsonb where id='orbe-cromatico';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":18,"size":0,"width":1.5,"origin":"point","dice":"2d8","damageType":"veneno","ability":false,"upcast":"1d8","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":false,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","attackRoll":true}$profile$::jsonb where id='raio-doentio';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":36,"size":0,"width":1.5,"origin":"point","dice":"4d6","damageType":"radiante","ability":false,"upcast":"1d6","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"Ataque e dano são guiados. Em um acerto, o mestre concede vantagem ao próximo ataque contra esse alvo antes do fim do próximo turno do conjurador.","attackRoll":true}$profile$::jsonb where id='raio-guiado';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":18,"size":0,"width":1.5,"origin":"point","dice":"1d8","damageType":"energia","ability":true,"upcast":"1d8","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"Ataque inicial guiado. Nos turnos seguintes, o mestre move a arma em até 6 m e confirma o novo ataque antes de Aplicar efeito; custo de ação bônus, sem novo espaço.","attackRoll":true,"upcastEvery":2,"pulseCost":"bonus"}$profile$::jsonb where id='arma-espiritual';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":18,"size":0,"width":1.5,"origin":"point","dice":"2d8","damageType":"fogo","ability":false,"upcast":"1d8","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma contato com metal manufaturado. O dano inicial não tem salvaguarda. Depois do dano, CON decide se a criatura consegue continuar segurando o objeto; aplicações seguintes usam ação bônus.","pulseCost":"bonus"}$profile$::jsonb where id='esquentar-metais';

update public.dnd_spells set combat=combat||$profile${"shape":"cube","kind":"damage","range":18,"size":1.5,"width":1.5,"origin":"point","dice":"4d4","damageType":"cortante","ability":false,"upcast":"2d4","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":99,"timing":"trigger","review":true,"note":"Não causa dano apenas por surgir. O mestre usa Aplicar efeito quando a criatura entra pela primeira vez em um turno ou começa o turno na área; sem salvaguarda."}$profile$::jsonb where id='nuvem-de-adagas';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":36,"size":0,"width":1.5,"origin":"point","dice":"2d6","damageType":"fogo","ability":false,"upcast":"","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"Três ataques separados, mais um raio por círculo acima do 2º. Escolha um alvo para cada raio.","attackRoll":true,"attackCount":3,"attacksPerSlot":1}$profile$::jsonb where id='raio-ardente';

update public.dnd_spells set combat=combat||$profile${"shape":"sphere","kind":"damage","range":36,"size":1.5,"width":1.5,"origin":"point","dice":"2d10","damageType":"radiante","ability":false,"upcast":"1d10","cantripScale":false,"save":"con","halfOnSave":true,"selective":false,"maxTargets":99,"timing":"trigger","review":true,"note":"Cilindro de raio 1,5 m. O mestre aplica o gatilho ao entrar ou começar o turno; CON reduz à metade. Metamorfos fazem a salvaguarda com desvantagem; mover o feixe usa ação."}$profile$::jsonb where id='raio-lunar';

update public.dnd_spells set combat=combat||$profile${"shape":"sphere","kind":"damage","range":36,"size":1.5,"width":1.5,"origin":"point","dice":"3d10","damageType":"elétrico","ability":false,"upcast":"1d10","cantripScale":false,"save":"dex","halfOnSave":true,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"A área mostra o raio do relâmpago, não a nuvem inteira. O mestre confirma espaço para a tempestade e eventual +1d10 de tempestade natural. Relâmpagos seguintes usam ação.","pulseCost":"action"}$profile$::jsonb where id='convocar-relampagos';

update public.dnd_spells set combat=combat||$profile${"shape":"single","kind":"damage","range":1.5,"size":0,"width":1.5,"origin":"point","dice":"3d6","damageType":"necrótico","ability":false,"upcast":"1d6","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"Ataque inicial guiado; recupera metade do dano necrótico causado. Ataques seguintes usam ação e dependem de nova confirmação de acerto pelo mestre antes de Aplicar efeito.","lifeSteal":0.5,"pulseCost":"action","attackRoll":true}$profile$::jsonb where id='toque-vampirico';

update public.dnd_spells set combat=combat||$profile${"shape":"sphere","kind":"damage","range":90,"size":6,"width":1.5,"origin":"point","dice":"4d10","damageType":"perfurante","ability":false,"upcast":"1d10","cantripScale":false,"save":"con","halfOnSave":true,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"Área inicial com CON para metade. Depois, o mestre aplica o gatilho ao entrar pela primeira vez ou começar o turno na área; terreno difícil e visibilidade dependem da descrição."}$profile$::jsonb where id='praga-de-insetos';

update public.dnd_spells set combat=combat||$profile${"shape":"sphere","kind":"damage","range":45,"size":6,"width":1.5,"origin":"point","dice":"10d8","damageType":"fogo","ability":false,"upcast":"","cantripScale":false,"save":"dex","halfOnSave":true,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"Área inicial com DES para metade. O mestre acompanha o movimento da nuvem e aplica o gatilho ao entrar pela primeira vez ou terminar o turno nela."}$profile$::jsonb where id='nuvem-incendiaria';

update public.dnd_spells set data=data||$correction${"range":"36 metros (24 quadrados)","description":"Um raio de luz irrompe até uma criatura à escolha do jogador, que esteja dentro do alcance. Se acertar, o alvo recebe 4d6 de dano radiante, e a próxima jogada de ataque feita contra este alvo antes do final do próximo turno do jogador ganha vantagem, graças a uma penumbra mística resplandecente que fica sobre o alvo. Em níveis superiores. Quando o jogador lança esta magia usando o espaço de uma magia de 2º nível ou superior, o dano aumente em 1d6 para cada nível acima do 1º."}$correction$::jsonb where id='raio-guiado';

update public.dnd_spells set data=data||$correction${"range":"18 metros (12 quadrados)","description":"O jogador cria uma arma espectral, flutuante, que permanece até a duração da magia ou até o jogador a lançar novamente. Quando o jogador lança a magia, ele pode fazer um ataque mágico corpo a corpo contra uma criatura que esteja a 1,5m (1 quadrado) da arma. Se acertar, o alvo recebe dano de força equivalente a 1d8 + o modificador de habilidade de conjuração do jogador. Como uma ação bônus no seu turno, o jogador pode mover a arma até 6 metros (4 quadrados) e repetir o ataque contra uma criatura a até 1,5m (1 quadrado) da arma. A arma pode possuir a forma que o jogador escolher. Clérigos de divindades que são associadas com uma arma em particular (St. Cuthbert é conhecido por sua maça e Thor por seu martelo) farão com que o efeito desta magia sejam semelhantes à arma de sua divindade. Em círculos superiores: acrescente 1d8 de dano a cada dois círculos acima do 2º (4º: 2d8; 6º: 3d8; 8º: 4d8), além do modificador de conjuração."}$correction$::jsonb where id='arma-espiritual';

update public.dnd_spells set data=data||$correction${"range":"18 metros (12 quadrados)","description":"O jogador preenche o ar com adagas rodopiantes em espaço equivalente a um cubo de 1,5m (1 quadrado), centrado no ponto escolhido dentro do alcance. Uma criatura recebe 4d4 de dano cortante quanto entra pela primeira vez em seu turno na área da magia ou começa seu turno nela. Em níveis superiores. Quando o jogador lança esta magia usando o espaço de uma magia de 3º nível ou superior, o dano aumenta em 2d4 para cada círculo acima do 2º."}$correction$::jsonb where id='nuvem-de-adagas';

-- Private helpers run only inside the authenticated RPCs below.
create or replace function private.dnd37_training(s jsonb,expertise boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb=coalesce(s->'skills','{}');id text;c jsonb;choice record;rules jsonb;race text;
begin
 foreach id in array array(select value from jsonb_array_elements_text(coalesce(s->'creation'->'class_skills','[]')||coalesce(s->'creation'->'background_skills','[]')||coalesce(s->'creation'->'race_skills','[]'))) loop
  result=result||jsonb_build_object(id,greatest(1,coalesce((result->>id)::integer,0)));
 end loop;
 select r.id into race from public.dnd_races r where r.name=s->>'race';
 if race in('elfo','alto-elfo','elfo-da-floresta','drow') then result=result||jsonb_build_object('perception',greatest(1,coalesce((result->>'perception')::integer,0)));end if;
 if race='meio-orc' then result=result||jsonb_build_object('intimidation',greatest(1,coalesce((result->>'intimidation')::integer,0)));end if;
 for c in select value from jsonb_array_elements(private.dnd_levels(s)) with ordinality x(value,n) loop
  select data->'choices'->(coalesce(c->>'subclass_id','')||':'||(c->>'level')||':'||case when c=private.dnd_levels(s)->0 then 'initial' else 'multi' end) into rules from public.dnd_character_build_rules where class_id=c->>'class_id';
  for choice in select * from jsonb_each(coalesce(rules,'{}')) loop
   if coalesce((choice.value->>'skills')::boolean,false) or expertise and coalesce((choice.value->>'expertise')::boolean,false) then
    for id in select value from jsonb_array_elements_text(coalesce(c->'choices'->choice.key,'[]')) loop
     result=result||jsonb_build_object(id,greatest(case when coalesce((choice.value->>'expertise')::boolean,false) then 2 else 1 end,coalesce((result->>id)::integer,0)));
    end loop;
   end if;
  end loop;
  if c->>'class_id'='warlock' and (c->>'level')::integer>=2 and coalesce(c->'choices'->'invocations','[]') ? 'beguiling' then
   result=result||jsonb_build_object('deception',greatest(1,coalesce((result->>'deception')::integer,0)),'persuasion',greatest(1,coalesce((result->>'persuasion')::integer,0)));
  end if;
 end loop;
 return result;
end $$;

create or replace function private.dnd37_validate_sheet(p_character uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s jsonb;c jsonb;p public.dnd_spell_progression;sp jsonb;entry record;rules jsonb;training jsonb;skill_id text;origin text;sub text;ability text;prepared integer;maximum integer;outside integer;schools text[];racial jsonb;race text;has_hand boolean;
begin
 select system_data||jsonb_build_object('abilities',coalesce((select jsonb_object_agg(ca.ability,ca.score) from public.character_attributes ca where ca.character_id=p_character),'{}'),'skills',coalesce((select jsonb_object_agg(cs.skill,cs.proficiency) from public.character_skills cs where cs.character_id=p_character),'{}')) into s from public.characters where id=p_character;
 if s is null then return;end if;
 for entry in select * from jsonb_each(coalesce(s->'skills','{}')) loop
  if entry.key<>all(array['acrobatics','animal_handling','arcana','athletics','deception','history','insight','intimidation','investigation','medicine','nature','perception','performance','persuasion','religion','sleight_of_hand','stealth','survival']) or entry.value::text not in('0','1','2') then raise exception 'Treinamento de perícia inválido.';end if;
 end loop;
 racial=coalesce(s->'creation'->'race_skills','[]');select r.id into race from public.dnd_races r where r.name=s->>'race';
 if jsonb_typeof(racial)<>'array' or jsonb_array_length(racial)>(case when race='meio-elfo' then 2 else 0 end) or (select count(distinct value) from jsonb_array_elements_text(racial))<>jsonb_array_length(racial) then raise exception 'Confira as perícias concedidas pela raça.';end if;
 for skill_id in select value from jsonb_array_elements_text(racial) loop
  if skill_id<>all(array['acrobatics','animal_handling','arcana','athletics','deception','history','insight','intimidation','investigation','medicine','nature','perception','performance','persuasion','religion','sleight_of_hand','stealth','survival']) then raise exception 'Perícia racial inválida.';end if;
 end loop;
 training=private.dnd37_training(s,false);
 for c in select value from jsonb_array_elements(private.dnd_levels(s)) loop
  select data->'choices'->(coalesce(c->>'subclass_id','')||':'||(c->>'level')||':'||case when c=private.dnd_levels(s)->0 then 'initial' else 'multi' end) into rules from public.dnd_character_build_rules where class_id=c->>'class_id';
  for entry in select * from jsonb_each(coalesce(rules,'{}')) loop
   if coalesce((entry.value->>'expertise')::boolean,false) and not coalesce((entry.value->>'skills')::boolean,false) then
    for skill_id in select value from jsonb_array_elements_text(coalesce(c->'choices'->entry.key,'[]')) loop
     if skill_id<>'thieves-tools' and coalesce((training->>skill_id)::integer,0)=0 then raise exception 'Especialização exige proficiência prévia na perícia.';end if;
    end loop;
   end if;
  end loop;
  origin=c->>'class_id';sub=case when c->>'subclass_id' in('eldritch-knight','arcane-trickster') then c->>'subclass_id' else '' end;
  select * into p from public.dnd_spell_progression where class_id=origin and subclass_id=sub and level=(c->>'level')::integer;
  if p.class_id is null then continue;end if;
  select case when sub<>'' then 'int' else spell_ability end into ability from public.dnd_classes where id=origin;
  maximum=case when jsonb_array_length(p.slots)>0 and (select learning='prepared' from public.dnd_classes where id=origin) then greatest(1,case when origin in('paladin','artificer') then (c->>'level')::integer/2 else (c->>'level')::integer end+floor((coalesce((s->'abilities'->>ability)::numeric,10)-10)/2)::integer) else null end;
  prepared=0;outside=0;has_hand=false;
  schools=case when origin='fighter' then array['Abjuração','Evocação'] else array['Encantamento','Ilusão'] end;
  for sp in select data from public.character_spells where character_id=p_character loop
   if coalesce(nullif(sp->>'class_id',''),s->>'class_id')<>origin or private.dnd_spell_inactive(s,sp) then continue;end if;
   if sp->>'catalog_id'='maos-magicas' then has_hand=true;end if;
   if (sp->>'level')::integer>0 and coalesce(sp->>'casting_mode','')<>'arcanum' and (coalesce((sp->>'prepared')::boolean,false) or coalesce((sp->>'always_prepared')::boolean,false)) and not(nullif(sp->>'granted_path','') is not null and coalesce((sp->>'always_prepared')::boolean,false)) then prepared=prepared+1;end if;
   if sub<>'' and (sp->>'level')::integer>0 and nullif(sp->>'granted_path','') is null and nullif(sp->>'granted_feature','') is null and coalesce(sp->>'school','')<>all(schools) then outside=outside+1;end if;
  end loop;
  if maximum is not null and prepared>maximum then raise exception 'Prepare até % magias da classe %. Truques e concessões da especialização são adicionais.',maximum,origin;end if;
  if sub<>'' and outside>(1+case when (c->>'level')::integer>=8 then 1 else 0 end+case when (c->>'level')::integer>=14 then 1 else 0 end+case when (c->>'level')::integer>=20 then 1 else 0 end) then raise exception 'O limite de magias de outras escolas desta especialização foi excedido.';end if;
  if sub='arcane-trickster' and not has_hand and (select count(*) from public.character_spells where character_id=p_character and (data->>'level')::integer=0 and coalesce(nullif(data->>'class_id',''),s->>'class_id')=origin and nullif(data->>'granted_feature','') is null and not private.dnd_spell_inactive(s,data))>=p.cantrips then raise exception 'Trapaceiro Arcano: Mãos Mágicas ocupa uma das escolhas de truque.';end if;
 end loop;
end $$;
create or replace function private.dnd37_sheet_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='characters' then
  if tg_op='UPDATE' and (new.system_data->'class_id',new.system_data->'level',new.system_data->'subclass_id',new.system_data->'class_levels',new.system_data->'creation',new.system_data->'skills') is not distinct from (old.system_data->'class_id',old.system_data->'level',old.system_data->'subclass_id',old.system_data->'class_levels',old.system_data->'creation',old.system_data->'skills') then return null;end if;
  perform private.dnd37_validate_sheet(new.id);
 elsif tg_op='DELETE' then perform private.dnd37_validate_sheet(old.character_id);
 else perform private.dnd37_validate_sheet(new.character_id);end if;
 return null;
end $$;
drop trigger if exists dnd37_sheet_character on public.characters;
create constraint trigger dnd37_sheet_character after insert or update on public.characters deferrable initially deferred for each row execute function private.dnd37_sheet_guard();
drop trigger if exists dnd37_sheet_scores on public.character_attributes;
create constraint trigger dnd37_sheet_scores after insert or update or delete on public.character_attributes deferrable initially deferred for each row execute function private.dnd37_sheet_guard();
drop trigger if exists dnd37_sheet_spells on public.character_spells;
create constraint trigger dnd37_sheet_spells after insert or update or delete on public.character_spells deferrable initially deferred for each row execute function private.dnd37_sheet_guard();

create table if not exists public.battle_decisions (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
 session_id uuid not null references public.battle_sessions(id) on delete cascade,
 request_id uuid not null references public.battle_action_requests(id) on delete cascade,
 token_id uuid not null references public.battle_map_tokens(id) on delete cascade,
 kind text not null check(kind in('attack','save','damage','concentration','choice')),
 sequence integer not null default 0, label text not null,
 ability text, dc integer, modifier integer not null default 0,
 mode text not null default 'normal' check(mode in('normal','advantage','disadvantage')),
 status text not null default 'pending' check(status in('pending','answered','cancelled')),
 options jsonb not null default '{}', result jsonb not null default '{}',
 answered_by uuid references public.profiles(id) on delete set null,client_id uuid,
 created_at timestamptz not null default now(), answered_at timestamptz,
 unique(request_id,kind,token_id,sequence)
);
create index if not exists battle_decisions_pending on public.battle_decisions(campaign_id,session_id,created_at) where status='pending';
create unique index if not exists battle_decisions_client on public.battle_decisions(answered_by,client_id) where client_id is not null;
alter table public.battle_decisions enable row level security;
drop policy if exists battle_decisions_read on public.battle_decisions;
create policy battle_decisions_read on public.battle_decisions for select to authenticated using(private.can_read_campaign(campaign_id) and private.can_control_battle_token(token_id));
revoke all on public.battle_decisions from public,anon,authenticated;
grant select on public.battle_decisions to authenticated;
create table if not exists private.battle_guides (
 request_id uuid primary key references public.battle_action_requests(id) on delete cascade,
 phase text not null, definition jsonb not null, target_ids uuid[] not null, options jsonb not null default '{}',
 approved_by uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
revoke all on private.battle_guides from public,anon,authenticated;

create or replace function private.dnd37_save_bonus(p_token uuid,p_ability text) returns integer
language plpgsql stable security definer set search_path='' as $$
declare s jsonb=private.battle_sheet(p_token);base jsonb;bonus integer;prof integer;trained boolean;
begin
 bonus=floor((coalesce((s->'abilities'->>p_ability)::numeric,10)-10)/2);if s->>'class_id'='npc' then return bonus;end if;
 select data->'saves' into base from public.dnd_classes where id=s->>'class_id';
 prof=2+((s->>'level')::integer-1)/4;
 trained=coalesce(base ? p_ability,false) or (s->'saves' is distinct from '["str","con"]'::jsonb or s->>'class_id'='fighter') and coalesce(s->'saves' ? p_ability,false) or private.dnd_class_level(s,'monk')>=14 or p_ability='wis' and private.dnd_class_level(s,'rogue')>=15;
 if trained then bonus=bonus+prof;end if;
 if private.dnd_class_level(s,'paladin')>=6 and (s->>'hp_current')::integer>0 and not coalesce(s->'conditions' ? 'Inconsciente',false) then bonus=bonus+greatest(1,floor(((s->'abilities'->>'cha')::numeric-10)/2)::integer);end if;
 return bonus;
end $$;
create or replace function private.dnd37_armor(p_token uuid) returns integer
language plpgsql stable security definer set search_path='' as $$
declare s jsonb=private.battle_sheet(p_token);armor jsonb;shield jsonb;race jsonb;natural_armor jsonb;defense jsonb;ac integer;dex integer;extra integer=0;
begin
 if s->>'class_id'='npc' then return (select ns.ac from public.npc_stats ns where ns.npc_id=(select npc_id from public.battle_map_tokens where id=p_token));end if;
 dex=floor(((s->'abilities'->>'dex')::numeric-10)/2);select data into race from public.dnd_races where name=s->>'race';natural_armor=race->'natural_armor';
 select value into armor from jsonb_array_elements(coalesce(s->'inventory','[]')) where value->>'category'='armor' and value->>'armor_type'<>'shield' and (value->>'quantity')::integer>0 and coalesce((value->>'equipped')::boolean,false) limit 1;
 select value into shield from jsonb_array_elements(coalesce(s->'inventory','[]')) where value->>'armor_type'='shield' and (value->>'quantity')::integer>0 and coalesce((value->>'equipped')::boolean,false) limit 1;
 if natural_armor->>'when'='shell' then armor=null;end if;
 ac=10+dex;
 if armor is not null then ac=coalesce((armor->>'armor_base')::integer,10)+case armor->>'armor_type' when 'heavy' then 0 when 'medium' then least(2,dex) else dex end;
 else
  select value into defense from jsonb_array_elements(private.dnd_levels(s)) where value->>'class_id' in('barbarian','monk') limit 1;
  if defense->>'class_id'='barbarian' then ac=ac+floor(((s->'abilities'->>'con')::numeric-10)/2);elsif defense->>'class_id'='monk' and shield is null then ac=ac+floor(((s->'abilities'->>'wis')::numeric-10)/2);end if;
  if exists(select 1 from jsonb_array_elements(private.dnd_levels(s)) c where c->>'class_id'='sorcerer' and c->>'subclass_id'='draconic') then ac=greatest(ac,13+dex);end if;
 end if;
 if armor is not null and private.dnd_has_style(s,'defense') then ac=ac+1;end if;
 if natural_armor is not null and (armor is null or natural_armor->>'when'<>'unarmored') then ac=greatest(ac,(natural_armor->>'base')::integer+case when nullif(natural_armor->>'ability','') is null then 0 else floor(((s->'abilities'->>(natural_armor->>'ability'))::numeric-10)/2)::integer end);end if;
 return ac+case when shield is null then 0 else coalesce((shield->>'armor_base')::integer,2) end+coalesce((s->>'ac_bonus')::integer,0)+coalesce((race->>'armor_bonus')::integer,0)+private.campaign_item_bonus(s,'ac')::integer;
end $$;

create or replace function private.battle37_add_decision(q public.battle_action_requests,p_token uuid,p_kind text,p_sequence integer,p_label text,p_ability text default null,p_dc integer default null,p_modifier integer default 0,p_mode text default 'normal',p_options jsonb default '{}') returns void
language sql security definer set search_path='' as $$
 insert into public.battle_decisions(campaign_id,session_id,request_id,token_id,kind,sequence,label,ability,dc,modifier,mode,options)
 values(q.campaign_id,q.session_id,q.id,p_token,p_kind,p_sequence,p_label,p_ability,p_dc,p_modifier,p_mode,p_options)
 on conflict(request_id,kind,token_id,sequence) do nothing
$$;

create or replace function private.battle37_target_range(a public.battle_map_tokens,t public.battle_map_tokens,m public.battle_maps) returns numeric
language sql stable set search_path='' as $$
 select private.battle_target_range(a,jsonb_build_object('x',greatest(t.x,least(a.x,t.x+t.size-1)),'y',greatest(t.y,least(a.y,t.y+t.size-1))),m)
$$;
create or replace function private.battle37_attack_mode(a public.battle_map_tokens,t public.battle_map_tokens,m public.battle_maps) returns text
language plpgsql stable security definer set search_path='' as $$
declare actor_conditions jsonb=coalesce(private.battle_sheet(a.id)->'conditions','[]');target_conditions jsonb=coalesce(private.battle_sheet(t.id)->'conditions','[]');adv boolean;dis boolean;distance numeric=private.battle37_target_range(a,t,m);
begin
 adv=target_conditions ?| array['Cego','Impedido','Paralisado','Petrificado','Atordoado','Inconsciente'] or actor_conditions ? 'Invisível' or distance<=1.50001 and target_conditions ? 'Caído';
 dis=actor_conditions ?| array['Cego','Envenenado','Impedido','Caído'] or target_conditions ? 'Invisível' or distance>1.50001 and target_conditions ? 'Caído' or t.dodging and not(actor_conditions ? 'Invisível') and not(target_conditions ?| array['Cego','Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado']);
 return case when adv=dis then 'normal' when adv then 'advantage' else 'disadvantage' end;
end $$;

create or replace function private.battle37_next(p_request uuid) returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests;g private.battle_guides;a public.battle_map_tokens;t public.battle_map_tokens;m public.battle_maps;s jsonb;e jsonb;entry jsonb;ability text;dc integer;bonus integer;count_attacks integer;target_id uuid;ids uuid[];i integer;mode text;
begin
 select * into q from public.battle_action_requests where id=p_request for update;
 select * into g from private.battle_guides where request_id=q.id for update;
 if q.status<>'pending' or g.request_id is null then return q;end if;
 if exists(select 1 from public.battle_decisions where request_id=q.id and status='pending') then return q;end if;
 select * into a from public.battle_map_tokens where id=q.token_id;select * into m from public.battle_maps where id=q.map_id;
 e=g.definition;s=private.battle_sheet(a.id);
 if g.phase='choice' then
  if exists(select 1 from public.battle_decisions where request_id=q.id and kind='choice' and result->>'choice'='cancel') then
   update public.battle_action_requests set status='cancelled',resolution=jsonb_build_object('guided',true,'message','Conjuração cancelada antes de gastar recursos.'),resolved_at=now() where id=q.id returning * into q;
   return q;
  end if;
  update public.battle_spell_effects set active=false where token_id=q.token_id and concentration and active;
  update public.battle_action_requests set resolution=resolution||'{"checks_started":true}'::jsonb where id=q.id;
  update private.battle_guides set phase='checks' where request_id=q.id;g.phase='checks';
 end if;
 if g.phase='checks' then
  if q.kind in('weapon','opportunity') or coalesce((e->>'attackRoll')::boolean,false) then
   count_attacks=coalesce((e->>'attackCount')::integer,1);
   bonus=coalesce((e->>'attackBonus')::integer,(g.options->>'attack_bonus')::integer);
   if bonus is null and q.kind='spell' and a.character_id is not null then
    ability=private.dnd_spell_ability(s,e->'entry');bonus=2+((s->>'level')::integer-1)/4+floor(((s->'abilities'->>ability)::numeric-10)/2)::integer;
   end if;
   if bonus is null then raise exception 'Informe o bônus de ataque deste NPC ou efeito personalizado.';end if;
   for i in 1..count_attacks loop
    target_id=coalesce((e->'attackTargets'->>(i-1))::uuid,g.target_ids[1+(i-1)%greatest(1,cardinality(g.target_ids))]);
    if target_id is null then raise exception 'Escolha uma criatura para cada ataque.';end if;
    select * into t from public.battle_map_tokens where id=target_id;
    mode=coalesce(g.options->>'attack_mode',private.battle37_attack_mode(a,t,m));
    -- Dodge only imposes disadvantage on attacks the defender can see. The GM confirms this in the review.
    perform private.battle37_add_decision(q,a.id,'attack',i,q.name||case when count_attacks>1 then ' · raio '||i||'/'||count_attacks else ' · ataque' end,null,null,bonus,mode,jsonb_build_object('target_id',case when private.can_read_battle_token(target_id) then target_id else null end,'critical_at',coalesce((e->>'criticalAt')::integer,20)));
   end loop;
   update private.battle_guides set phase='attacks' where request_id=q.id;
  elsif nullif(e->>'save','') is not null then
   ability=case upper(e->>'save') when 'FOR' then 'str' when 'STR' then 'str' when 'DES' then 'dex' when 'DEX' then 'dex' when 'CON' then 'con' when 'INT' then 'int' when 'SAB' then 'wis' when 'WIS' then 'wis' when 'CAR' then 'cha' when 'CHA' then 'cha' else null end;
   if ability is null then raise exception 'Atributo da salvaguarda inválido.';end if;
   dc=coalesce((e->>'save_dc')::integer,(g.options->>'dc')::integer);
   if dc is null and q.kind='spell' and a.character_id is not null then
    entry=private.battle_sheet(a.id);dc=8+2+((entry->>'level')::integer-1)/4+floor(((entry->'abilities'->>private.dnd_spell_ability(entry,e->'entry'))::numeric-10)/2)::integer;
   end if;
   if dc is null or dc not between 1 and 40 then raise exception 'Informe uma CD de salvaguarda de 1 a 40 para este efeito.';end if;
   for t in select * from public.battle_map_tokens where id=any(g.target_ids) order by id loop
    bonus=private.dnd37_save_bonus(t.id,ability);
    if t.npc_id is not null then bonus=coalesce((g.options->'save_bonuses'->>t.id::text)::integer,bonus);end if;
    mode=coalesce(g.options->'save_modes'->>t.id::text,'normal');
    if not coalesce(g.options->'save_modes','{}') ? t.id::text then
     if ability='str' and t.raging then mode='advantage';end if;
     if ability='dex' then
      if t.dodging and not coalesce(private.battle_sheet(t.id)->'conditions','[]') ?| array['Cego','Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado'] then mode='advantage';end if;
      if coalesce(private.battle_sheet(t.id)->'conditions','[]') ? 'Impedido' then mode=case when mode='advantage' then 'normal' else 'disadvantage' end;end if;
     end if;
    end if;
    perform private.battle37_add_decision(q,t.id,'save',0,q.name||' · salvaguarda',ability,dc,bonus,mode,jsonb_build_object('half_on_save',coalesce((e->>'halfOnSave')::boolean,false)));
   end loop;
   update private.battle_guides set phase='saves' where request_id=q.id;
  else
   update private.battle_guides set phase='damage' where request_id=q.id;
   if e->>'kind' in('damage','healing','temporary') and coalesce(e->>'dice','')<>'' and (coalesce(e->>'timing','immediate')='immediate' or coalesce((g.options->>'apply_now')::boolean,false)) then
    perform private.battle37_add_decision(q,a.id,'damage',0,q.name||case e->>'kind' when 'healing' then ' · cura' when 'temporary' then ' · PV temporários' else ' · dano' end,null,null,0,'normal',jsonb_build_object('dice',e->>'dice'));
   else
    q=private.battle_resolve_guided_core(q.id,true,g.options||jsonb_build_object('guided',true,'dice','0'));
    update public.battle_action_requests set resolution=resolution||jsonb_build_object('guided',true,'message',case when e->>'kind'='utility' then 'Ação concluída. O mestre acompanha as condições e os efeitos descritos.' else 'Efeito persistente criado. O mestre aplica os gatilhos da descrição.' end) where id=q.id returning * into q;
   end if;
  end if;
  return q;
 end if;
 if g.phase='attacks' and not exists(select 1 from public.battle_decisions where request_id=q.id and kind='attack' and coalesce((result->>'hit')::boolean,false)) then
  q=private.battle_resolve_guided_core(q.id,false,g.options||'{"guided":true}'::jsonb);
  update public.battle_action_requests set resolution=resolution||'{"guided":true,"message":"O ataque não acertou. A ação e a munição foram utilizadas; recursos de dano no acerto foram preservados."}'::jsonb where id=q.id returning * into q;
 elsif g.phase in('attacks','saves') then
  update private.battle_guides set phase='damage' where request_id=q.id;
  if e->>'kind' in('damage','healing','temporary') and coalesce(e->>'dice','')<>'' and (coalesce(e->>'timing','immediate')='immediate' or coalesce((g.options->>'apply_now')::boolean,false)) then
   perform private.battle37_add_decision(q,a.id,'damage',0,q.name||' · aplicar efeito',null,null,0,'normal',jsonb_build_object('dice',e->>'dice','separate_attacks',g.phase='attacks'));
  else
   q=private.battle_resolve_guided_core(q.id,true,g.options||jsonb_build_object('guided',true,'dice','0'));
   update public.battle_action_requests set resolution=resolution||'{"guided":true,"message":"Testes concluídos. O mestre aplica as condições e acompanha a duração da descrição."}'::jsonb where id=q.id returning * into q;
  end if;
 end if;
 return q;
end $$;

create or replace function public.guide_battle_action(p_request_id uuid,p_options jsonb default '{}') returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests;bs public.battle_sessions;a public.battle_map_tokens;m public.battle_maps;e jsonb;ids uuid[];options jsonb=coalesce(p_options,'{}');has_concentration boolean;v jsonb;
begin
 select * into q from public.battle_action_requests where id=p_request_id;
 if q.id is null or not private.is_campaign_owner(q.campaign_id) or not private.can_read_campaign(q.campaign_id) then raise exception 'Somente o mestre pode autorizar a resolução guiada.' using errcode='42501';end if;
 select * into bs from public.battle_sessions where id=q.session_id for update;perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into q from public.battle_action_requests where id=q.id for update;
 if q.status<>'pending' or exists(select 1 from private.battle_guides where request_id=q.id) then return q;end if;
 if bs.status<>'active' or bs.round<>q.round or bs.turn_index<>q.turn_index or bs.turn_started_at is distinct from q.turn_started_at then raise exception 'O turno desta tentativa já terminou.';end if;
 if q.kind='opportunity' then raise exception 'Resolva a reação de oportunidade pelo painel de reações.';end if;
 select * into a from public.battle_map_tokens where id=q.token_id for update;select * into m from public.battle_maps where id=q.map_id;e=q.definition;
 if options ? 'dc' and (jsonb_typeof(options->'dc')<>'number' or (options->>'dc')::numeric<>floor((options->>'dc')::numeric) or (options->>'dc')::integer not between 1 and 40) then raise exception 'CD inválida.';end if;
 if options ? 'attack_bonus' and (jsonb_typeof(options->'attack_bonus')<>'number' or abs((options->>'attack_bonus')::numeric)>50 or (options->>'attack_bonus')::numeric<>floor((options->>'attack_bonus')::numeric)) then raise exception 'Bônus de ataque inválido.';end if;
 if coalesce(options->>'attack_mode','normal') not in('normal','advantage','disadvantage') then raise exception 'Modo de ataque inválido.';end if;
 for v in select value from jsonb_each(coalesce(options->'save_modes','{}')) loop if v#>>'{}' not in('normal','advantage','disadvantage') then raise exception 'Modo de salvaguarda inválido.';end if;end loop;
 for v in select value from jsonb_each(coalesce(options->'save_bonuses','{}')) loop if jsonb_typeof(v)<>'number' or abs(v::numeric)>50 or v::numeric<>floor(v::numeric) then raise exception 'Bônus de salvaguarda inválido.';end if;end loop;
 if options ? 'damageType' then
  if length(options->>'damageType')>40 then raise exception 'Tipo de dano inválido.';end if;
  e=e||jsonb_build_object('damageType',options->>'damageType');
 end if;
 -- Only the GM can narrow an area, e.g. sculpt spells. The server verifies every target's footprint.
 select array_agg(t.id order by t.id) into ids from public.battle_map_tokens t where t.map_id=q.map_id and
  (case when e->>'shape'='single' or coalesce((e->>'selective')::boolean,false) then t.id=any(q.target_ids)
   else private.battle_in_effect(t,a,q.target,e,m.scale_per_cell*case when m.scale_unit='ft' then 0.3 else 1 end) end);
 ids=coalesce(ids,'{}');
 if options ? 'target_ids' then
  if jsonb_typeof(options->'target_ids')<>'array' or exists(select 1 from jsonb_array_elements_text(options->'target_ids') x where not x::uuid=any(ids)) then raise exception 'Um dos alvos está fora da área original.';end if;
  ids=array(select distinct value::uuid from jsonb_array_elements_text(options->'target_ids'));
 end if;
 if cardinality(ids)>200 then raise exception 'O efeito excede 200 criaturas.';end if;
 select exists(select 1 from public.battle_spell_effects where token_id=a.id and active and concentration) into has_concentration;
 insert into private.battle_guides(request_id,phase,definition,target_ids,options,approved_by)
 values(q.id,case when coalesce((e->>'concentration')::boolean,false) and has_concentration then 'choice' else 'checks' end,e,ids,options-'dice'-'targets'-'critical'-'geometry'-'kind'-'defer_player_roll'-'target_ids',auth.uid());
 update public.battle_action_requests set resolution=jsonb_build_object('guided',true,'message','Resolução guiada autorizada. Aguardando as escolhas e rolagens dos participantes.') where id=q.id returning * into q;
 if coalesce((e->>'concentration')::boolean,false) and has_concentration then
  perform private.battle37_add_decision(q,a.id,'choice',0,'Trocar a concentração?',null,null,0,'normal',jsonb_build_object('choices',jsonb_build_array(jsonb_build_object('id','continue','label','Conjurar e encerrar a concentração anterior'),jsonb_build_object('id','cancel','label','Cancelar e manter a concentração atual'))));
 else q=private.battle37_next(q.id);end if;
 return q;
end $$;

create or replace function private.battle37_critical(e jsonb,s jsonb,p_weapon boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare expression text=e->>'dice';parts jsonb='[]';part jsonb;barbarian integer=private.dnd_class_level(s,'barbarian');extra integer=0;
begin
 if p_weapon and not coalesce((private.dnd_weapon_traits(e->'entry',s)->>'ranged')::boolean,false) then extra=case when barbarian>=17 then 3 when barbarian>=13 then 2 when barbarian>=9 then 1 else 0 end;end if;
 for part in select value from jsonb_array_elements(coalesce(e->'damageParts','[]')) loop
  part=part||jsonb_build_object('dice',private.dnd_critical_expression(part->>'dice'));
  if jsonb_array_length(parts)=0 and extra>0 and expression~'^\d+d\d+' then part=part||jsonb_build_object('dice',(part->>'dice')||'+'||extra||'d'||substring(expression from '^\d+d(\d+)'));end if;
  parts=parts||jsonb_build_array(part);
 end loop;
 expression=private.dnd_critical_expression(expression);
 if jsonb_array_length(parts)>0 then select string_agg(p->>'dice','+' order by n) into expression from jsonb_array_elements(parts) with ordinality a(p,n);end if;
 return e||jsonb_build_object('dice',expression,'damageParts',parts,'rerollWeaponDice',coalesce((e->>'rerollWeaponDice')::integer,0)*2,'critical',true);
end $$;
create or replace function private.battle37_record(q public.battle_action_requests,p_token uuid,p_expression text,p_mode text,p_client uuid,p_definition jsonb default null) returns public.battle_dice_rolls
language plpgsql security definer set search_path='' as $$
declare detail jsonb;d public.battle_dice_rolls;t public.battle_map_tokens;
begin
 select * into t from public.battle_map_tokens where id=p_token;
 if p_definition is null then detail=private.battle_roll_detail(p_expression,p_mode);else detail=private.dnd_attack_roll_detail(p_expression,p_definition);end if;
 insert into public.battle_dice_rolls(campaign_id,map_id,rolled_by,client_id,expression,label,visibility,mode,terms,total,request_id,consumed_at)
 values(q.campaign_id,q.map_id,auth.uid(),p_client,detail->>'expression',left(q.name,120),case when t.visible then 'public' when private.is_campaign_owner(q.campaign_id) then 'gm' else 'self' end,p_mode,detail->'terms',(detail->>'total')::integer,q.id,now()) returning * into d;
 return d;
end $$;

create or replace function public.answer_battle_decision(p_decision_id uuid,p_client_id uuid,p_answer jsonb default '{}') returns public.battle_decisions
language plpgsql security definer set search_path='' as $$
declare decision public.battle_decisions;q public.battle_action_requests;bs public.battle_sessions;g private.battle_guides;a public.battle_map_tokens;target public.battle_map_tokens;check_row public.battle_decisions;d public.battle_dice_rolls;detail jsonb;answer_result jsonb='{}';damage_events jsonb='[]';s jsonb;e jsonb;part_effect jsonb;opts jsonb;targets jsonb='{}';rolls jsonb='[]';outcome jsonb;target_id uuid;total integer;natural_roll integer;ac integer;passed boolean;hit boolean;critical boolean;amount integer;mode text;choice text;concentration_effect uuid;checked integer=0;single_bonus integer=0;
begin
 if auth.uid() is null or p_client_id is null then raise exception 'Entre na sua conta para responder.' using errcode='42501';end if;
 select * into decision from public.battle_decisions where id=p_decision_id;
 if decision.id is null or not private.can_read_campaign(decision.campaign_id) or not private.can_control_battle_token(decision.token_id) then raise exception 'Esta decisão pertence a outro participante.' using errcode='42501';end if;
 select * into bs from public.battle_sessions where id=decision.session_id for update;
 perform 1 from public.campaigns where id=decision.campaign_id for update;
 select * into q from public.battle_action_requests where id=decision.request_id for update;
 select * into g from private.battle_guides where request_id=q.id for update;
 select * into decision from public.battle_decisions where id=p_decision_id for update;
 if decision.status<>'pending' then return decision;end if;
 if bs.status<>'active' or bs.round<>q.round or bs.turn_index<>q.turn_index or bs.turn_started_at is distinct from q.turn_started_at or q.status not in('pending','success') or q.status='success' and decision.kind<>'concentration' then
  update public.battle_decisions set status='cancelled',answered_at=now() where id=decision.id returning * into decision;return decision;
 end if;
 if exists(select 1 from public.battle_decisions where answered_by=auth.uid() and client_id=p_client_id and id<>decision.id) or exists(select 1 from public.battle_dice_rolls where rolled_by=auth.uid() and client_id=p_client_id) then raise exception 'Este identificador já pertence a outra resposta.';end if;
 select * into a from public.battle_map_tokens where id=decision.token_id for update;s=private.battle_sheet(a.id);e=g.definition;
 if decision.kind in('attack','damage','choice') and ((s->>'hp_current')::integer<=0 or coalesce(s->'conditions','[]') ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado']) then raise exception 'Este participante não pode agir agora. O mestre pode cancelar a tentativa.';end if;
 if decision.kind='choice' then
  choice=p_answer->>'choice';
  if choice is null or not exists(select 1 from jsonb_array_elements(decision.options->'choices') o where o->>'id'=choice) then raise exception 'Escolha uma das opções apresentadas.';end if;
  answer_result=jsonb_build_object('choice',choice);
 elsif decision.kind in('attack','save','concentration') then
  if decision.kind in('save','concentration') and decision.ability in('str','dex') and coalesce(s->'conditions','[]') ?| array['Inconsciente','Atordoado','Paralisado','Petrificado'] then
   answer_result=jsonb_build_object('passed',false,'automatic',true,'message','A condição atual causa falha automática nesta salvaguarda.');
  else
   d=private.battle37_record(q,a.id,'1d20'||case when decision.modifier>=0 then '+' else '' end||decision.modifier,decision.mode,p_client_id);
   natural_roll=coalesce((select (term->>'subtotal')::integer from jsonb_array_elements(d.terms) term where (term->>'sides')::integer=20 limit 1),0);
   if decision.kind='attack' then
    target_id=coalesce((e->'attackTargets'->>(decision.sequence-1))::uuid,g.target_ids[1+(decision.sequence-1)%greatest(1,cardinality(g.target_ids))]);
    ac=private.dnd37_armor(target_id);critical=natural_roll>=coalesce((e->>'criticalAt')::integer,20);hit=natural_roll<>1 and (natural_roll=20 or critical or d.total>=ac);
    select * into target from public.battle_map_tokens where id=target_id;
    if hit and coalesce(private.battle_sheet(target_id)->'conditions','[]') ?| array['Paralisado','Inconsciente'] and exists(select 1 from public.battle_maps m where m.id=q.map_id and private.battle_target_range(a,jsonb_build_object('x',target.x,'y',target.y),m)<=1.50001) then critical=true;end if;
    answer_result=jsonb_build_object('hit',hit,'critical',critical and hit,'natural',natural_roll,'roll',to_jsonb(d));
   else
    passed=d.total>=decision.dc;answer_result=jsonb_build_object('passed',passed,'roll',to_jsonb(d));
   end if;
  end if;
  if decision.kind='concentration' and not coalesce((answer_result->>'passed')::boolean,false) then
   update public.battle_spell_effects set active=false where token_id=a.id and concentration and active and (decision.options->'effect_ids') @> jsonb_build_array(id::text);
   update public.battle_decisions set status='cancelled',answered_at=now() where request_id=q.id and token_id=a.id and kind='concentration' and status='pending' and id<>decision.id;
  end if;
 elsif decision.kind='damage' then
  opts=g.options||jsonb_build_object('guided',true,'target_ids',to_jsonb(g.target_ids));
  if exists(select 1 from public.battle_decisions where request_id=q.id and kind='attack') then
   -- Each beam has its own attack, critical, damage roll and resistance calculation.
   for check_row in select * from public.battle_decisions where request_id=q.id and kind='attack' and coalesce((battle_decisions.result->>'hit')::boolean,false) order by sequence loop
    target_id=coalesce((e->'attackTargets'->>(check_row.sequence-1))::uuid,g.target_ids[1+(check_row.sequence-1)%greatest(1,cardinality(g.target_ids))]);
    select * into target from public.battle_map_tokens where id=target_id;
    part_effect=case when coalesce((check_row.result->>'critical')::boolean,false) then private.battle37_critical(e,s,q.kind='weapon') else e end;
    if checked>0 and coalesce((e->>'onceBonus')::integer,0)<>0 then part_effect=part_effect||jsonb_build_object('dice',(part_effect->>'dice')||case when (e->>'onceBonus')::integer>0 then '-' else '+' end||abs((e->>'onceBonus')::integer));end if;
    d=private.battle37_record(q,a.id,part_effect->>'dice','normal',case when checked=0 then p_client_id else gen_random_uuid() end,part_effect);checked=checked+1;rolls=rolls||jsonb_build_array(to_jsonb(d));
    detail=jsonb_build_object('damage_parts',private.dnd_roll_damage_parts(d.terms,part_effect->'damageParts'));
    amount=private.dnd_damage_amount(target,private.battle_sheet(target.id),part_effect,greatest(0,d.total),false,detail);
    damage_events=damage_events||jsonb_build_array(jsonb_build_object('token_id',target_id,'amount',amount,'sequence',checked));
    targets=targets||jsonb_build_object(target_id::text,jsonb_build_object('amount',coalesce((targets->target_id::text->>'amount')::integer,0)+amount));
   end loop;
   -- Missed targets are explicitly zero, never damaged by the aggregate roll.
   foreach target_id in array g.target_ids loop if not targets ? target_id::text then targets=targets||jsonb_build_object(target_id::text,jsonb_build_object('amount',0));end if;end loop;
   opts=opts||jsonb_build_object('dice','0','targets',targets);
  else
   d=private.battle37_record(q,a.id,e->>'dice','normal',p_client_id,e);rolls=jsonb_build_array(to_jsonb(d));
   for check_row in select * from public.battle_decisions where request_id=q.id and kind='save' loop
    targets=targets||jsonb_build_object(check_row.token_id::text,jsonb_build_object('saved',coalesce((check_row.result->>'passed')::boolean,false)));
   end loop;
   opts=opts||jsonb_build_object('dice',greatest(0,d.total)::text,'targets',targets,'damage_parts',private.dnd_roll_damage_parts(d.terms,e->'damageParts'));
  end if;
  q=private.battle_resolve_guided_core(q.id,true,opts);
  if coalesce((private.battle_sheet(a.id)->>'hp_current')::integer,0)<=0 then update public.battle_spell_effects set active=false where token_id=a.id and concentration and active;end if;
  if q.status not in('success','failure') then raise exception 'A tentativa não pode ser concluída neste turno.';end if;
  update public.battle_action_requests set resolution=resolution||jsonb_build_object('guided',true,'dice_rolls',rolls,'dice_roll',to_jsonb(d),'dice_roll_id',d.id,'dice',d.expression,'message','Rolagens e recursos aplicados. Confira os resultados por alvo.') where id=q.id returning * into q;
  -- Concentration checks include absorbed temporary HP damage, and stop automatically at zero HP.
  if jsonb_array_length(damage_events)=0 then select coalesce(jsonb_agg(jsonb_build_object('token_id',ae.token_id,'amount',ae.amount,'sequence',0)),'[]') into damage_events from public.battle_action_effects ae where ae.request_id=q.id and ae.kind='damage';end if;
  for outcome in select value from jsonb_array_elements(damage_events) where (value->>'amount')::integer>0 loop
   target_id=(outcome->>'token_id')::uuid;
   if coalesce((private.battle_sheet(target_id)->>'hp_current')::integer,0)>0 and exists(select 1 from public.battle_spell_effects where token_id=target_id and active and concentration) then
    perform private.battle37_add_decision(q,target_id,'concentration',coalesce((outcome->>'sequence')::integer,0),'Manter concentração','con',greatest(10,(outcome->>'amount')::integer/2),private.dnd37_save_bonus(target_id,'con'),'normal',jsonb_build_object('effect_ids',(select jsonb_agg(id::text) from public.battle_spell_effects where token_id=target_id and active and concentration)));
   end if;
  end loop;
  update public.battle_action_requests set resolution=resolution||jsonb_build_object('awaiting_concentration',exists(select 1 from public.battle_decisions where request_id=q.id and kind='concentration' and status='pending')) where id=q.id;
  answer_result=jsonb_build_object('roll',to_jsonb(d),'rolls',rolls,'message','Efeito aplicado aos alvos.');
 end if;
 update public.battle_decisions set status='answered',result=answer_result,answered_by=auth.uid(),client_id=p_client_id,answered_at=now() where id=decision.id returning * into decision;
 if decision.kind in('attack','save') then update public.battle_action_requests set resolution=resolution||'{"checks_started":true}'::jsonb where id=q.id and status='pending';end if;
 if decision.kind in('choice','attack','save') then perform private.battle37_next(q.id);
 elsif decision.kind='concentration' and not exists(select 1 from public.battle_decisions where request_id=q.id and kind='concentration' and status='pending') then update public.battle_action_requests set resolution=resolution||'{"awaiting_concentration":false}'::jsonb where id=q.id;end if;
 return decision;
end $$;

create or replace function public.configure_battle_decision(p_decision_id uuid,p_mode text,p_modifier integer default null) returns public.battle_decisions
language plpgsql security definer set search_path='' as $$
declare d public.battle_decisions;
begin
 select * into d from public.battle_decisions where id=p_decision_id;
 if d.id is null or not private.is_campaign_owner(d.campaign_id) or not private.can_read_campaign(d.campaign_id) then raise exception 'Somente o mestre pode ajustar a vantagem.' using errcode='42501';end if;
 perform 1 from public.battle_sessions where id=d.session_id for update;
 if p_mode is null or p_mode not in('normal','advantage','disadvantage') then raise exception 'Modo inválido.';end if;
 if p_modifier is not null and (abs(p_modifier)>50 or not exists(select 1 from public.battle_map_tokens where id=d.token_id and npc_id is not null)) then raise exception 'Informe o bônus total do NPC; os bônus dos personagens seguem a ficha.';end if;
 update public.battle_decisions set mode=p_mode,modifier=coalesce(p_modifier,modifier) where id=d.id and status='pending' returning * into d;return d;
end $$;

create or replace function private.battle37_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in('cancelled','expired','failure','success') then update public.battle_decisions set status='cancelled',answered_at=now() where request_id=new.id and status='pending' and (new.status<>'success' or kind<>'concentration');end if;return new;
end $$;
drop trigger if exists battle37_cleanup on public.battle_action_requests;
create trigger battle37_cleanup after update of status on public.battle_action_requests for each row execute function private.battle37_cleanup();
create or replace function private.battle37_turn_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='active' and old.status='active' and (new.turn_started_at is distinct from old.turn_started_at or new.active_token_id is distinct from old.active_token_id) and exists(select 1 from public.battle_decisions where session_id=old.id and status='pending') then raise exception 'Conclua ou cancele as rolagens e escolhas pendentes antes de avançar o turno.';end if;
 if new.status<>'active' then update public.battle_decisions set status='cancelled',answered_at=now() where session_id=new.id and status='pending';end if;return new;
end $$;
drop trigger if exists battle37_turn_guard on public.battle_sessions;
create trigger battle37_turn_guard before update on public.battle_sessions for each row execute function private.battle37_turn_guard();

revoke all on function private.battle_resolve_guided_core(uuid,boolean,jsonb),private.dnd37_training(jsonb,boolean),private.dnd37_validate_sheet(uuid),private.dnd37_sheet_guard(),private.dnd37_save_bonus(uuid,text),private.dnd37_armor(uuid),private.battle37_add_decision(public.battle_action_requests,uuid,text,integer,text,text,integer,integer,text,jsonb),private.battle37_next(uuid),private.battle37_target_range(public.battle_map_tokens,public.battle_map_tokens,public.battle_maps),private.battle37_attack_mode(public.battle_map_tokens,public.battle_map_tokens,public.battle_maps),private.battle37_critical(jsonb,jsonb,boolean),private.battle37_record(public.battle_action_requests,uuid,text,text,uuid,jsonb),private.battle37_cleanup(),private.battle37_turn_guard() from public,anon,authenticated;
revoke all on function public.guide_battle_action(uuid,jsonb),public.answer_battle_decision(uuid,uuid,jsonb),public.configure_battle_decision(uuid,text,integer) from public,anon;
grant execute on function public.guide_battle_action(uuid,jsonb),public.answer_battle_decision(uuid,uuid,jsonb),public.configure_battle_decision(uuid,text,integer) to authenticated;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='battle_decisions') then alter publication supabase_realtime add table public.battle_decisions;end if;
end $$;
notify pgrst,'reload schema';

-- A participant cannot fish for a critical by cancelling an already rolled attack.
create or replace function public.cancel_battle_action(p_request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.battle_action_requests;g private.battle_guides;
begin
 select * into r from public.battle_action_requests where id=p_request_id;
 if r.id is null or not private.can_read_campaign(r.campaign_id) or not private.is_campaign_owner(r.campaign_id) and (r.requested_by<>auth.uid() or not private.can_control_battle_token(r.token_id)) then raise exception 'Você não pode cancelar esta tentativa.' using errcode='42501';end if;
 perform 1 from public.battle_sessions where id=r.session_id for update;perform 1 from public.campaigns where id=r.campaign_id for update;
 select * into r from public.battle_action_requests where id=p_request_id for update;
 if r.status not in('pending','approved') then return;end if;
 select * into g from private.battle_guides where request_id=r.id;
 if r.status='pending' and g.request_id is not null and exists(select 1 from public.battle_decisions where request_id=r.id and status='answered' and (kind in('attack','save') or kind='choice' and result->>'choice'='continue')) then
  if not private.is_campaign_owner(r.campaign_id) then raise exception 'As rolagens já começaram. Conclua a sequência ou peça ao mestre para encerrá-la.';end if;
  begin r=private.battle_resolve_guided_core(r.id,false,g.options||'{"guided":true}'::jsonb);
  exception when others then
   -- The GM must still be able to close a request whose source was removed/changed.
   -- This subtransaction rolls back every attempted resource write before flagging manual review.
   update public.battle_action_requests set resolution=resolution||'{"manual_resource_review":true,"message":"A ficha mudou durante a tentativa. O mestre deve conferir manualmente a ação e os recursos ao cancelar."}'::jsonb where id=r.id returning * into r;
  end;
 end if;
 if (r.kind='opportunity' or r.status='approved') and not private.is_campaign_owner(r.campaign_id) then raise exception 'Esta tentativa depende do mestre.' using errcode='42501';end if;
 update public.battle_action_requests set status='cancelled',resolution=resolution||jsonb_build_object('awaiting_roll',false),resolved_at=now() where id=r.id;
 if r.movement_plan_id is not null then perform private.battle_finish_movement(r.movement_plan_id);end if;
end $$;

-- Manual exceptions belong to the GM; old approved exceptions remain intact.
create or replace function private.dnd37_training_permissions() returns trigger language plpgsql security definer set search_path='' as $$
declare initial_saves jsonb;old_saves jsonb='[]';save_id text;
begin
 select data->'saves' into initial_saves from public.dnd_classes where id=new.system_data->>'class_id';
 -- Older clients changed the class while retaining the default fighter saves.
 if new.system_data->>'class_id'<>'fighter' and new.system_data->'saves'='["str","con"]'::jsonb then new.system_data=jsonb_set(new.system_data,'{saves}',coalesce(initial_saves,'[]'));end if;
 if auth.uid() is null or private.is_campaign_owner(new.campaign_id) then return new;end if;
 if tg_op='UPDATE' then old_saves=coalesce(old.system_data->'saves','[]');else select coalesce(system_data->'saves','[]') into old_saves from public.characters where id=new.id;end if;
 for save_id in select value from jsonb_array_elements_text(coalesce(new.system_data->'saves','[]')) loop
  if not coalesce(initial_saves ? save_id,false) and not coalesce(old_saves,'[]') ? save_id then raise exception 'As salvaguardas vêm da classe inicial. Treinamentos extras dependem do mestre.';end if;
 end loop;
 return new;
end $$;
drop trigger if exists dnd37_training_permissions on public.characters;
create trigger dnd37_training_permissions before insert or update on public.characters for each row execute function private.dnd37_training_permissions();
revoke all on function private.dnd37_training_permissions() from public,anon,authenticated;

create table if not exists private.dnd37_skill_grants (
 character_id uuid not null references public.characters(id) on delete cascade,
 skill text not null,proficiency smallint not null check(proficiency between 0 and 2),primary key(character_id,skill)
);
revoke all on private.dnd37_skill_grants from public,anon,authenticated;
insert into private.dnd37_skill_grants select character_id,skill,proficiency from public.character_skills on conflict do nothing;
create or replace function private.dnd37_skill_permission() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid;campaign uuid;allowed smallint=0;gm boolean;
begin
 if tg_op='DELETE' then cid=old.character_id;else cid=new.character_id;end if;
 select campaign_id into campaign from public.characters where id=cid;
 gm=auth.uid() is null or private.is_campaign_owner(campaign);
 if tg_op='DELETE' then
  if gm then delete from private.dnd37_skill_grants where character_id=old.character_id and skill=old.skill;end if;
  return old;
 end if;
 if gm then
  insert into private.dnd37_skill_grants values(new.character_id,new.skill,new.proficiency) on conflict(character_id,skill) do update set proficiency=excluded.proficiency;
 else
  select proficiency into allowed from private.dnd37_skill_grants where character_id=new.character_id and skill=new.skill;
  if new.proficiency>coalesce(allowed,0) then raise exception 'Escolha proficiências e especializações na criação ou nas habilidades da classe. Exceções manuais dependem do mestre.';end if;
 end if;
 return new;
end $$;
drop trigger if exists dnd37_skill_permission on public.character_skills;
create trigger dnd37_skill_permission before insert or update or delete on public.character_skills for each row execute function private.dnd37_skill_permission();
drop trigger if exists dnd37_sheet_skills on public.character_skills;
create constraint trigger dnd37_sheet_skills after insert or update or delete on public.character_skills deferrable initially deferred for each row execute function private.dnd37_sheet_guard();
revoke all on function private.dnd37_skill_permission() from public,anon,authenticated;


commit;

-- VTT v11: approve first, roll once as the actor, and persistent scenery.
-- Apply after 010. Historical migrations remain unchanged.
begin;
alter table public.battle_action_requests drop constraint battle_action_requests_status_check;
alter table public.battle_action_requests add constraint battle_action_requests_status_check check(status in('pending','approved','success','failure','cancelled','expired'));
drop index public.battle_one_pending_action;
create unique index battle_one_pending_action on public.battle_action_requests(token_id) where status in('pending','approved') and kind<>'opportunity';

-- GM options are private: hidden targets must never leak through player-readable JSON.
create table private.battle_roll_permits (
 request_id uuid primary key references public.battle_action_requests(id) on delete cascade,
 definition jsonb not null, options jsonb not null,
 effect_ids uuid[] not null default '{}'
);
revoke all on private.battle_roll_permits from public,anon,authenticated;
alter function private.battle_apply_hp(public.battle_action_requests,public.battle_map_tokens,jsonb,jsonb) rename to battle_apply_hp_v9;
revoke all on function private.battle_apply_hp_v9(public.battle_action_requests,public.battle_map_tokens,jsonb,jsonb) from public,anon,authenticated;
create function private.battle_apply_hp(r public.battle_action_requests,a public.battle_map_tokens,e jsonb,opts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if coalesce((opts->>'defer_player_roll')::boolean,false) then
  if not private.is_campaign_owner(r.campaign_id) then raise exception 'Apenas o mestre pode autorizar a rolagem.' using errcode='42501'; end if;
  if opts ? 'target_ids' and (jsonb_array_length(opts->'target_ids')>200 or exists(select 1 from jsonb_array_elements_text(opts->'target_ids') target(value) where not exists(select 1 from public.battle_map_tokens t where t.id=target.value::uuid and t.map_id=r.map_id))) then raise exception 'Alvo de outra mesa ou quantidade inválida.'; end if;
  insert into private.battle_roll_permits(request_id,definition,options) values(r.id,e,opts-'defer_player_roll'-'roll_id');
  return jsonb_build_object('awaiting_roll',true,'roll_kind',e->>'kind','required_dice',opts->>'dice');
 end if;
 return private.battle_apply_hp_v9(r,a,e,opts);
end $$;
revoke all on function private.battle_apply_hp(public.battle_action_requests,public.battle_map_tokens,jsonb,jsonb) from public,anon,authenticated;

-- Validate custom formulas without rolling any dice during approval.
create function private.battle_check_dice(p_expression text) returns void language plpgsql set search_path='' as $$
declare expression text=regexp_replace(lower(coalesce(p_expression,'')),'\s','','g'); part text[]; budget integer=0; n integer; sides integer;
begin
 if length(expression)>200 or expression !~ '^[+-]?\d+(d\d+)?([+-]\d+(d\d+)?)*$' then raise exception 'Use uma fórmula como 2d6+3.'; end if;
 for part in select regexp_matches(expression,'([+-]?)(\d+)(?:d(\d+))?','g') loop
  if length(part[2])>6 or length(coalesce(part[3],''))>3 then raise exception 'Quantidade fora do limite.'; end if;
  n=part[2]::integer;
  if part[3] is null then if n>100000 then raise exception 'Modificador acima do limite.'; end if;
  else sides=part[3]::integer; budget=budget+n; if n<1 or sides not in(4,6,8,10,12,20,100) or budget>100 then raise exception 'Use até 100 dados d4, d6, d8, d10, d12, d20 ou d100.'; end if; end if;
 end loop;
end $$;
revoke all on function private.battle_check_dice(text) from public,anon,authenticated;

create function public.approve_battle_action(p_request_id uuid,p_success boolean,p_resolution jsonb default '{}') returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests; result public.battle_action_requests; opts jsonb=coalesce(p_resolution,'{}')-'defer_player_roll'-'roll_id'; kind text; expression text;
begin
 select * into q from public.battle_action_requests where id=p_request_id;
 if q.id is null or not private.is_campaign_owner(q.campaign_id) then raise exception 'Apenas o mestre pode decidir.' using errcode='42501'; end if;
 perform 1 from public.battle_sessions where id=q.session_id for update;
 perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into q from public.battle_action_requests where id=p_request_id for update;
 if q.status<>'pending' then return q; end if;
 expression=coalesce(q.definition->>'dice','');
 if (expression='' or coalesce((q.definition->>'review')::boolean,false)) and opts ? 'dice' then expression=coalesce(opts->>'dice',expression); end if;
 kind=coalesce(opts->>'kind',q.definition->>'kind','utility');
 if p_success and q.kind in('spell','weapon') and kind in('damage','healing','temporary') and expression~'d(4|6|8|10|12|20|100)' and (coalesce(q.definition->>'timing','immediate')='immediate' or coalesce((opts->>'apply_now')::boolean,false)) then
  -- Formula is scaled server-side; only GM review can supply an exception/custom effect.
  perform private.battle_check_dice(expression);
  opts=opts||jsonb_build_object('defer_player_roll',true,'dice',expression);
  result=public.resolve_battle_action_v9(q.id,true,opts);
  if result.status='success' and coalesce((result.resolution->>'awaiting_roll')::boolean,false) then
   update private.battle_roll_permits set effect_ids=array(select id from public.battle_spell_effects where request_id=q.id) where request_id=q.id;
   update public.battle_spell_effects set active=false where request_id=q.id;
   update public.battle_action_requests set status='approved' where id=q.id returning * into result;
  end if;
 else result=public.resolve_battle_action(q.id,p_success,opts); end if;
 return result;
end $$;

create function public.roll_approved_battle_action(p_request_id uuid,p_client_id uuid) returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests; s public.battle_sessions; a public.battle_map_tokens; permit private.battle_roll_permits; d public.battle_dice_rolls; detail jsonb; outcome jsonb; expression text;
begin
 if auth.uid() is null or p_client_id is null then raise exception 'Entre na sua conta para rolar.' using errcode='42501'; end if;
 select * into q from public.battle_action_requests where id=p_request_id;
 if q.id is null or not private.can_read_campaign(q.campaign_id) or not private.can_control_battle_token(q.token_id) or not(private.is_campaign_owner(q.campaign_id) or q.requested_by=auth.uid()) then raise exception 'Você não pode rolar esta tentativa.' using errcode='42501'; end if;
 select * into s from public.battle_sessions where id=q.session_id for update;
 perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into q from public.battle_action_requests where id=p_request_id for update;
 -- Retries and concurrent tabs return the original result, never another roll or HP change.
 if q.status='success' and q.resolution ? 'dice_roll_id' then return q; end if;
 if q.status<>'approved' then raise exception 'Aguarde o sucesso do mestre antes de rolar.'; end if;
 if s.status<>'active' or s.active_token_id is distinct from q.token_id or s.round<>q.round or s.turn_index<>q.turn_index or s.turn_started_at is distinct from q.turn_started_at then
  update public.battle_action_requests set status='expired',resolution=resolution||jsonb_build_object('awaiting_roll',false),resolved_at=now() where id=q.id returning * into q; return q;
 end if;
 select * into a from public.battle_map_tokens where id=q.token_id for update;
 if coalesce((private.battle_sheet(a.id)->>'hp_current')::integer,0)<=0 or (private.battle_sheet(a.id)->'conditions') ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado'] then raise exception 'O personagem não pode concluir esta ação. O mestre pode cancelar ou encerrar o turno.'; end if;
 select * into permit from private.battle_roll_permits where request_id=q.id;
 if permit.request_id is null then raise exception 'Esta tentativa não tem uma rolagem autorizada.'; end if;
 if exists(select 1 from public.battle_dice_rolls where rolled_by=auth.uid() and client_id=p_client_id) then raise exception 'Este identificador pertence a outra rolagem.'; end if;
 expression=permit.options->>'dice'; detail=private.battle_roll_detail(expression,'normal');
 insert into public.battle_dice_rolls(campaign_id,map_id,rolled_by,client_id,expression,label,visibility,mode,terms,total,request_id,consumed_at)
 values(q.campaign_id,q.map_id,auth.uid(),p_client_id,detail->>'expression',left(q.name,120),case when not a.visible then case when private.is_campaign_owner(q.campaign_id) then 'gm' else 'self' end else 'public' end,'normal',detail->'terms',(detail->>'total')::integer,q.id,now()) returning * into d;
 outcome=private.battle_apply_hp_v9(q,a,permit.definition,permit.options||jsonb_build_object('dice',greatest(0,d.total)::text));
 -- A persistent effect becomes available after the initial HP result is applied.
 update public.battle_spell_effects set active=true where id=any(permit.effect_ids);
 update public.battle_action_requests set status='success',resolution=resolution||outcome||jsonb_build_object('awaiting_roll',false,'dice',d.expression,'dice_roll_id',d.id,'dice_roll',to_jsonb(d),'rolled_at',now()),resolved_at=now() where id=q.id returning * into q;
 return q;
end $$;

create or replace function public.cancel_battle_action(p_request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.battle_action_requests;
begin
 select * into r from public.battle_action_requests where id=p_request_id;
 if r.id is null or not private.can_read_campaign(r.campaign_id) or not private.is_campaign_owner(r.campaign_id) and (r.requested_by<>auth.uid() or not private.can_control_battle_token(r.token_id)) then raise exception 'Você não pode cancelar esta tentativa.' using errcode='42501'; end if;
 perform 1 from public.battle_sessions where id=r.session_id for update;
 select * into r from public.battle_action_requests where id=p_request_id for update;
 if (r.kind='opportunity' or r.status='approved') and not private.is_campaign_owner(r.campaign_id) then raise exception 'Esta tentativa depende do mestre.' using errcode='42501'; end if;
 update public.battle_action_requests set status='cancelled',resolution=resolution||jsonb_build_object('awaiting_roll',false),resolved_at=now() where id=r.id and status in('pending','approved');
 if r.movement_plan_id is not null then perform private.battle_finish_movement(r.movement_plan_id); end if;
end $$;


create or replace function public.request_battle_action(p_token_id uuid,p_payload jsonb,p_client_id uuid) returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens; m public.battle_maps; s public.battle_sessions; entry jsonb; e jsonb; sheet jsonb;
 result public.battle_action_requests; source uuid; kind text=p_payload->>'kind'; cost text='action'; rkind text='none'; rlevel integer=0;
 target jsonb=p_payload->'target'; ids uuid[]; sp public.dnd_spells; ability text; modifier integer; dice text; pulse_dice text; lvl integer=0; cname text;
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
 if kind not in('weapon','spell','dash','disengage','dodge') then raise exception 'Ação inválida.'; end if;
 if kind in('weapon','spell') then
  source=(p_payload->>'source_id')::uuid;
  if kind='weapon' then
   if t.character_id is not null then select data into entry from public.character_inventory where id=source and character_id=t.character_id and data->>'category'='weapon' and coalesce((data->>'quantity')::integer,0)>0;
   else select data into entry from public.npc_attacks where id=source and npc_id=t.npc_id; end if;
   if entry is null then raise exception 'Esta arma não está na ficha do personagem.'; end if;
   e=private.battle_weapon(entry,sheet); cname=entry->>'name';
  else
   if t.character_id is not null then select data into entry from public.character_spells where id=source and character_id=t.character_id;
   else select data into entry from public.npc_spells where id=source and npc_id=t.npc_id; end if;
   if entry is null then raise exception 'Esta magia não está na ficha do personagem.'; end if;
   select * into sp from public.dnd_spells where id=entry->>'catalog_id';
   e=case when sp.id is not null then sp.combat else '{"shape":"single","kind":"utility","range":9,"size":0,"width":1.5,"origin":"point","dice":"","review":true,"timing":"immediate","note":"Magia personalizada: o mestre configura os efeitos na aprovação."}'::jsonb end;
   lvl=coalesce(sp.level,(entry->>'level')::integer,0); entry=entry||jsonb_build_object('level',lvl);
   cname=coalesce(sp.name,entry->>'name'); rkind=coalesce(p_payload->>'resource_kind',case when lvl=0 then 'cantrip' else 'slot' end); rlevel=coalesce((p_payload->>'resource_level')::integer,lvl);
   perform private.battle_check_resource(t,entry,rkind,rlevel);
   if lower(coalesce(sp.data->>'casting_time',entry->>'casting_time','1 ação')) like '%bônus%' then cost='bonus';
   elsif lower(coalesce(sp.data->>'casting_time',entry->>'casting_time','1 ação')) like '%rea%' then cost='reaction'; end if;
   if t.bonus_spell_cast and (cost<>'action' or lvl>0) then raise exception 'Após magia bônus, só um truque com tempo de 1 ação pode ser conjurado neste turno.'; end if;
   if cost='bonus' and t.action_spell_level>0 then raise exception 'Uma magia de ação de círculo 1 ou maior impede conjuração bônus neste turno.'; end if;
   select spell_ability into ability from public.dnd_classes where id=sheet->>'class_id';
   if sheet->>'subclass_id' in('eldritch-knight','arcane-trickster') then ability='int'; end if;
   modifier=floor((coalesce((sheet->'abilities'->>ability)::numeric,10)-10)/2);
   dice=coalesce(e->>'dice','');
   if e ? 'sizePerSlot' then e=e||jsonb_build_object('size',(e->>'size')::numeric+greatest(0,rlevel-lvl)*(e->>'sizePerSlot')::numeric); end if;
   if coalesce((e->>'cantripScale')::boolean,false) and lvl=0 then
    dice=regexp_replace(dice,'^(\d+)d',((substring(dice from '^\d+'))::integer*case when (sheet->>'level')::integer>=17 then 4 when (sheet->>'level')::integer>=11 then 3 when (sheet->>'level')::integer>=5 then 2 else 1 end)::text||'d');
   end if;
   if coalesce(e->>'upcast','')<>'' and rlevel>lvl then for i in lvl+1..rlevel loop dice=dice||'+'||(e->>'upcast'); end loop; end if;
   if e ? 'pulseDice' then
    pulse_dice=e->>'pulseDice';
    if coalesce(e->>'pulseUpcast','')<>'' and rlevel>lvl then for i in lvl+1..rlevel loop pulse_dice=pulse_dice||'+'||(e->>'pulseUpcast'); end loop; end if;
    e=e||jsonb_build_object('pulseDice',pulse_dice);
   end if;
   if coalesce((e->>'ability')::boolean,false) then dice=dice||case when modifier>=0 then '+' else '' end||modifier; end if;
   e=e||jsonb_build_object('dice',dice,'concentration',coalesce(sp.concentration,false),'duration',coalesce(sp.data->>'duration',entry->>'duration',''),'description',coalesce(sp.data->>'description',entry->>'description',''),'casting_time',coalesce(sp.data->>'casting_time',entry->>'casting_time','1 ação'));
   if lower(e->>'casting_time') ~ '(minuto|hora)' then e=e||'{"review":true,"timing":"trigger","note":"Conjuração longa: o mestre acompanha o tempo e conclui o efeito somente após a duração necessária."}'::jsonb; end if;
  end if;
 elsif kind in('dash','disengage') and sheet->>'class_id'='rogue' and (sheet->>'level')::integer>=2 and p_payload->>'cost'='bonus' then
  cost='bonus'; cname=case kind when 'dash' then 'Disparada (Ação Ardilosa)' else 'Desengajar (Ação Ardilosa)' end;
 else cname=case kind when 'dash' then 'Disparada' when 'disengage' then 'Desengajar' else 'Esquivar' end; end if;
 if cost='action' and t.action_used and not(kind='weapon' and t.attacks_remaining>0) then raise exception 'A ação deste turno já foi utilizada.'; end if;
 if cost='bonus' and t.bonus_used then raise exception 'A ação bônus já foi utilizada.'; end if;
 if cost='reaction' and t.reaction_used then raise exception 'A reação já foi utilizada.'; end if;
 e=coalesce(e,'{"shape":"self","kind":"utility","origin":"self","range":0,"size":0,"dice":""}'::jsonb);
 target=coalesce(target,jsonb_build_object('x',t.x,'y',t.y));
 if jsonb_typeof(target->'x') is distinct from 'number' or jsonb_typeof(target->'y') is distinct from 'number' or (target->>'x')::numeric<>floor((target->>'x')::numeric) or (target->>'y')::numeric<>floor((target->>'y')::numeric) or (target->>'x')::integer<0 or (target->>'x')::integer>=m.width or (target->>'y')::integer<0 or (target->>'y')::integer>=m.height then raise exception 'Alvo fora do mapa.'; end if;
 if e->>'origin'<>'self' and private.battle_target_range(t,target,m)>coalesce((e->>'range')::numeric,0)+0.00001 then raise exception 'Alvo fora do alcance.'; end if;
 ids=array(select distinct value::uuid from jsonb_array_elements_text(coalesce(p_payload->'target_ids','[]')));
 if cardinality(ids)>coalesce((e->>'maxTargets')::integer,1) then raise exception 'Quantidade de alvos acima do limite da magia.'; end if;
 if exists(select 1 from unnest(ids) v where not exists(select 1 from public.battle_map_tokens q where q.id=v and q.map_id=t.map_id and private.can_read_battle_token(q.id))) then raise exception 'Alvo não pertence ao mapa ou não está visível.' using errcode='42501'; end if;
 if e->>'shape'='single' and (e->>'kind' in('damage','healing','temporary')) and cardinality(ids)<>1 then raise exception 'Selecione uma criatura como alvo.'; end if;
 if exists(select 1 from public.battle_map_tokens q where q.id=any(ids) and not private.battle_in_effect(q,t,target,e,m.scale_per_cell*case when m.scale_unit='ft' then 0.3 else 1 end)) then raise exception 'Alvo fora da área indicada.'; end if;
 insert into public.battle_action_requests(campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,source_id,name,cost,resource_kind,resource_level,spell_level,target,target_ids,definition,round,turn_index,turn_started_at)
 values(t.campaign_id,s.id,t.map_id,t.id,auth.uid(),p_client_id,kind,source,cname,cost,rkind,rlevel,lvl,target,ids,e||jsonb_build_object('entry',entry,'actor_x',t.x,'actor_y',t.y),s.round,s.turn_index,s.turn_started_at) returning * into result;
 return result;
end $$;

create or replace function public.move_battle_token(p_token_id uuid,p_to_x integer,p_to_y integer,p_path jsonb,p_expected_version bigint,p_force boolean default false) returns public.battle_map_tokens
language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens; s public.battle_sessions; result public.battle_map_tokens; enemy public.battle_map_tokens; sheet jsonb; entry jsonb; source uuid; e jsonb; step jsonb; cx integer; cy integer; previous numeric; nextdist numeric; scale numeric; triggered boolean; reach numeric; plan_id uuid;
begin
 select * into t from public.battle_map_tokens where id=p_token_id;
 if t.id is null or not private.can_control_battle_token(t.id) then raise exception 'Você não controla este token.' using errcode='42501'; end if;
 select * into s from public.battle_sessions where id=(select battle_session_id from public.battle_maps where id=t.map_id) for update;
 select * into t from public.battle_map_tokens where id=p_token_id for update;
 if exists(select 1 from public.battle_action_requests q where q.session_id=s.id and q.status in('pending','approved') and (q.token_id=t.id or q.kind='opportunity')) then raise exception 'Aguarde a decisão do mestre antes de mover.'; end if;
 if exists(select 1 from public.battle_movement_plans where token_id=t.id and status='pending') then raise exception 'Este movimento aguarda uma reação.'; end if;
 if s.status='active' and not coalesce(p_force,false) and coalesce((private.battle_sheet(t.id)->>'hp_current')::integer,0)<=0 then raise exception 'Um personagem com 0 PV não pode se mover.'; end if;
 if s.status='active' and not coalesce(p_force,false) and (private.battle_sheet(t.id)->'conditions') ?| array['Agarrado','Impedido','Inconsciente','Atordoado','Paralisado','Petrificado'] then raise exception 'A condição do personagem impede deslocamento.'; end if;
 perform private.battle_validate_movement(p_token_id,p_to_x,p_to_y,p_path,p_expected_version,p_force);
 if s.status='active' and not t.disengaged and not coalesce(p_force,false) then
  select scale_per_cell*case when scale_unit='ft' then 0.3 else 1 end into scale from public.battle_maps where id=t.map_id;
  for enemy in select * from public.battle_map_tokens q where q.map_id=t.map_id and q.id<>t.id and not q.reaction_used and q.faction in('ally','enemy') and t.faction in('ally','enemy') and q.faction<>t.faction order by q.id for update loop
   sheet=private.battle_sheet(enemy.id); if coalesce((sheet->>'hp_current')::integer,0)<=0 then continue; end if;
   entry=null; source=null;
   if enemy.character_id is not null then select id,data into source,entry from public.character_inventory where character_id=enemy.character_id and data->>'category'='weapon' and coalesce((data->>'quantity')::integer,0)>0 and data->>'weapon_mode' is distinct from 'ranged' and lower(data->>'name') !~ '(arco|besta|funda|zarabatana)' order by coalesce((data->>'equipped')::boolean,false) desc,id limit 1;
   else select id,data into source,entry from public.npc_attacks where npc_id=enemy.npc_id and lower(coalesce(data->>'name','')||' '||coalesce(data->>'range','')) !~ '(arco|besta|funda|zarabatana|distância|distancia|ranged)' order by id limit 1; end if;
   if entry is null then continue; end if;
   e=private.battle_weapon(entry,sheet); reach=coalesce((e->>'range')::numeric,1.5); cx=t.x; cy=t.y; triggered=false;
   for step in select value from jsonb_array_elements(p_path) loop
    previous=greatest(greatest(0,enemy.x-(cx+t.size-1),cx-(enemy.x+enemy.size-1)),greatest(0,enemy.y-(cy+t.size-1),cy-(enemy.y+enemy.size-1)))*scale;
    cx=(step->>'x')::integer; cy=(step->>'y')::integer;
    nextdist=greatest(greatest(0,enemy.x-(cx+t.size-1),cx-(enemy.x+enemy.size-1)),greatest(0,enemy.y-(cy+t.size-1),cy-(enemy.y+enemy.size-1)))*scale;
    if previous<=reach and nextdist>reach then triggered=true; exit; end if;
   end loop;
   if triggered then
    if plan_id is null then
     insert into public.battle_movement_plans(campaign_id,session_id,token_id,target,path,expected_version,from_x,from_y) values(t.campaign_id,s.id,t.id,jsonb_build_object('x',p_to_x,'y',p_to_y),p_path,p_expected_version,t.x,t.y) returning id into plan_id;
    end if;
    insert into public.battle_action_requests(campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,source_id,movement_plan_id,name,cost,target,target_ids,definition,round,turn_index,turn_started_at)
    values(t.campaign_id,s.id,t.map_id,enemy.id,(select owner_id from public.campaigns where id=t.campaign_id),gen_random_uuid(),'opportunity',source,plan_id,'Ataque de oportunidade: '||enemy.name||' → '||t.name,'reaction',jsonb_build_object('x',t.x,'y',t.y),array[t.id],e||jsonb_build_object('entry',entry,'note','Reação antes de sair do alcance. O mestre verifica visão, arma e condições.'),s.round,s.turn_index,s.turn_started_at) on conflict do nothing;
   end if;
  end loop;
 end if;
 if plan_id is not null then return t; end if;
 result=public.move_battle_token_path_v7(p_token_id,p_to_x,p_to_y,p_path,p_expected_version,p_force); return result;
end $$;

create or replace function private.battle_turn_budget() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status or new.active_token_id is distinct from old.active_token_id or new.round<>old.round or new.turn_index<>old.turn_index or new.turn_started_at is distinct from old.turn_started_at then
  if not private.is_campaign_owner(new.campaign_id) and (exists(select 1 from public.battle_action_requests where session_id=new.id and status in('pending','approved')) or exists(select 1 from public.battle_movement_plans where session_id=new.id and status='pending')) then raise exception 'Aguarde a decisão do mestre antes de encerrar o turno.'; end if;
  update public.battle_action_requests set status='expired',resolved_at=now() where session_id=new.id and status in('pending','approved');
  update public.battle_movement_plans set status='cancelled',reason='Turno encerrado.' where session_id=new.id and status='pending';
  update public.battle_map_tokens set disengaged=false where id=old.active_token_id;
  if new.status='active' then
   update public.battle_map_tokens set movement_speed=private.battle_character_speed(character_id),movement_remaining=private.battle_character_speed(character_id),movement_unit='m' where id=new.active_token_id and character_id is not null;
   update public.battle_map_tokens set action_used=false,bonus_used=false,reaction_used=false,attacks_remaining=0,disengaged=false,dodging=false,movement_bonus=0,bonus_spell_cast=false,action_spell_level=-1,version=version+1 where id=new.active_token_id; end if;
 end if; return new;
end $$;

create or replace function public.pulse_battle_spell_v9(p_effect_id uuid,p_resolution jsonb,p_expected_pulses integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.battle_spell_effects; r public.battle_action_requests; t public.battle_map_tokens; s public.battle_sessions; result jsonb;
begin
 select * into e from public.battle_spell_effects where id=p_effect_id;
 if e.id is null or not private.is_campaign_owner(e.campaign_id) then raise exception 'Apenas o mestre pode aplicar este efeito.' using errcode='42501'; end if;
 select * into s from public.battle_sessions where id=(select battle_session_id from public.battle_maps where id=e.map_id) for update;
 perform 1 from public.campaigns where id=e.campaign_id for update;
 select * into e from public.battle_spell_effects where id=p_effect_id for update;
 if not e.active or e.pulses<>p_expected_pulses then raise exception 'O efeito mudou. Atualize a mesa antes de aplicar novamente.'; end if;
 select * into r from public.battle_action_requests where id=e.request_id;
 select * into t from public.battle_map_tokens where id=e.token_id for update;
 if e.definition->>'pulseCost' in('action','bonus') then
  if s.status<>'active' or s.active_token_id is distinct from t.id then raise exception 'Este efeito precisa ser usado no turno do conjurador.'; end if;
  if coalesce((private.battle_sheet(t.id)->>'hp_current')::integer,0)<=0 or (private.battle_sheet(t.id)->'conditions') ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado'] then raise exception 'O conjurador não pode executar esta ação.'; end if;
  if exists(select 1 from public.battle_action_requests where session_id=s.id and status in('pending','approved')) then raise exception 'Resolva a tentativa pendente antes de aplicar o efeito.'; end if;
  if e.definition->>'pulseCost'='action' then
   if t.action_used then raise exception 'A ação deste turno já foi utilizada.'; end if;
   update public.battle_map_tokens set action_used=true,attacks_remaining=0,version=version+1 where id=t.id;
  else
   if t.bonus_used then raise exception 'A ação bônus já foi utilizada.'; end if;
   update public.battle_map_tokens set bonus_used=true,version=version+1 where id=t.id;
  end if;
 end if;
 r.target=e.target;
 result=private.battle_apply_hp(r,t,e.definition,coalesce(p_resolution,'{}'));
 update public.battle_spell_effects set pulses=pulses+1,active=not coalesce((definition->>'pulseOnce')::boolean,false),updated_at=now() where id=e.id;
 return result;
end $$;


-- Scenery uses integer rectangular footprints, shared by the 3D/2D renderer and path validation.
create function private.battle_scenery_bounds() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.battle_maps; g jsonb; x integer; y integer; w integer; h integer; cost numeric;
begin
 if tg_op='DELETE' then
  select * into m from public.battle_maps where id=old.map_id;
  perform 1 from public.battle_sessions where id=m.battle_session_id for update;
  update public.battle_maps set updated_at=now() where id=old.map_id;
  return old;
 end if;
 select * into m from public.battle_maps where id=new.map_id;
 perform 1 from public.battle_sessions where id=m.battle_session_id for update;
 if tg_op='UPDATE' and new.map_id<>old.map_id then raise exception 'Não transfira objetos entre mapas.'; end if;
 if new.object_type not in('tree','pine','rock','mountain','water','fire','lava','ruin') then
  if new.blocks_movement then raise exception 'Use um objeto de cenário com dimensões válidas para bloquear movimento.'; end if;
  return new;
 end if;
 g=new.geometry;
 if jsonb_typeof(g->'x') is distinct from 'number' or jsonb_typeof(g->'y') is distinct from 'number' or jsonb_typeof(g->'width') is distinct from 'number' or jsonb_typeof(g->'height') is distinct from 'number' then raise exception 'Informe posição e dimensões do objeto.'; end if;
 if (g->>'x')::numeric<>floor((g->>'x')::numeric) or (g->>'y')::numeric<>floor((g->>'y')::numeric) or (g->>'width')::numeric<>floor((g->>'width')::numeric) or (g->>'height')::numeric<>floor((g->>'height')::numeric) then raise exception 'As dimensões devem seguir as células do grid.'; end if;
 x=(g->>'x')::integer; y=(g->>'y')::integer; w=(g->>'width')::integer; h=(g->>'height')::integer;
 if x<0 or y<0 or w<1 or h<1 or w>8 or h>8 or x+w>m.width or y+h>m.height or new.z<>0 or coalesce((g->>'rotation')::numeric,0) not between 0 and 360 then raise exception 'Objeto fora do mapa ou com dimensões inválidas (1 a 8 células).'; end if;
 cost=coalesce((new.metadata->>'movement_cost')::numeric,1);
 if cost not between 1 and 10 then raise exception 'Custo de movimento inválido (1 a 10).'; end if;
 if new.blocks_movement and exists(select 1 from public.battle_map_tokens t where t.map_id=m.id and t.z=0 and t.x<(new.geometry->>'x')::integer+(new.geometry->>'width')::integer and t.x+t.size>(new.geometry->>'x')::integer and t.y<(new.geometry->>'y')::integer+(new.geometry->>'height')::integer and t.y+t.size>(new.geometry->>'y')::integer) then raise exception 'O objeto bloqueia um personagem. Escolha outra posição.'; end if;
 if tg_op='INSERT' and (select count(*) from public.battle_map_objects where map_id=m.id)>=1200 then raise exception 'Limite de 1200 objetos neste mapa.'; end if;
 update public.battle_maps set updated_at=now() where id=m.id;
 return new;
end $$;
create trigger battle_scenery_bounds before insert or update or delete on public.battle_map_objects for each row execute function private.battle_scenery_bounds();

create function private.battle_footprint_cost(p_map uuid,px integer,py integer,pz numeric,p_size numeric,p_token uuid) returns numeric
language plpgsql stable security definer set search_path='' as $$
declare result numeric=1; m public.battle_maps;
begin
 select * into m from public.battle_maps where id=p_map;
 if px<0 or py<0 or px+p_size>m.width or py+p_size>m.height then return null; end if;
 if exists(select 1 from public.battle_map_cells c where c.map_id=p_map and c.z=pz and c.blocked and c.x>=px and c.x<px+p_size and c.y>=py and c.y<py+p_size) or
 exists(select 1 from public.battle_map_tokens t where t.map_id=p_map and t.id<>p_token and t.z=pz and t.x<px+p_size and t.x+t.size>px and t.y<py+p_size and t.y+t.size>py) or
 exists(select 1 from public.battle_map_objects o where o.map_id=p_map and o.z=pz and o.blocks_movement and o.object_type in('tree','pine','rock','mountain','water','fire','lava','ruin') and (o.geometry->>'x')::integer<px+p_size and (o.geometry->>'x')::integer+(o.geometry->>'width')::integer>px and (o.geometry->>'y')::integer<py+p_size and (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>py) then return null; end if;
 select greatest(result,coalesce(max(c.movement_cost),1)) into result from public.battle_map_cells c where c.map_id=p_map and c.z=pz and c.x>=px and c.x<px+p_size and c.y>=py and c.y<py+p_size;
 select greatest(result,coalesce(max(coalesce((o.metadata->>'movement_cost')::numeric,1)),1)) into result from public.battle_map_objects o where o.map_id=p_map and o.z=pz and o.object_type in('tree','pine','rock','mountain','water','fire','lava','ruin') and (o.geometry->>'x')::integer<px+p_size and (o.geometry->>'x')::integer+(o.geometry->>'width')::integer>px and (o.geometry->>'y')::integer<py+p_size and (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>py;
 return result;
end $$;
create function private.battle_scenery_resize() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.width<>old.width or new.height<>old.height) and exists(select 1 from public.battle_map_objects o where o.map_id=new.id and o.object_type in('tree','pine','rock','mountain','water','fire','lava','ruin') and ((o.geometry->>'x')::integer+(o.geometry->>'width')::integer>new.width or (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>new.height)) then raise exception 'Remova ou reposicione os objetos antes de reduzir o mapa.'; end if;
 return new;
end $$;
create trigger battle_scenery_resize before update on public.battle_maps for each row execute function private.battle_scenery_resize();


create or replace function private.battle_validate_movement(p_token_id uuid,p_to_x integer,p_to_y integer,p_path jsonb,p_expected_version bigint,p_force boolean default false) returns numeric
language plpgsql security definer set search_path='' as $$
declare
  t public.battle_map_tokens; m public.battle_maps; s public.battle_sessions; result public.battle_map_tokens;
  step jsonb; cx integer; cy integer; nx integer; ny integer; diag_count integer=0; step_cost numeric; total_grid_cost numeric=0;
  blocked_cell boolean; terrain_cost numeric; movement_cost numeric; token_owner boolean; item_count integer;
begin
  p_force=coalesce(p_force,false);
  select * into t from public.battle_map_tokens where id=p_token_id for update;
  if t.id is null or not private.can_control_battle_token(t.id) then raise exception 'Você não pode controlar este token.' using errcode='42501'; end if;
  token_owner=private.is_campaign_owner(t.campaign_id);
  if p_force and not token_owner then raise exception 'Somente o mestre pode forçar um movimento.' using errcode='42501'; end if;
  if p_expected_version is null or t.version<>p_expected_version then raise exception 'O token foi movido por outra pessoa. Atualize a mesa e tente novamente.' using errcode='40001'; end if;
  select * into m from public.battle_maps where id=t.map_id;
  select * into s from public.battle_sessions where id=m.battle_session_id;
  if p_to_x is null or p_to_y is null or p_to_x<0 or p_to_y<0 or p_to_x+t.size>m.width or p_to_y+t.size>m.height then raise exception 'Destino fora do mapa.'; end if;
  if s.status='active' and s.restrict_movement_to_turn and s.active_token_id<>t.id and not token_owner and not p_force then
    raise exception 'Aguarde o turno deste token.' using errcode='42501';
  end if;
  if p_path is null or jsonb_typeof(p_path)<>'array' then raise exception 'Caminho inválido.'; end if;
  item_count=jsonb_array_length(p_path);
  if item_count=0 or item_count>500 then raise exception 'Caminho inválido.'; end if;
  cx=t.x; cy=t.y;
  for step in select value from jsonb_array_elements(p_path) loop
    if jsonb_typeof(step->'x') is distinct from 'number' or jsonb_typeof(step->'y') is distinct from 'number' or (step->>'x')::numeric<>floor((step->>'x')::numeric) or (step->>'y')::numeric<>floor((step->>'y')::numeric) then raise exception 'O caminho contém uma coordenada inválida.'; end if;
    nx=(step->>'x')::integer; ny=(step->>'y')::integer;
    if nx<0 or ny<0 or nx+t.size>m.width or ny+t.size>m.height or abs(nx-cx)>1 or abs(ny-cy)>1 or (nx=cx and ny=cy) then raise exception 'O caminho contém uma etapa inválida.'; end if;
    terrain_cost=private.battle_footprint_cost(m.id,nx,ny,t.z,t.size,t.id);
    if terrain_cost is null then raise exception 'O caminho atravessa uma célula bloqueada, objeto ou token.'; end if;
    if nx<>cx and ny<>cy and (private.battle_footprint_cost(m.id,nx,cy,t.z,t.size,t.id) is null or private.battle_footprint_cost(m.id,cx,ny,t.z,t.size,t.id) is null) then raise exception 'O caminho tenta atravessar um canto bloqueado.'; end if;
    if nx<>cx and ny<>cy then
      diag_count=diag_count+1;
      step_cost=terrain_cost * case m.diagonal_rule when 'sqrt2' then sqrt(2::numeric) when 'five-ten-five' then case when diag_count%2=0 then 2 else 1 end else 1 end;
    else step_cost=terrain_cost; end if;
    total_grid_cost=total_grid_cost+step_cost;
    cx=nx; cy=ny;
  end loop;
  if cx<>p_to_x or cy<>p_to_y then raise exception 'O caminho não termina no destino informado.'; end if;
  movement_cost=total_grid_cost*m.scale_per_cell;
  if m.scale_unit<>t.movement_unit then
    movement_cost=case when m.scale_unit='m' and t.movement_unit='ft' then movement_cost/0.3 else movement_cost*0.3 end;
  end if;
  if s.status='active' and movement_cost>t.movement_remaining+0.0001 and not p_force then raise exception 'Movimento acima do deslocamento restante.' using errcode='42501'; end if;
  return movement_cost;
end $$;

create or replace function public.move_battle_token_path_v7(p_token_id uuid,p_to_x integer,p_to_y integer,p_path jsonb,p_expected_version bigint,p_force boolean default false) returns public.battle_map_tokens
language plpgsql security definer set search_path='' as $$
declare
  t public.battle_map_tokens; m public.battle_maps; s public.battle_sessions; result public.battle_map_tokens;
  step jsonb; cx integer; cy integer; nx integer; ny integer; diag_count integer=0; step_cost numeric; total_grid_cost numeric=0;
  blocked_cell boolean; terrain_cost numeric; movement_cost numeric; token_owner boolean; item_count integer;
begin
  p_force=coalesce(p_force,false);
  select * into t from public.battle_map_tokens where id=p_token_id for update;
  if t.id is null or not private.can_control_battle_token(t.id) then raise exception 'Você não pode controlar este token.' using errcode='42501'; end if;
  token_owner=private.is_campaign_owner(t.campaign_id);
  if p_force and not token_owner then raise exception 'Somente o mestre pode forçar um movimento.' using errcode='42501'; end if;
  if p_expected_version is null or t.version<>p_expected_version then raise exception 'O token foi movido por outra pessoa. Atualize a mesa e tente novamente.' using errcode='40001'; end if;
  select * into m from public.battle_maps where id=t.map_id;
  select * into s from public.battle_sessions where id=m.battle_session_id;
  if p_to_x is null or p_to_y is null or p_to_x<0 or p_to_y<0 or p_to_x+t.size>m.width or p_to_y+t.size>m.height then raise exception 'Destino fora do mapa.'; end if;
  if s.status='active' and s.restrict_movement_to_turn and s.active_token_id<>t.id and not token_owner and not p_force then
    raise exception 'Aguarde o turno deste token.' using errcode='42501';
  end if;
  if p_path is null or jsonb_typeof(p_path)<>'array' then raise exception 'Caminho inválido.'; end if;
  item_count=jsonb_array_length(p_path);
  if item_count=0 or item_count>500 then raise exception 'Caminho inválido.'; end if;
  cx=t.x; cy=t.y;
  for step in select value from jsonb_array_elements(p_path) loop
    if jsonb_typeof(step->'x') is distinct from 'number' or jsonb_typeof(step->'y') is distinct from 'number' or (step->>'x')::numeric<>floor((step->>'x')::numeric) or (step->>'y')::numeric<>floor((step->>'y')::numeric) then raise exception 'O caminho contém uma coordenada inválida.'; end if;
    nx=(step->>'x')::integer; ny=(step->>'y')::integer;
    if nx<0 or ny<0 or nx+t.size>m.width or ny+t.size>m.height or abs(nx-cx)>1 or abs(ny-cy)>1 or (nx=cx and ny=cy) then raise exception 'O caminho contém uma etapa inválida.'; end if;
    terrain_cost=private.battle_footprint_cost(m.id,nx,ny,t.z,t.size,t.id);
    if terrain_cost is null then raise exception 'O caminho atravessa uma célula bloqueada, objeto ou token.'; end if;
    if nx<>cx and ny<>cy and (private.battle_footprint_cost(m.id,nx,cy,t.z,t.size,t.id) is null or private.battle_footprint_cost(m.id,cx,ny,t.z,t.size,t.id) is null) then raise exception 'O caminho tenta atravessar um canto bloqueado.'; end if;
    if nx<>cx and ny<>cy then
      diag_count=diag_count+1;
      step_cost=terrain_cost * case m.diagonal_rule when 'sqrt2' then sqrt(2::numeric) when 'five-ten-five' then case when diag_count%2=0 then 2 else 1 end else 1 end;
    else step_cost=terrain_cost; end if;
    total_grid_cost=total_grid_cost+step_cost;
    cx=nx; cy=ny;
  end loop;
  if cx<>p_to_x or cy<>p_to_y then raise exception 'O caminho não termina no destino informado.'; end if;
  movement_cost=total_grid_cost*m.scale_per_cell;
  if m.scale_unit<>t.movement_unit then
    movement_cost=case when m.scale_unit='m' and t.movement_unit='ft' then movement_cost/0.3 else movement_cost*0.3 end;
  end if;
  if s.status='active' and movement_cost>t.movement_remaining+0.0001 and not p_force then raise exception 'Movimento acima do deslocamento restante.' using errcode='42501'; end if;
  update public.battle_map_tokens set x=p_to_x,y=p_to_y,movement_remaining=case when s.status='active' then greatest(0,movement_remaining-movement_cost) else movement_remaining end,version=version+1 where id=t.id returning * into result;
  insert into public.battle_movements(campaign_id,session_id,token_id,character_id,from_x,from_y,to_x,to_y,movement_cost,movement_unit,path,turn_round)
  values(t.campaign_id,s.id,t.id,t.character_id,t.x,t.y,p_to_x,p_to_y,movement_cost,t.movement_unit,p_path,case when s.status='active' then s.round else null end);
  return result;
end $$;


-- Tokens added or resized through the existing sheet/grid APIs respect solid scenery too.
create function private.battle_scenery_token_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.battle_sessions where id=(select battle_session_id from public.battle_maps where id=new.map_id) for update;
 if exists(select 1 from public.battle_map_objects o where o.map_id=new.map_id and o.z=new.z and o.blocks_movement and o.object_type in('tree','pine','rock','mountain','water','fire','lava','ruin') and (o.geometry->>'x')::integer<new.x+new.size and (o.geometry->>'x')::integer+(o.geometry->>'width')::integer>new.x and (o.geometry->>'y')::integer<new.y+new.size and (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>new.y) then raise exception 'A posição está bloqueada por um objeto do cenário.'; end if;
 return new;
end $$;
create trigger battle_scenery_token_guard before insert or update of x,y,size,map_id on public.battle_map_tokens for each row execute function private.battle_scenery_token_guard();
revoke all on function private.battle_scenery_token_guard() from public,anon,authenticated;

revoke all on function private.battle_scenery_bounds(),private.battle_scenery_resize(),private.battle_footprint_cost(uuid,integer,integer,numeric,numeric,uuid) from public,anon,authenticated;
revoke all on function public.approve_battle_action(uuid,boolean,jsonb),public.roll_approved_battle_action(uuid,uuid) from public,anon;
grant execute on function public.approve_battle_action(uuid,boolean,jsonb),public.roll_approved_battle_action(uuid,uuid) to authenticated;
revoke all on function public.move_battle_token_path_v7(uuid,integer,integer,jsonb,bigint,boolean),public.pulse_battle_spell_v9(uuid,jsonb,integer),private.battle_validate_movement(uuid,integer,integer,jsonb,bigint,boolean) from public,anon,authenticated;
commit;

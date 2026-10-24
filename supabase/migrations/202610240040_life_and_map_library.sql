-- 040: life states, death saves and cartography library. Apply after 039.

begin;

alter table public.battle_decisions drop constraint if exists battle_decisions_kind_check;
alter table public.battle_decisions add constraint battle_decisions_kind_check check(kind in('attack','save','damage','concentration','choice','condition','death'));
create unique index if not exists battle40_death_once on public.battle_action_requests(session_id,token_id,turn_started_at) where definition->>'death_save'='true';
create or replace function private.battle40_life_sheet() returns trigger language plpgsql security definer set search_path='' as $$
declare hp integer;oldhp integer;conditions jsonb;
begin
 if not new.system_data ? 'hp_current' then return new;end if;
 hp=coalesce((new.system_data->>'hp_current')::integer,1);oldhp=case when tg_op='UPDATE' then coalesce((old.system_data->>'hp_current')::integer,1) else hp end;conditions=coalesce(new.system_data->'conditions','[]');
 if hp=0 then
  select coalesce(jsonb_agg(distinct v),'[]') into conditions from jsonb_array_elements_text(conditions||'["Caído","Inconsciente"]') v;
  if coalesce((new.system_data->>'death_failures')::integer,0)>=3 then conditions=conditions||case when conditions ? 'Morto' then '[]'::jsonb else '["Morto"]'::jsonb end;end if;
 elsif oldhp=0 then
  select coalesce(jsonb_agg(v),'[]') into conditions from jsonb_array_elements_text(conditions) v where v not in('Inconsciente','Estável','Morto','Dead');new.system_data=new.system_data||'{"death_successes":0,"death_failures":0}';
 end if;new.system_data=jsonb_set(new.system_data,'{conditions}',conditions);return new;
end $$;
drop trigger if exists battle40_life_sheet on public.characters;
create trigger battle40_life_sheet before insert or update of system_data on public.characters for each row execute function private.battle40_life_sheet();
create or replace function private.battle40_damage_state(sheet jsonb,amount integer,temporary integer,events jsonb,maximum integer) returns jsonb language plpgsql immutable set search_path='' as $$
declare hp integer=coalesce((sheet->>'hp_current')::integer,0);temp integer=temporary;failures integer=coalesce((sheet->>'death_failures')::integer,0);successes integer=coalesce((sheet->>'death_successes')::integer,0);conditions jsonb=coalesce(sheet->'conditions','[]');event jsonb;hit integer;remaining integer;
begin
 if conditions ?| array['Morto','Dead'] or failures>=3 then return '{}';end if;
 if events is null or jsonb_array_length(events)=0 then events=jsonb_build_array(jsonb_build_object('amount',amount,'critical',false));end if;
 for event in select value from jsonb_array_elements(events) loop
  hit=greatest(0,coalesce((event->>'amount')::integer,0));if hit=0 then continue;end if;
  select coalesce(jsonb_agg(v),'[]') into conditions from jsonb_array_elements_text(conditions) v where v<>'Estável';
  remaining=greatest(0,hit-temp);temp=greatest(0,temp-hit);
  if hp=0 then failures=least(3,failures+case when coalesce((event->>'critical')::boolean,false) then 2 else 1 end);if hit>=maximum then failures=3;end if;
  elsif remaining>=hp then if remaining-hp>=maximum then failures=3;else failures=0;successes=0;end if;end if;
  hp=greatest(0,hp-remaining);if failures>=3 then conditions=conditions||'["Morto"]';exit;end if;
 end loop;return jsonb_build_object('death_failures',failures,'death_successes',successes,'conditions',conditions);
end $$;
create or replace function private.battle40_ensure_death(s public.battle_sessions) returns void language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens;sheet jsonb;q public.battle_action_requests;owner uuid;
begin
 if s.status<>'active' or s.active_token_id is null then return;end if;select * into t from public.battle_map_tokens where id=s.active_token_id;
 if t.character_id is null then return;end if;sheet=private.battle_sheet(t.id);
 if (sheet->>'hp_current')::integer<>0 or coalesce((sheet->>'death_failures')::integer,0)>=3 or sheet->'conditions' ?| array['Estável','Morto','Dead'] then return;end if;
 if exists(select 1 from public.battle_action_requests where session_id=s.id and token_id=t.id and turn_started_at=s.turn_started_at and definition->>'death_save'='true') then return;end if;
 select owner_id into owner from public.characters where id=t.character_id;
 insert into public.battle_action_requests(campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,name,cost,target,target_ids,definition,round,turn_index,turn_started_at,status,resolution)
 values(s.campaign_id,s.id,t.map_id,t.id,owner,gen_random_uuid(),'feature','Salvaguarda contra a morte','free',jsonb_build_object('x',t.x,'y',t.y),array[t.id],'{"death_save":true,"kind":"utility","shape":"self"}',s.round,s.turn_index,s.turn_started_at,'success','{"message":"Salvaguarda contra a morte no início do turno."}') returning * into q;
 perform private.battle37_add_decision(q,t.id,'death',0,'Salvaguarda contra a morte',null,10,0,'normal','{"death_save":true}');
end $$;
create or replace function private.battle40_death_turn() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.turn_started_at is distinct from old.turn_started_at or new.status is distinct from old.status then perform private.battle40_ensure_death(new);end if;return new;end $$;
drop trigger if exists zz_battle40_death_turn on public.battle_sessions;
create trigger zz_battle40_death_turn after update on public.battle_sessions for each row execute function private.battle40_death_turn();
create or replace function private.battle40_recover() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce((new.system_data->>'hp_current')::integer,1)>0 and coalesce((old.system_data->>'hp_current')::integer,1)=0 then
  update public.battle_map_tokens t set movement_remaining=greatest(0,t.movement_remaining+private.battle_character_speed(new.id)-t.movement_speed),movement_speed=private.battle_character_speed(new.id) where t.character_id=new.id and exists(select 1 from public.battle_sessions s join public.battle_maps m on m.battle_session_id=s.id where m.id=t.map_id and s.status='active' and s.active_token_id=t.id);
 end if;
 if coalesce((new.system_data->>'hp_current')::integer,1)>0 or coalesce(new.system_data->'conditions','[]') ?| array['Estável','Morto','Dead'] or coalesce((new.system_data->>'death_failures')::integer,0)>=3 then
  update public.battle_decisions d set status='cancelled',answered_at=now() from public.battle_map_tokens t where t.character_id=new.id and d.token_id=t.id and d.kind='death' and d.status='pending';end if;return new;
end $$;
drop trigger if exists battle40_recover on public.characters;
create trigger battle40_recover after update of system_data on public.characters for each row execute function private.battle40_recover();
revoke all on function private.battle40_life_sheet(),private.battle40_damage_state(jsonb,integer,integer,jsonb,integer),private.battle40_ensure_death(public.battle_sessions),private.battle40_death_turn(),private.battle40_recover() from public,anon,authenticated;
create or replace function public.stand_battle_token(p_token_id uuid,p_client_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens;s public.battle_sessions;sheet jsonb;cost numeric;
begin
 select * into t from public.battle_map_tokens where id=p_token_id;
 if p_client_id is null or t.id is null or not private.can_read_campaign(t.campaign_id) or not private.battle38_controls(t.id) then raise exception 'Você só pode levantar seu participante.' using errcode='42501';end if;
 select * into s from public.battle_sessions where id=(select battle_session_id from public.battle_maps where id=t.map_id) for update;
 select * into t from public.battle_map_tokens where id=p_token_id for update;sheet=private.battle_sheet(t.id);
 if not(sheet->'conditions' ? 'Caído') then return public.battle_combat_update(t.map_id);end if;
 if (sheet->>'hp_current')::integer<=0 or sheet->'conditions' ?| array['Inconsciente','Incapacitado','Paralisado','Atordoado','Petrificado','Morto','Dead','Impedido'] then raise exception 'A condição atual impede levantar.';end if;
 if s.status='active' then
  if s.active_token_id is distinct from t.id then raise exception 'Aguarde seu turno para levantar.';end if;
  cost=t.movement_speed/2;if t.movement_speed<=0 or t.movement_remaining<cost then raise exception 'Levantar exige metade do deslocamento.';end if;
  update public.battle_map_tokens set movement_remaining=movement_remaining-cost where id=t.id;
 end if;
 if t.character_id is not null then update public.characters set system_data=jsonb_set(system_data,'{conditions}',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(system_data->'conditions') v where v<>'Caído'),'[]')) where id=t.character_id;end if;
 update private.battle_condition_effects set active=false where token_id=t.id and condition='Caído' and active;return public.battle_combat_update(t.map_id);
end $$;
revoke all on function public.stand_battle_token(uuid,uuid) from public,anon;grant execute on function public.stand_battle_token(uuid,uuid) to authenticated;
create or replace function public.list_battle_life(p_campaign_id uuid,p_map_id uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'state',case when coalesce((s.data->>'death_failures')::integer,0)>=3 and coalesce((s.data->>'hp_current')::integer,1)=0 or s.data->'conditions' ?| array['Morto','Dead'] then 'dead' when coalesce((s.data->>'hp_current')::integer,1)=0 then case when s.data->'conditions' ? 'Estável' then 'stable' else 'dying' end when s.data->'conditions' ? 'Caído' or exists(select 1 from private.battle_condition_effects e where e.token_id=t.id and e.active and e.condition='Caído') then 'prone' else 'standing' end)||case when private.battle38_controls(t.id) then jsonb_build_object('hp_current',(s.data->>'hp_current')::integer,'hp_temp',coalesce((s.data->>'hp_temp')::integer,0),'death_successes',coalesce((s.data->>'death_successes')::integer,0),'death_failures',coalesce((s.data->>'death_failures')::integer,0),'conditions',s.data->'conditions') else '{}'::jsonb end),'[]') from public.battle_map_tokens t join public.characters c on c.id=t.character_id cross join lateral (select c.system_data data) s where t.campaign_id=p_campaign_id and (p_map_id is null or t.map_id=p_map_id) and private.can_read_campaign(p_campaign_id) and private.can_read_battle_token(t.id)
$$;
revoke all on function public.list_battle_life(uuid,uuid) from public,anon;grant execute on function public.list_battle_life(uuid,uuid) to authenticated;
create or replace function private.battle40_death_options() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.kind='death' then new.modifier=0;new.ability=null;new.dc=10;new.options=new.options||jsonb_build_object('roll_plan',jsonb_build_array(jsonb_build_object('expression','1d20','mode',new.mode,'label',new.label)));end if;return new;end $$;
drop trigger if exists zz_battle40_death_options on public.battle_decisions;
create trigger zz_battle40_death_options before insert or update of mode,modifier,dc on public.battle_decisions for each row execute function private.battle40_death_options();
revoke all on function private.battle40_death_options() from public,anon,authenticated;


create or replace function public.answer_battle_decision(p_decision_id uuid,p_client_id uuid,p_answer jsonb default '{}') returns public.battle_decisions
language plpgsql security definer set search_path='' as $$
declare decision public.battle_decisions;q public.battle_action_requests;bs public.battle_sessions;g private.battle_guides;a public.battle_map_tokens;target public.battle_map_tokens;check_row public.battle_decisions;d public.battle_dice_rolls;detail jsonb;answer_result jsonb='{}';damage_events jsonb='[]';s jsonb;e jsonb;part_effect jsonb;opts jsonb;targets jsonb='{}';rolls jsonb='[]';outcome jsonb;target_id uuid;total integer;natural_roll integer;ac integer;passed boolean;hit boolean;critical boolean;amount integer;mode text;choice text;concentration_effect uuid;checked integer=0;single_bonus integer=0;
begin
 if auth.uid() is null or p_client_id is null then raise exception 'Entre na sua conta para responder.' using errcode='42501';end if;
 select * into decision from public.battle_decisions where id=p_decision_id;
 if decision.id is null or not private.can_read_campaign(decision.campaign_id) or not private.battle38_controls(decision.token_id) then raise exception 'Esta decisão pertence a outro participante.' using errcode='42501';end if;
 select * into bs from public.battle_sessions where id=decision.session_id for update;
 perform 1 from public.campaigns where id=decision.campaign_id for update;
 select * into q from public.battle_action_requests where id=decision.request_id for update;
 select * into g from private.battle_guides where request_id=q.id for update;
 select * into decision from public.battle_decisions where id=p_decision_id for update;
 if decision.status<>'pending' then return decision;end if;
 perform set_config('battle39.physical',(coalesce(decision.options->>'dice_mode','program')='physical' and decision.kind<>'choice')::text,true);
 if bs.status<>'active' or (decision.kind<>'condition' and (bs.round<>q.round or bs.turn_index<>q.turn_index or bs.turn_started_at is distinct from q.turn_started_at)) or q.status not in('pending','success') or q.status='success' and decision.kind not in('concentration','condition','death') then
  update public.battle_decisions set status='cancelled',answered_at=now() where id=decision.id returning * into decision;return decision;
 end if;
 if exists(select 1 from public.battle_decisions where answered_by=auth.uid() and client_id=p_client_id and id<>decision.id) or exists(select 1 from public.battle_dice_rolls where rolled_by=auth.uid() and client_id=p_client_id) then raise exception 'Este identificador já pertence a outra resposta.';end if;
 if coalesce(decision.options->>'dice_mode','program')='physical' and decision.kind<>'choice' then
  if jsonb_typeof(p_answer->'rolls') is distinct from 'array' or jsonb_array_length(p_answer->'rolls')>100 then raise exception 'Informe as faces dos dados físicos.';end if;
  perform set_config('battle39.rolls',(p_answer->'rolls')::text,true);perform set_config('battle39.roll_index','0',true);
 elsif p_answer ? 'rolls' then raise exception 'Esta etapa usa dados do programa.';end if;
 select * into a from public.battle_map_tokens where id=decision.token_id for update;s=private.battle_sheet(a.id);e=g.definition;
 if decision.kind in('attack','damage','choice') and ((s->>'hp_current')::integer<=0 or coalesce(s->'conditions','[]') ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado']) then raise exception 'Este participante não pode agir agora. O mestre pode cancelar a tentativa.';end if;
 if coalesce((decision.options->>'escape')::boolean,false) then
  if bs.active_token_id is distinct from a.id or (a.action_used and coalesce(a.extra_actions,0)<=0) then raise exception 'Escapar exige seu turno e uma ação disponível.';end if;
  if (s->>'hp_current')::integer<=0 or s->'conditions' ?| array['Incapacitado','Paralisado','Atordoado','Inconsciente','Petrificado'] then raise exception 'A condição atual impede esta ação.';end if;
  update public.battle_map_tokens set action_used=true,extra_actions=case when action_used then greatest(0,extra_actions-1) else extra_actions end where id=a.id;
 end if;
 if decision.kind='death' then
  if a.character_id is null or bs.active_token_id<>a.id or (s->>'hp_current')::integer<>0 or coalesce((s->>'death_failures')::integer,0)>=3 or s->'conditions' ?| array['Estável','Morto','Dead'] then
   update public.battle_decisions set status='cancelled',answered_at=now() where id=decision.id returning * into decision;perform set_config('battle39.physical','false',true);return decision;end if;
  d=private.battle37_record(q,a.id,'1d20',decision.mode,p_client_id);
  natural_roll=(select (term->>'subtotal')::integer from jsonb_array_elements(d.terms) term where (term->>'sides')::integer=20 limit 1);
  total=coalesce((s->>'death_successes')::integer,0);amount=coalesce((s->>'death_failures')::integer,0);
  if natural_roll=20 then
   update public.characters set system_data=system_data||'{"hp_current":1,"death_successes":0,"death_failures":0}' where id=a.character_id;
   total=0;amount=0;answer_result=jsonb_build_object('life_state','revived','message','20 natural: você recuperou 1 PV. Continua caído até se levantar.');
  else
   if natural_roll>=10 then total=least(3,total+1);else amount=least(3,amount+case when natural_roll=1 then 2 else 1 end);end if;
   select system_data into s from public.characters where id=a.character_id for update;
   s=s||jsonb_build_object('death_successes',case when total>=3 then 0 else total end,'death_failures',case when total>=3 then 0 else amount end);
   if total>=3 then s=jsonb_set(s,'{conditions}',coalesce(s->'conditions','[]')||'["Estável"]');end if;
   update public.characters set system_data=s where id=a.character_id;
   answer_result=jsonb_build_object('life_state',case when amount>=3 then 'dead' when total>=3 then 'stable' else 'dying' end,'message',case when amount>=3 then 'Três falhas: o personagem morreu.' when total>=3 then 'Você está estável, com 0 PV e inconsciente. As contagens foram zeradas.' when natural_roll=1 then '1 natural: duas falhas contra a morte.' when natural_roll>=10 then 'Um sucesso contra a morte.' else 'Uma falha contra a morte.' end);
  end if;
  answer_result=answer_result||jsonb_build_object('passed',natural_roll>=10,'natural',natural_roll,'roll',to_jsonb(d),'death_successes',total,'death_failures',amount);
 elsif decision.kind='choice' then
  choice=p_answer->>'choice';
  if choice is null or not exists(select 1 from jsonb_array_elements(decision.options->'choices') o where o->>'id'=choice) then raise exception 'Escolha uma das opções apresentadas.';end if;
  answer_result=jsonb_build_object('choice',choice);
 elsif decision.kind in('attack','save','concentration','condition') then
  if decision.kind in('save','concentration','condition') and decision.ability in('str','dex') and coalesce(s->'conditions','[]') ?| array['Inconsciente','Atordoado','Paralisado','Petrificado'] then
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
   for check_row in select * from public.battle_decisions where request_id=q.id and kind='attack' and (coalesce((battle_decisions.result->>'hit')::boolean,false) or coalesce((e->>'missHalf')::boolean,false)) order by sequence loop
    target_id=coalesce((e->'attackTargets'->>(check_row.sequence-1))::uuid,g.target_ids[1+(check_row.sequence-1)%greatest(1,cardinality(g.target_ids))]);
    select * into target from public.battle_map_tokens where id=target_id;
    part_effect=case when coalesce((check_row.result->>'critical')::boolean,false) then private.battle37_critical(e,s,q.kind='weapon') else e end;
    if checked>0 and coalesce((e->>'onceBonus')::integer,0)<>0 then part_effect=part_effect||jsonb_build_object('dice',(part_effect->>'dice')||case when (e->>'onceBonus')::integer>0 then '-' else '+' end||abs((e->>'onceBonus')::integer));end if;
    d=private.battle37_record(q,a.id,part_effect->>'dice','normal',case when checked=0 then p_client_id else gen_random_uuid() end,part_effect);checked=checked+1;rolls=rolls||jsonb_build_array(to_jsonb(d));
    if not coalesce((check_row.result->>'hit')::boolean,false) then part_effect=part_effect||jsonb_build_object('halfOnSave',true);end if;
    detail=jsonb_build_object('damage_parts',private.dnd_roll_damage_parts(d.terms,part_effect->'damageParts'));
    amount=private.dnd_damage_amount(target,private.battle_sheet(target.id),part_effect,greatest(0,d.total),not coalesce((check_row.result->>'hit')::boolean,false),detail);
    damage_events=damage_events||jsonb_build_array(jsonb_build_object('token_id',target_id,'amount',amount,'sequence',checked));
    targets=targets||jsonb_build_object(target_id::text,jsonb_build_object('amount',coalesce((targets->target_id::text->>'amount')::integer,0)+amount,'death_events',coalesce(targets->target_id::text->'death_events','[]')||jsonb_build_array(jsonb_build_object('amount',amount,'critical',coalesce((check_row.result->>'critical')::boolean,false)))));
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
  update public.battle_action_requests set resolution=resolution||jsonb_build_object('critical',exists(select 1 from public.battle_decisions where request_id=q.id and kind='attack' and coalesce((result->>'critical')::boolean,false))) where id=q.id returning * into q;
  if coalesce((private.battle_sheet(a.id)->>'hp_current')::integer,0)<=0 then update public.battle_spell_effects set active=false where token_id=a.id and concentration and active;end if;
  if q.status not in('success','failure') then raise exception 'A tentativa não pode ser concluída neste turno.';end if;
  update public.battle_action_requests set resolution=resolution||jsonb_build_object('guided',true,'dice_rolls',rolls,'dice_roll',to_jsonb(d),'dice_roll_id',d.id,'dice',d.expression,'message','Rolagens e recursos aplicados. Confira os resultados por alvo.') where id=q.id returning * into q;
  -- Concentration checks include absorbed temporary HP damage, and stop automatically at zero HP.
  if jsonb_array_length(damage_events)=0 then select coalesce(jsonb_agg(jsonb_build_object('token_id',ae.token_id,'amount',ae.amount,'sequence',0)),'[]') into damage_events from public.battle_action_effects ae where ae.request_id=q.id and ae.kind='damage';end if;
  for outcome in select value from jsonb_array_elements(damage_events) where (value->>'amount')::integer>0 loop
   target_id=(outcome->>'token_id')::uuid;
   if coalesce((select concentration_checks from public.campaign_rules where campaign_id=q.campaign_id),true) and coalesce((private.battle_sheet(target_id)->>'hp_current')::integer,0)>0 and exists(select 1 from public.battle_spell_effects where token_id=target_id and active and concentration) then
    perform private.battle37_add_decision(q,target_id,'concentration',coalesce((outcome->>'sequence')::integer,0),'Manter concentração','con',greatest(10,(outcome->>'amount')::integer/2),private.dnd37_save_bonus(target_id,'con'),'normal',jsonb_build_object('effect_ids',(select jsonb_agg(id::text) from public.battle_spell_effects where token_id=target_id and active and concentration)));
   end if;
  end loop;
  update public.battle_action_requests set resolution=resolution||jsonb_build_object('awaiting_concentration',exists(select 1 from public.battle_decisions where request_id=q.id and kind='concentration' and status='pending')) where id=q.id;
  answer_result=jsonb_build_object('roll',to_jsonb(d),'rolls',rolls,'message','Efeito aplicado aos alvos.');
 end if;
 if decision.kind='condition' and decision.options->>'condition_id' is not null then
  update private.battle_condition_effects set active=not coalesce((answer_result->>'passed')::boolean,false) where id=(decision.options->>'condition_id')::uuid;
 end if;
 update public.battle_decisions set status='answered',result=answer_result,answered_by=auth.uid(),client_id=p_client_id,answered_at=now() where id=decision.id returning * into decision;
 if coalesce(decision.options->>'dice_mode','program')='physical' and decision.kind<>'choice' and current_setting('battle39.roll_index',true)::integer<>jsonb_array_length(p_answer->'rolls') then raise exception 'A quantidade de rolagens físicas não corresponde aos dados desta etapa.';end if;
 perform set_config('battle39.physical','false',true);
 if decision.kind in('attack','save') then update public.battle_action_requests set resolution=resolution||'{"checks_started":true}'::jsonb where id=q.id and status='pending';end if;
 if decision.kind in('choice','attack','save') then perform private.battle37_next(q.id);
 elsif decision.kind='concentration' and not exists(select 1 from public.battle_decisions where request_id=q.id and kind='concentration' and status='pending') then update public.battle_action_requests set resolution=resolution||'{"awaiting_concentration":false}'::jsonb where id=q.id;end if;
 return decision;
end $$;

create or replace function private.battle_apply_hp_v11(r public.battle_action_requests,a public.battle_map_tokens,e jsonb,opts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens; m public.battle_maps; target jsonb; sheet jsonb; amount integer; roll integer;
 hp integer; maxhp integer; temp integer; afterhp integer; aftertemp integer; saved boolean; multiplier numeric; override jsonb; kind text=e->>'kind';
 condition_row private.battle_condition_effects;source_request public.battle_action_requests;ids uuid[]; total integer=0; total_amount integer=0; applied jsonb='[]'; target_opts jsonb; minimum integer;
begin
 select * into m from public.battle_maps where id=r.map_id;
 target=r.target; roll=private.battle_roll(coalesce(opts->>'dice',e->>'dice',''));
 ids=case when opts ? 'target_ids' then array(select distinct value::uuid from jsonb_array_elements_text(opts->'target_ids')) else r.target_ids end;
 if cardinality(ids)>200 then raise exception 'Quantidade de alvos inválida.'; end if;
 if exists(select 1 from unnest(ids) i where not exists(select 1 from public.battle_map_tokens where id=i and map_id=r.map_id)) then raise exception 'Alvo de outra mesa não pode ser afetado.'; end if;
 for t in select * from public.battle_map_tokens q where q.map_id=r.map_id and
  ((coalesce((e->>'selective')::boolean,false) or e->>'shape'='single' or opts ? 'target_ids') and q.id=any(ids) or
   not coalesce((e->>'selective')::boolean,false) and e->>'shape'<>'single' and not(opts ? 'target_ids') and private.battle_in_effect(q,a,target,e,m.scale_per_cell*case when m.scale_unit='ft' then 0.3 else 1 end)) order by q.id for update loop
  if t.character_id is not null then perform 1 from public.characters where id=t.character_id for update;
  else perform 1 from public.npc_stats where npc_id=t.npc_id for update; end if;
  sheet=private.battle_sheet(t.id); if sheet is null then continue; end if;
  target_opts=coalesce(opts->'targets'->t.id::text,'{}'); saved=coalesce((target_opts->>'saved')::boolean,false);
  multiplier=coalesce((target_opts->>'multiplier')::numeric,1);
  if multiplier not in(0,0.5,1,2) then raise exception 'Multiplicador inválido.'; end if;
  amount=greatest(0,least(100000,coalesce((target_opts->>'amount')::integer,floor(floor(roll*case when saved then case when coalesce((e->>'halfOnSave')::boolean,false) then 0.5 else 0 end else 1 end)*multiplier)::integer)));
  if kind='damage' and not(target_opts ? 'amount') then amount=greatest(0,least(100000,floor(private.dnd_damage_amount(t,sheet,e,roll,saved,opts)*multiplier)::integer));end if;
  hp=coalesce((sheet->>'hp_current')::integer,0); maxhp=private.battle_hp_max(sheet); temp=coalesce((sheet->>'hp_temp')::integer,0);
  if coalesce((e->>'restoreFull')::boolean,false) and kind='healing' then amount=greatest(0,maxhp-hp); end if;
  if kind='healing' and (sheet->'conditions' ?| array['Cura bloqueada','Morto','Dead'] or coalesce((sheet->>'death_failures')::integer,0)>=3) then amount=0;end if;
  total_amount=total_amount+amount;
  if e ? 'pool' and total_amount>(e->>'pool')::integer then raise exception 'A cura distribuída supera a reserva de % PV.',e->>'pool'; end if;
  afterhp=hp; aftertemp=temp;
  if kind='damage' then aftertemp=greatest(0,temp-amount); afterhp=greatest(0,hp-greatest(0,amount-temp));
   if r.kind='spell' and r.name='Doença Plena' then afterhp=greatest(1,afterhp); end if;
  elsif kind='healing' then afterhp=least(maxhp,hp+amount);
  elsif kind='temporary' then aftertemp=greatest(temp,amount);
  else continue; end if;
  if t.character_id is not null then
   perform 1 from public.characters where id=t.character_id for update;
   -- Read again after locking so concurrent sheet saves cannot lose HP changes.
   sheet=private.battle_sheet(t.id); hp=coalesce((sheet->>'hp_current')::integer,0); temp=coalesce((sheet->>'hp_temp')::integer,0); maxhp=private.battle_hp_max(sheet);
   afterhp=case kind when 'damage' then greatest(case when r.name='Doença Plena' then 1 else 0 end,hp-greatest(0,amount-temp)) when 'healing' then least(maxhp,hp+amount) else hp end;
   aftertemp=case kind when 'damage' then greatest(0,temp-amount) when 'temporary' then greatest(temp,amount) else temp end;
   update public.characters set system_data=system_data||case when kind='damage' then private.battle40_damage_state(sheet,amount,temp,coalesce(target_opts->'death_events',jsonb_build_array(jsonb_build_object('amount',amount,'critical',coalesce((opts->>'critical')::boolean,false)))),maxhp) else '{}'::jsonb end||jsonb_build_object('hp_current',afterhp,'hp_temp',aftertemp) where id=t.character_id;
  else
   select hp_current,hp_max,hp_temp into hp,maxhp,temp from public.npc_stats where npc_id=t.npc_id for update;
   afterhp=case kind when 'damage' then greatest(case when r.name='Doença Plena' then 1 else 0 end,hp-greatest(0,amount-temp)) when 'healing' then least(maxhp,hp+amount) else hp end;
   aftertemp=case kind when 'damage' then greatest(0,temp-amount) when 'temporary' then greatest(temp,amount) else temp end;
   update public.npc_stats set hp_current=afterhp,hp_temp=aftertemp where npc_id=t.npc_id;
   update public.npcs set updated_at=now() where id=t.npc_id;
  end if;
  insert into public.battle_action_effects(request_id,campaign_id,token_id,kind,amount,hp_before,hp_after,temp_before,temp_after,saved)
  values(r.id,r.campaign_id,t.id,kind,amount,hp,afterhp,temp,aftertemp,saved);
  if t.visible or t.controlled_by=r.requested_by or exists(select 1 from public.characters where id=t.character_id and owner_id=r.requested_by) or exists(select 1 from public.campaigns where id=r.campaign_id and owner_id=r.requested_by) then applied=applied||jsonb_build_array(jsonb_build_object('token_id',t.id,'name',t.name,'amount',case kind when 'healing' then afterhp-hp when 'temporary' then aftertemp-temp else amount end,'kind',kind,'saved',saved)); end if;
  total=total+1;
  if kind='damage' and amount>0 then
   update private.battle_condition_effects c set active=false from public.battle_action_requests src where src.id=c.request_id and c.token_id=t.id and c.active and src.definition->'entry'->>'catalog_id'='padrao-hipnotico';
   for condition_row in select c.* from private.battle_condition_effects c join public.battle_action_requests src on src.id=c.request_id where c.token_id=t.id and c.active and src.definition->'entry'->>'catalog_id'='riso-histerico-de-tasha' loop
    update private.battle_condition_effects set damage_saves=damage_saves+1 where id=condition_row.id returning * into condition_row;
    select * into source_request from public.battle_action_requests where id=condition_row.request_id;
    perform private.battle37_add_decision(source_request,t.id,'condition',-condition_row.damage_saves,source_request.name||' · salvaguarda após dano',condition_row.ability,condition_row.dc,private.dnd37_save_bonus(t.id,condition_row.ability),'advantage',jsonb_build_object('condition_id',condition_row.id,'damage_trigger',true));
   end loop;
   update public.battle_map_tokens set rage_activity_at=case when raging then now() else rage_activity_at end where id=t.id;
   if t.character_id is not null then update public.characters set system_data=jsonb_set(system_data,'{conditions}',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(system_data->'conditions','[]')) v where v<>'Estável'),'[]')) where id=t.character_id;end if;
  end if;
  if kind='healing' and hp=0 and afterhp>0 and t.character_id is not null then
   update public.characters set system_data=system_data||jsonb_build_object('death_successes',0,'death_failures',0,'conditions',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(system_data->'conditions','[]')) v where v not in('Estável','Inconsciente')),'[]')) where id=t.character_id;
  end if;
  if afterhp=0 then update public.battle_spell_effects set active=false where token_id=t.id and concentration and active;update public.battle_map_tokens set raging=false where id=t.id;end if;
 end loop;
 if e ? 'pool' and kind='healing' and total_amount=0 then raise exception 'Distribua a reserva de cura nos valores finais dos alvos antes de aprovar.'; end if;
 if kind='damage' and coalesce((e->>'lifeSteal')::numeric,0)>0 then
  if a.character_id is not null then perform 1 from public.characters where id=a.character_id for update;
  else perform 1 from public.npc_stats where npc_id=a.npc_id for update; end if;
  sheet=private.battle_sheet(a.id); hp=(sheet->>'hp_current')::integer; maxhp=private.battle_hp_max(sheet); temp=coalesce((sheet->>'hp_temp')::integer,0);
  amount=floor(total_amount*(e->>'lifeSteal')::numeric)::integer; afterhp=least(maxhp,hp+amount);
  if a.character_id is not null then update public.characters set system_data=system_data||jsonb_build_object('hp_current',afterhp) where id=a.character_id;
  else update public.npc_stats set hp_current=afterhp where npc_id=a.npc_id; update public.npcs set updated_at=now() where id=a.npc_id; end if;
  insert into public.battle_action_effects(request_id,campaign_id,token_id,kind,amount,hp_before,hp_after,temp_before,temp_after,saved) values(r.id,r.campaign_id,a.id,'healing',amount,hp,afterhp,temp,temp,false);
  applied=applied||jsonb_build_array(jsonb_build_object('token_id',a.id,'name',a.name,'kind','healing','amount',afterhp-hp,'saved',false));
 end if;
 if kind='healing' and r.kind='spell' and r.spell_level>0 and exists(select 1 from jsonb_array_elements(applied) v where v->>'token_id'<>a.id::text and (v->>'amount')::integer>0) then
  sheet=private.battle_sheet(a.id);
  if exists(select 1 from jsonb_array_elements(private.dnd_levels(sheet)) c where c->>'class_id'='cleric' and c->>'subclass_id'='life' and (c->>'level')::integer>=6) then
   hp=(sheet->>'hp_current')::integer;maxhp=private.battle_hp_max(sheet);afterhp=least(maxhp,hp+2+r.resource_level);temp=coalesce((sheet->>'hp_temp')::integer,0);
   update public.characters set system_data=system_data||jsonb_build_object('hp_current',afterhp) where id=a.character_id;
   insert into public.battle_action_effects(request_id,campaign_id,token_id,kind,amount,hp_before,hp_after,temp_before,temp_after,saved) values(r.id,r.campaign_id,a.id,'healing',afterhp-hp,hp,afterhp,temp,temp,false);
   applied=applied||jsonb_build_array(jsonb_build_object('token_id',a.id,'name',a.name,'kind','healing','amount',afterhp-hp,'saved',false));
  end if;
 end if;
 return jsonb_build_object('roll',roll,'affected',applied,'count',jsonb_array_length(applied));
end $$;

create or replace function private.validate_atlas_document(d jsonb) returns void language plpgsql immutable set search_path='' as $$
declare
 required_keys text[] := array['schema','title','notes','template','seed','width','height','theme','palette','terrain','elevation','baseTerrain','layers','objects','grid','gridColor','gridOpacity','relief','compass','scaleBar','unit','distancePerCell'];
 base_keys text[] := array['id','kind','name','x','y','rotation','opacity','visible','locked'];
 extra_keys text[];
 k text;
 v jsonb;
 o jsonb;
 p jsonb;
 n integer;
 point_count integer:=0;
begin
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>2000000 then raise exception 'Documento de mapa inválido ou maior que 2 MB.';end if;
 if not d ?& required_keys or d-required_keys<>'{}'::jsonb then raise exception 'Estrutura de mapa inválida.';end if;
 if d->'schema'<>'1'::jsonb then raise exception 'Versão de mapa incompatível.';end if;
 foreach k in array array['title','notes','template','seed','theme','grid','unit'] loop
  if jsonb_typeof(d->k)<>'string' then raise exception 'Campo de mapa inválido: %.',k;end if;
 end loop;
 if length(trim(d->>'title')) not between 1 and 120 or length(d->>'notes')>12000 or length(d->>'seed')>80 then raise exception 'Nome ou notas do mapa inválidos.';end if;
 if d->>'template' not in ('blank','island','archipelago','continent','valley','city','dungeon','desert')
  or d->>'theme' not in ('parchment','natural','night','blueprint') or d->>'grid' not in ('none','square','hex') or d->>'unit' not in ('km','m','mi') then raise exception 'Opção de mapa inválida.';end if;
 if not private.atlas_number(d->'width',320,4096,true) or not private.atlas_number(d->'height',320,4096,true)
  or not private.atlas_number(d->'baseTerrain',0,21,true) or not private.atlas_number(d->'distancePerCell',0.01,10000)
  or not private.atlas_number(d->'gridOpacity',0,0.8) or not private.atlas_color(d->'gridColor') then raise exception 'Tamanho, escala ou cor de mapa inválidos.';end if;
 foreach k in array array['relief','compass','scaleBar'] loop if jsonb_typeof(d->k)<>'boolean' then raise exception 'Preferência de mapa inválida.';end if;end loop;
 foreach k in array array['palette','terrain','elevation','layers','objects'] loop if jsonb_typeof(d->k)<>'array' then raise exception 'Coleção de mapa inválida: %.',k;end if;end loop;
 n=ceil((d->>'width')::numeric/16)::integer*ceil((d->>'height')::numeric/16)::integer;
 if jsonb_array_length(d->'palette')<>22 or exists(select 1 from jsonb_array_elements(d->'palette') a where not private.atlas_color(a)) then raise exception 'Paleta de mapa inválida.';end if;
 if jsonb_array_length(d->'terrain')<>n or jsonb_array_length(d->'elevation')<>n then raise exception 'A malha de terreno não corresponde ao tamanho do mapa.';end if;
 if exists(select 1 from jsonb_array_elements(d->'terrain') a where not private.atlas_number(a,0,21,true))
  or exists(select 1 from jsonb_array_elements(d->'elevation') a where not private.atlas_number(a,0,5,true)) then raise exception 'Dados de terreno ou relevo inválidos.';end if;
 if jsonb_array_length(d->'layers')<>6 then raise exception 'Camadas de mapa inválidas.';end if;
 if (select count(distinct a->>'id') from jsonb_array_elements(d->'layers') a)<>6 then raise exception 'Camadas repetidas no mapa.';end if;
 for v in select * from jsonb_array_elements(d->'layers') loop
  if jsonb_typeof(v)<>'object' or not v ?& array['id','visible','locked','opacity'] or v-array['id','visible','locked','opacity']<>'{}'::jsonb
   or coalesce(v->>'id','') not in ('terrain','regions','routes','symbols','tokens','labels') or jsonb_typeof(v->'visible')<>'boolean' or jsonb_typeof(v->'locked')<>'boolean' or not private.atlas_number(v->'opacity',0,1) then raise exception 'Camada de mapa inválida.';end if;
 end loop;
 if jsonb_array_length(d->'objects')>1800 then raise exception 'Limite de 1.800 elementos por mapa.';end if;
 if (select count(distinct a->>'id') from jsonb_array_elements(d->'objects') a)<>jsonb_array_length(d->'objects') then raise exception 'Elementos repetidos no mapa.';end if;
 for o in select * from jsonb_array_elements(d->'objects') loop
  if jsonb_typeof(o)<>'object' or not o ?& base_keys then raise exception 'Elemento de mapa inválido.';end if;
  if jsonb_typeof(o->'id')<>'string' or (o->>'id') !~ '^[a-zA-Z0-9_-]{1,80}$' or jsonb_typeof(o->'name')<>'string' or length(o->>'name')>120
   or not private.atlas_number(o->'x',0,(d->>'width')::numeric) or not private.atlas_number(o->'y',0,(d->>'height')::numeric)
   or not private.atlas_number(o->'rotation',-360,360) or not private.atlas_number(o->'opacity',0,1)
   or jsonb_typeof(o->'visible')<>'boolean' or jsonb_typeof(o->'locked')<>'boolean' then raise exception 'Posição ou propriedade de elemento inválida.';end if;
  case o->>'kind'
   when 'symbol' then
    extra_keys=array['symbol','size','color'];
    if coalesce(o->>'symbol','') not in ('mountain','snowpeak','ridge','volcano','hill','rock','pine','tree','forest','palm','dead-tree','crystal','cactus','city','village','castle','tower','temple','ruin','harbor','lighthouse','house','windmill','farm','bridge','gate','wall','well','fountain','camp','cave','mine','dungeon','graveyard','shrine','obelisk','portal','ship','wreck','chest','skull','flag','fire','door','stairs','trap','altar','waterfall','reeds','mushroom','glacier','dunes','fort','tavern','blacksmith','market','prison','hut','dock','stone-circle','statue','barricade','barrel','crate','table','bed','bookshelf','torch')
     or not private.atlas_number(o->'size',8,512) or not private.atlas_color(o->'color') then raise exception 'Símbolo de mapa inválido.';end if;
   when 'token' then
    extra_keys=array['icon','size','color','faction','number'];
    if coalesce(o->>'icon','') not in ('warrior','mage','rogue','cleric','ranger','druid','beast','dragon','goblin','undead','boss','party','barbarian','bard','monk','paladin','sorcerer','warlock','wolf','spider','giant','ooze','construct','demon')
     or coalesce(o->>'faction','') not in ('neutral','ally','enemy') or not private.atlas_number(o->'size',16,256)
     or not private.atlas_number(o->'number',0,999,true) or not private.atlas_color(o->'color') then raise exception 'Token de mapa inválido.';end if;
   when 'label' then
    extra_keys=array['text','fontSize','color','font','italic'];
    if jsonb_typeof(o->'text')<>'string' or length(o->>'text') not between 1 and 300 or not private.atlas_number(o->'fontSize',8,144)
     or coalesce(o->>'font','') not in ('serif','sans') or jsonb_typeof(o->'italic')<>'boolean' or not private.atlas_color(o->'color') then raise exception 'Texto de mapa inválido.';end if;
   when 'route' then
    extra_keys=array['points','color','width','style','curved'];
    if coalesce(o->>'style','') not in ('road','trail','river','border','wall','arrow') or jsonb_typeof(o->'curved')<>'boolean'
     or not private.atlas_number(o->'width',1,64) or not private.atlas_color(o->'color') then raise exception 'Rota de mapa inválida.';end if;
   when 'region' then
    extra_keys=array['points','color','fill','width','fillOpacity'];
    if not private.atlas_color(o->'color') or not private.atlas_color(o->'fill') or not private.atlas_number(o->'width',1,32) or not private.atlas_number(o->'fillOpacity',0,1) then raise exception 'Região de mapa inválida.';end if;
   else raise exception 'Tipo de elemento desconhecido.';
  end case;
  if not o ?& extra_keys or o-base_keys-extra_keys<>'{}'::jsonb then raise exception 'Estrutura de elemento inválida.';end if;
  if o->>'kind' in ('route','region') then
   if jsonb_typeof(o->'points')<>'array' then raise exception 'Pontos de rota inválidos.';end if;
   point_count=point_count+jsonb_array_length(o->'points');
   if point_count>20000 then raise exception 'Limite de 20.000 pontos de rotas e regiões por mapa.';end if;
   if jsonb_array_length(o->'points') not between (case when o->>'kind'='route' then 2 else 3 end) and 300 then raise exception 'Quantidade de pontos inválida.';end if;
   for p in select * from jsonb_array_elements(o->'points') loop
    if jsonb_typeof(p)<>'object' or not p ?& array['x','y'] or p-array['x','y']<>'{}'::jsonb or not private.atlas_number(p->'x',-8192,8192) or not private.atlas_number(p->'y',-8192,8192) then raise exception 'Ponto de rota inválido.';end if;
   end loop;
  end if;
 end loop;
end;
$$;

create or replace function private.battle39_decision_options() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.campaign_rules;t public.battle_map_tokens;q public.battle_action_requests;mode text;
begin
 select * into r from public.campaign_rules where campaign_id=new.campaign_id;select * into t from public.battle_map_tokens where id=new.token_id;select * into q from public.battle_action_requests where id=new.request_id;
 if tg_op='INSERT' then
  mode=case when t.npc_id is not null and coalesce(r.npc_dice_mode,'inherit')<>'inherit' then r.npc_dice_mode else coalesce(r.combat_dice_mode,'program') end;
  new.options=new.options||jsonb_build_object('dice_mode',mode,'animate',coalesce(r.combat_dice_animation,true),'show_dc',coalesce(r.show_save_dc,true) or t.npc_id is not null,'dc_source',case when new.kind='death' then 'Salvaguarda contra a morte: d20, CD 10, sem atributo ou proficiência. 1 natural: duas falhas. 20 natural: recupera 1 PV.' when new.kind='concentration' then 'Concentração: maior entre 10 e metade do dano.' when q.kind='spell' then 'CD do conjurador: 8 + proficiência + atributo da origem da magia.' else 'CD definida pelo efeito.' end);
 end if;
 new.options=new.options||jsonb_build_object('roll_plan',private.battle39_plan(new));return new;
end $$;

create or replace function public.battle_combat_update(p_map_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('map_id',p_map_id,'lifeStates',public.list_battle_life((select campaign_id from public.battle_maps where id=p_map_id),p_map_id),'conditionEffects',public.list_battle_conditions((select campaign_id from public.battle_maps where id=p_map_id)),
 'sessions',coalesce((select jsonb_agg(s) from public.battle_sessions s where s.id=(select battle_session_id from public.battle_maps where id=p_map_id)),'[]'),
 'tokens',coalesce((select jsonb_agg(t) from public.battle_map_tokens t where t.map_id=p_map_id),'[]'),
 'actions',coalesce((select jsonb_agg(q) from (select r.* from public.battle_action_requests r where map_id=p_map_id order by created_at desc,id limit 80) q),'[]'),
 'decisions',coalesce((select jsonb_agg(d) from public.battle_decisions d where status='pending' and session_id=(select battle_session_id from public.battle_maps where id=p_map_id)),'[]'),
 'movementPlans',coalesce((select jsonb_agg(p) from public.battle_movement_plans p where status='pending' and session_id=(select battle_session_id from public.battle_maps where id=p_map_id)),'[]'),
 'spellEffects',coalesce((select jsonb_agg(e) from public.battle_spell_effects e where map_id=p_map_id and active),'[]'))
$$;

update public.characters set system_data=system_data where system_data->>'hp_current'='0';
do $$ declare s public.battle_sessions;begin for s in select * from public.battle_sessions where status='active' loop perform private.battle40_ensure_death(s);end loop;end $$;

commit;

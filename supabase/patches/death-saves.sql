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

create or replace function private.battle38_controls(p_token uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.battle_map_tokens t left join public.characters c on c.id=t.character_id
 where t.id=p_token and private.can_read_campaign(t.campaign_id) and
 case when t.npc_id is not null then private.is_campaign_owner(t.campaign_id)
 else c.owner_id=auth.uid() and not private.is_campaign_owner(t.campaign_id) end)
$$;
revoke all on function private.battle38_controls(uuid) from public,anon;
grant execute on function private.battle38_controls(uuid) to authenticated;
drop policy if exists battle_decisions_read on public.battle_decisions;
create policy battle_decisions_read on public.battle_decisions for select to authenticated using(private.battle38_controls(token_id));

-- Invoker reads keep every existing RLS boundary, including hidden tokens and private decisions.
create or replace function public.battle_combat_update(p_map_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('map_id',p_map_id,
 'sessions',coalesce((select jsonb_agg(s) from public.battle_sessions s where s.id=(select battle_session_id from public.battle_maps where id=p_map_id)),'[]'),
 'tokens',coalesce((select jsonb_agg(t) from public.battle_map_tokens t where t.map_id=p_map_id),'[]'),
 'actions',coalesce((select jsonb_agg(q) from (select r.* from public.battle_action_requests r where map_id=p_map_id order by created_at desc,id limit 80) q),'[]'),
 'decisions',coalesce((select jsonb_agg(d) from public.battle_decisions d where status='pending' and session_id=(select battle_session_id from public.battle_maps where id=p_map_id)),'[]'),
 'movementPlans',coalesce((select jsonb_agg(p) from public.battle_movement_plans p where status='pending' and session_id=(select battle_session_id from public.battle_maps where id=p_map_id)),'[]'),
 'spellEffects',coalesce((select jsonb_agg(e) from public.battle_spell_effects e where map_id=p_map_id and active),'[]'))
$$;
create or replace function public.perform_battle_action(p_token_id uuid,p_payload jsonb,p_client_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare q public.battle_action_requests;
begin
 q=public.request_battle_action(p_token_id,p_payload,p_client_id);
 return public.battle_combat_update(q.map_id)||jsonb_build_object('action',to_jsonb(q));
end $$;
create or replace function public.answer_battle_decision_fast(p_decision_id uuid,p_client_id uuid,p_answer jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d public.battle_decisions;m uuid;
begin
 d=public.answer_battle_decision(p_decision_id,p_client_id,p_answer);
 select map_id into m from public.battle_action_requests where id=d.request_id;
 return public.battle_combat_update(m)||jsonb_build_object('decision',to_jsonb(d));
end $$;
revoke all on function public.battle_combat_update(uuid),public.perform_battle_action(uuid,jsonb,uuid),public.answer_battle_decision_fast(uuid,uuid,jsonb) from public,anon;
grant execute on function public.battle_combat_update(uuid),public.perform_battle_action(uuid,jsonb,uuid),public.answer_battle_decision_fast(uuid,uuid,jsonb) to authenticated;

create or replace function private.battle38_waiting() returns trigger
language plpgsql security definer set search_path='' as $$
declare waiting text;
begin
 select string_agg(distinct case when t.visible and not private.battle_area_hidden(t.map_id,t.x,t.y,t.size,t.size) then t.name else 'Criatura do mestre' end||' · '||case d.kind when 'save' then 'salvaguarda' when 'concentration' then 'concentração' when 'attack' then 'ataque' when 'damage' then 'dano' else 'escolha' end, ', ')
 into waiting from public.battle_decisions d join public.battle_map_tokens t on t.id=d.token_id where d.request_id=new.request_id and d.status='pending';
 update public.battle_action_requests set resolution=resolution||jsonb_build_object('waiting_for',coalesce(waiting,'')) where id=new.request_id;
 return new;
end $$;
revoke all on function private.battle38_waiting() from public,anon,authenticated;
drop trigger if exists battle38_waiting on public.battle_decisions;
create trigger battle38_waiting after insert or update of status on public.battle_decisions for each row execute function private.battle38_waiting();

create or replace function public.finish_battle_turn(p_session_id uuid,p_map_id uuid,p_turn_started_at timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.battle_maps where id=p_map_id and battle_session_id=p_session_id) then raise exception 'Mapa fora deste combate.';end if;
 perform private.battle38_finish(p_session_id,p_turn_started_at);
 return public.battle_combat_update(p_map_id);
end $$;
revoke all on function public.finish_battle_turn(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.finish_battle_turn(uuid,uuid,timestamptz) to authenticated;

create or replace function private.battle38_opportunity_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind='opportunity' and new.status='pending' then perform private.battle38_begin_opportunity(new.id,'{}');end if;
 return new;
end $$;
revoke all on function private.battle38_opportunity_trigger() from public,anon,authenticated;
drop trigger if exists battle38_opportunity on public.battle_action_requests;
create trigger battle38_opportunity after insert on public.battle_action_requests for each row execute function private.battle38_opportunity_trigger();

create or replace function private.battle38_finish(p_session uuid,p_started timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare s public.battle_sessions;
begin
 select * into s from public.battle_sessions where id=p_session for update;
 if auth.uid() is null or s.id is null or not private.can_read_campaign(s.campaign_id) then raise exception 'Você não tem acesso a este combate.' using errcode='42501';end if;
 if p_started is null then raise exception 'Recarregue o turno antes de encerrá-lo.';end if;
 if s.turn_started_at is distinct from p_started then return;end if;
 perform public.advance_battle_turn(s.id);
end $$;
revoke all on function private.battle38_finish(uuid,timestamptz) from public,anon;
grant execute on function private.battle38_finish(uuid,timestamptz) to authenticated;

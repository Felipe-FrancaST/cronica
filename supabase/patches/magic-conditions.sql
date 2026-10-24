create table if not exists private.battle_condition_effects(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.battle_action_requests(id) on delete cascade,
 token_id uuid not null references public.battle_map_tokens(id) on delete cascade,condition text not null,
 expiry_scope text not null default 'round',
 ability text,dc integer,repeat_save text not null default '',expires_round integer,active boolean not null default true,
 damage_saves integer not null default 0,
 created_at timestamptz not null default now(),unique(request_id,token_id,condition)
);
revoke all on private.battle_condition_effects from public,anon,authenticated;
create index if not exists battle_conditions_active_token on private.battle_condition_effects(token_id) where active;
alter table public.battle_decisions drop constraint if exists battle_decisions_kind_check;
alter table public.battle_decisions add constraint battle_decisions_kind_check check(kind in('attack','save','damage','concentration','choice','condition'));
create index if not exists battle_decisions_condition_pending on public.battle_decisions((options->>'condition_id')) where status='pending' and kind='condition';
create or replace function private.battle39_apply_conditions() returns trigger language plpgsql security definer set search_path='' as $$
declare g private.battle_guides;t public.battle_map_tokens;passed boolean;n integer;c uuid;save_ability text;
begin
 if new.status<>'success' or old.status='success' then return new;end if;select * into g from private.battle_guides where request_id=new.id;
 if g.request_id is null or nullif(g.definition->>'condition','') is null and nullif(g.definition->>'effectSave','') is null then return new;end if;
 for t in select * from public.battle_map_tokens where id=any(g.target_ids) loop
  c=null;
  if exists(select 1 from public.battle_decisions where request_id=new.id and kind='attack') and not exists(select 1 from public.battle_decisions where request_id=new.id and kind='attack' and coalesce((result->>'hit')::boolean,false)) then continue;end if;
  select coalesce(bool_or(coalesce((result->>'passed')::boolean,false)),false) into passed from public.battle_decisions where request_id=new.id and token_id=t.id and kind='save';if passed then continue;end if;
  n=coalesce((g.definition->>'conditionRounds')::integer,10);
  if nullif(g.definition->>'condition','') is not null then
   insert into private.battle_condition_effects(request_id,token_id,condition,ability,dc,repeat_save,expiry_scope,expires_round,active)
   values(new.id,t.id,g.definition->>'condition',coalesce(nullif(g.definition->>'effectSave',''),g.definition->>'save'),private.battle39_dc(new.token_id,g.definition->'entry'),coalesce(g.definition->>'repeatSave',''),coalesce(g.definition->>'expiryScope','round'),case when g.definition->>'expiryScope' like 'target_%' then new.round+case when (select position from public.battle_turn_order where session_id=new.session_id and token_id=t.id)<=new.turn_index then 1 else 0 end when n>0 then new.round+n else null end,nullif(g.definition->>'effectSave','') is null)
   on conflict(request_id,token_id,condition) do update set active=excluded.active returning id into c;
  end if;
  save_ability=nullif(g.definition->>'effectSave','');
  if save_ability is not null then perform private.battle37_add_decision(new,t.id,'condition',0,new.name||' · efeito adicional',save_ability,private.battle39_dc(new.token_id,g.definition->'entry'),private.dnd37_save_bonus(t.id,save_ability),'normal',jsonb_build_object('condition_id',c,'post_effect',true,'manual_effect',c is null));end if;
 end loop;return new;
end $$;
drop trigger if exists battle39_apply_conditions on public.battle_action_requests;
create trigger battle39_apply_conditions after update of status on public.battle_action_requests for each row execute function private.battle39_apply_conditions();
create or replace function private.battle39_conditions_public(p_campaign uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'token_id',c.token_id,'condition',c.condition,'label',q.name,'repeat_save',c.repeat_save,'dc',c.dc) order by c.created_at,c.id),'[]') from private.battle_condition_effects c join public.battle_action_requests q on q.id=c.request_id where c.active and q.campaign_id=p_campaign and private.can_read_campaign(p_campaign) and private.can_read_battle_token(c.token_id)
$$;
create or replace function public.list_battle_conditions(p_campaign_id uuid) returns jsonb language sql stable security definer set search_path='' as $$select private.battle39_conditions_public(p_campaign_id)$$;
revoke all on function public.list_battle_conditions(uuid) from public,anon;grant execute on function public.list_battle_conditions(uuid) to authenticated;
create or replace function private.battle39_end_concentration() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.active and not new.active and new.concentration then update private.battle_condition_effects set active=false where request_id=new.request_id;update public.battle_decisions set status='cancelled' where request_id=new.request_id and kind='condition' and status='pending';end if;return new;
end $$;
drop trigger if exists battle39_end_concentration on public.battle_spell_effects;
create trigger battle39_end_concentration after update of active on public.battle_spell_effects for each row execute function private.battle39_end_concentration();
create or replace function private.battle39_condition_turn() returns trigger language plpgsql security definer set search_path='' as $$
declare c private.battle_condition_effects;q public.battle_action_requests;
begin
 if new.status<>'active' then return new;end if;
 if new.turn_started_at is not distinct from old.turn_started_at then return new;end if;
 update private.battle_condition_effects e set active=false from public.battle_action_requests r where r.id=e.request_id and r.session_id=new.id and e.expires_round is not null and e.expires_round<=new.round and ((e.expiry_scope in('round','source_start') and r.token_id=new.active_token_id) or e.expiry_scope='target_start' and e.token_id=new.active_token_id or e.expiry_scope='target_end' and e.token_id=old.active_token_id and e.expires_round<=old.round);
 -- One-round poison ends at the end of the affected creature's next turn.
 update private.battle_condition_effects e set active=false from public.battle_action_requests r where r.id=e.request_id and r.session_id=new.id and e.condition='Envenenado' and e.token_id=old.active_token_id and coalesce((r.definition->>'conditionRounds')::integer,0)=1;
 for c in select e.* from private.battle_condition_effects e join public.battle_action_requests r on r.id=e.request_id where r.session_id=new.id and e.active and e.token_id=old.active_token_id and e.repeat_save='end' loop
  select * into q from public.battle_action_requests where id=c.request_id;
  perform private.battle37_add_decision(q,c.token_id,'condition',new.round*1000+new.turn_index,q.name||' · repetir salvaguarda',c.ability,c.dc,private.dnd37_save_bonus(c.token_id,c.ability),'normal',jsonb_build_object('condition_id',c.id,'repeat_condition',true));
 end loop;return new;
end $$;
drop trigger if exists battle39_condition_turn on public.battle_sessions;
create trigger battle39_condition_turn after update on public.battle_sessions for each row execute function private.battle39_condition_turn();
do $$ declare definition text;begin
 if to_regprocedure('private.battle_sheet_v38(uuid)') is null then select pg_get_functiondef('private.battle_sheet(uuid)'::regprocedure) into definition;execute replace(definition,'private.battle_sheet(','private.battle_sheet_v38(');end if;
end $$;
revoke all on function private.battle_sheet_v38(uuid) from public,anon,authenticated;
create or replace function private.battle_sheet(p_token uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb=private.battle_sheet_v38(p_token);conditions jsonb;
begin
 select coalesce(jsonb_agg(distinct value),'[]') into conditions from (select value from jsonb_array_elements_text(coalesce(s->'conditions','[]')) union select condition from private.battle_condition_effects where token_id=p_token and active) c(value);
 return s||jsonb_build_object('conditions',conditions);
end $$;
revoke all on function private.battle_sheet(uuid) from public,anon,authenticated;
create or replace function public.end_battle_condition(p_condition_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.battle_condition_effects;q public.battle_action_requests;t public.battle_map_tokens;cost numeric;
begin
 select * into c from private.battle_condition_effects where id=p_condition_id;select * into q from public.battle_action_requests where id=c.request_id;
 if q.id is null or not private.can_read_campaign(q.campaign_id) then raise exception 'Você não tem acesso a este efeito.' using errcode='42501';end if;
 perform 1 from public.battle_sessions where id=q.session_id for update;select * into c from private.battle_condition_effects where id=p_condition_id for update;
 if not c.active then return private.battle39_conditions_public(q.campaign_id);end if;
 if not private.is_campaign_owner(q.campaign_id) then
  select * into t from public.battle_map_tokens where id=c.token_id for update;
  if c.condition<>'Caído' or not private.battle38_controls(t.id) or not exists(select 1 from public.battle_sessions where id=q.session_id and status='active' and active_token_id=t.id) then raise exception 'Este efeito termina pela salvaguarda ou pela sua fonte.' using errcode='42501';end if;
  cost=t.movement_speed/2;if t.movement_remaining<cost then raise exception 'Levantar exige metade do deslocamento.';end if;
  update public.battle_map_tokens set movement_remaining=movement_remaining-cost where id=t.id;
 end if;
 update private.battle_condition_effects set active=false where id=c.id;update public.battle_decisions set status='cancelled' where status='pending' and options->>'condition_id'=c.id::text;return private.battle39_conditions_public(q.campaign_id);
end $$;
revoke all on function public.end_battle_condition(uuid) from public,anon;grant execute on function public.end_battle_condition(uuid) to authenticated;
revoke all on function private.battle39_apply_conditions(),private.battle39_conditions_public(uuid),private.battle39_end_concentration(),private.battle39_condition_turn() from public,anon,authenticated;

create or replace function private.battle39_consume_attack_condition() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='attack' and new.status='answered' and old.status='pending' then update private.battle_condition_effects set active=false where token_id=new.token_id and condition='Desvantagem no próximo ataque' and active;end if;return new;
end $$;
drop trigger if exists battle39_consume_attack_condition on public.battle_decisions;
create trigger battle39_consume_attack_condition after update of status on public.battle_decisions for each row execute function private.battle39_consume_attack_condition();
revoke all on function private.battle39_consume_attack_condition() from public,anon,authenticated;

create or replace function private.battle39_condition_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.active and not new.active then update public.battle_decisions set status='cancelled' where kind='condition' and status='pending' and options->>'condition_id'=new.id::text;end if;return new;
end $$;
drop trigger if exists battle39_condition_cleanup on private.battle_condition_effects;
create trigger battle39_condition_cleanup after update of active on private.battle_condition_effects for each row execute function private.battle39_condition_cleanup();
revoke all on function private.battle39_condition_cleanup() from public,anon,authenticated;

alter table private.battle_condition_effects add column if not exists escape_attempts integer not null default 0;
create or replace function public.escape_battle_condition(p_condition_id uuid,p_client_id uuid) returns public.battle_decisions language plpgsql security definer set search_path='' as $$
declare c private.battle_condition_effects;q public.battle_action_requests;s public.battle_sessions;t public.battle_map_tokens;d public.battle_decisions;sheet jsonb;modifier integer;mode text;
begin
 select * into c from private.battle_condition_effects where id=p_condition_id;select * into q from public.battle_action_requests where id=c.request_id;
 if p_client_id is null or q.id is null or not private.battle38_controls(c.token_id) then raise exception 'Este efeito pertence a outro participante.' using errcode='42501';end if;
 select * into s from public.battle_sessions where id=q.session_id for update;perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into d from public.battle_decisions where token_id=c.token_id and options->>'escape_client'=p_client_id::text;
 if d.id is not null then return d;end if;
 select * into c from private.battle_condition_effects where id=c.id for update;select * into t from public.battle_map_tokens where id=c.token_id for update;sheet=private.battle_sheet(t.id);
 if not c.active or q.definition->'entry'->>'catalog_id'<>'constricao' or c.condition<>'Impedido' then raise exception 'Este efeito não oferece este teste para escapar.';end if;
 if s.status<>'active' or s.active_token_id<>t.id or coalesce((sheet->>'hp_current')::integer,0)<=0 or sheet->'conditions' ?| array['Incapacitado','Paralisado','Atordoado','Inconsciente','Petrificado'] then raise exception 'Aguarde seu turno e uma condição que permita agir.';end if;
 if t.action_used and coalesce(t.extra_actions,0)<=0 then raise exception 'Escapar exige uma ação disponível.';end if;
 if exists(select 1 from public.battle_decisions where session_id=s.id and status='pending') or exists(select 1 from public.battle_action_requests where session_id=s.id and status in('pending','approved')) then raise exception 'Conclua as rolagens pendentes antes de tentar escapar.';end if;
 update private.battle_condition_effects set escape_attempts=escape_attempts+1 where id=c.id returning * into c;
 modifier=floor(((sheet->'abilities'->>'str')::numeric-10)/2)::integer+case when private.dnd_class_level(sheet,'bard')>=2 then (2+((sheet->>'level')::integer-1)/4)/2 else 0 end;
 mode=case when t.raging then 'advantage' else 'normal' end;
 perform private.battle37_add_decision(q,t.id,'condition',-1000000-c.escape_attempts,'Escapar de Constrição · usa uma ação','str',c.dc,modifier,mode,jsonb_build_object('condition_id',c.id,'escape',true,'ability_check',true,'escape_client',p_client_id));
 select * into d from public.battle_decisions where token_id=t.id and options->>'escape_client'=p_client_id::text;return d;
end $$;
revoke all on function public.escape_battle_condition(uuid,uuid) from public,anon;grant execute on function public.escape_battle_condition(uuid,uuid) to authenticated;

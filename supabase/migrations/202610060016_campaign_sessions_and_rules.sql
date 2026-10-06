-- v15: adventure sessions, immutable archives, presentation-only journal and campaign rules.
begin;

create table public.campaign_sessions (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120),
 number integer not null check(number between 1 and 100000),
 status text not null default 'planned' check(status in('planned','active','ended')),
 summary text not null default '' check(length(summary)<=12000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 started_at timestamptz, ended_at timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 unique(campaign_id,number), unique(id,campaign_id),
 check((status='planned' and started_at is null and ended_at is null) or
       (status='active' and started_at is not null and ended_at is null) or
       (status='ended' and started_at is not null and ended_at is not null and ended_at>=started_at))
);
create unique index campaign_one_active_session on public.campaign_sessions(campaign_id) where status='active';
create index campaign_sessions_order on public.campaign_sessions(campaign_id,number desc);
create table public.campaign_rules (
 campaign_id uuid primary key references public.campaigns(id) on delete cascade,
 party_level integer not null default 1 check(party_level between 1 and 20),
 lock_player_level boolean not null default false,
 players_can_create_characters boolean not null default true,
 players_can_edit_sheets boolean not null default true,
 players_can_end_turn boolean not null default true,
 default_restrict_movement boolean not null default true,
 default_failed_actions_consume boolean not null default true,
 updated_at timestamptz not null default clock_timestamp()
);
insert into public.campaign_rules(campaign_id) select id from public.campaigns;
create table public.campaign_session_events (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 adventure_session_id uuid not null,
 kind text not null,
 title text not null check(length(title) between 1 and 240),
 description text not null default '' check(length(description)<=12000),
 image_path text,
 visibility text not null default 'players' check(visibility in('players','gm')),
 data jsonb not null default '{}' check(jsonb_typeof(data)='object'),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(adventure_session_id,campaign_id) references public.campaign_sessions(id,campaign_id) on delete cascade
);
create index campaign_session_events_recent on public.campaign_session_events(adventure_session_id,created_at desc,id desc);
create index campaign_session_events_image on public.campaign_session_events(image_path) where image_path is not null;
create table private.campaign_session_life (
 session_id uuid not null references public.campaign_sessions(id) on delete cascade,
 entity_id uuid not null, entity_kind text not null, dead boolean not null,
 primary key(session_id,entity_kind,entity_id)
);
revoke all on private.campaign_session_life from public,anon,authenticated;

create function private.can_read_campaign_session(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.campaign_sessions s where s.id=p_id and private.can_read_campaign(s.campaign_id)
  and (private.is_campaign_owner(s.campaign_id) or s.status in('active','ended')));
$$;
revoke all on function private.can_read_campaign_session(uuid) from public,anon;
grant execute on function private.can_read_campaign_session(uuid) to authenticated;
alter table public.campaign_sessions enable row level security;
alter table public.campaign_rules enable row level security;
alter table public.campaign_session_events enable row level security;
revoke all on public.campaign_sessions,public.campaign_rules,public.campaign_session_events from public,anon,authenticated;
grant select on public.campaign_sessions,public.campaign_rules,public.campaign_session_events to authenticated;
create policy adventure_read on public.campaign_sessions for select to authenticated using(private.can_read_campaign_session(id));
create policy campaign_rules_read on public.campaign_rules for select to authenticated using(private.can_read_campaign(campaign_id));
create policy session_events_read on public.campaign_session_events for select to authenticated using(
 private.can_read_campaign_session(adventure_session_id) and (visibility='players' or private.is_campaign_owner(campaign_id)));

alter table public.battle_sessions add column adventure_session_id uuid;
alter table public.battle_maps add column adventure_session_id uuid;
alter table public.campaign_mural_items add column adventure_session_id uuid;
-- Preserve the existing table. An already running encounter continues in an active adventure.
insert into public.campaign_sessions(campaign_id,name,number,created_by,status,started_at)
 select c.id,'Mesa existente',1,c.owner_id,
 case when exists(select 1 from public.battle_sessions b where b.campaign_id=c.id and b.status='active') then 'active' else 'planned' end,
 case when exists(select 1 from public.battle_sessions b where b.campaign_id=c.id and b.status='active') then now() else null end
 from public.campaigns c where exists(select 1 from public.battle_maps m where m.campaign_id=c.id)
 or exists(select 1 from public.campaign_mural_items i where i.campaign_id=c.id)
 or exists(select 1 from public.battle_sessions b where b.campaign_id=c.id);
update public.battle_sessions b set adventure_session_id=s.id from public.campaign_sessions s where s.campaign_id=b.campaign_id;
update public.battle_maps m set adventure_session_id=s.id from public.campaign_sessions s where s.campaign_id=m.campaign_id;
update public.campaign_mural_items i set adventure_session_id=s.id from public.campaign_sessions s where s.campaign_id=i.campaign_id;
do $$ declare t text; begin
 foreach t in array array['battle_sessions','battle_maps','campaign_mural_items'] loop
  execute format('alter table public.%I alter column adventure_session_id set not null',t);
  execute format('alter table public.%I add constraint %I foreign key(adventure_session_id,campaign_id) references public.campaign_sessions(id,campaign_id) on delete cascade',t,t||'_adventure_fk');
  execute format('create index %I on public.%I(adventure_session_id)',t||'_adventure_idx',t);
 end loop;
end $$;
alter table public.battle_sessions add constraint battle_sessions_adventure_context unique(id,campaign_id,adventure_session_id);
alter table public.battle_maps add constraint battle_map_adventure_context foreign key(battle_session_id,campaign_id,adventure_session_id)
 references public.battle_sessions(id,campaign_id,adventure_session_id) on delete cascade;

create function private.adventure_destination(p_campaign uuid,p_session uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.campaign_sessions;
begin
 if not private.is_campaign_owner(p_campaign) then raise exception 'Somente o mestre pode preparar a sessão.' using errcode='42501'; end if;
 perform 1 from public.campaigns where id=p_campaign for update;
 if p_session is not null then select * into s from public.campaign_sessions where id=p_session and campaign_id=p_campaign for share;
 else select * into s from public.campaign_sessions where campaign_id=p_campaign and status<>'ended' order by (status='active') desc,number desc limit 1 for share;
 end if;
 if s.id is null and p_session is null then
  insert into public.campaign_sessions(campaign_id,name,number,created_by) values(p_campaign,'Preparação',
   (select coalesce(max(number),0)+1 from public.campaign_sessions where campaign_id=p_campaign),auth.uid()) returning * into s;
 end if;
 if s.id is null then raise exception 'A sessão não pertence a esta campanha.'; end if;
 if s.status='ended' then raise exception 'Esta sessão está encerrada. Copie o cenário para uma nova sessão.'; end if;
 return s.id;
end $$;
revoke all on function private.adventure_destination(uuid,uuid) from public,anon,authenticated;

create function private.adventure_content_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; sid uuid; cid uuid; state text;
begin
 r=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_table_name in('battle_maps','battle_sessions','campaign_mural_items') then
  cid=(r->>'campaign_id')::uuid;sid=(r->>'adventure_session_id')::uuid;
  if tg_op='INSERT' and sid is null then sid=private.adventure_destination(cid);new.adventure_session_id=sid; end if;
  if tg_op='UPDATE' and (new.adventure_session_id<>old.adventure_session_id or new.campaign_id<>old.campaign_id) then
   raise exception 'O vínculo com a sessão não pode ser alterado.';
  end if;
 elsif tg_table_name='battle_turn_order' then
  select adventure_session_id,campaign_id into sid,cid from public.battle_sessions where id=(r->>'session_id')::uuid;
 else
  select adventure_session_id,campaign_id into sid,cid from public.battle_maps where id=(r->>'map_id')::uuid;
 end if;
 -- Cascading campaign deletion is allowed; individual archive edits are not.
 if cid is not null and exists(select 1 from public.campaigns where id=cid) then
  select status into state from public.campaign_sessions where id=sid for share;
  if state='ended' then
   -- Referential SET NULL after a source sheet is deleted does not alter the archived presentation.
   if tg_table_name='campaign_mural_items' and tg_op='UPDATE' and
    (to_jsonb(new)-array['source_npc_id','source_location_id'])=(to_jsonb(old)-array['source_npc_id','source_location_id'])
    and (r->>'source_npc_id' is null or r->>'source_npc_id'=to_jsonb(old)->>'source_npc_id')
    and (r->>'source_location_id' is null or r->>'source_location_id'=to_jsonb(old)->>'source_location_id') then return new; end if;
   raise exception 'A sessão está encerrada e seu histórico é somente para consulta.';
  end if;
  if tg_table_name='battle_sessions' and tg_op='UPDATE' and r->>'status'='active' and to_jsonb(old)->>'status'<>'active' and state<>'active' then
   raise exception 'Inicie a sessão da aventura antes de iniciar o combate.';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['battle_sessions','battle_maps','battle_map_cells','battle_map_objects','battle_map_fog','battle_map_tokens','battle_turn_order','battle_dice_rolls','campaign_mural_items'] loop
  execute format('create trigger a_adventure_content_guard before insert or update or delete on public.%I for each row execute function private.adventure_content_guard()',t);
 end loop;
end $$;
revoke all on function private.adventure_content_guard() from public,anon,authenticated;

create function private.session_event(p_session uuid,p_kind text,p_title text,p_description text default '',p_visibility text default 'players',p_image text default null,p_data jsonb default '{}')
returns void language plpgsql security definer set search_path='' as $$
declare s public.campaign_sessions;
begin
 select * into s from public.campaign_sessions where id=p_session for share;
 if s.status is distinct from 'active' then return; end if;
 insert into public.campaign_session_events(campaign_id,adventure_session_id,kind,title,description,visibility,image_path,data)
 values(s.campaign_id,s.id,p_kind,left(p_title,240),left(coalesce(p_description,''),12000),p_visibility,p_image,p_data);
end $$;
revoke all on function private.session_event(uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;

create function public.save_campaign_session(p_campaign_id uuid,p_name text,p_number integer,p_session_id uuid default null,p_expected_updated_at timestamptz default null)
returns public.campaign_sessions language plpgsql security definer set search_path='' as $$
declare s public.campaign_sessions;
begin
 if not private.is_campaign_owner(p_campaign_id) then raise exception 'Somente o mestre pode criar ou editar sessões.' using errcode='42501'; end if;
 perform 1 from public.campaigns where id=p_campaign_id for update;
 if p_session_id is null then
  insert into public.campaign_sessions(campaign_id,name,number,created_by) values(p_campaign_id,trim(p_name),p_number,auth.uid()) returning * into s;
 else
  select * into s from public.campaign_sessions where id=p_session_id and campaign_id=p_campaign_id for update;
  if s.id is null or s.status<>'planned' then raise exception 'Somente sessões em preparação podem ser renomeadas.'; end if;
  if s.updated_at is distinct from p_expected_updated_at then raise exception 'A sessão mudou. Atualize a lista.' using errcode='40001'; end if;
  update public.campaign_sessions set name=trim(p_name),number=p_number,updated_at=clock_timestamp() where id=s.id returning * into s;
 end if;
 return s;
end $$;
create function public.start_campaign_session(p_session_id uuid) returns public.campaign_sessions language plpgsql security definer set search_path='' as $$
declare s public.campaign_sessions;
begin
 select * into s from public.campaign_sessions where id=p_session_id;
 if s.id is null or not private.is_campaign_owner(s.campaign_id) then raise exception 'Somente o mestre pode iniciar a sessão.' using errcode='42501'; end if;
 perform 1 from public.campaigns where id=s.campaign_id for update;
 select * into s from public.campaign_sessions where id=p_session_id for update;
 if s.status<>'planned' then raise exception 'Esta sessão já foi iniciada ou encerrada.'; end if;
 if exists(select 1 from public.campaign_sessions where campaign_id=s.campaign_id and status='active') then raise exception 'Encerre a sessão atual antes de iniciar outra.'; end if;
 update public.campaign_sessions set status='active',started_at=clock_timestamp(),updated_at=clock_timestamp() where id=s.id returning * into s;
 perform private.session_event(s.id,'session_started','Sessão '||s.number||' iniciada',s.name);
 insert into private.campaign_session_life(session_id,entity_id,entity_kind,dead)
 select s.id,c.id,'character',((coalesce((c.system_data->>'hp_current')::integer,1)=0 and coalesce((c.system_data->>'death_failures')::integer,0)>=3) or coalesce(c.system_data->'conditions','[]') ?| array['Morto','Dead'])
 from public.characters c where c.campaign_id=s.campaign_id;
 insert into private.campaign_session_life(session_id,entity_id,entity_kind,dead)
 select s.id,n.id,'npc',lower(n.status) in('morto','morta','dead') or coalesce(st.hp_current,1)=0
 from public.npcs n left join public.npc_stats st on st.npc_id=n.id where n.campaign_id=s.campaign_id;
 -- Record the initial scene, including previously prepared cards and maps.
 insert into public.campaign_session_events(campaign_id,adventure_session_id,kind,title,description,visibility,image_path,data)
 select s.campaign_id,s.id,'mural_initial',i.title,i.description,case when i.visible_to_players then 'players' else 'gm' end,i.image_path,jsonb_build_object('mural_item_id',i.id,'kind',i.kind)
 from public.campaign_mural_items i where i.adventure_session_id=s.id;
 perform private.session_event(s.id,'scene_initial','Cenários da sessão','Mapas e Mural vinculados a este capítulo.');
 return s;
end $$;
create function public.end_campaign_session(p_session_id uuid,p_summary text default '') returns public.campaign_sessions language plpgsql security definer set search_path='' as $$
declare s public.campaign_sessions;
begin
 select * into s from public.campaign_sessions where id=p_session_id;
 if s.id is null or not private.is_campaign_owner(s.campaign_id) then raise exception 'Somente o mestre pode encerrar a sessão.' using errcode='42501'; end if;
 perform 1 from public.battle_sessions where adventure_session_id=s.id order by id for update;
 perform 1 from public.campaigns where id=s.campaign_id for update;
 select * into s from public.campaign_sessions where id=p_session_id for update;
 if s.status<>'active' then raise exception 'Esta sessão não está ativa.'; end if;
 update public.battle_sessions set status='ended',active_token_id=null,turn_started_at=null where adventure_session_id=s.id;
 update public.battle_action_requests set status='expired',resolved_at=now() where session_id in(select id from public.battle_sessions where adventure_session_id=s.id) and status in('pending','approved');
 update public.battle_movement_plans set status='cancelled' where session_id in(select id from public.battle_sessions where adventure_session_id=s.id) and status='pending';
 update public.battle_spell_effects set active=false where map_id in(select id from public.battle_maps where adventure_session_id=s.id);
 -- Journal rows contain presentation snapshots and survive cascading token/action cleanup.
 delete from public.battle_map_tokens where map_id in(select id from public.battle_maps where adventure_session_id=s.id);
 perform private.session_event(s.id,'session_ended','Sessão encerrada',p_summary);
 update public.campaign_sessions set status='ended',summary=coalesce(p_summary,''),ended_at=clock_timestamp(),updated_at=clock_timestamp() where id=s.id returning * into s;
 return s;
end $$;
create function public.add_campaign_session_note(p_session_id uuid,p_title text,p_description text,p_image_path text default null,p_visible boolean default true)
returns void language plpgsql security definer set search_path='' as $$
declare s public.campaign_sessions;
begin
 select * into s from public.campaign_sessions where id=p_session_id for share;
 if s.id is null or not private.is_campaign_owner(s.campaign_id) then raise exception 'Somente o mestre pode registrar acontecimentos.' using errcode='42501'; end if;
 if s.status<>'active' then raise exception 'Inicie a sessão antes de registrar um acontecimento.'; end if;
 if length(trim(p_title)) not between 1 and 240 or length(coalesce(p_description,''))>12000 then raise exception 'Confira o título e a descrição.'; end if;
 if not private.mural_image_belongs_to_campaign(s.campaign_id,p_image_path) then raise exception 'Use uma imagem desta campanha.'; end if;
 perform private.session_event(s.id,'note',trim(p_title),p_description,case when p_visible then 'players' else 'gm' end,p_image_path);
end $$;

create or replace function private.can_read_battle_map(p_map uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.battle_maps where id=p_map and private.can_read_campaign_session(adventure_session_id));
$$;
drop policy battle_sessions_read on public.battle_sessions;
create policy battle_sessions_read on public.battle_sessions for select to authenticated using(private.can_read_campaign_session(adventure_session_id));
drop policy battle_maps_read on public.battle_maps;
create policy battle_maps_read on public.battle_maps for select to authenticated using(private.can_read_campaign_session(adventure_session_id));
drop policy mural_read on public.campaign_mural_items;
create policy mural_read on public.campaign_mural_items for select to authenticated using(private.can_read_campaign_session(adventure_session_id) and (private.is_campaign_owner(campaign_id) or visible_to_players));
create or replace function private.can_control_battle_token(p_token uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.battle_map_tokens t join public.battle_maps m on m.id=t.map_id join public.campaign_sessions s on s.id=m.adventure_session_id
 where t.id=p_token and s.status<>'ended' and private.can_read_campaign(t.campaign_id) and
 (private.is_campaign_owner(t.campaign_id) or s.status='active' and (t.controlled_by=auth.uid() or exists(select 1 from public.characters c where c.id=t.character_id and c.owner_id=auth.uid()))));
$$;

create function public.copy_battle_map_to_session(p_map_id uuid,p_session_id uuid,p_name text default null) returns public.battle_maps language plpgsql security definer set search_path='' as $$
declare source public.battle_maps; target public.battle_maps; sid uuid; encounter uuid;
begin
 select * into source from public.battle_maps where id=p_map_id for share;
 if source.id is null or not private.is_campaign_owner(source.campaign_id) then raise exception 'Somente o mestre pode reaproveitar este cenário.' using errcode='42501'; end if;
 sid=private.adventure_destination(source.campaign_id,p_session_id);
 if sid=source.adventure_session_id then raise exception 'Escolha outra sessão para copiar o cenário.'; end if;
 target=public.create_battle_map(source.campaign_id,jsonb_build_object('adventure_session_id',sid,'name',coalesce(nullif(trim(p_name),''),source.name),'width',source.width,'height',source.height,'cell_size',source.cell_size,'scale_per_cell',source.scale_per_cell,'scale_unit',source.scale_unit,'diagonal_rule',source.diagonal_rule,'grid_visible',source.grid_visible,'grid_opacity',source.grid_opacity));
 update public.battle_maps set description=source.description,grid_size=source.grid_size,background_image=source.background_image,background_offset_x=source.background_offset_x,background_offset_y=source.background_offset_y,background_scale=source.background_scale where id=target.id returning * into target;
 insert into public.battle_map_cells(map_id,x,y,z,terrain_type,movement_cost,blocked,metadata)
 select target.id,x,y,z,terrain_type,movement_cost,blocked,metadata from public.battle_map_cells where map_id=source.id;
 insert into public.battle_map_fog(map_id,x,y) select target.id,x,y from public.battle_map_fog where map_id=source.id;
 insert into public.battle_map_objects(map_id,object_type,geometry,z,blocks_movement,blocks_vision,visible,metadata)
 select target.id,object_type,geometry,z,blocks_movement,blocks_vision,visible,metadata from public.battle_map_objects where map_id=source.id order by id;
 perform private.session_event(sid,'map_copied','Cenário reaproveitado: '||target.name,'Estruturas, terreno, imagem e áreas ocultas copiados; posicione os personagens para a nova sessão.','players',source.background_image,jsonb_build_object('map_id',target.id));
 select * into target from public.battle_maps where id=target.id;
 return target;
end $$;
create function public.copy_campaign_mural_to_session(p_source_session uuid,p_target_session uuid) returns integer language plpgsql security definer set search_path='' as $$
declare s public.campaign_sessions; sid uuid; total integer;
begin
 select * into s from public.campaign_sessions where id=p_source_session;
 if s.id is null or not private.is_campaign_owner(s.campaign_id) then raise exception 'Somente o mestre pode copiar este mural.' using errcode='42501'; end if;
 sid=private.adventure_destination(s.campaign_id,p_target_session);
 if sid=s.id then raise exception 'Escolha outra sessão.'; end if;
 if exists(select 1 from public.campaign_mural_items where adventure_session_id=sid) then raise exception 'O Mural de destino deve estar vazio para copiar todos os cartões.'; end if;
 insert into public.campaign_mural_items(campaign_id,adventure_session_id,kind,title,description,image_path,source_location_id,source_npc_id,visible_to_players,pinned,sort_order)
 select campaign_id,sid,kind,title,description,image_path,source_location_id,source_npc_id,visible_to_players,pinned,sort_order from public.campaign_mural_items where adventure_session_id=s.id;
 get diagnostics total=row_count;return total;
end $$;

create function private.can_write_character(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.characters c where c.id=p_id and private.can_edit_character(c.id) and
 (private.is_campaign_owner(c.campaign_id) or coalesce((select players_can_edit_sheets from public.campaign_rules where campaign_id=c.campaign_id),true)));
$$;
create function private.can_create_campaign_character(p_campaign uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_campaign_owner(p_campaign) or private.can_read_campaign(p_campaign) and
 coalesce((select players_can_create_characters and players_can_edit_sheets from public.campaign_rules where campaign_id=p_campaign),true);
$$;
revoke all on function private.can_write_character(uuid),private.can_create_campaign_character(uuid) from public,anon;
grant execute on function private.can_write_character(uuid),private.can_create_campaign_character(uuid) to authenticated;
drop policy characters_create on public.characters;
drop policy characters_edit on public.characters;
drop policy characters_delete on public.characters;
-- save_character uses INSERT ... ON CONFLICT for existing sheets as well.
-- Disabling new characters must still permit an authorized edit of an existing one.
create policy characters_create on public.characters for insert to authenticated with check(private.character_owner_allowed(campaign_id,owner_id) and (private.can_create_campaign_character(campaign_id) or private.can_write_character(id)));
create policy characters_edit on public.characters for update to authenticated using(private.can_write_character(id)) with check(private.can_write_character(id));
create policy characters_delete on public.characters for delete to authenticated using(private.can_write_character(id));
do $$ declare t text; begin
 foreach t in array array['character_attributes','character_skills','character_inventory','character_spells'] loop
  execute format('drop policy child_create on public.%I',t);execute format('drop policy child_edit on public.%I',t);execute format('drop policy child_delete on public.%I',t);
  execute format('create policy child_create on public.%I for insert to authenticated with check(private.can_write_character(character_id))',t);
  execute format('create policy child_edit on public.%I for update to authenticated using(private.can_write_character(character_id)) with check(private.can_write_character(character_id))',t);
  execute format('create policy child_delete on public.%I for delete to authenticated using(private.can_write_character(character_id))',t);
 end loop;
end $$;
create function private.campaign_level_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.campaign_rules;
begin
 select * into r from public.campaign_rules where campaign_id=new.campaign_id;
 if r.lock_player_level and (tg_op='INSERT' or new.system_data->'level' is distinct from old.system_data->'level') and
 (new.system_data->>'level')::integer is distinct from r.party_level then raise exception 'O nível é definido pelo mestre nas regras da campanha.'; end if;
 return new;
end $$;
create trigger a_campaign_level_guard before insert or update of system_data on public.characters for each row execute function private.campaign_level_guard();
revoke all on function private.campaign_level_guard() from public,anon,authenticated;
create function private.session_level_resources(p_sheet jsonb,p_level integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.dnd_spell_progression; slots jsonb='{}'; arcana jsonb='{}'; entry record; maximum integer;
begin
 select * into p from public.dnd_spell_progression where class_id=p_sheet->>'class_id' and subclass_id=coalesce(p_sheet->>'subclass_id','') and level=p_level;
 if p.class_id is null then raise exception 'Classe ou opção de conjuração inválida.';end if;
 for entry in select key,value from jsonb_each(coalesce(p_sheet->'slots_used','{}')) loop
  maximum=coalesce((p.slots->>(entry.key::integer-1))::integer,0);
  if maximum>0 and p.pact_slots=0 then slots=slots||jsonb_build_object(entry.key,least(entry.value::integer,maximum));end if;
 end loop;
 for entry in select key,value from jsonb_each(coalesce(p_sheet->'arcanum_used','{}')) loop
  if entry.key::smallint=any(p.arcanum_levels) then arcana=arcana||jsonb_build_object(entry.key,entry.value);end if;
 end loop;
 return p_sheet||jsonb_build_object('level',p_level,'slots_used',slots,'pact_slots_used',least(coalesce((p_sheet->>'pact_slots_used')::integer,0),p.pact_slots),'arcanum_used',arcana);
end $$;
revoke all on function private.session_level_resources(jsonb,integer) from public,anon,authenticated;
create function public.save_campaign_rules(p_campaign_id uuid,p_rules jsonb,p_expected_updated_at timestamptz default null)
returns public.campaign_rules language plpgsql security definer set search_path='' as $$
declare r public.campaign_rules; c public.characters; sheet jsonb; attrs jsonb; maximum integer;
begin
 if not private.is_campaign_owner(p_campaign_id) then raise exception 'Somente o mestre pode definir as regras.' using errcode='42501'; end if;
 perform 1 from public.campaigns where id=p_campaign_id for update;
 select * into r from public.campaign_rules where campaign_id=p_campaign_id for update;
 if r.campaign_id is not null and r.updated_at is distinct from p_expected_updated_at then raise exception 'As regras mudaram. Atualize antes de salvar.' using errcode='40001'; end if;
 insert into public.campaign_rules(campaign_id,party_level,lock_player_level,players_can_create_characters,players_can_edit_sheets,players_can_end_turn,default_restrict_movement,default_failed_actions_consume)
 values(p_campaign_id,coalesce((p_rules->>'party_level')::integer,1),coalesce((p_rules->>'lock_player_level')::boolean,false),coalesce((p_rules->>'players_can_create_characters')::boolean,true),coalesce((p_rules->>'players_can_edit_sheets')::boolean,true),coalesce((p_rules->>'players_can_end_turn')::boolean,true),coalesce((p_rules->>'default_restrict_movement')::boolean,true),coalesce((p_rules->>'default_failed_actions_consume')::boolean,true))
 on conflict(campaign_id) do update set party_level=excluded.party_level,lock_player_level=excluded.lock_player_level,players_can_create_characters=excluded.players_can_create_characters,players_can_edit_sheets=excluded.players_can_edit_sheets,players_can_end_turn=excluded.players_can_end_turn,default_restrict_movement=excluded.default_restrict_movement,default_failed_actions_consume=excluded.default_failed_actions_consume,updated_at=clock_timestamp()
 returning * into r;
 if r.lock_player_level then
  for c in select * from public.characters where campaign_id=p_campaign_id and system_data->>'level' is distinct from r.party_level::text for update loop
   sheet=private.session_level_resources(c.system_data,r.party_level);
   select coalesce(jsonb_object_agg(ability,score),'{}') into attrs from public.character_attributes where character_id=c.id;
   maximum=private.battle_hp_max(sheet||jsonb_build_object('abilities',attrs));
   sheet=jsonb_set(sheet,'{hp_current}',to_jsonb(least(coalesce((sheet->>'hp_current')::integer,0),maximum)));
   sheet=jsonb_set(sheet,'{hit_dice_used}',to_jsonb(least(coalesce((sheet->>'hit_dice_used')::integer,0),r.party_level)));
   update public.characters set system_data=sheet where id=c.id;
  end loop;
 end if;
 return r;
end $$;

create function private.session_life_event() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid; eid uuid; sid uuid; label text; image text; kind text; is_dead boolean; was_dead boolean; visible boolean; hp integer; oldhp integer;
begin
 if tg_table_name='characters' then
  cid=new.campaign_id;eid=new.id;label=new.name;image=new.portrait_path;kind='character';visible=true;
  hp=coalesce((new.system_data->>'hp_current')::integer,1);oldhp=coalesce((old.system_data->>'hp_current')::integer,1);
  is_dead=(hp=0 and coalesce((new.system_data->>'death_failures')::integer,0)>=3) or coalesce(new.system_data->'conditions','[]') ?| array['Morto','Dead'];
 elsif tg_table_name='npcs' then
  cid=new.campaign_id;eid=new.id;label=new.name;image=new.image_path;kind='npc';visible=new.visible_to_players;
  select hp_current into hp from public.npc_stats where npc_id=new.id;
  is_dead=lower(new.status) in('morto','morta','dead') or hp=0;oldhp=hp;
 else
  select campaign_id,name,image_path,visible_to_players into cid,label,image,visible from public.npcs where id=new.npc_id;
  eid=new.npc_id;kind='npc';hp=new.hp_current;oldhp=old.hp_current;
  is_dead=hp=0 or exists(select 1 from public.npcs where id=eid and lower(status) in('morto','morta','dead'));
 end if;
 select id into sid from public.campaign_sessions where campaign_id=cid and status='active';
 if sid is null then return new; end if;
 if kind='npc' then visible=visible or exists(select 1 from public.battle_map_tokens t join public.battle_maps m on m.id=t.map_id where t.npc_id=eid and m.adventure_session_id=sid and t.visible and not private.battle_area_hidden(m.id,t.x,t.y,t.size,t.size)); end if;
 select dead into was_dead from private.campaign_session_life where session_id=sid and entity_kind=kind and entity_id=eid;
 if is_dead and was_dead is distinct from true then
  perform private.session_event(sid,kind||'_death',label||' morreu',case when kind='character' then 'Morte confirmada na ficha ou pelo mestre.' else 'NPC sem pontos de vida ou marcado como morto.' end,case when visible then 'players' else 'gm' end,image,jsonb_build_object('entity_id',eid,'entity_kind',kind));
 elsif not is_dead and was_dead=true then
  perform private.session_event(sid,kind||'_revived',label||' voltou à vida','Estado de vida atualizado.',case when visible then 'players' else 'gm' end,image,jsonb_build_object('entity_id',eid,'entity_kind',kind));
 elsif kind='character' and hp=0 and oldhp>0 then
  perform private.session_event(sid,'character_down',label||' caiu a 0 PV','O personagem precisa de ajuda; 0 PV não confirma a morte.','players',image,jsonb_build_object('entity_id',eid));
 end if;
 insert into private.campaign_session_life(session_id,entity_kind,entity_id,dead) values(sid,kind,eid,coalesce(is_dead,false)) on conflict(session_id,entity_kind,entity_id) do update set dead=excluded.dead;
 return new;
end $$;
create trigger session_character_life after update of system_data on public.characters for each row execute function private.session_life_event();
create trigger session_npc_life after update of status on public.npcs for each row execute function private.session_life_event();
create trigger session_npc_hp after update of hp_current on public.npc_stats for each row execute function private.session_life_event();
revoke all on function private.session_life_event() from public,anon,authenticated;

create function public.confirm_campaign_session_death(p_session_id uuid,p_entity_id uuid,p_kind text) returns void language plpgsql security definer set search_path='' as $$
declare s public.campaign_sessions;
begin
 select * into s from public.campaign_sessions where id=p_session_id for share;
 if s.id is null or not private.is_campaign_owner(s.campaign_id) or s.status<>'active' then raise exception 'O mestre deve ter uma sessão ativa para confirmar a morte.' using errcode='42501'; end if;
 if p_kind='character' then
  update public.characters set system_data=jsonb_set(jsonb_set(system_data,'{hp_current}','0'),'{death_failures}','3') where id=p_entity_id and campaign_id=s.campaign_id;
 elsif p_kind='npc' then
  update public.npcs set status='Morto' where id=p_entity_id and campaign_id=s.campaign_id;
  if not found then raise exception 'Personagem não pertence a esta campanha.';end if;
  update public.npc_stats set hp_current=0 where npc_id=p_entity_id;
 else raise exception 'Personagem inválido.';end if;
 if not found then raise exception 'Personagem não pertence a esta campanha.';end if;
end $$;

create or replace function private.battle_assert_editable(p_map uuid) returns void
language plpgsql security definer set search_path='' as $$
declare cid uuid; sid uuid;
begin
  select campaign_id,battle_session_id into cid,sid from public.battle_maps where id=p_map;
  if cid is not null and not exists(select 1 from public.campaigns where id=cid) then return;end if;
  if exists(select 1 from public.battle_maps m join public.campaign_sessions a on a.id=m.adventure_session_id where m.id=p_map and a.status='ended') then raise exception 'A sessão está encerrada. Copie o cenário para outra sessão.'; end if;
  if cid is null then raise exception 'Mapa não encontrado.'; end if;
  -- Retain the ordered locks used by portal linking and combat RPCs.
  -- Only the encounter actually attached to this map decides its editability.
  perform 1 from public.battle_sessions where campaign_id=cid order by id for update;
  if exists(select 1 from public.battle_sessions where id=sid and status='active') then
    raise exception 'Encerre o combate desta mesa antes de editar o grid.';
  end if;
end $$;

create or replace function private.can_read_battle_token(p_token uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.battle_map_tokens t where t.id=p_token and private.can_read_battle_map(t.map_id) and
 (private.is_campaign_owner(t.campaign_id) or t.controlled_by=auth.uid() or exists(select 1 from public.characters c where c.id=t.character_id and c.owner_id=auth.uid()) or
 t.visible and not private.battle_area_hidden(t.map_id,t.x,t.y,t.size,t.size)));
$$;

create or replace function private.battle_link_portals() returns trigger
language plpgsql security definer set search_path='' as $$
declare source_session uuid; other_session uuid; cid uuid;
begin
  if new.object_type<>'portal' then return new; end if;
  select campaign_id,battle_session_id into cid,source_session from public.battle_maps where id=new.map_id;
  select bm.battle_session_id into other_session
  from public.battle_map_objects o join public.battle_maps bm on bm.id=o.map_id
  where o.object_type='portal' and bm.campaign_id=cid and bm.adventure_session_id=(select adventure_session_id from public.battle_maps where id=new.map_id) and o.id<>new.id
    and o.metadata->>'portal_code'=new.metadata->>'portal_code' limit 1;
  if other_session is null or source_session=other_session then return new; end if;
  -- The bounds trigger already locked the campaign's sessions in ID order.
  -- Joining either active encounter would invalidate its initiative and budgets.
  if exists(select 1 from public.battle_sessions where id in(source_session,other_session) and status='active') then
    raise exception 'Encerre o combate nos dois mapas antes de conectar os portais.';
  end if;
  update public.battle_action_requests set status='expired',resolved_at=now()
    where session_id=source_session and status in('pending','approved');
  delete from public.battle_turn_order where session_id=source_session;
  update public.battle_maps set battle_session_id=other_session,updated_at=clock_timestamp()
    where campaign_id=cid and battle_session_id=source_session;
  return new;
end $$;

create or replace function private.battle_scenery_bounds() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.battle_maps; g jsonb; x integer; y integer; w integer; h integer; cost numeric; code text; variant text; color text;
begin
 if tg_op='DELETE' then
  select * into m from public.battle_maps where id=old.map_id;
  if m.id is null then return old; end if;
  perform private.battle_assert_editable(m.id);
  perform 1 from public.battle_sessions where id=m.battle_session_id for update;
  update public.battle_maps set updated_at=now() where id=old.map_id;
  return old;
 end if;
 select * into m from public.battle_maps where id=new.map_id;
 perform private.battle_assert_editable(m.id);
 perform 1 from public.battle_sessions where id=m.battle_session_id for update;
 if tg_op='UPDATE' and new.map_id<>old.map_id then raise exception 'Não transfira objetos entre mapas.'; end if;
 if not private.battle_is_scenery_kind(new.object_type) then
  if new.blocks_movement then raise exception 'Use um objeto de cenário com dimensões válidas para bloquear movimento.'; end if;
  return new;
 end if;
 variant=coalesce(nullif(new.metadata->>'variant',''),'default');
 if not private.battle_valid_scenery_variant(new.object_type,variant) then raise exception 'Variante inválida para este elemento.'; end if;
 new.metadata=jsonb_set(new.metadata,'{variant}',to_jsonb(variant));
 if new.metadata ? 'color' then
  if new.metadata->'color'='null'::jsonb then new.metadata=new.metadata-'color';
  else
   color=new.metadata->>'color';
   if jsonb_typeof(new.metadata->'color')<>'string' or color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Cor inválida: use #RRGGBB.'; end if;
   new.metadata=jsonb_set(new.metadata,'{color}',to_jsonb(lower(color)));
  end if;
 end if;
 g=new.geometry;
 if jsonb_typeof(g->'x') is distinct from 'number' or jsonb_typeof(g->'y') is distinct from 'number' or jsonb_typeof(g->'width') is distinct from 'number' or jsonb_typeof(g->'height') is distinct from 'number' then raise exception 'Informe posição e dimensões do objeto.'; end if;
 if (g->>'x')::numeric<>floor((g->>'x')::numeric) or (g->>'y')::numeric<>floor((g->>'y')::numeric) or (g->>'width')::numeric<>floor((g->>'width')::numeric) or (g->>'height')::numeric<>floor((g->>'height')::numeric) then raise exception 'As dimensões devem seguir as células do grid.'; end if;
 x=(g->>'x')::integer; y=(g->>'y')::integer; w=(g->>'width')::integer; h=(g->>'height')::integer;
 if x<0 or y<0 or w<1 or h<1 or w>8 or h>8 or x+w>m.width or y+h>m.height or new.z<>0 or coalesce((g->>'rotation')::numeric,0) not between 0 and 360 then raise exception 'Objeto fora do mapa ou com dimensões inválidas (1 a 8 células).'; end if;
 if new.object_type='portal' then
  code=upper(trim(coalesce(new.metadata->>'portal_code','')));
  if code !~ '^[A-Z0-9_-]{1,24}$' then raise exception 'Código do portal: 1 a 24 letras, números, hífen ou sublinhado.'; end if;
  perform 1 from public.campaigns where id=m.campaign_id for update;
  if (select count(*) from public.battle_map_objects o join public.battle_maps bm on bm.id=o.map_id where bm.campaign_id=m.campaign_id and bm.adventure_session_id=m.adventure_session_id and o.object_type='portal' and upper(trim(o.metadata->>'portal_code'))=code and o.id<>new.id)>=2 then raise exception 'Este código já liga dois portais. Use outro código.'; end if;
  if exists(select 1 from public.battle_map_objects o where o.map_id=m.id and o.object_type='portal' and o.id<>new.id and upper(trim(o.metadata->>'portal_code'))=code and (o.geometry->>'x')::integer<x+w and (o.geometry->>'x')::integer+(o.geometry->>'width')::integer>x and (o.geometry->>'y')::integer<y+h and (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>y) then raise exception 'As duas pontas do portal precisam ocupar áreas diferentes.'; end if;
  new.metadata=jsonb_set(new.metadata,'{portal_code}',to_jsonb(code));
  new.metadata=jsonb_set(new.metadata,'{movement_cost}','1');
  new.blocks_movement=false; new.blocks_vision=false;
 end if;
 cost=coalesce((new.metadata->>'movement_cost')::numeric,1);
 if cost not between 1 and 10 then raise exception 'Custo de movimento inválido (1 a 10).'; end if;
 if new.blocks_movement and exists(select 1 from public.battle_map_tokens t where t.map_id=m.id and t.z=0 and t.x<(new.geometry->>'x')::integer+(new.geometry->>'width')::integer and t.x+t.size>(new.geometry->>'x')::integer and t.y<(new.geometry->>'y')::integer+(new.geometry->>'height')::integer and t.y+t.size>(new.geometry->>'y')::integer) then raise exception 'O objeto bloqueia um personagem. Escolha outra posição.'; end if;
 if tg_op='INSERT' and (select count(*) from public.battle_map_objects where map_id=m.id)>=1200 then raise exception 'Limite de 1200 objetos neste mapa.'; end if;
 update public.battle_maps set updated_at=now() where id=m.id;
 return new;
end $$;

create or replace function public.use_battle_portal(p_token_id uuid,p_portal_id uuid,p_expected_version bigint,p_client_id uuid) returns public.battle_map_tokens
language plpgsql security definer set search_path='' as $$
declare actor public.battle_map_tokens; result public.battle_map_tokens; entrance public.battle_map_objects; outlet public.battle_map_objects; src public.battle_maps; dst public.battle_maps; s public.battle_sessions; previous private.battle_portal_trips; sheet jsonb; dx integer; dy integer; found_exit boolean=false;
begin
 select * into actor from public.battle_map_tokens where id=p_token_id;
 if actor.id is null or not private.can_control_battle_token(actor.id) then raise exception 'Você não controla este personagem.' using errcode='42501'; end if;
 if p_client_id is null or p_expected_version is null then raise exception 'Identificação da travessia inválida.'; end if;
 select * into src from public.battle_maps where id=actor.map_id;
 select * into s from public.battle_sessions where id=src.battle_session_id for update;
 perform 1 from public.campaigns where id=actor.campaign_id for update;
 select * into actor from public.battle_map_tokens where id=p_token_id for update;
 if actor.id is null or not private.can_control_battle_token(actor.id) then raise exception 'Você não controla mais este personagem.' using errcode='42501'; end if;
 select * into previous from private.battle_portal_trips where token_id=actor.id and client_id=p_client_id;
 if previous.token_id is not null then
  if previous.requested_by<>auth.uid() and not private.is_campaign_owner(actor.campaign_id) then raise exception 'Travessia de outro jogador.' using errcode='42501'; end if;
  select * into result from jsonb_populate_record(null::public.battle_map_tokens,previous.result); return result;
 end if;
 if actor.map_id<>src.id then raise exception 'O personagem já mudou de mapa. Atualize a mesa.'; end if;
 if actor.version<>p_expected_version then raise exception 'A posição mudou. Atualize a mesa antes de atravessar.'; end if;
 select * into entrance from public.battle_map_objects where id=p_portal_id and object_type='portal' and map_id=actor.map_id for share;
 if entrance.id is null or not entrance.visible or not private.is_campaign_owner(actor.campaign_id) and private.battle_area_hidden(entrance.map_id,(entrance.geometry->>'x')::numeric,(entrance.geometry->>'y')::numeric,(entrance.geometry->>'width')::numeric,(entrance.geometry->>'height')::numeric) then raise exception 'Portal indisponível.'; end if;
 if actor.x<(entrance.geometry->>'x')::integer or actor.y<(entrance.geometry->>'y')::integer or actor.x+actor.size>(entrance.geometry->>'x')::integer+(entrance.geometry->>'width')::integer or actor.y+actor.size>(entrance.geometry->>'y')::integer+(entrance.geometry->>'height')::integer then raise exception 'Mova o personagem para dentro do portal antes de atravessar.'; end if;
 select o.* into outlet from public.battle_map_objects o join public.battle_maps bm on bm.id=o.map_id where o.object_type='portal' and o.id<>entrance.id and bm.campaign_id=actor.campaign_id and bm.adventure_session_id=src.adventure_session_id and o.metadata->>'portal_code'=entrance.metadata->>'portal_code' for share of o;
 if outlet.id is null or not outlet.visible then raise exception 'Este portal precisa de uma segunda ponta visível com o mesmo código.'; end if;
 select * into dst from public.battle_maps where id=outlet.map_id;
 if dst.battle_session_id<>src.battle_session_id then raise exception 'Os portais precisam compartilhar a mesma sessão de combate.'; end if;
 if not private.is_campaign_owner(actor.campaign_id) and private.battle_area_hidden(outlet.map_id,(outlet.geometry->>'x')::numeric,(outlet.geometry->>'y')::numeric,(outlet.geometry->>'width')::numeric,(outlet.geometry->>'height')::numeric) then raise exception 'O mestre precisa revelar a saída do portal.'; end if;
 if exists(select 1 from public.battle_action_requests r where r.token_id=actor.id and r.status in('pending','approved')) or exists(select 1 from public.battle_movement_plans p where p.token_id=actor.id and p.status='pending') then raise exception 'Conclua a ação ou reação pendente antes de atravessar.'; end if;
 if s.status='active' then
  if s.restrict_movement_to_turn and s.active_token_id is distinct from actor.id then raise exception 'Aguarde o turno deste personagem.'; end if;
  sheet=private.battle_sheet(actor.id);
  if coalesce((sheet->>'hp_current')::integer,0)<=0 or sheet->'conditions' ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado'] then raise exception 'Este personagem não pode atravessar agora.'; end if;
 end if;
 -- Search only inside the exit footprint, so a large token or an occupied exit cannot land in a wall.
 for dy in select generate_series((outlet.geometry->>'y')::integer,floor((outlet.geometry->>'y')::integer+(outlet.geometry->>'height')::integer-actor.size)::integer) loop
  for dx in select generate_series((outlet.geometry->>'x')::integer,floor((outlet.geometry->>'x')::integer+(outlet.geometry->>'width')::integer-actor.size)::integer) loop
   if private.battle_footprint_cost(dst.id,dx,dy,actor.z,actor.size,actor.id) is not null then found_exit=true; exit; end if;
  end loop;
  if found_exit then exit; end if;
 end loop;
 if not found_exit then raise exception 'A saída está bloqueada, ocupada ou pequena demais.'; end if;
 update public.battle_map_tokens set map_id=dst.id,x=dx,y=dy,version=version+1 where id=actor.id returning * into result;
 insert into private.battle_portal_trips(token_id,client_id,requested_by,source_map,destination_map,result) values(actor.id,p_client_id,auth.uid(),src.id,dst.id,to_jsonb(result));
 return result;
end $$;

create or replace function public.create_battle_map(p_campaign_id uuid,p_payload jsonb) returns public.battle_maps
language plpgsql security definer set search_path='' as $$
declare session_row public.battle_sessions; map_row public.battle_maps; sid uuid; rules public.campaign_rules;
begin
  if not private.is_campaign_owner(p_campaign_id) then raise exception 'Apenas o mestre pode criar mapas.' using errcode='42501'; end if;
  sid=private.adventure_destination(p_campaign_id,nullif(p_payload->>'adventure_session_id','')::uuid);
  select * into rules from public.campaign_rules where campaign_id=p_campaign_id;
  insert into public.battle_sessions(campaign_id,adventure_session_id,name,restrict_movement_to_turn,failed_actions_consume)
  values(p_campaign_id,sid,coalesce(nullif(trim(p_payload->>'session_name'),''),coalesce(nullif(trim(p_payload->>'name'),''),'Mesa tática')),coalesce((p_payload->>'restrict_movement_to_turn')::boolean,rules.default_restrict_movement,true),coalesce(rules.default_failed_actions_consume,true))
  returning * into session_row;

  insert into public.battle_maps(campaign_id,adventure_session_id,battle_session_id,name,description,width,height,cell_size,scale_per_cell,scale_unit,diagonal_rule,grid_visible,grid_opacity)
  values(
    p_campaign_id,sid,session_row.id,coalesce(nullif(trim(p_payload->>'name'),''),'Novo mapa'),coalesce(p_payload->>'description',''),
    coalesce((p_payload->>'width')::integer,30),coalesce((p_payload->>'height')::integer,20),coalesce((p_payload->>'cell_size')::integer,64),
    coalesce((p_payload->>'scale_per_cell')::numeric,1.5),coalesce(nullif(p_payload->>'scale_unit',''),'m'),coalesce(nullif(p_payload->>'diagonal_rule',''),'one'),
    coalesce((p_payload->>'grid_visible')::boolean,true),coalesce((p_payload->>'grid_opacity')::numeric,0.45)
  ) returning * into map_row;
  return map_row;
end $$;

create or replace function public.advance_battle_turn(p_session_id uuid) returns public.battle_sessions
language plpgsql security definer set search_path='' as $$
declare s public.battle_sessions; total integer; next_index integer; next_round integer; next_token uuid; result public.battle_sessions;
begin
  select * into s from public.battle_sessions where id=p_session_id for update;
  if s.id is null or (not private.is_campaign_owner(s.campaign_id) and (s.active_token_id is null or not private.can_control_battle_token(s.active_token_id))) then raise exception 'Você não pode encerrar este turno.' using errcode='42501'; end if;
  if not private.is_campaign_owner(s.campaign_id) and exists(select 1 from public.campaign_rules where campaign_id=s.campaign_id and not players_can_end_turn) then raise exception 'Somente o mestre pode encerrar os turnos nesta campanha.' using errcode='42501'; end if;
  if s.status<>'active' then raise exception 'O combate não está ativo.'; end if;
  select count(*) into total from public.battle_turn_order where session_id=s.id;
  if total=0 then raise exception 'A ordem de iniciativa está vazia.'; end if;
  next_index=(s.turn_index+1)%total;
  next_round=s.round + case when next_index=0 then 1 else 0 end;
  select token_id into next_token from public.battle_turn_order where session_id=s.id and position=next_index;
  update public.battle_map_tokens set movement_remaining=movement_speed where id=next_token;
  update public.battle_sessions set turn_index=next_index,round=next_round,active_token_id=next_token,turn_started_at=now() where id=s.id returning * into result;
  return result;
end $$;

create or replace function private.mural_item_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and exists(select 1 from public.campaign_sessions where id=old.adventure_session_id and status='ended') then return new; end if;
 if tg_op='UPDATE' and (new.id<>old.id or new.campaign_id<>old.campaign_id or new.adventure_session_id<>old.adventure_session_id) then raise exception 'O vínculo deste cartão não pode ser alterado.' using errcode='42501'; end if;
 perform 1 from public.campaigns where id=new.campaign_id for update;
 if new.source_location_id is not null and not exists(select 1 from public.world_locations where id=new.source_location_id and campaign_id=new.campaign_id) then raise exception 'O local não pertence a esta campanha.'; end if;
 if new.source_npc_id is not null and not exists(select 1 from public.npcs where id=new.source_npc_id and campaign_id=new.campaign_id) then raise exception 'O NPC não pertence a esta campanha.'; end if;
 if not private.mural_image_belongs_to_campaign(new.campaign_id,new.image_path) and not(tg_op='UPDATE' and new.image_path is not distinct from old.image_path) then raise exception 'Use uma imagem desta campanha.'; end if;
 if tg_op='INSERT' and not exists(select 1 from public.campaign_mural_items where id=new.id and campaign_id=new.campaign_id) and (select count(*) from public.campaign_mural_items where adventure_session_id=new.adventure_session_id)>=300 then raise exception 'Limite de 300 cartões neste mural.'; end if;
 if tg_op='UPDATE' then new.created_at=old.created_at; new.updated_at=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond'); end if;
 return new;
end $$;

create or replace function private.mural_image_belongs_to_campaign(p_campaign uuid,p_path text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare entity text; target uuid;
begin
 if p_path is null then return true; end if;
 if exists(select 1 from public.campaign_mural_items where campaign_id=p_campaign and image_path=p_path) or exists(select 1 from public.campaign_session_events where campaign_id=p_campaign and image_path=p_path) then return true; end if;
 if p_path ~ '^/images/[A-Za-z0-9_/-]+\.(jpg|jpeg|png|webp)$' and p_path not like '%..%' then return true; end if;
 if p_path !~ '^(campaign_mural|campaigns|npcs|world_regions|world_cities|world_locations|battle_maps)/[0-9a-fA-F-]{36}/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$' then return false; end if;
 if split_part(p_path,'/',2) !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false; end if;
 entity=split_part(p_path,'/',1);target=split_part(p_path,'/',2)::uuid;
 case entity
  when 'campaign_mural','campaigns' then return target=p_campaign;
  when 'npcs' then return exists(select 1 from public.npcs where id=target and campaign_id=p_campaign);
  when 'world_regions' then return exists(select 1 from public.world_regions where id=target and campaign_id=p_campaign);
  when 'world_cities' then return exists(select 1 from public.world_cities where id=target and campaign_id=p_campaign);
  when 'world_locations' then return exists(select 1 from public.world_locations where id=target and campaign_id=p_campaign);
  when 'battle_maps' then return exists(select 1 from public.battle_maps where id=target and campaign_id=p_campaign);
  else return false;
 end case;
end $$;

create or replace function public.save_campaign_mural_item(p_payload jsonb,p_expected_updated_at timestamptz default null) returns public.campaign_mural_items
language plpgsql security definer set search_path='' as $$
declare cid uuid=(p_payload->>'campaign_id')::uuid; eid uuid=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid()); previous public.campaign_mural_items; result public.campaign_mural_items; position integer; sid uuid;
begin
 if not private.is_campaign_owner(cid) then raise exception 'Somente o mestre pode editar o mural.' using errcode='42501'; end if;
 perform 1 from public.campaigns where id=cid for update;
 select * into previous from public.campaign_mural_items where id=eid for update;
 if previous.id is not null and previous.campaign_id<>cid then raise exception 'O cartão pertence a outra campanha.' using errcode='42501'; end if;
 if previous.id is not null and p_expected_updated_at is distinct from previous.updated_at or previous.id is null and p_expected_updated_at is not null then raise exception 'Este cartão mudou em outra janela. Atualize o mural antes de salvar.' using errcode='40001'; end if;
 sid=private.adventure_destination(cid,coalesce(nullif(p_payload->>'adventure_session_id','')::uuid,previous.adventure_session_id));
 if previous.id is not null and previous.adventure_session_id<>sid then raise exception 'O cartão pertence a outra sessão.'; end if;
 if previous.id is null then select coalesce(max(sort_order)+1,0) into position from public.campaign_mural_items where adventure_session_id=sid;
 else position=coalesce((p_payload->>'sort_order')::integer,previous.sort_order); end if;
 insert into public.campaign_mural_items(id,campaign_id,adventure_session_id,kind,title,description,image_path,source_location_id,source_npc_id,visible_to_players,pinned,sort_order)
 values(eid,cid,sid,p_payload->>'kind',trim(p_payload->>'title'),coalesce(p_payload->>'description',''),nullif(p_payload->>'image_path',''),nullif(p_payload->>'source_location_id','')::uuid,nullif(p_payload->>'source_npc_id','')::uuid,coalesce((p_payload->>'visible_to_players')::boolean,false),coalesce((p_payload->>'pinned')::boolean,false),position)
 on conflict(id) do update set kind=excluded.kind,title=excluded.title,description=excluded.description,image_path=excluded.image_path,source_location_id=excluded.source_location_id,source_npc_id=excluded.source_npc_id,visible_to_players=excluded.visible_to_players,pinned=excluded.pinned,sort_order=excluded.sort_order
 returning * into result;
 return result;
end $$;

create or replace function public.reorder_campaign_mural(p_campaign_id uuid,p_item_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not private.is_campaign_owner(p_campaign_id) then raise exception 'Somente o mestre pode organizar o mural.' using errcode='42501'; end if;
 perform 1 from public.campaigns where id=p_campaign_id for update;
 select adventure_session_id into sid from public.campaign_mural_items where id=p_item_ids[1] and campaign_id=p_campaign_id;
 if sid is null and coalesce(cardinality(p_item_ids),0)=0 then return; end if;
 if p_item_ids is null or cardinality(p_item_ids)<>(select count(*) from public.campaign_mural_items where campaign_id=p_campaign_id and adventure_session_id=sid) or cardinality(p_item_ids)<>(select count(distinct requested.id) from unnest(p_item_ids) requested(id)) or exists(select 1 from unnest(p_item_ids) requested(id) where not exists(select 1 from public.campaign_mural_items item where item.campaign_id=p_campaign_id and item.adventure_session_id=sid and item.id=requested.id)) then raise exception 'O mural mudou. Atualize os cartões antes de reorganizar.' using errcode='40001'; end if;
 update public.campaign_mural_items item set sort_order=ordering.position-1 from unnest(p_item_ids) with ordinality ordering(id,position) where item.id=ordering.id and item.campaign_id=p_campaign_id;
end $$;


create function private.session_content_event() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; sid uuid; cid uuid; mid uuid; token public.battle_map_tokens; title text; description text=''; audience text='players'; image text; kind text; data jsonb='{}';
begin
 r=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 kind=tg_table_name||'_'||lower(tg_op);
 if tg_table_name='campaign_mural_items' then
  sid=(r->>'adventure_session_id')::uuid;title=r->>'title';description=r->>'description';image=r->>'image_path';
  audience=case when (r->>'visible_to_players')::boolean then 'players' else 'gm' end;
  data=jsonb_build_object('mural_item_id',r->>'id','kind',r->>'kind');
  if tg_op='UPDATE' and old.visible_to_players and not new.visible_to_players then title=old.title||' — cartão ocultado';description='';image=null;audience='players';end if;
  if tg_op='DELETE' then title='Cartão removido: '||title;end if;
 elsif tg_table_name='battle_sessions' then
  sid=(r->>'adventure_session_id')::uuid;
  if tg_op='INSERT' then return new;end if;
  if new.status<>old.status then title=case when new.status='active' then 'Combate iniciado' else 'Combate encerrado' end;
  elsif new.turn_index<>old.turn_index or new.round<>old.round then title='Novo turno · rodada '||new.round;
  else return new;end if;
 elsif tg_table_name='battle_maps' then
  sid=(r->>'adventure_session_id')::uuid;title=case when tg_op='INSERT' then 'Grid criado: ' else 'Grid atualizado: ' end||(r->>'name');
  if tg_op='DELETE' then title='Grid removido: '||(r->>'name');end if;
  if tg_op='UPDATE' and (to_jsonb(new)-array['updated_at','battle_session_id'])=(to_jsonb(old)-array['updated_at','battle_session_id']) then return new;end if;
  image=r->>'background_image';data=jsonb_build_object('map_id',r->>'id');
 elsif tg_table_name='battle_map_objects' then
  mid=(r->>'map_id')::uuid;title=case when tg_op='DELETE' then 'Elemento removido: ' when tg_op='INSERT' then 'Elemento adicionado: ' else 'Elemento atualizado: ' end||(r->>'object_type');
  audience='gm';data=jsonb_build_object('map_id',mid,'object_type',r->>'object_type');
 elsif tg_table_name='battle_map_tokens' then
  if tg_op='UPDATE' then return new;end if;
  mid=(r->>'map_id')::uuid;title=case when tg_op='INSERT' then 'Entrou no grid: ' else 'Saiu do grid: ' end||(r->>'name');image=r->>'image';
  if not (r->>'visible')::boolean or private.battle_area_hidden(mid,(r->>'x')::numeric,(r->>'y')::numeric,(r->>'size')::numeric,(r->>'size')::numeric) then audience='gm';end if;
 elsif tg_table_name='battle_movements' then
  select * into token from public.battle_map_tokens where id=new.token_id;
  mid=token.map_id;title=token.name||' se moveu';description='Deslocamento de '||new.movement_cost||' '||new.movement_unit;
  if not token.visible or private.battle_area_hidden(mid,token.x,token.y,token.size,token.size) then audience='gm';end if;
 elsif tg_table_name='battle_action_requests' then
  if tg_op='UPDATE' and old.status=new.status then return new;end if;
  select * into token from public.battle_map_tokens where id=new.token_id;
  mid=new.map_id;title=coalesce(token.name,'Personagem')||' · '||new.name;
  description=case new.status when 'pending' then 'Ação enviada ao mestre.' when 'approved' then 'Sucesso aprovado; aguardando rolagem.' when 'success' then 'Ação executada.' when 'failure' then 'Falha: a ação não foi executada.' when 'expired' then 'Ação expirada.' else 'Estado da ação: '||new.status end;
  data=jsonb_build_object('kind',new.kind,'status',new.status);
  if token.id is null or not token.visible or private.battle_area_hidden(mid,token.x,token.y,token.size,token.size) then audience='gm';end if;
 elsif tg_table_name='battle_action_effects' then
  select * into token from public.battle_map_tokens where id=new.token_id;
  mid=token.map_id;title=coalesce(token.name,'Personagem')||case when new.kind='healing' then ' recebeu cura' else ' · efeito aplicado' end;
  description='Valor: '||new.amount||' · PV: '||new.hp_before||' → '||new.hp_after;
  data=jsonb_build_object('kind',new.kind,'amount',new.amount,'hp_before',new.hp_before,'hp_after',new.hp_after);
  if token.id is null or not token.visible or private.battle_area_hidden(mid,token.x,token.y,token.size,token.size) then audience='gm';end if;
 elsif tg_table_name='battle_dice_rolls' then
  mid=new.map_id;title='Rolagem: '||new.expression;description=coalesce(new.label,'')||' · Resultado: '||new.total;
  data=jsonb_build_object('expression',new.expression,'total',new.total,'terms',new.terms);
  if new.visibility<>'public' or not private.battle_dice_source_visible(new.request_id,new.effect_id) then audience='gm';end if;
 else return coalesce(new,old);end if;
 if sid is null then select adventure_session_id,campaign_id into sid,cid from public.battle_maps where id=mid;end if;
 if sid is not null and title is not null then perform private.session_event(sid,kind,title,description,audience,image,data);end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger journal_mural after insert or update or delete on public.campaign_mural_items for each row execute function private.session_content_event();
create trigger journal_combat after update on public.battle_sessions for each row execute function private.session_content_event();
create trigger journal_maps after insert or update or delete on public.battle_maps for each row execute function private.session_content_event();
create trigger journal_scenery after insert or update or delete on public.battle_map_objects for each row execute function private.session_content_event();
create trigger journal_tokens after insert or delete on public.battle_map_tokens for each row execute function private.session_content_event();
create trigger journal_movements after insert on public.battle_movements for each row execute function private.session_content_event();
create trigger journal_actions after insert or update on public.battle_action_requests for each row execute function private.session_content_event();
create trigger journal_dice after insert on public.battle_dice_rolls for each row execute function private.session_content_event();
create trigger journal_hp_effects after insert on public.battle_action_effects for each row execute function private.session_content_event();
revoke all on function private.session_content_event() from public,anon,authenticated;

-- Only the exact historical image is shared, never the NPC sheet or its other files.
create policy session_journal_media_read on storage.objects for select to authenticated using(bucket_id='campaign-media' and exists(
 select 1 from public.campaign_session_events e where e.image_path=name and private.can_read_campaign_session(e.adventure_session_id)
 and (e.visibility='players' or private.is_campaign_owner(e.campaign_id))));
create function private.media_in_session_archive(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.battle_maps m join public.campaign_sessions s on s.id=m.adventure_session_id where s.status='ended' and m.background_image=p_name)
 or exists(select 1 from public.campaign_mural_items i join public.campaign_sessions s on s.id=i.adventure_session_id where s.status='ended' and i.image_path=p_name)
 or exists(select 1 from public.campaign_session_events e join public.campaign_sessions s on s.id=e.adventure_session_id where s.status='ended' and e.image_path=p_name);
$$;
revoke all on function private.media_in_session_archive(text) from public,anon;
grant execute on function private.media_in_session_archive(text) to authenticated;
create policy preserve_session_archive_media on storage.objects as restrictive for delete to authenticated using(bucket_id<>'campaign-media' or not private.media_in_session_archive(name));

revoke all on function public.save_campaign_session(uuid,text,integer,uuid,timestamptz),public.start_campaign_session(uuid),public.end_campaign_session(uuid,text),public.add_campaign_session_note(uuid,text,text,text,boolean),public.copy_battle_map_to_session(uuid,uuid,text),public.copy_campaign_mural_to_session(uuid,uuid),public.save_campaign_rules(uuid,jsonb,timestamptz),public.confirm_campaign_session_death(uuid,uuid,text) from public,anon;
grant execute on function public.save_campaign_session(uuid,text,integer,uuid,timestamptz),public.start_campaign_session(uuid),public.end_campaign_session(uuid,text),public.add_campaign_session_note(uuid,text,text,text,boolean),public.copy_battle_map_to_session(uuid,uuid,text),public.copy_campaign_mural_to_session(uuid,uuid),public.save_campaign_rules(uuid,jsonb,timestamptz),public.confirm_campaign_session_death(uuid,uuid,text) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='campaign_sessions') then alter publication supabase_realtime add table public.campaign_sessions;end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='campaign_rules') then alter publication supabase_realtime add table public.campaign_rules;end if;
 end if;
end $$;
notify pgrst,'reload schema';

-- One journal entry per brush request, rather than one per painted cell.
create or replace function public.set_battle_fog(p_map_id uuid,p_x integer,p_y integer,p_width integer default 1,p_height integer default 1,p_hidden boolean default true) returns void
language plpgsql security definer set search_path='' as $$
declare m public.battle_maps;
begin
 select * into m from public.battle_maps where id=p_map_id;
 if m.id is null or not private.is_campaign_owner(m.campaign_id) then raise exception 'Somente o mestre pode ocultar ou revelar áreas.' using errcode='42501'; end if;
 if p_x is null or p_y is null or p_width is null or p_height is null or p_hidden is null or p_x<0 or p_y<0 or p_x>=m.width or p_y>=m.height or p_width not between 1 and 8 or p_height not between 1 and 8 then raise exception 'Área inválida (pincel de 1 a 8 células).'; end if;
 perform 1 from public.battle_sessions where id=m.battle_session_id for update;
 if p_hidden then perform private.battle_assert_editable(m.id); end if;
 if p_hidden then
  insert into public.battle_map_fog(map_id,x,y) select m.id,x,y from generate_series(p_x,least(m.width-1,p_x+p_width-1)) x cross join generate_series(p_y,least(m.height-1,p_y+p_height-1)) y on conflict(map_id,x,y) do nothing;
 else delete from public.battle_map_fog where map_id=m.id and x>=p_x and x<least(m.width,p_x+p_width) and y>=p_y and y<least(m.height,p_y+p_height); end if;
 update public.battle_maps set updated_at=clock_timestamp() where id=m.id;
 perform private.session_event(m.adventure_session_id,case when p_hidden then 'fog_hidden' else 'fog_revealed' end,case when p_hidden then 'Área ocultada no grid' else 'Área revelada no grid' end,'Grid: '||m.name||' · Células: '||p_x||','||p_y||' · Área: '||p_width||' × '||p_height,case when p_hidden then 'gm' else 'players' end);
end $$;

create or replace function public.paint_battle_terrain(p_map_id uuid,p_x integer,p_y integer,p_width integer default 1,p_height integer default 1,p_terrain_type text default 'difficult',p_movement_cost numeric default 2,p_blocked boolean default false) returns integer
language plpgsql security definer set search_path='' as $$
declare m public.battle_maps; n integer; terrain text;
begin
 select * into m from public.battle_maps where id=p_map_id;
 if m.id is null or not private.is_campaign_owner(m.campaign_id) then raise exception 'Somente o mestre pode pintar o terreno.' using errcode='42501'; end if;
 if p_x is null or p_y is null or p_width is null or p_height is null or p_x<0 or p_y<0 or p_x>=m.width or p_y>=m.height or p_width not between 1 and 16 or p_height not between 1 and 16 then raise exception 'Pincel inválido: 1 a 16 células por dimensão.'; end if;
 terrain=trim(p_terrain_type);
 if terrain is null or length(terrain) not between 1 and 60 or p_movement_cost is null or p_movement_cost not between 0.1 and 10 or p_blocked is null then raise exception 'Terreno inválido: nome de 1 a 60 caracteres e custo entre 0,1 e 10.'; end if;
 perform private.battle_assert_editable(m.id);
 if terrain<>'normal' and p_blocked and exists(select 1 from public.battle_map_tokens t where t.map_id=m.id and t.z=0 and t.x<least(m.width,p_x+p_width) and t.x+t.size>p_x and t.y<least(m.height,p_y+p_height) and t.y+t.size>p_y) then raise exception 'O pincel bloqueia um personagem. Escolha outra área.'; end if;
 if terrain='normal' then
  delete from public.battle_map_cells where map_id=m.id and z=0 and x>=p_x and x<least(m.width,p_x+p_width) and y>=p_y and y<least(m.height,p_y+p_height);
 else
  insert into public.battle_map_cells(map_id,x,y,z,terrain_type,movement_cost,blocked,metadata)
  select m.id,x,y,0,terrain,p_movement_cost,p_blocked,'{}' from generate_series(p_x,least(m.width-1,p_x+p_width-1)) x cross join generate_series(p_y,least(m.height-1,p_y+p_height-1)) y
  on conflict(map_id,x,y,z) do update set terrain_type=excluded.terrain_type,movement_cost=excluded.movement_cost,blocked=excluded.blocked,metadata=excluded.metadata;
 end if;
 get diagnostics n=row_count;
 update public.battle_maps set updated_at=clock_timestamp() where id=m.id;
 perform private.session_event(m.adventure_session_id,'terrain_painted','Terreno atualizado no grid','Grid: '||m.name||' · Células alteradas: '||n||' · Terreno: '||terrain,'gm');
 return n;
end $$;
commit;

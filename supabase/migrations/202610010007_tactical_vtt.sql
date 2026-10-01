-- Tactical VTT v1. Logical grid coordinates are authoritative; Canvas/WebGL are presentation layers only.
create table public.battle_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 120),
  status text not null default 'preparing' check(status in ('preparing','active','ended')),
  round integer not null default 0 check(round >= 0),
  turn_index integer not null default 0 check(turn_index >= 0),
  active_token_id uuid,
  restrict_movement_to_turn boolean not null default true,
  turn_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,campaign_id)
);
create index battle_sessions_campaign_idx on public.battle_sessions(campaign_id,status);

create table public.battle_maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  battle_session_id uuid not null,
  name text not null check(length(trim(name)) between 1 and 120),
  description text not null default '',
  width integer not null default 30 check(width between 1 and 500),
  height integer not null default 20 check(height between 1 and 500),
  grid_size integer not null default 1 check(grid_size > 0),
  cell_size integer not null default 64 check(cell_size between 16 and 256),
  scale_per_cell numeric(10,4) not null default 1.5 check(scale_per_cell > 0),
  scale_unit text not null default 'm' check(scale_unit in ('m','ft')),
  diagonal_rule text not null default 'one' check(diagonal_rule in ('one','sqrt2','five-ten-five')),
  background_image text,
  background_offset_x numeric(12,4) not null default 0,
  background_offset_y numeric(12,4) not null default 0,
  background_scale numeric(10,4) not null default 1 check(background_scale > 0),
  grid_visible boolean not null default true,
  grid_opacity numeric(4,3) not null default 0.45 check(grid_opacity between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,campaign_id),
  foreign key(battle_session_id,campaign_id) references public.battle_sessions(id,campaign_id) on delete cascade
);
create index battle_maps_campaign_idx on public.battle_maps(campaign_id,created_at);
create index battle_maps_session_idx on public.battle_maps(battle_session_id);

create table public.battle_map_cells (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.battle_maps(id) on delete cascade,
  x integer not null check(x >= 0),
  y integer not null check(y >= 0),
  z integer not null default 0,
  terrain_type text not null default 'normal',
  movement_cost numeric(10,4) not null default 1 check(movement_cost > 0),
  blocked boolean not null default false,
  metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(map_id,x,y,z)
);
create index battle_map_cells_map_xy_idx on public.battle_map_cells(map_id,x,y,z);

-- Sparse scene objects keep walls/doors/obstacles/effects independent from the 2D renderer.
-- geometry is intentionally renderer-agnostic so the same logical scene can be projected in Three.js later.
create table public.battle_map_objects (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.battle_maps(id) on delete cascade,
  object_type text not null check(length(trim(object_type)) between 1 and 60),
  geometry jsonb not null default '{}' check(jsonb_typeof(geometry)='object'),
  z numeric(10,4) not null default 0,
  blocks_movement boolean not null default false,
  blocks_vision boolean not null default false,
  visible boolean not null default true,
  metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index battle_map_objects_map_idx on public.battle_map_objects(map_id,object_type);

create table public.battle_map_tokens (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  map_id uuid not null,
  character_id uuid references public.characters(id) on delete cascade,
  npc_id uuid references public.npcs(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 120),
  image text,
  x integer not null default 0 check(x >= 0),
  y integer not null default 0 check(y >= 0),
  z integer not null default 0,
  size numeric(6,2) not null default 1 check(size > 0),
  movement_speed numeric(10,4) not null check(movement_speed >= 0),
  movement_remaining numeric(10,4) not null check(movement_remaining >= 0),
  movement_unit text not null default 'm' check(movement_unit in ('m','ft')),
  controlled_by uuid references public.profiles(id) on delete set null,
  visible boolean not null default true,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(map_id,campaign_id) references public.battle_maps(id,campaign_id) on delete cascade,
  check(character_id is null or npc_id is null)
);
create index battle_map_tokens_map_idx on public.battle_map_tokens(map_id,visible);
create index battle_map_tokens_character_idx on public.battle_map_tokens(character_id) where character_id is not null;
create index battle_map_tokens_npc_idx on public.battle_map_tokens(npc_id) where npc_id is not null;

alter table public.battle_sessions add constraint battle_sessions_active_token_fk
  foreign key(active_token_id) references public.battle_map_tokens(id) on delete set null;

create table public.battle_turn_order (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.battle_sessions(id) on delete cascade,
  token_id uuid not null references public.battle_map_tokens(id) on delete cascade,
  position integer not null check(position >= 0),
  initiative numeric(10,3) not null default 0,
  created_at timestamptz not null default now(),
  unique(session_id,token_id),
  unique(session_id,position)
);
create index battle_turn_order_session_idx on public.battle_turn_order(session_id,position);

create table public.battle_movements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  session_id uuid references public.battle_sessions(id) on delete set null,
  token_id uuid not null references public.battle_map_tokens(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  from_x integer not null,
  from_y integer not null,
  to_x integer not null,
  to_y integer not null,
  movement_cost numeric(10,4) not null check(movement_cost >= 0),
  movement_unit text not null check(movement_unit in ('m','ft')),
  path jsonb not null default '[]' check(jsonb_typeof(path)='array'),
  turn_round integer,
  created_at timestamptz not null default now()
);
create index battle_movements_token_created_idx on public.battle_movements(token_id,created_at desc);
create index battle_movements_campaign_created_idx on public.battle_movements(campaign_id,created_at desc);

create function private.validate_battle_cell_bounds() returns trigger language plpgsql set search_path='' as $$
declare m public.battle_maps;
begin
  select * into m from public.battle_maps where id=new.map_id;
  if m.id is null or new.x>=m.width or new.y>=m.height then raise exception 'Célula fora dos limites do mapa.'; end if;
  return new;
end $$;
create function private.validate_battle_token_context() returns trigger language plpgsql set search_path='' as $$
declare m public.battle_maps; cid uuid;
begin
  select * into m from public.battle_maps where id=new.map_id;
  if m.id is null or m.campaign_id<>new.campaign_id or new.x>=m.width or new.y>=m.height then raise exception 'Token fora do contexto do mapa.'; end if;
  if new.character_id is not null then select campaign_id into cid from public.characters where id=new.character_id; if cid is distinct from new.campaign_id then raise exception 'Personagem não pertence à campanha do mapa.'; end if; end if;
  if new.npc_id is not null then select campaign_id into cid from public.npcs where id=new.npc_id; if cid is distinct from new.campaign_id then raise exception 'NPC não pertence à campanha do mapa.'; end if; end if;
  if new.controlled_by is not null and not exists(
    select 1 from public.campaigns c where c.id=new.campaign_id and (c.owner_id=new.controlled_by or exists(select 1 from public.campaign_members cm where cm.campaign_id=c.id and cm.user_id=new.controlled_by))
  ) then raise exception 'O controlador do token não pertence à campanha.'; end if;
  return new;
end $$;
create function private.validate_battle_map_resize() returns trigger language plpgsql set search_path='' as $$
begin
  if (new.width<old.width or new.height<old.height) and (
    exists(select 1 from public.battle_map_tokens t where t.map_id=new.id and (t.x>=new.width or t.y>=new.height)) or
    exists(select 1 from public.battle_map_cells c where c.map_id=new.id and (c.x>=new.width or c.y>=new.height))
  ) then raise exception 'Reposicione tokens e terrenos antes de reduzir os limites do mapa.'; end if;
  return new;
end $$;
create trigger validate_battle_cell_bounds before insert or update on public.battle_map_cells for each row execute function private.validate_battle_cell_bounds();
create trigger validate_battle_token_context before insert or update on public.battle_map_tokens for each row execute function private.validate_battle_token_context();
create trigger validate_battle_map_resize before update of width,height on public.battle_maps for each row execute function private.validate_battle_map_resize();

create trigger touch_updated_at before update on public.battle_sessions for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.battle_maps for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.battle_map_cells for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.battle_map_objects for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.battle_map_tokens for each row execute function private.touch_updated_at();

create function private.battle_map_campaign(p_map uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select campaign_id from public.battle_maps where id=p_map;
$$;
create function private.battle_session_campaign(p_session uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select campaign_id from public.battle_sessions where id=p_session;
$$;
create function private.can_read_battle_token(p_token uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.battle_map_tokens t
    where t.id=p_token and private.can_read_campaign(t.campaign_id)
      and (private.is_campaign_owner(t.campaign_id) or t.visible or t.controlled_by=(select auth.uid())
        or exists(select 1 from public.characters c where c.id=t.character_id and c.owner_id=(select auth.uid())))
  );
$$;
create function private.can_control_battle_token(p_token uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.battle_map_tokens t
    where t.id=p_token and private.can_read_campaign(t.campaign_id)
      and (private.is_campaign_owner(t.campaign_id) or t.controlled_by=(select auth.uid())
        or exists(select 1 from public.characters c where c.id=t.character_id and c.owner_id=(select auth.uid())))
  );
$$;

alter table public.battle_sessions enable row level security;
alter table public.battle_maps enable row level security;
alter table public.battle_map_cells enable row level security;
alter table public.battle_map_objects enable row level security;
alter table public.battle_map_tokens enable row level security;
alter table public.battle_turn_order enable row level security;
alter table public.battle_movements enable row level security;

revoke all on public.battle_sessions,public.battle_maps,public.battle_map_cells,public.battle_map_objects,public.battle_map_tokens,public.battle_turn_order,public.battle_movements from anon,authenticated;
grant select on public.battle_sessions,public.battle_maps,public.battle_map_cells,public.battle_map_objects,public.battle_map_tokens,public.battle_turn_order,public.battle_movements to authenticated;
grant insert,update,delete on public.battle_sessions,public.battle_maps,public.battle_map_cells,public.battle_map_objects,public.battle_map_tokens,public.battle_turn_order to authenticated;

create policy battle_sessions_read on public.battle_sessions for select to authenticated using(private.can_read_campaign(campaign_id));
create policy battle_sessions_create on public.battle_sessions for insert to authenticated with check(private.is_campaign_owner(campaign_id));
create policy battle_sessions_edit on public.battle_sessions for update to authenticated using(private.is_campaign_owner(campaign_id)) with check(private.is_campaign_owner(campaign_id));
create policy battle_sessions_delete on public.battle_sessions for delete to authenticated using(private.is_campaign_owner(campaign_id));

create policy battle_maps_read on public.battle_maps for select to authenticated using(private.can_read_campaign(campaign_id));
create policy battle_maps_create on public.battle_maps for insert to authenticated with check(private.is_campaign_owner(campaign_id));
create policy battle_maps_edit on public.battle_maps for update to authenticated using(private.is_campaign_owner(campaign_id)) with check(private.is_campaign_owner(campaign_id));
create policy battle_maps_delete on public.battle_maps for delete to authenticated using(private.is_campaign_owner(campaign_id));

create policy battle_cells_read on public.battle_map_cells for select to authenticated using(private.can_read_campaign(private.battle_map_campaign(map_id)));
create policy battle_cells_create on public.battle_map_cells for insert to authenticated with check(private.is_campaign_owner(private.battle_map_campaign(map_id)));
create policy battle_cells_edit on public.battle_map_cells for update to authenticated using(private.is_campaign_owner(private.battle_map_campaign(map_id))) with check(private.is_campaign_owner(private.battle_map_campaign(map_id)));
create policy battle_cells_delete on public.battle_map_cells for delete to authenticated using(private.is_campaign_owner(private.battle_map_campaign(map_id)));

create policy battle_objects_read on public.battle_map_objects for select to authenticated using(private.can_read_campaign(private.battle_map_campaign(map_id)) and (visible or private.is_campaign_owner(private.battle_map_campaign(map_id))));
create policy battle_objects_create on public.battle_map_objects for insert to authenticated with check(private.is_campaign_owner(private.battle_map_campaign(map_id)));
create policy battle_objects_edit on public.battle_map_objects for update to authenticated using(private.is_campaign_owner(private.battle_map_campaign(map_id))) with check(private.is_campaign_owner(private.battle_map_campaign(map_id)));
create policy battle_objects_delete on public.battle_map_objects for delete to authenticated using(private.is_campaign_owner(private.battle_map_campaign(map_id)));

create policy battle_tokens_read on public.battle_map_tokens for select to authenticated using(private.can_read_battle_token(id));
create policy battle_tokens_create on public.battle_map_tokens for insert to authenticated with check(private.is_campaign_owner(campaign_id));
-- Direct token writes are GM-only. Player movement is exclusively through the checked RPC below.
create policy battle_tokens_edit on public.battle_map_tokens for update to authenticated using(private.is_campaign_owner(campaign_id)) with check(private.is_campaign_owner(campaign_id));
create policy battle_tokens_delete on public.battle_map_tokens for delete to authenticated using(private.is_campaign_owner(campaign_id));

create policy battle_turn_order_read on public.battle_turn_order for select to authenticated using(private.is_campaign_owner(private.battle_session_campaign(session_id)) or private.can_read_battle_token(token_id));
create policy battle_turn_order_create on public.battle_turn_order for insert to authenticated with check(private.is_campaign_owner(private.battle_session_campaign(session_id)));
create policy battle_turn_order_edit on public.battle_turn_order for update to authenticated using(private.is_campaign_owner(private.battle_session_campaign(session_id))) with check(private.is_campaign_owner(private.battle_session_campaign(session_id)));
create policy battle_turn_order_delete on public.battle_turn_order for delete to authenticated using(private.is_campaign_owner(private.battle_session_campaign(session_id)));

create policy battle_movements_read on public.battle_movements for select to authenticated using(private.is_campaign_owner(campaign_id) or private.can_read_battle_token(token_id));

create or replace function public.create_battle_map(p_campaign_id uuid,p_payload jsonb) returns public.battle_maps
language plpgsql security definer set search_path='' as $$
declare session_row public.battle_sessions; map_row public.battle_maps;
begin
  if not private.is_campaign_owner(p_campaign_id) then raise exception 'Apenas o mestre pode criar mapas.' using errcode='42501'; end if;
  insert into public.battle_sessions(campaign_id,name,restrict_movement_to_turn)
  values(p_campaign_id,coalesce(nullif(trim(p_payload->>'session_name'),''),coalesce(nullif(trim(p_payload->>'name'),''),'Mesa tática')),coalesce((p_payload->>'restrict_movement_to_turn')::boolean,true))
  returning * into session_row;

  insert into public.battle_maps(campaign_id,battle_session_id,name,description,width,height,cell_size,scale_per_cell,scale_unit,diagonal_rule,grid_visible,grid_opacity)
  values(
    p_campaign_id,session_row.id,coalesce(nullif(trim(p_payload->>'name'),''),'Novo mapa'),coalesce(p_payload->>'description',''),
    coalesce((p_payload->>'width')::integer,30),coalesce((p_payload->>'height')::integer,20),coalesce((p_payload->>'cell_size')::integer,64),
    coalesce((p_payload->>'scale_per_cell')::numeric,1.5),coalesce(nullif(p_payload->>'scale_unit',''),'m'),coalesce(nullif(p_payload->>'diagonal_rule',''),'one'),
    coalesce((p_payload->>'grid_visible')::boolean,true),coalesce((p_payload->>'grid_opacity')::numeric,0.45)
  ) returning * into map_row;
  return map_row;
end $$;

create or replace function public.add_character_to_battle_map(p_map_id uuid,p_character_id uuid,p_x integer default 0,p_y integer default 0) returns public.battle_map_tokens
language plpgsql security definer set search_path='' as $$
declare m public.battle_maps; c public.characters; result public.battle_map_tokens; system_slug text; speed numeric;
begin
  select * into m from public.battle_maps where id=p_map_id;
  if m.id is null or not private.is_campaign_owner(m.campaign_id) then raise exception 'Apenas o mestre pode adicionar personagens.' using errcode='42501'; end if;
  select * into c from public.characters where id=p_character_id and campaign_id=m.campaign_id;
  if c.id is null then raise exception 'Personagem não pertence a esta campanha.'; end if;
  if p_x<0 or p_y<0 or p_x>=m.width or p_y>=m.height then raise exception 'Posição inicial fora do mapa.'; end if;
  if exists(select 1 from public.battle_map_cells where map_id=m.id and x=p_x and y=p_y and z=0 and blocked) then raise exception 'A posição inicial está bloqueada.'; end if;
  if exists(select 1 from public.battle_map_tokens where map_id=m.id and x=p_x and y=p_y and z=0) then raise exception 'A posição inicial já está ocupada.'; end if;
  if exists(select 1 from public.battle_map_tokens where map_id=m.id and character_id=c.id) then raise exception 'Este personagem já está no mapa.'; end if;
  select slug into system_slug from public.rpg_systems where id=c.rpg_system_id;
  if c.system_data ? 'speed_override' and nullif(c.system_data->>'speed_override','') is not null then
    speed=(c.system_data->>'speed_override')::numeric;
  elsif system_slug='dnd5e' then
    speed=case when coalesce(c.system_data->>'race','') in ('Anão','Halfling','Gnomo') then 7.5 else 9 end;
  else
    raise exception 'A ficha não fornece um deslocamento que o VTT consiga interpretar.';
  end if;
  insert into public.battle_map_tokens(campaign_id,map_id,character_id,name,image,x,y,size,movement_speed,movement_remaining,movement_unit,controlled_by,visible)
  values(m.campaign_id,m.id,c.id,c.name,c.portrait_path,p_x,p_y,1,speed,speed,'m',c.owner_id,true)
  returning * into result;
  return result;
end $$;

create or replace function public.add_npc_to_battle_map(p_map_id uuid,p_npc_id uuid,p_movement_speed numeric,p_movement_unit text default 'm',p_x integer default 0,p_y integer default 0) returns public.battle_map_tokens
language plpgsql security definer set search_path='' as $$
declare m public.battle_maps; n public.npcs; result public.battle_map_tokens;
begin
  select * into m from public.battle_maps where id=p_map_id;
  if m.id is null or not private.is_campaign_owner(m.campaign_id) then raise exception 'Apenas o mestre pode adicionar NPCs.' using errcode='42501'; end if;
  select * into n from public.npcs where id=p_npc_id and campaign_id=m.campaign_id;
  if n.id is null then raise exception 'NPC não pertence a esta campanha.'; end if;
  if p_movement_speed is null or p_movement_speed<0 or p_movement_unit not in ('m','ft') then raise exception 'Informe um deslocamento válido para o NPC.'; end if;
  if p_x<0 or p_y<0 or p_x>=m.width or p_y>=m.height then raise exception 'Posição inicial fora do mapa.'; end if;
  if exists(select 1 from public.battle_map_cells where map_id=m.id and x=p_x and y=p_y and z=0 and blocked) then raise exception 'A posição inicial está bloqueada.'; end if;
  if exists(select 1 from public.battle_map_tokens where map_id=m.id and x=p_x and y=p_y and z=0) then raise exception 'A posição inicial já está ocupada.'; end if;
  if exists(select 1 from public.battle_map_tokens where map_id=m.id and npc_id=n.id) then raise exception 'Este NPC já está no mapa.'; end if;
  insert into public.battle_map_tokens(campaign_id,map_id,npc_id,name,image,x,y,size,movement_speed,movement_remaining,movement_unit,visible)
  values(m.campaign_id,m.id,n.id,n.name,n.image_path,p_x,p_y,1,p_movement_speed,p_movement_speed,p_movement_unit,n.visible_to_players)
  returning * into result;
  return result;
end $$;

create or replace function public.start_battle_combat(p_session_id uuid,p_order jsonb) returns public.battle_sessions
language plpgsql security definer set search_path='' as $$
declare s public.battle_sessions; item jsonb; idx integer=0; first_token uuid; result public.battle_sessions;
begin
  select * into s from public.battle_sessions where id=p_session_id for update;
  if s.id is null or not private.is_campaign_owner(s.campaign_id) then raise exception 'Apenas o mestre pode iniciar o combate.' using errcode='42501'; end if;
  if p_order is null or jsonb_typeof(p_order)<>'array' or jsonb_array_length(p_order)=0 then raise exception 'Defina a ordem de iniciativa.'; end if;
  delete from public.battle_turn_order where session_id=s.id;
  for item in select value from jsonb_array_elements(p_order) loop
    if not exists(select 1 from public.battle_map_tokens t join public.battle_maps m on m.id=t.map_id where t.id=(item->>'token_id')::uuid and m.battle_session_id=s.id) then
      raise exception 'A ordem contém um token que não pertence à mesa.';
    end if;
    insert into public.battle_turn_order(session_id,token_id,position,initiative)
    values(s.id,(item->>'token_id')::uuid,idx,coalesce((item->>'initiative')::numeric,0));
    if idx=0 then first_token=(item->>'token_id')::uuid; end if;
    idx=idx+1;
  end loop;
  update public.battle_map_tokens set movement_remaining=movement_speed where id=first_token;
  update public.battle_sessions set status='active',round=1,turn_index=0,active_token_id=first_token,turn_started_at=now() where id=s.id returning * into result;
  return result;
end $$;

create or replace function public.advance_battle_turn(p_session_id uuid) returns public.battle_sessions
language plpgsql security definer set search_path='' as $$
declare s public.battle_sessions; total integer; next_index integer; next_round integer; next_token uuid; result public.battle_sessions;
begin
  select * into s from public.battle_sessions where id=p_session_id for update;
  if s.id is null or (not private.is_campaign_owner(s.campaign_id) and (s.active_token_id is null or not private.can_control_battle_token(s.active_token_id))) then raise exception 'Você não pode encerrar este turno.' using errcode='42501'; end if;
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

create or replace function public.end_battle_combat(p_session_id uuid) returns public.battle_sessions
language plpgsql security definer set search_path='' as $$
declare s public.battle_sessions; result public.battle_sessions;
begin
  select * into s from public.battle_sessions where id=p_session_id for update;
  if s.id is null or not private.is_campaign_owner(s.campaign_id) then raise exception 'Apenas o mestre pode encerrar o combate.' using errcode='42501'; end if;
  update public.battle_sessions set status='ended',active_token_id=null,turn_started_at=null where id=s.id returning * into result;
  return result;
end $$;

create or replace function public.move_battle_token(p_token_id uuid,p_to_x integer,p_to_y integer,p_path jsonb,p_expected_version bigint,p_force boolean default false) returns public.battle_map_tokens
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
  if p_to_x<0 or p_to_y<0 or p_to_x>=m.width or p_to_y>=m.height then raise exception 'Destino fora do mapa.'; end if;
  if s.status='active' and s.restrict_movement_to_turn and s.active_token_id<>t.id and not token_owner and not p_force then
    raise exception 'Aguarde o turno deste token.' using errcode='42501';
  end if;
  if p_path is null or jsonb_typeof(p_path)<>'array' then raise exception 'Caminho inválido.'; end if;
  item_count=jsonb_array_length(p_path);
  if item_count=0 or item_count>500 then raise exception 'Caminho inválido.'; end if;
  cx=t.x; cy=t.y;
  for step in select value from jsonb_array_elements(p_path) loop
    nx=(step->>'x')::integer; ny=(step->>'y')::integer;
    if nx<0 or ny<0 or nx>=m.width or ny>=m.height or abs(nx-cx)>1 or abs(ny-cy)>1 or (nx=cx and ny=cy) then raise exception 'O caminho contém uma etapa inválida.'; end if;
    select c.blocked,c.movement_cost into blocked_cell,terrain_cost from public.battle_map_cells c where c.map_id=m.id and c.x=nx and c.y=ny and c.z=t.z;
    blocked_cell=coalesce(blocked_cell,false); terrain_cost=coalesce(terrain_cost,1);
    if blocked_cell then raise exception 'O caminho atravessa uma célula bloqueada.'; end if;
    if nx<>cx and ny<>cy and (
      exists(select 1 from public.battle_map_cells side where side.map_id=m.id and side.z=t.z and side.blocked and ((side.x=nx and side.y=cy) or (side.x=cx and side.y=ny))) or
      exists(select 1 from public.battle_map_tokens other where other.map_id=m.id and other.id<>t.id and other.visible and other.z=t.z and ((other.x=nx and other.y=cy) or (other.x=cx and other.y=ny)))
    ) then raise exception 'O caminho tenta atravessar um canto bloqueado.'; end if;
    if exists(select 1 from public.battle_map_tokens other where other.map_id=m.id and other.id<>t.id and other.visible and other.x=nx and other.y=ny and other.z=t.z) then
      raise exception 'O caminho atravessa um token.';
    end if;
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
    movement_cost=case when m.scale_unit='m' and t.movement_unit='ft' then movement_cost*3.280839895 else movement_cost/3.280839895 end;
  end if;
  if s.status='active' and movement_cost>t.movement_remaining+0.0001 and not p_force then raise exception 'Movimento acima do deslocamento restante.' using errcode='42501'; end if;
  update public.battle_map_tokens set x=p_to_x,y=p_to_y,movement_remaining=case when s.status='active' then greatest(0,movement_remaining-movement_cost) else movement_remaining end,version=version+1 where id=t.id returning * into result;
  insert into public.battle_movements(campaign_id,session_id,token_id,character_id,from_x,from_y,to_x,to_y,movement_cost,movement_unit,path,turn_round)
  values(t.campaign_id,s.id,t.id,t.character_id,t.x,t.y,p_to_x,p_to_y,movement_cost,t.movement_unit,p_path,case when s.status='active' then s.round else null end);
  return result;
end $$;

revoke execute on function private.battle_map_campaign(uuid), private.battle_session_campaign(uuid), private.can_read_battle_token(uuid), private.can_control_battle_token(uuid), private.validate_battle_cell_bounds(), private.validate_battle_token_context(), private.validate_battle_map_resize() from public,anon;
grant execute on function private.battle_map_campaign(uuid), private.battle_session_campaign(uuid), private.can_read_battle_token(uuid), private.can_control_battle_token(uuid), private.validate_battle_cell_bounds(), private.validate_battle_token_context(), private.validate_battle_map_resize() to authenticated;

revoke execute on function public.create_battle_map(uuid,jsonb), public.add_character_to_battle_map(uuid,uuid,integer,integer), public.add_npc_to_battle_map(uuid,uuid,numeric,text,integer,integer), public.start_battle_combat(uuid,jsonb), public.advance_battle_turn(uuid), public.end_battle_combat(uuid), public.move_battle_token(uuid,integer,integer,jsonb,bigint,boolean) from public,anon;
grant execute on function public.create_battle_map(uuid,jsonb), public.add_character_to_battle_map(uuid,uuid,integer,integer), public.add_npc_to_battle_map(uuid,uuid,numeric,text,integer,integer), public.start_battle_combat(uuid,jsonb), public.advance_battle_turn(uuid), public.end_battle_combat(uuid), public.move_battle_token(uuid,integer,integer,jsonb,bigint,boolean) to authenticated;

-- Extend private media access to map backgrounds, preserving the existing bucket.
create or replace function private.can_access_media(p_name text,p_write boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare entity text=split_part(p_name,'/',1); raw_id text=split_part(p_name,'/',2); target uuid; cid uuid;
begin
  if auth.uid() is null or raw_id!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or split_part(p_name,'/',3)='' then return false; end if;
  target=raw_id::uuid;
  case entity
    when 'profiles' then return case when p_write then target=auth.uid() else private.can_read_profile(target) end;
    when 'campaigns' then return case when p_write then private.is_campaign_owner(target) else private.can_read_campaign(target) end;
    when 'characters' then return case when p_write then private.can_edit_character(target) else private.can_edit_character(target) or exists(select 1 from public.battle_map_tokens t where t.character_id=target and private.can_read_battle_token(t.id)) end;
    when 'npcs' then return case when p_write then private.can_edit_npc(target) else private.can_read_npc(target) or exists(select 1 from public.battle_map_tokens t where t.npc_id=target and private.can_read_battle_token(t.id)) end;
    when 'world_regions' then return case when p_write then private.is_campaign_owner(private.world_campaign('region',target)) else private.can_read_world('region',target) end;
    when 'world_cities' then return case when p_write then private.is_campaign_owner(private.world_campaign('city',target)) else private.can_read_world('city',target) end;
    when 'world_locations' then return case when p_write then private.is_campaign_owner(private.world_campaign('location',target)) else private.can_read_world('location',target) end;
    when 'battle_maps' then cid=private.battle_map_campaign(target); return case when p_write then private.is_campaign_owner(cid) else private.can_read_campaign(cid) end;
    else return false;
  end case;
end $$;

-- Realtime: token movement, turn changes and GM map/cell edits reach every connected client.
do $$ declare t text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['battle_sessions','battle_maps','battle_map_cells','battle_map_objects','battle_map_tokens','battle_turn_order','battle_movements'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;

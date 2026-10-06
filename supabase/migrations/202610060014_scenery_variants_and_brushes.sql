-- VTT v13: scalable terrain brushes, scene eraser, object variants and individual colors.
begin;
create function private.battle_is_scenery_kind(p_kind text) returns boolean language sql immutable set search_path='' as $$
 select p_kind=any(array['tree','pine','rock','mountain','water','fire','lava','ruin','tent','road','cart','ice','pit','portal','barrel','campfire','boat','bush','flowers','statue','chest']);
$$;
revoke all on function private.battle_is_scenery_kind(text) from public,anon;
grant execute on function private.battle_is_scenery_kind(text) to authenticated;
create function private.battle_valid_scenery_variant(p_kind text,p_variant text) returns boolean language sql immutable set search_path='' as $$
 select p_variant='default' or case p_kind
 when 'portal' then p_variant in('door','cave') when 'ice' then p_variant='snow'
 when 'boat' then p_variant='ship' when 'barrel' then p_variant='crate'
 when 'campfire' then p_variant='brazier' when 'bush' then p_variant='thorn'
 when 'flowers' then p_variant='mushrooms' when 'statue' then p_variant='obelisk'
 when 'chest' then p_variant='open' when 'tree' then p_variant='autumn'
 when 'rock' then p_variant='crystal' when 'road' then p_variant='cobblestone' else false end;
$$;
revoke all on function private.battle_valid_scenery_variant(text,text) from public,anon,authenticated;
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
  if (select count(*) from public.battle_map_objects o join public.battle_maps bm on bm.id=o.map_id where bm.campaign_id=m.campaign_id and o.object_type='portal' and upper(trim(o.metadata->>'portal_code'))=code and o.id<>new.id)>=2 then raise exception 'Este código já liga dois portais. Use outro código.'; end if;
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

create or replace function private.battle_footprint_cost(p_map uuid,px integer,py integer,pz numeric,p_size numeric,p_token uuid) returns numeric
language plpgsql stable security definer set search_path='' as $$
declare result numeric=1; m public.battle_maps;
begin
 select * into m from public.battle_maps where id=p_map;
 if px<0 or py<0 or px+p_size>m.width or py+p_size>m.height then return null; end if;
 if exists(select 1 from public.battle_map_cells c where c.map_id=p_map and c.z=pz and c.blocked and c.x>=px and c.x<px+p_size and c.y>=py and c.y<py+p_size) or
 exists(select 1 from public.battle_map_tokens t where t.map_id=p_map and t.id<>p_token and t.z=pz and t.x<px+p_size and t.x+t.size>px and t.y<py+p_size and t.y+t.size>py) or
 exists(select 1 from public.battle_map_objects o where o.map_id=p_map and o.z=pz and o.blocks_movement and private.battle_is_scenery_kind(o.object_type) and (o.geometry->>'x')::integer<px+p_size and (o.geometry->>'x')::integer+(o.geometry->>'width')::integer>px and (o.geometry->>'y')::integer<py+p_size and (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>py) then return null; end if;
 select greatest(result,coalesce(max(c.movement_cost),1)) into result from public.battle_map_cells c where c.map_id=p_map and c.z=pz and c.x>=px and c.x<px+p_size and c.y>=py and c.y<py+p_size;
 select greatest(result,coalesce(max(coalesce((o.metadata->>'movement_cost')::numeric,1)),1)) into result from public.battle_map_objects o where o.map_id=p_map and o.z=pz and private.battle_is_scenery_kind(o.object_type) and (o.geometry->>'x')::integer<px+p_size and (o.geometry->>'x')::integer+(o.geometry->>'width')::integer>px and (o.geometry->>'y')::integer<py+p_size and (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>py;
 return result;
end $$;

create or replace function private.battle_scenery_resize() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.width<>old.width or new.height<>old.height) and exists(select 1 from public.battle_map_objects o where o.map_id=new.id and private.battle_is_scenery_kind(o.object_type) and ((o.geometry->>'x')::integer+(o.geometry->>'width')::integer>new.width or (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>new.height)) then raise exception 'Remova ou reposicione os objetos antes de reduzir o mapa.'; end if;
 if exists(select 1 from public.battle_map_fog f where f.map_id=new.id and (f.x>=new.width or f.y>=new.height)) then raise exception 'Revele as áreas ocultas antes de reduzir o mapa.'; end if;
 return new;
end $$;

create or replace function private.battle_scenery_token_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.battle_sessions where id=(select battle_session_id from public.battle_maps where id=new.map_id) for update;
 if exists(select 1 from public.battle_map_objects o where o.map_id=new.map_id and o.z=new.z and o.blocks_movement and private.battle_is_scenery_kind(o.object_type) and (o.geometry->>'x')::integer<new.x+new.size and (o.geometry->>'x')::integer+(o.geometry->>'width')::integer>new.x and (o.geometry->>'y')::integer<new.y+new.size and (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>new.y) then raise exception 'A posição está bloqueada por um objeto do cenário.'; end if;
 return new;
end $$;

drop policy battle_objects_read on public.battle_map_objects;
create policy battle_objects_read on public.battle_map_objects for select to authenticated using(private.can_read_battle_map(map_id) and
 (private.is_campaign_owner(private.battle_map_campaign(map_id)) or visible and case when private.battle_is_scenery_kind(object_type) then
 not private.battle_area_hidden(map_id,(geometry->>'x')::numeric,(geometry->>'y')::numeric,(geometry->>'width')::numeric,(geometry->>'height')::numeric) else true end));

-- Paint/clear one clipped rectangle atomically; one request replaces up to 256 single-cell requests.
create function public.paint_battle_terrain(p_map_id uuid,p_x integer,p_y integer,p_width integer default 1,p_height integer default 1,p_terrain_type text default 'difficult',p_movement_cost numeric default 2,p_blocked boolean default false) returns integer
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
 return n;
end $$;
revoke all on function public.paint_battle_terrain(uuid,integer,integer,integer,integer,text,numeric,boolean) from public,anon;
grant execute on function public.paint_battle_terrain(uuid,integer,integer,integer,integer,text,numeric,boolean) to authenticated;

-- Delete complete objects intersected by the brush, preserving their underlying painted terrain.
create function public.erase_battle_scenery(p_map_id uuid,p_x integer,p_y integer,p_width integer default 1,p_height integer default 1) returns integer
language plpgsql security definer set search_path='' as $$
declare m public.battle_maps; n integer;
begin
 select * into m from public.battle_maps where id=p_map_id;
 if m.id is null or not private.is_campaign_owner(m.campaign_id) then raise exception 'Somente o mestre pode apagar objetos.' using errcode='42501'; end if;
 if p_x is null or p_y is null or p_width is null or p_height is null or p_x<0 or p_y<0 or p_x>=m.width or p_y>=m.height or p_width not between 1 and 16 or p_height not between 1 and 16 then raise exception 'Pincel inválido: 1 a 16 células por dimensão.'; end if;
 perform private.battle_assert_editable(m.id);
 delete from public.battle_map_objects o where o.map_id=m.id and case when private.battle_is_scenery_kind(o.object_type) then
  (o.geometry->>'x')::integer<least(m.width,p_x+p_width) and (o.geometry->>'x')::integer+(o.geometry->>'width')::integer>p_x and
  (o.geometry->>'y')::integer<least(m.height,p_y+p_height) and (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>p_y else false end;
 get diagnostics n=row_count;
 update public.battle_maps set updated_at=clock_timestamp() where id=m.id;
 return n;
end $$;
revoke all on function public.erase_battle_scenery(uuid,integer,integer,integer,integer) from public,anon;
grant execute on function public.erase_battle_scenery(uuid,integer,integer,integer,integer) to authenticated;
commit;

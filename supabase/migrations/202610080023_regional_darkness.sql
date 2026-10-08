-- Regional darkness independent of day/night. Later rectangles override earlier ones.
-- Run after 022; existing scenes remain unchanged (day = none, regions = []).
begin;
alter table public.battle_maps add column if not exists day_darkness_level text not null default 'none';
alter table public.battle_maps add column if not exists darkness_regions jsonb not null default '[]'::jsonb;
alter table public.battle_maps drop constraint if exists battle_maps_darkness_valid;
alter table public.battle_maps add constraint battle_maps_darkness_valid check (darkness_level in ('none','dim','dark','magical'));
alter table public.battle_maps add constraint battle_maps_day_darkness_valid check (day_darkness_level in ('none','dim','dark','magical'));
alter table public.battle_maps add constraint battle_maps_darkness_regions_array check (jsonb_typeof(darkness_regions)='array' and jsonb_array_length(darkness_regions)<=120);

-- Allows toggling the previous individual-vision switch when night mode is "none".
create or replace function public.set_battle_map_vision(p_map_id uuid,p_enabled boolean,p_darkness text)
returns public.battle_maps language plpgsql security definer set search_path='' as $$
declare m public.battle_maps; status text;
begin
  select * into m from public.battle_maps where id=p_map_id for update;
  if m.id is null or not private.is_campaign_owner(m.campaign_id) then
    raise exception 'Somente o mestre pode alterar a visão do grid.' using errcode='42501';
  end if;
  if p_enabled is null or p_darkness is null or p_darkness not in ('none','dim','dark','magical') then
    raise exception 'Escolha uma iluminação válida: penumbra, escuridão ou escuridão mágica.';
  end if;
  if m.adventure_session_id is not null then
    select s.status into status from public.campaign_sessions s where s.id=m.adventure_session_id;
    if status='ended' then raise exception 'A iluminação de um capítulo encerrado não pode mudar.' using errcode='42501'; end if;
  end if;
  update public.battle_maps set vision_enabled=p_enabled, darkness_level=p_darkness,
    updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
    where id=p_map_id returning * into m;
  return m;
end $$;

create or replace function public.set_battle_map_darkness(p_map_id uuid,p_level text,p_period text)
returns public.battle_maps language plpgsql security definer set search_path='' as $$
declare m public.battle_maps;
begin
  select * into m from public.battle_maps where id=p_map_id for update;
  if m.id is null or not private.is_campaign_owner(m.campaign_id) then
    raise exception 'Somente o mestre pode alterar a escuridão.' using errcode='42501';
  end if;
  if p_level is null or p_level not in ('none','dim','dark','magical') or p_period is null or p_period not in ('day','night') then
    raise exception 'Selecione um nível de escuridão válido.';
  end if;
  if exists(select 1 from public.campaign_sessions where id=m.adventure_session_id and status='ended') then
    raise exception 'Não é permitido editar capítulos encerrados.' using errcode='42501';
  end if;
  if p_period='day' then
    update public.battle_maps set day_darkness_level=p_level,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
    where id=p_map_id returning * into m;
  else
    update public.battle_maps set darkness_level=p_level,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
    where id=p_map_id returning * into m;
  end if;
  return m;
end $$;
revoke all on function public.set_battle_map_darkness(uuid,text,text) from public,anon;
grant execute on function public.set_battle_map_darkness(uuid,text,text) to authenticated;

create or replace function public.set_battle_map_darkness_regions(p_map_id uuid,p_regions jsonb)
returns public.battle_maps language plpgsql security definer set search_path='' as $$
declare m public.battle_maps; region jsonb;
begin
  select * into m from public.battle_maps where id=p_map_id for update;
  if m.id is null or not private.is_campaign_owner(m.campaign_id) then
    raise exception 'Somente o mestre pode alterar regiões de escuridão.' using errcode='42501';
  end if;
  if exists(select 1 from public.campaign_sessions where id=m.adventure_session_id and status='ended') then
    raise exception 'Não é permitido editar capítulos encerrados.' using errcode='42501';
  end if;
  if p_regions is null or jsonb_typeof(p_regions) is distinct from 'array' then
    raise exception 'As regiões devem formar uma lista.';
  end if;
  if jsonb_array_length(p_regions)>120 then raise exception 'O limite é 120 regiões por mapa.'; end if;
  for region in select value from jsonb_array_elements(p_regions)
  loop
    if jsonb_typeof(region) is distinct from 'object'
      or jsonb_typeof(region->'id') is distinct from 'string'
      or length(region->>'id') not between 1 and 64
      or coalesce(region->>'level','') not in ('none','dim','dark','magical')
      or coalesce(region->>'x','') !~ '^[0-9]{1,6}$'
      or coalesce(region->>'y','') !~ '^[0-9]{1,6}$'
      or coalesce(region->>'width','') !~ '^[0-9]{1,6}$'
      or coalesce(region->>'height','') !~ '^[0-9]{1,6}$'
    then raise exception 'Região inválida.'; end if;
    if (region->>'x')::int < 0 or (region->>'y')::int < 0
      or (region->>'width')::int < 1 or (region->>'height')::int < 1
      or (region->>'x')::int + (region->>'width')::int > m.width
      or (region->>'y')::int + (region->>'height')::int > m.height
    then raise exception 'A região excede os limites do grid.'; end if;
  end loop;
  update public.battle_maps set darkness_regions=p_regions,
    updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
    where id=p_map_id returning * into m;
  return m;
end $$;
revoke all on function public.set_battle_map_darkness_regions(uuid,jsonb) from public,anon;
grant execute on function public.set_battle_map_darkness_regions(uuid,jsonb) to authenticated;

-- Preserve overrides when a map is copied to a new chapter.
create or replace function public.copy_battle_map_to_session(p_map_id uuid,p_session_id uuid,p_name text default null)
returns public.battle_maps language plpgsql security definer set search_path='' as $$
declare source public.battle_maps; target public.battle_maps; sid uuid;
begin
  select * into source from public.battle_maps where id=p_map_id for share;
  if source.id is null or not private.is_campaign_owner(source.campaign_id) then raise exception 'Somente o mestre pode reaproveitar este cenário.' using errcode='42501'; end if;
  sid=private.adventure_destination(source.campaign_id,p_session_id);
  if sid=source.adventure_session_id then raise exception 'Escolha outra sessão para copiar o cenário.'; end if;
  target=public.create_battle_map(source.campaign_id,jsonb_build_object('adventure_session_id',sid,'name',coalesce(nullif(trim(p_name),''),source.name),'width',source.width,'height',source.height,'cell_size',source.cell_size,'scale_per_cell',source.scale_per_cell,'scale_unit',source.scale_unit,'diagonal_rule',source.diagonal_rule,'grid_visible',source.grid_visible,'grid_opacity',source.grid_opacity));
  update public.battle_maps set description=source.description,grid_size=source.grid_size,background_image=source.background_image,
    background_offset_x=source.background_offset_x,background_offset_y=source.background_offset_y,
    background_scale=source.background_scale,lighting=source.lighting,
    vision_enabled=source.vision_enabled,darkness_level=source.darkness_level,
    day_darkness_level=source.day_darkness_level,darkness_regions=source.darkness_regions
    where id=target.id returning * into target;
  insert into public.battle_map_cells(map_id,x,y,z,terrain_type,movement_cost,blocked,metadata)
    select target.id,x,y,z,terrain_type,movement_cost,blocked,metadata from public.battle_map_cells where map_id=source.id;
  insert into public.battle_map_fog(map_id,x,y) select target.id,x,y from public.battle_map_fog where map_id=source.id;
  insert into public.battle_map_objects(map_id,object_type,geometry,z,blocks_movement,blocks_vision,visible,metadata)
    select target.id,object_type,geometry,z,blocks_movement,blocks_vision,visible,metadata from public.battle_map_objects where map_id=source.id order by id;
  perform private.session_event(sid,'map_copied','Cenário reaproveitado: '||target.name,'Estruturas, terreno, imagem e áreas ocultas copiados; posicione os personagens para a nova sessão.','players',source.background_image,jsonb_build_object('map_id',target.id));
  return target;
end $$;
commit;

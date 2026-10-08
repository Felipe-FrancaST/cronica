-- Optional per-character night vision. Defaults OFF so pre-existing maps do not change behaviour.
-- The base archive ends at 018 despite documenting 019-021; this migration only depends on 016.
begin;
alter table public.battle_maps add column if not exists lighting text not null default 'day';
alter table public.battle_maps add column if not exists vision_enabled boolean not null default false;
alter table public.battle_maps add column if not exists darkness_level text not null default 'dark';
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.battle_maps'::regclass and conname='battle_maps_lighting_valid') then
    alter table public.battle_maps add constraint battle_maps_lighting_valid check(lighting in ('day','night'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.battle_maps'::regclass and conname='battle_maps_darkness_valid') then
    alter table public.battle_maps add constraint battle_maps_darkness_valid check(darkness_level in ('dim','dark','magical'));
  end if;
end $$;

create or replace function public.set_battle_map_vision(p_map_id uuid,p_enabled boolean,p_darkness text)
returns public.battle_maps language plpgsql security definer set search_path='' as $$
declare m public.battle_maps; status text;
begin
  select * into m from public.battle_maps where id=p_map_id for update;
  if m.id is null or not private.is_campaign_owner(m.campaign_id) then
    raise exception 'Somente o mestre pode alterar a visão do grid.' using errcode='42501';
  end if;
  if p_enabled is null or p_darkness is null or p_darkness not in ('dim','dark','magical') then
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
revoke all on function public.set_battle_map_vision(uuid,boolean,text) from public,anon;
grant execute on function public.set_battle_map_vision(uuid,boolean,text) to authenticated;

-- Older exports may omit migration 021 entirely; provide the missing day/night RPC only when absent.
do $$ begin
  if to_regprocedure('public.set_battle_map_lighting(uuid,text)') is null then
    execute $create$
      create function public.set_battle_map_lighting(p_map_id uuid,p_lighting text)
      returns public.battle_maps language plpgsql security definer set search_path='' as $fn$
      declare m public.battle_maps;
      begin
        select * into m from public.battle_maps where id=p_map_id for update;
        if m.id is null or not private.is_campaign_owner(m.campaign_id) then
          raise exception 'Somente o mestre pode alterar o período do grid.' using errcode='42501';
        end if;
        if p_lighting is null or p_lighting not in ('day','night') then
          raise exception 'Escolha dia ou noite.';
        end if;
        if exists(select 1 from public.campaign_sessions where id=m.adventure_session_id and status='ended') then
          raise exception 'Capítulo encerrado.' using errcode='42501';
        end if;
        update public.battle_maps set lighting=p_lighting,
          updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
          where id=p_map_id returning * into m;
        return m;
      end $fn$
    $create$;
  end if;
end $$;
revoke all on function public.set_battle_map_lighting(uuid,text) from public,anon;
grant execute on function public.set_battle_map_lighting(uuid,text) to authenticated;

-- Keep settings when copying a grid to another adventure chapter.
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
    vision_enabled=source.vision_enabled,darkness_level=source.darkness_level
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

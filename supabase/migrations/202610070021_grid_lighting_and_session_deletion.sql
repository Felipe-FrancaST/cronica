-- Restore lighting validation and explicit, owner-only chapter deletion.
begin;
alter table public.battle_maps add column if not exists lighting text not null default 'day';
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.battle_maps'::regclass and conname='battle_maps_lighting_valid') then
    alter table public.battle_maps add constraint battle_maps_lighting_valid check(lighting in('day','night'));
  end if;
end $$;

create or replace function private.scenery_light_metadata_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.metadata ? 'light_enabled' and jsonb_typeof(new.metadata->'light_enabled') is distinct from 'boolean' then raise exception 'Escolha um estado válido para a luz.'; end if;
  if new.metadata ? 'light_radius' then
    if jsonb_typeof(new.metadata->'light_radius') is distinct from 'number' then raise exception 'Alcance de luz inválido.'; end if;
    if (new.metadata->>'light_radius')::numeric not between 1 and 60 then raise exception 'Alcance de luz inválido (1 a 60 metros).'; end if;
  end if;
  if new.metadata ? 'light_color' and (jsonb_typeof(new.metadata->'light_color') is distinct from 'string' or new.metadata->>'light_color' !~ '^#[0-9A-Fa-f]{6}$') then raise exception 'Cor da luz inválida: use #RRGGBB.'; end if;
  return new;
end $$;
revoke all on function private.scenery_light_metadata_guard() from public,anon,authenticated;
drop trigger if exists c_scenery_light_metadata_guard on public.battle_map_objects;
create trigger c_scenery_light_metadata_guard before insert or update on public.battle_map_objects for each row execute function private.scenery_light_metadata_guard();

-- Keep the installed argument names/default expressions and function identity.
-- Removing an existing DEFAULT with CREATE OR REPLACE would raise 42P13.
do $preserve_set_battle_map_lighting$
declare function_arguments text;
begin
  select pg_catalog.pg_get_function_arguments(pg_catalog.to_regprocedure('public.set_battle_map_lighting(uuid,text)')) into function_arguments;
  function_arguments=coalesce(function_arguments,'p_map_id uuid,p_lighting text');
  execute 'create or replace function public.set_battle_map_lighting('||function_arguments||') '
    ||$function_definition$returns public.battle_maps language plpgsql security definer set search_path='' as $function_body$
declare
  p_map_id alias for $1;
  p_lighting alias for $2;
 m public.battle_maps;
begin
  select * into m from public.battle_maps where id=p_map_id for update;
  if m.id is null or not private.is_campaign_owner(m.campaign_id) then raise exception 'Somente o mestre pode alterar o período do grid.' using errcode='42501'; end if;
  if p_lighting is null or p_lighting not in('day','night') then raise exception 'Escolha dia ou noite.'; end if;
  if exists(select 1 from public.campaign_sessions where id=m.adventure_session_id and status='ended') then raise exception 'A sessão está encerrada e seu histórico é somente para consulta.' using errcode='42501'; end if;
  update public.battle_maps set lighting=p_lighting,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=m.id returning * into m;
  return m;
end $function_body$;$function_definition$;
end $preserve_set_battle_map_lighting$;
revoke all on function public.set_battle_map_lighting(uuid,text) from public,anon;
grant execute on function public.set_battle_map_lighting(uuid,text) to authenticated;

-- Keep the installed argument names/default expressions and function identity.
-- Removing an existing DEFAULT with CREATE OR REPLACE would raise 42P13.
do $preserve_delete_campaign_session$
declare function_arguments text;
begin
  select pg_catalog.pg_get_function_arguments(pg_catalog.to_regprocedure('public.delete_campaign_session(uuid,timestamptz)')) into function_arguments;
  function_arguments=coalesce(function_arguments,'p_session_id uuid,p_expected_updated_at timestamptz default null');
  execute 'create or replace function public.delete_campaign_session('||function_arguments||') '
    ||$function_definition$returns uuid language plpgsql security definer set search_path='' as $function_body$
declare
  p_session_id alias for $1;
  p_expected_updated_at alias for $2;
 s public.campaign_sessions;
begin
  select * into s from public.campaign_sessions where id=p_session_id;
  if s.id is null or not private.is_campaign_owner(s.campaign_id) then raise exception 'Somente o mestre pode excluir a sessão.' using errcode='42501'; end if;
  -- Campaign operations use this same lock order, preventing concurrent start/delete.
  perform 1 from public.campaigns where id=s.campaign_id for update;
  select * into s from public.campaign_sessions where id=p_session_id for update;
  if s.id is null then raise exception 'Esta sessão mudou. Atualize antes de excluir.' using errcode='40001'; end if;
  if p_expected_updated_at is not null and s.updated_at is distinct from p_expected_updated_at then raise exception 'Esta sessão mudou. Atualize antes de excluir.' using errcode='40001'; end if;
  if s.status='active' then raise exception 'Encerre a sessão antes de excluir.'; end if;
  delete from public.campaign_sessions where id=s.id;
  return s.id;
end $function_body$;$function_definition$;
end $preserve_delete_campaign_session$;
revoke all on function public.delete_campaign_session(uuid,timestamptz) from public,anon;
grant execute on function public.delete_campaign_session(uuid,timestamptz) to authenticated;

-- copy_battle_map_to_session is added below, preserving later vision columns.
create or replace function public.copy_battle_map_to_session(p_map_id uuid,p_session_id uuid,p_name text default null) returns public.battle_maps language plpgsql security definer set search_path='' as $$
declare source public.battle_maps; target public.battle_maps; sid uuid; setting text; source_settings jsonb; encounter uuid;
begin
 select * into source from public.battle_maps where id=p_map_id for share;
 if source.id is null or not private.is_campaign_owner(source.campaign_id) then raise exception 'Somente o mestre pode reaproveitar este cenário.' using errcode='42501'; end if;
 sid=private.adventure_destination(source.campaign_id,p_session_id);
 if sid=source.adventure_session_id then raise exception 'Escolha outra sessão para copiar o cenário.'; end if;
 target=public.create_battle_map(source.campaign_id,jsonb_build_object('adventure_session_id',sid,'name',coalesce(nullif(trim(p_name),''),source.name),'width',source.width,'height',source.height,'cell_size',source.cell_size,'scale_per_cell',source.scale_per_cell,'scale_unit',source.scale_unit,'diagonal_rule',source.diagonal_rule,'grid_visible',source.grid_visible,'grid_opacity',source.grid_opacity));
 update public.battle_maps set description=source.description,grid_size=source.grid_size,background_image=source.background_image,background_offset_x=source.background_offset_x,background_offset_y=source.background_offset_y,background_scale=source.background_scale,lighting=source.lighting where id=target.id returning * into target;
 -- Reapplying 021 after later migrations must not drop their settings.
 source_settings=to_jsonb(source);
 foreach setting in array array['vision_enabled','darkness_level','day_darkness_level','darkness_regions'] loop
  if source_settings ? setting then
   execute format('update public.battle_maps set %I=(jsonb_populate_record(null::public.battle_maps,$1)).%I where id=$2',setting,setting) using jsonb_build_object(setting,source_settings->setting),target.id;
  end if;
 end loop;
 select * into target from public.battle_maps where id=target.id;
 insert into public.battle_map_cells(map_id,x,y,z,terrain_type,movement_cost,blocked,metadata)
 select target.id,x,y,z,terrain_type,movement_cost,blocked,metadata from public.battle_map_cells where map_id=source.id;
 insert into public.battle_map_fog(map_id,x,y) select target.id,x,y from public.battle_map_fog where map_id=source.id;
 insert into public.battle_map_objects(map_id,object_type,geometry,z,blocks_movement,blocks_vision,visible,metadata)
 select target.id,object_type,geometry,z,blocks_movement,blocks_vision,visible,metadata from public.battle_map_objects where map_id=source.id order by id;
 perform private.session_event(sid,'map_copied','Cenário reaproveitado: '||target.name,'Estruturas, terreno, imagem e áreas ocultas copiados; posicione os personagens para a nova sessão.','players',source.background_image,jsonb_build_object('map_id',target.id));
 select * into target from public.battle_maps where id=target.id;
 return target;
end $$;

commit;

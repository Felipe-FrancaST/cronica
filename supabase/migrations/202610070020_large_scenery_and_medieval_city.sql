-- Restore large scenery and atomic scene creation without changing existing maps.
begin;
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
 if new.metadata ? 'height_metres' and (jsonb_typeof(new.metadata->'height_metres') is distinct from 'number' or (new.metadata->>'height_metres')::numeric not between 0.01 and 300) then raise exception 'Altura visual inválida (maior que zero e até 300 metros).'; end if;
 g=new.geometry;
 if jsonb_typeof(g->'x') is distinct from 'number' or jsonb_typeof(g->'y') is distinct from 'number' or jsonb_typeof(g->'width') is distinct from 'number' or jsonb_typeof(g->'height') is distinct from 'number' then raise exception 'Informe posição e dimensões do objeto.'; end if;
 if (g->>'x')::numeric<>floor((g->>'x')::numeric) or (g->>'y')::numeric<>floor((g->>'y')::numeric) or (g->>'width')::numeric<>floor((g->>'width')::numeric) or (g->>'height')::numeric<>floor((g->>'height')::numeric) then raise exception 'As dimensões devem seguir as células do grid.'; end if;
 x=(g->>'x')::integer; y=(g->>'y')::integer; w=(g->>'width')::integer; h=(g->>'height')::integer;
 if x<0 or y<0 or w<1 or h<1 or w>128 or h>128 or x+w>m.width or y+h>m.height or new.z<>0 or coalesce((g->>'rotation')::numeric,0) not between 0 and 360 then raise exception 'Objeto fora do mapa ou com dimensões inválidas (1 a 128 células).'; end if;
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

create table if not exists private.battle_scene_requests (
  request_id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  map_id uuid not null references public.battle_maps(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp()
);
revoke all on private.battle_scene_requests from public,anon,authenticated;
-- Keep the installed argument names/default expressions and function identity.
-- Removing an existing DEFAULT with CREATE OR REPLACE would raise 42P13.
do $preserve_create_battle_scene$
declare function_arguments text;
begin
  select pg_catalog.pg_get_function_arguments(pg_catalog.to_regprocedure('public.create_battle_scene(uuid,jsonb,jsonb,uuid)')) into function_arguments;
  function_arguments=coalesce(function_arguments,'p_campaign_id uuid,p_payload jsonb,p_objects jsonb,p_request_id uuid');
  execute 'create or replace function public.create_battle_scene('||function_arguments||') '
    ||$function_definition$returns public.battle_maps language plpgsql security definer set search_path='' as $function_body$
declare
  p_campaign_id alias for $1;
  p_payload alias for $2;
  p_objects alias for $3;
  p_request_id alias for $4;
 previous private.battle_scene_requests; result public.battle_maps; object jsonb;
begin
  if not private.is_campaign_owner(p_campaign_id) then raise exception 'Somente o mestre pode criar cenários.' using errcode='42501'; end if;
  if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_objects) is distinct from 'array' then raise exception 'Cenário inválido.'; end if;
  if jsonb_array_length(p_objects)>1200 then raise exception 'Limite de 1200 objetos neste mapa.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,20));
  select * into previous from private.battle_scene_requests where request_id=p_request_id;
  if previous.request_id is not null then
    if previous.campaign_id<>p_campaign_id or previous.requested_by<>auth.uid() then raise exception 'Você não tem acesso a esta solicitação.' using errcode='42501'; end if;
    select * into result from public.battle_maps where id=previous.map_id;
    return result;
  end if;
  result=public.create_battle_map(p_campaign_id,p_payload);
  for object in select value from jsonb_array_elements(p_objects) loop
    if not coalesce(private.battle_is_scenery_kind(object->>'object_type'),false) then raise exception 'Elemento de cenário inválido.'; end if;
    insert into public.battle_map_objects(map_id,object_type,geometry,z,visible,blocks_movement,blocks_vision,metadata)
      values(result.id,object->>'object_type',object->'geometry',coalesce((object->>'z')::numeric,0),coalesce((object->>'visible')::boolean,true),
        coalesce((object->>'blocks_movement')::boolean,false),coalesce((object->>'blocks_vision')::boolean,false),coalesce(object->'metadata','{}'));
  end loop;
  insert into private.battle_scene_requests(request_id,campaign_id,map_id,requested_by) values(p_request_id,p_campaign_id,result.id,auth.uid());
  select * into result from public.battle_maps where id=result.id;
  return result;
end $function_body$;$function_definition$;
end $preserve_create_battle_scene$;
revoke all on function public.create_battle_scene(uuid,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.create_battle_scene(uuid,jsonb,jsonb,uuid) to authenticated;
commit;


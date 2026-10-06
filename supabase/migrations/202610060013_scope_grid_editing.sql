-- VTT v12.1: an independent or abandoned encounter must not lock this map.
-- Portal-linked maps still share the same encounter and its combat lock.
begin;

create or replace function private.battle_assert_editable(p_map uuid) returns void
language plpgsql security definer set search_path='' as $$
declare cid uuid; sid uuid;
begin
  select campaign_id,battle_session_id into cid,sid from public.battle_maps where id=p_map;
  if cid is null then raise exception 'Mapa não encontrado.'; end if;
  -- Retain the ordered locks used by portal linking and combat RPCs.
  -- Only the encounter actually attached to this map decides its editability.
  perform 1 from public.battle_sessions where campaign_id=cid order by id for update;
  if exists(select 1 from public.battle_sessions where id=sid and status='active') then
    raise exception 'Encerre o combate desta mesa antes de editar o grid.';
  end if;
end $$;
revoke all on function private.battle_assert_editable(uuid) from public,anon,authenticated;

create or replace function private.battle_link_portals() returns trigger
language plpgsql security definer set search_path='' as $$
declare source_session uuid; other_session uuid; cid uuid;
begin
  if new.object_type<>'portal' then return new; end if;
  select campaign_id,battle_session_id into cid,source_session from public.battle_maps where id=new.map_id;
  select bm.battle_session_id into other_session
  from public.battle_map_objects o join public.battle_maps bm on bm.id=o.map_id
  where o.object_type='portal' and bm.campaign_id=cid and o.id<>new.id
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
revoke all on function private.battle_link_portals() from public,anon,authenticated;

commit;

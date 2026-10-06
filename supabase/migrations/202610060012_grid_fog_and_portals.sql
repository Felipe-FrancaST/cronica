-- VTT v12: locked scene editing, opaque fog, campaign portal pairs and shared encounters.
begin;
create table public.battle_map_fog (
 id uuid primary key default gen_random_uuid(),
 map_id uuid not null references public.battle_maps(id) on delete cascade,
 x integer not null check(x>=0), y integer not null check(y>=0),
 unique(map_id,x,y)
);
create index battle_fog_area on public.battle_map_fog(map_id,x,y);
alter table public.battle_map_fog enable row level security;
create policy battle_fog_read on public.battle_map_fog for select to authenticated using(private.can_read_battle_map(map_id));
revoke all on public.battle_map_fog from public,anon,authenticated;
grant select on public.battle_map_fog to authenticated;

create function private.battle_area_hidden(p_map uuid,px numeric,py numeric,w numeric default 1,h numeric default 1) returns boolean
language sql stable security definer set search_path='' as $$
 select private.can_read_battle_map(p_map) and exists(select 1 from public.battle_map_fog f where f.map_id=p_map and f.x<px+w and f.x+1>px and f.y<py+h and f.y+1>py);
$$;
revoke all on function private.battle_area_hidden(uuid,numeric,numeric,numeric,numeric) from public,anon;
grant execute on function private.battle_area_hidden(uuid,numeric,numeric,numeric,numeric) to authenticated;

create function private.battle_assert_editable(p_map uuid) returns void language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 select campaign_id into cid from public.battle_maps where id=p_map;
 if cid is null then raise exception 'Mapa não encontrado.'; end if;
 -- Session locks also serialize against start/advance/end combat. Campaign edits are a GM activity.
 perform 1 from public.battle_sessions where campaign_id=cid order by id for update;
 if exists(select 1 from public.battle_sessions where campaign_id=cid and status='active') then raise exception 'Encerre o combate antes de editar o grid.'; end if;
end $$;
revoke all on function private.battle_assert_editable(uuid) from public,anon,authenticated;

create function public.set_battle_fog(p_map_id uuid,p_x integer,p_y integer,p_width integer default 1,p_height integer default 1,p_hidden boolean default true) returns void
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
end $$;
revoke all on function public.set_battle_fog(uuid,integer,integer,integer,integer,boolean) from public,anon;
grant execute on function public.set_battle_fog(uuid,integer,integer,integer,integer,boolean) to authenticated;

create or replace function private.can_read_battle_token(p_token uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.battle_map_tokens t where t.id=p_token and private.can_read_campaign(t.campaign_id) and
 (private.is_campaign_owner(t.campaign_id) or t.controlled_by=auth.uid() or exists(select 1 from public.characters c where c.id=t.character_id and c.owner_id=auth.uid()) or
 t.visible and not private.battle_area_hidden(t.map_id,t.x,t.y,t.size,t.size)));
$$;
drop policy battle_cells_read on public.battle_map_cells;
create policy battle_cells_read on public.battle_map_cells for select to authenticated using(private.can_read_battle_map(map_id) and (private.is_campaign_owner(private.battle_map_campaign(map_id)) or not private.battle_area_hidden(map_id,x,y)));
drop policy battle_objects_read on public.battle_map_objects;
create policy battle_objects_read on public.battle_map_objects for select to authenticated using(private.can_read_battle_map(map_id) and
 (private.is_campaign_owner(private.battle_map_campaign(map_id)) or visible and case when object_type in('tree','pine','rock','mountain','water','fire','lava','ruin','tent','road','cart','ice','pit','portal') then
 not private.battle_area_hidden(map_id,(geometry->>'x')::numeric,(geometry->>'y')::numeric,(geometry->>'width')::numeric,(geometry->>'height')::numeric) else true end));

-- Concealed creatures still receive area damage; their identity is omitted from shared result rows.
alter function private.battle_apply_hp_v9(public.battle_action_requests,public.battle_map_tokens,jsonb,jsonb) rename to battle_apply_hp_v11;
create function private.battle_apply_hp_v9(r public.battle_action_requests,a public.battle_map_tokens,e jsonb,opts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare outcome jsonb; public_targets jsonb;
begin
 outcome=private.battle_apply_hp_v11(r,a,e,opts);
 select coalesce(jsonb_agg(item),'[]') into public_targets from jsonb_array_elements(coalesce(outcome->'affected','[]')) item
 join public.battle_map_tokens t on t.id=(item->>'token_id')::uuid where
 (t.visible and not private.battle_area_hidden(t.map_id,t.x,t.y,t.size,t.size)) or t.controlled_by=r.requested_by or exists(select 1 from public.characters c where c.id=t.character_id and c.owner_id=r.requested_by);
 return jsonb_set(jsonb_set(outcome,'{affected}',public_targets),'{count}',to_jsonb(jsonb_array_length(public_targets)));
end $$;
revoke all on function private.battle_apply_hp_v9(public.battle_action_requests,public.battle_map_tokens,jsonb,jsonb),private.battle_apply_hp_v11(public.battle_action_requests,public.battle_map_tokens,jsonb,jsonb) from public,anon,authenticated;

create function private.battle_dice_source_visible(p_request uuid,p_effect uuid) returns boolean language sql stable security definer set search_path='' as $$
 select (p_request is null or exists(select 1 from public.battle_action_requests r where r.id=p_request and private.can_read_battle_token(r.token_id))) and
 (p_effect is null or exists(select 1 from public.battle_spell_effects e where e.id=p_effect and private.can_read_battle_token(e.token_id)));
$$;
revoke all on function private.battle_dice_source_visible(uuid,uuid) from public,anon;
grant execute on function private.battle_dice_source_visible(uuid,uuid) to authenticated;

-- Dice attached to a concealed creature must not broadcast that creature's action.
drop policy battle_dice_read on public.battle_dice_rolls;
create policy battle_dice_read on public.battle_dice_rolls for select to authenticated using(private.can_read_battle_map(map_id) and
 (visibility='public' or rolled_by=auth.uid() or visibility='gm' and private.is_campaign_owner(campaign_id)) and
 (private.is_campaign_owner(campaign_id) or rolled_by=auth.uid() or private.battle_dice_source_visible(request_id,effect_id)));

create function private.battle_grid_edit_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='battle_maps' then
  if new.width is distinct from old.width or new.height is distinct from old.height or new.background_image is distinct from old.background_image or new.background_offset_x is distinct from old.background_offset_x or new.background_offset_y is distinct from old.background_offset_y or new.background_scale is distinct from old.background_scale or new.scale_per_cell is distinct from old.scale_per_cell or new.scale_unit is distinct from old.scale_unit or new.diagonal_rule is distinct from old.diagonal_rule or new.cell_size is distinct from old.cell_size or new.grid_size is distinct from old.grid_size or new.grid_visible is distinct from old.grid_visible or new.grid_opacity is distinct from old.grid_opacity then perform private.battle_assert_editable(old.id); end if;
 elsif tg_op='DELETE' then
  -- Cascading deletion of a map has already passed its own guard.
  if exists(select 1 from public.battle_maps where id=old.map_id) then perform private.battle_assert_editable(old.map_id); end if;
  return old;
 else perform private.battle_assert_editable(new.map_id);
 end if;
 return new;
end $$;
create trigger battle_grid_edit_guard before insert or update or delete on public.battle_map_cells for each row execute function private.battle_grid_edit_guard();
create trigger battle_grid_edit_guard before update on public.battle_maps for each row execute function private.battle_grid_edit_guard();
revoke all on function private.battle_grid_edit_guard() from public,anon,authenticated;
create or replace function private.battle_scenery_bounds() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.battle_maps; g jsonb; x integer; y integer; w integer; h integer; cost numeric; code text;
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
 if new.object_type not in('tree','pine','rock','mountain','water','fire','lava','ruin','tent','road','cart','ice','pit','portal') then
  if new.blocks_movement then raise exception 'Use um objeto de cenário com dimensões válidas para bloquear movimento.'; end if;
  return new;
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
 exists(select 1 from public.battle_map_objects o where o.map_id=p_map and o.z=pz and o.blocks_movement and o.object_type in('tree','pine','rock','mountain','water','fire','lava','ruin','tent','road','cart','ice','pit','portal') and (o.geometry->>'x')::integer<px+p_size and (o.geometry->>'x')::integer+(o.geometry->>'width')::integer>px and (o.geometry->>'y')::integer<py+p_size and (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>py) then return null; end if;
 select greatest(result,coalesce(max(c.movement_cost),1)) into result from public.battle_map_cells c where c.map_id=p_map and c.z=pz and c.x>=px and c.x<px+p_size and c.y>=py and c.y<py+p_size;
 select greatest(result,coalesce(max(coalesce((o.metadata->>'movement_cost')::numeric,1)),1)) into result from public.battle_map_objects o where o.map_id=p_map and o.z=pz and o.object_type in('tree','pine','rock','mountain','water','fire','lava','ruin','tent','road','cart','ice','pit','portal') and (o.geometry->>'x')::integer<px+p_size and (o.geometry->>'x')::integer+(o.geometry->>'width')::integer>px and (o.geometry->>'y')::integer<py+p_size and (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>py;
 return result;
end $$;

create or replace function private.battle_scenery_resize() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.width<>old.width or new.height<>old.height) and exists(select 1 from public.battle_map_objects o where o.map_id=new.id and o.object_type in('tree','pine','rock','mountain','water','fire','lava','ruin','tent','road','cart','ice','pit','portal') and ((o.geometry->>'x')::integer+(o.geometry->>'width')::integer>new.width or (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>new.height)) then raise exception 'Remova ou reposicione os objetos antes de reduzir o mapa.'; end if;
 if exists(select 1 from public.battle_map_fog f where f.map_id=new.id and (f.x>=new.width or f.y>=new.height)) then raise exception 'Revele as áreas ocultas antes de reduzir o mapa.'; end if;
 return new;
end $$;

create or replace function private.battle_scenery_token_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.battle_sessions where id=(select battle_session_id from public.battle_maps where id=new.map_id) for update;
 if exists(select 1 from public.battle_map_objects o where o.map_id=new.map_id and o.z=new.z and o.blocks_movement and o.object_type in('tree','pine','rock','mountain','water','fire','lava','ruin','tent','road','cart','ice','pit','portal') and (o.geometry->>'x')::integer<new.x+new.size and (o.geometry->>'x')::integer+(o.geometry->>'width')::integer>new.x and (o.geometry->>'y')::integer<new.y+new.size and (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>new.y) then raise exception 'A posição está bloqueada por um objeto do cenário.'; end if;
 return new;
end $$;

create function private.battle_link_portals() returns trigger language plpgsql security definer set search_path='' as $$
declare source_session uuid; other_session uuid; cid uuid;
begin
 if new.object_type<>'portal' then return new; end if;
 select campaign_id,battle_session_id into cid,source_session from public.battle_maps where id=new.map_id;
 select bm.battle_session_id into other_session from public.battle_map_objects o join public.battle_maps bm on bm.id=o.map_id where o.object_type='portal' and bm.campaign_id=cid and o.id<>new.id and o.metadata->>'portal_code'=new.metadata->>'portal_code' limit 1;
 if other_session is null or source_session=other_session then return new; end if;
 -- Bounds trigger already locks every session and rejects edits in active combat.
 -- Both connected map groups use the existing endpoint's encounter; token IDs and budgets remain intact.
 update public.battle_action_requests set status='expired',resolved_at=now() where session_id=source_session and status in('pending','approved');
 delete from public.battle_turn_order where session_id=source_session;
 update public.battle_maps set battle_session_id=other_session,updated_at=clock_timestamp() where campaign_id=cid and battle_session_id=source_session;
 return new;
end $$;
create trigger battle_link_portals after insert or update on public.battle_map_objects for each row execute function private.battle_link_portals();
revoke all on function private.battle_link_portals() from public,anon,authenticated;

create table private.battle_portal_trips (
 token_id uuid not null references public.battle_map_tokens(id) on delete cascade,
 client_id uuid not null, requested_by uuid not null, source_map uuid not null, destination_map uuid not null,
 result jsonb not null, created_at timestamptz not null default now(), primary key(token_id,client_id)
);
revoke all on private.battle_portal_trips from public,anon,authenticated;
create function public.use_battle_portal(p_token_id uuid,p_portal_id uuid,p_expected_version bigint,p_client_id uuid) returns public.battle_map_tokens
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
 select o.* into outlet from public.battle_map_objects o join public.battle_maps bm on bm.id=o.map_id where o.object_type='portal' and o.id<>entrance.id and bm.campaign_id=actor.campaign_id and o.metadata->>'portal_code'=entrance.metadata->>'portal_code' for share of o;
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
revoke all on function public.use_battle_portal(uuid,uuid,bigint,uuid) from public,anon;
grant execute on function public.use_battle_portal(uuid,uuid,bigint,uuid) to authenticated;

-- Guard map deletion as well as layout changes; token sheets remain editable during combat.
create function private.battle_map_delete_guard() returns trigger language plpgsql security definer set search_path='' as $$begin perform private.battle_assert_editable(old.id); return old; end $$;
create trigger battle_map_delete_guard before delete on public.battle_maps for each row execute function private.battle_map_delete_guard();
revoke all on function private.battle_map_delete_guard() from public,anon,authenticated;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='battle_map_fog') then alter publication supabase_realtime add table public.battle_map_fog; end if;
 end if;
end $$;
commit;

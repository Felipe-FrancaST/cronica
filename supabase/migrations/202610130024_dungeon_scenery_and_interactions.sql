-- VTT workshop: dungeon pieces and owner-controlled interactions.
-- Additive; existing objects and map settings are preserved.
begin;
create or replace function private.battle_is_scenery_kind(p_kind text) returns boolean language sql immutable set search_path='' as $$ select p_kind=any(array['tree','pine','rock','mountain','ruin','water','fire','tent','road','cart','ice','pit','portal','lava','barrel','campfire','boat','bush','flowers','statue','chest','counter','crops','house','gravestone','cross','fence','grass','well','bridge','table','chair','bookshelf','torch','market','signpost','tavern','forge','stable','wall','floor','stairs','bed','rug','doorway','fountain','door','portcullis','pillar','altar','sarcophagus','cage','weaponrack','lever','trap','treasure','rubble','web','stalagmite','ladder','magiccircle','barricade']); $$;
create or replace function private.battle_valid_scenery_variant(p_kind text,p_variant text) returns boolean language sql immutable set search_path='' as $$ select p_variant='default' or case p_kind
when 'door' then p_variant in('open','iron','iron-open')
when 'portcullis' then p_variant in('open')
when 'pillar' then p_variant in('broken')
when 'altar' then p_variant in('arcane')
when 'sarcophagus' then p_variant in('open')
when 'cage' then p_variant in('open')
when 'weaponrack' then p_variant in('armor')
when 'lever' then p_variant in('activated')
when 'trap' then p_variant in('runes','disarmed')
when 'treasure' then p_variant in('gems')
when 'stalagmite' then p_variant in('crystal')
when 'ladder' then p_variant in('rope')
when 'magiccircle' then p_variant in('summoning','spent')
when 'barricade' then p_variant in('spikes')
when 'statue' then p_variant='obelisk' when 'portal' then p_variant in('door','cave')
when 'ice' then p_variant in('snow')
when 'boat' then p_variant in('ship')
when 'barrel' then p_variant in('crate')
when 'campfire' then p_variant in('brazier')
when 'bush' then p_variant in('thorn','desert','frost')
when 'flowers' then p_variant in('mushrooms','roses','sunflowers','lavender','dead')
when 'chest' then p_variant in('open')
when 'tree' then p_variant in('autumn')
when 'rock' then p_variant in('crystal','boulder','pile','moss','desert','ice')
when 'road' then p_variant in('cobblestone')
when 'mountain' then p_variant in('snowy','desert','volcano')
when 'ruin' then p_variant in('wall','arch','columns','temple')
when 'cart' then p_variant in('covered','goods','broken')
when 'tent' then p_variant in('pavilion','desert','war')
when 'counter' then p_variant in('stone','merchant')
when 'crops' then p_variant in('vegetables','pumpkins','corn','vineyard')
when 'house' then p_variant in('cottage','inn','tower','timber','stone','manor','desert','ruined')
when 'tavern' then p_variant in('port','stone','open')
when 'forge' then p_variant in('covered')
when 'stable' then p_variant in('open')
when 'wall' then p_variant in('timber','brick','low')
when 'floor' then p_variant in('wood','tile')
when 'stairs' then p_variant in('stone')
when 'bed' then p_variant in('bunk','royal')
when 'rug' then p_variant in('round','royal')
when 'doorway' then p_variant in('arch','iron')
when 'fountain' then p_variant in('dry','ornate')
when 'gravestone' then p_variant in('ornate','broken')
when 'cross' then p_variant in('stone','rune')
when 'fence' then p_variant in('stone','palisade','iron')
when 'grass' then p_variant in('tall','dry')
when 'well' then p_variant in('roofed','ruined')
when 'bridge' then p_variant in('stone','rope')
when 'table' then p_variant in('round','feast')
when 'chair' then p_variant in('throne','stool')
when 'bookshelf' then p_variant in('scrolls','potions')
when 'torch' then p_variant in('lantern','arcane')
when 'market' then p_variant in('produce','weapons')
when 'signpost' then p_variant in('forked','banner') else false end; $$;

-- Only a state transition may bypass the general combat editing lock.
-- The master still owns the action, and geometry, visibility and other metadata
-- must be identical. This cannot be used to move/create/delete an obstacle.
create or replace function private.battle_scenery_state_update(p_old public.battle_map_objects,p_new public.battle_map_objects)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(
  (to_jsonb(p_old)-array['metadata','blocks_movement','blocks_vision','updated_at']) =
  (to_jsonb(p_new)-array['metadata','blocks_movement','blocks_vision','updated_at'])
  and (p_old.metadata-'variant')=(p_new.metadata-'variant')
  and case p_old.object_type
   when 'door' then case coalesce(p_old.metadata->>'variant','default')
    when 'default' then p_new.metadata->>'variant'='open'
    when 'open' then p_new.metadata->>'variant'='default'
    when 'iron' then p_new.metadata->>'variant'='iron-open'
    when 'iron-open' then p_new.metadata->>'variant'='iron' else false end
   when 'portcullis' then (coalesce(p_old.metadata->>'variant','default')='default' and p_new.metadata->>'variant'='open') or (p_old.metadata->>'variant'='open' and p_new.metadata->>'variant'='default')
   when 'cage' then (coalesce(p_old.metadata->>'variant','default')='default' and p_new.metadata->>'variant'='open') or (p_old.metadata->>'variant'='open' and p_new.metadata->>'variant'='default')
   when 'chest' then (coalesce(p_old.metadata->>'variant','default')='default' and p_new.metadata->>'variant'='open') or (p_old.metadata->>'variant'='open' and p_new.metadata->>'variant'='default')
   when 'sarcophagus' then (coalesce(p_old.metadata->>'variant','default')='default' and p_new.metadata->>'variant'='open') or (p_old.metadata->>'variant'='open' and p_new.metadata->>'variant'='default')
   when 'lever' then (coalesce(p_old.metadata->>'variant','default')='default' and p_new.metadata->>'variant'='activated') or (p_old.metadata->>'variant'='activated' and p_new.metadata->>'variant'='default')
   else false end
  and case when p_old.object_type in('door','portcullis','cage') then
   p_new.blocks_movement=(p_new.metadata->>'variant' not in('open','iron-open')) and
   p_new.blocks_vision=(p_old.object_type='door' and p_new.blocks_movement)
  else p_new.blocks_movement=p_old.blocks_movement and p_new.blocks_vision=p_old.blocks_vision end,false);
$$;
revoke all on function private.battle_scenery_state_update(public.battle_map_objects,public.battle_map_objects) from public,anon,authenticated;

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
 if tg_op='UPDATE' and private.battle_scenery_state_update(old,new) then
  if not private.is_campaign_owner(m.campaign_id) then raise exception 'Somente o mestre pode interagir com o cenário.' using errcode='42501'; end if;
  perform 1 from public.campaigns where id=m.campaign_id for update;
  perform 1 from public.campaign_sessions where id=m.adventure_session_id for share;
  if exists(select 1 from public.campaign_sessions where id=m.adventure_session_id and status='ended') then raise exception 'A sessão está encerrada e seu histórico é somente para consulta.' using errcode='42501'; end if;
  perform 1 from public.battle_sessions where campaign_id=m.campaign_id order by id for update;
 else
  perform private.battle_assert_editable(m.id);
 end if;
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


create or replace function public.set_battle_scenery_state(p_object_id uuid,p_variant text,p_expected_updated_at timestamptz)
returns public.battle_map_objects language plpgsql security definer set search_path='' as $$
declare object public.battle_map_objects; changed public.battle_map_objects; cid uuid; sid uuid;
begin
 select m.campaign_id,m.adventure_session_id into cid,sid from public.battle_map_objects o join public.battle_maps m on m.id=o.map_id where o.id=p_object_id;
 if cid is null or not private.is_campaign_owner(cid) then raise exception 'Somente o mestre pode interagir com o cenário.' using errcode='42501'; end if;
 -- Campaign/session locks match chapter close and combat start before the row lock.
 perform 1 from public.campaigns where id=cid for update;
 perform 1 from public.campaign_sessions where id=sid for share;
 if exists(select 1 from public.campaign_sessions where id=sid and status='ended') then raise exception 'A sessão está encerrada e seu histórico é somente para consulta.' using errcode='42501'; end if;
 perform 1 from public.battle_sessions where campaign_id=cid order by id for update;
 select * into object from public.battle_map_objects where id=p_object_id for update;
 if object.id is null or p_expected_updated_at is null or object.updated_at is distinct from p_expected_updated_at then raise exception 'Este elemento mudou. Atualize a mesa antes de interagir.' using errcode='40001'; end if;
 changed=object;
 changed.metadata=jsonb_set(object.metadata,'{variant}',to_jsonb(coalesce(p_variant,'')));
 if object.object_type in('door','portcullis','cage') then
  changed.blocks_movement=p_variant not in('open','iron-open');
  changed.blocks_vision=object.object_type='door' and changed.blocks_movement;
 end if;
 if not private.battle_scenery_state_update(object,changed) then raise exception 'Esta interação não está disponível para o elemento.'; end if;
 update public.battle_map_objects set metadata=changed.metadata,blocks_movement=changed.blocks_movement,blocks_vision=changed.blocks_vision where id=object.id returning * into changed;
 return changed;
end $$;
revoke all on function public.set_battle_scenery_state(uuid,text,timestamptz) from public,anon;
grant execute on function public.set_battle_scenery_state(uuid,text,timestamptz) to authenticated;

-- Names are optional, but malformed metadata must not leak into the editor.
create or replace function private.scenery_name_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if private.battle_is_scenery_kind(new.object_type) and new.metadata ? 'name' and
  (jsonb_typeof(new.metadata->'name') is distinct from 'string' or length(new.metadata->>'name')>80) then raise exception 'Use um nome de até 80 caracteres para o elemento.'; end if;
 return new;
end $$;
revoke all on function private.scenery_name_guard() from public,anon,authenticated;
drop trigger if exists d_scenery_name_guard on public.battle_map_objects;
create trigger d_scenery_name_guard before insert or update on public.battle_map_objects for each row execute function private.scenery_name_guard();

commit;

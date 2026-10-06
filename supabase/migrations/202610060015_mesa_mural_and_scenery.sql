-- Mesa v14: narrative mural and an expanded scenery catalog. Existing grids and sessions are preserved.
begin;
create or replace function private.battle_is_scenery_kind(p_kind text) returns boolean language sql immutable set search_path='' as $$
 select p_kind=any(array['tree','pine','rock','mountain','ruin','water','fire','tent','road','cart','ice','pit','portal','lava','barrel','campfire','boat','bush','flowers','statue','chest','counter','crops','house','gravestone','cross','fence','grass','well','bridge','table','chair','bookshelf','torch','market','signpost']);
$$;
create or replace function private.battle_valid_scenery_variant(p_kind text,p_variant text) returns boolean language sql immutable set search_path='' as $$
 select p_variant='default' or case p_kind
 when 'portal' then p_variant in('door','cave')
 when 'ice' then p_variant in('snow')
 when 'boat' then p_variant in('ship')
 when 'barrel' then p_variant in('crate')
 when 'campfire' then p_variant in('brazier')
 when 'bush' then p_variant in('thorn','desert','frost')
 when 'flowers' then p_variant in('mushrooms','roses','sunflowers','lavender','dead')
 when 'statue' then p_variant in('obelisk')
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
 when 'house' then p_variant in('cottage','inn','tower')
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
 when 'signpost' then p_variant in('forked','banner')
 else false end;
$$;


create table public.campaign_mural_items (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 kind text not null check(kind in('location','npc','image','note')),
 title text not null check(length(trim(title)) between 1 and 180),
 description text not null default '' check(length(description)<=12000),
 image_path text check(length(image_path)<=1024),
 source_location_id uuid references public.world_locations(id) on delete set null,
 source_npc_id uuid references public.npcs(id) on delete set null,
 visible_to_players boolean not null default false,
 pinned boolean not null default false,
 sort_order integer not null default 0 check(sort_order between 0 and 10000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default clock_timestamp(),
 check(source_location_id is null or kind='location'),
 check(source_npc_id is null or kind='npc'),
 check(kind<>'image' or image_path is not null)
);
create index campaign_mural_order_idx on public.campaign_mural_items(campaign_id,pinned desc,sort_order,id);
create index campaign_mural_image_idx on public.campaign_mural_items(image_path) where image_path is not null;
create index campaign_mural_location_idx on public.campaign_mural_items(source_location_id) where source_location_id is not null;
create index campaign_mural_npc_idx on public.campaign_mural_items(source_npc_id) where source_npc_id is not null;

-- Only this small state is published. Hiding/deleting a card can notify players without broadcasting hidden content.
create table public.campaign_mural_states (
 campaign_id uuid primary key references public.campaigns(id) on delete cascade,
 revision bigint not null default 0,
 updated_at timestamptz not null default now()
);
insert into public.campaign_mural_states(campaign_id) select id from public.campaigns;
alter table public.campaign_mural_items enable row level security;
alter table public.campaign_mural_states enable row level security;
revoke all on public.campaign_mural_items,public.campaign_mural_states from anon,public;
grant select,insert,update,delete on public.campaign_mural_items to authenticated;
grant select on public.campaign_mural_states to authenticated;
create policy mural_read on public.campaign_mural_items for select to authenticated using(private.is_campaign_owner(campaign_id) or visible_to_players and private.can_read_campaign(campaign_id));
create policy mural_create on public.campaign_mural_items for insert to authenticated with check(private.is_campaign_owner(campaign_id));
create policy mural_edit on public.campaign_mural_items for update to authenticated using(private.is_campaign_owner(campaign_id)) with check(private.is_campaign_owner(campaign_id));
create policy mural_delete on public.campaign_mural_items for delete to authenticated using(private.is_campaign_owner(campaign_id));
create policy mural_state_read on public.campaign_mural_states for select to authenticated using(private.can_read_campaign(campaign_id));

create function private.mural_image_belongs_to_campaign(p_campaign uuid,p_path text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare entity text; target uuid;
begin
 if p_path is null then return true; end if;
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
revoke all on function private.mural_image_belongs_to_campaign(uuid,text) from public,anon,authenticated;

create function private.mural_item_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.campaign_id<>old.campaign_id) then raise exception 'O vínculo deste cartão não pode ser alterado.' using errcode='42501'; end if;
 perform 1 from public.campaigns where id=new.campaign_id for update;
 if new.source_location_id is not null and not exists(select 1 from public.world_locations where id=new.source_location_id and campaign_id=new.campaign_id) then raise exception 'O local não pertence a esta campanha.'; end if;
 if new.source_npc_id is not null and not exists(select 1 from public.npcs where id=new.source_npc_id and campaign_id=new.campaign_id) then raise exception 'O NPC não pertence a esta campanha.'; end if;
 if not private.mural_image_belongs_to_campaign(new.campaign_id,new.image_path) and not(tg_op='UPDATE' and new.image_path is not distinct from old.image_path) then raise exception 'Use uma imagem desta campanha.'; end if;
 if tg_op='INSERT' and not exists(select 1 from public.campaign_mural_items where id=new.id and campaign_id=new.campaign_id) and (select count(*) from public.campaign_mural_items where campaign_id=new.campaign_id)>=300 then raise exception 'Limite de 300 cartões neste mural.'; end if;
 if tg_op='UPDATE' then new.created_at=old.created_at; new.updated_at=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond'); end if;
 return new;
end $$;
create trigger mural_guard before insert or update on public.campaign_mural_items for each row execute function private.mural_item_guard();

create function private.touch_campaign_mural() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 cid=case when tg_op='DELETE' then old.campaign_id else new.campaign_id end;
 if exists(select 1 from public.campaigns where id=cid) then
  insert into public.campaign_mural_states(campaign_id,revision,updated_at) values(cid,1,clock_timestamp())
  on conflict(campaign_id) do update set revision=public.campaign_mural_states.revision+1,updated_at=clock_timestamp();
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger mural_changed after insert or update or delete on public.campaign_mural_items for each row execute function private.touch_campaign_mural();

create function public.save_campaign_mural_item(p_payload jsonb,p_expected_updated_at timestamptz default null) returns public.campaign_mural_items
language plpgsql security definer set search_path='' as $$
declare cid uuid=(p_payload->>'campaign_id')::uuid; eid uuid=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid()); previous public.campaign_mural_items; result public.campaign_mural_items; position integer;
begin
 if not private.is_campaign_owner(cid) then raise exception 'Somente o mestre pode editar o mural.' using errcode='42501'; end if;
 perform 1 from public.campaigns where id=cid for update;
 select * into previous from public.campaign_mural_items where id=eid for update;
 if previous.id is not null and previous.campaign_id<>cid then raise exception 'O cartão pertence a outra campanha.' using errcode='42501'; end if;
 if previous.id is not null and p_expected_updated_at is distinct from previous.updated_at or previous.id is null and p_expected_updated_at is not null then raise exception 'Este cartão mudou em outra janela. Atualize o mural antes de salvar.' using errcode='40001'; end if;
 if previous.id is null then select coalesce(max(sort_order)+1,0) into position from public.campaign_mural_items where campaign_id=cid;
 else position=coalesce((p_payload->>'sort_order')::integer,previous.sort_order); end if;
 insert into public.campaign_mural_items(id,campaign_id,kind,title,description,image_path,source_location_id,source_npc_id,visible_to_players,pinned,sort_order)
 values(eid,cid,p_payload->>'kind',trim(p_payload->>'title'),coalesce(p_payload->>'description',''),nullif(p_payload->>'image_path',''),nullif(p_payload->>'source_location_id','')::uuid,nullif(p_payload->>'source_npc_id','')::uuid,coalesce((p_payload->>'visible_to_players')::boolean,false),coalesce((p_payload->>'pinned')::boolean,false),position)
 on conflict(id) do update set kind=excluded.kind,title=excluded.title,description=excluded.description,image_path=excluded.image_path,source_location_id=excluded.source_location_id,source_npc_id=excluded.source_npc_id,visible_to_players=excluded.visible_to_players,pinned=excluded.pinned,sort_order=excluded.sort_order
 returning * into result;
 return result;
end $$;
create function public.delete_campaign_mural_item(p_item_id uuid,p_expected_updated_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare item public.campaign_mural_items;
begin
 select * into item from public.campaign_mural_items where id=p_item_id;
 if item.id is null or not private.is_campaign_owner(item.campaign_id) then raise exception 'Somente o mestre pode excluir este cartão.' using errcode='42501'; end if;
 perform 1 from public.campaigns where id=item.campaign_id for update;
 select * into item from public.campaign_mural_items where id=p_item_id for update;
 if item.id is null or item.updated_at is distinct from p_expected_updated_at then raise exception 'Este cartão mudou em outra janela. Atualize o mural antes de excluir.' using errcode='40001'; end if;
 delete from public.campaign_mural_items where id=p_item_id;
end $$;
create function public.reorder_campaign_mural(p_campaign_id uuid,p_item_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_campaign_owner(p_campaign_id) then raise exception 'Somente o mestre pode organizar o mural.' using errcode='42501'; end if;
 perform 1 from public.campaigns where id=p_campaign_id for update;
 if p_item_ids is null or cardinality(p_item_ids)<>(select count(*) from public.campaign_mural_items where campaign_id=p_campaign_id) or cardinality(p_item_ids)<>(select count(distinct requested.id) from unnest(p_item_ids) requested(id)) or exists(select 1 from unnest(p_item_ids) requested(id) where not exists(select 1 from public.campaign_mural_items item where item.campaign_id=p_campaign_id and item.id=requested.id)) then raise exception 'O mural mudou. Atualize os cartões antes de reorganizar.' using errcode='40001'; end if;
 update public.campaign_mural_items item set sort_order=ordering.position-1 from unnest(p_item_ids) with ordinality ordering(id,position) where item.id=ordering.id and item.campaign_id=p_campaign_id;
end $$;
revoke all on function public.save_campaign_mural_item(jsonb,timestamptz),public.delete_campaign_mural_item(uuid,timestamptz),public.reorder_campaign_mural(uuid,uuid[]) from public,anon;
grant execute on function public.save_campaign_mural_item(jsonb,timestamptz),public.delete_campaign_mural_item(uuid,timestamptz),public.reorder_campaign_mural(uuid,uuid[]) to authenticated;

-- The master may publish one specific image from a private NPC/local without granting access to its record or sheet.
create function private.can_write_mural_media(p_name text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if p_name !~ '^campaign_mural/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$' then return false; end if;
 return private.is_campaign_owner(split_part(p_name,'/',2)::uuid);
end $$;
revoke all on function private.can_write_mural_media(text) from public,anon;
grant execute on function private.can_write_mural_media(text) to authenticated;
create policy mural_media_read on storage.objects for select to authenticated using(bucket_id='campaign-media' and (private.can_write_mural_media(name) or exists(select 1 from public.campaign_mural_items item where item.image_path=name and (private.is_campaign_owner(item.campaign_id) or item.visible_to_players and private.can_read_campaign(item.campaign_id)))));
create policy mural_media_create on storage.objects for insert to authenticated with check(bucket_id='campaign-media' and private.can_write_mural_media(name));
create policy mural_media_delete on storage.objects for delete to authenticated using(bucket_id='campaign-media' and private.can_write_mural_media(name));

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='campaign_mural_states') then alter publication supabase_realtime add table public.campaign_mural_states; end if;
end $$;
commit;

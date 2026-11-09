-- 055: Places can be assigned to a region OR to a city in the same campaign.
-- Safe for existing records: city_id starts nullable, original region links remain intact.
begin;

alter table public.world_locations add column if not exists city_id uuid;
alter table public.world_locations
  add constraint world_locations_parent_055 check (region_id is null or city_id is null);
alter table public.world_cities add constraint world_cities_id_campaign_055 unique(id,campaign_id);
alter table public.world_locations
  add constraint world_locations_city_campaign_055 foreign key (city_id, campaign_id)
  references public.world_cities(id, campaign_id);
create index if not exists world_locations_city_055 on public.world_locations(city_id) where city_id is not null;

-- Keep locations when a city is removed. The FK still enforces campaign identity on saves.
create or replace function private.unlink_city_055() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.world_locations set city_id=null where city_id=old.id;
  return old;
end $$;
create trigger unlink_city_055 before delete on public.world_cities
for each row execute function private.unlink_city_055();
revoke all on function private.unlink_city_055() from public, anon, authenticated;

-- Checked API in 047 delegates to this function. Keep its contract and extend only the location parent.
create or replace function public.save_world_entry(p_payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare kind text=p_payload->>'kind'; tab text; cid uuid=(p_payload->>'campaign_id')::uuid;
  eid uuid=(p_payload->>'id')::uuid; existing_campaign uuid;
begin
  if auth.uid() is null or not private.is_campaign_owner(cid) then
    raise exception 'Apenas o mestre desta campanha pode construir o mundo.' using errcode='42501';
  end if;
  case kind when 'region' then tab='world_regions'; when 'city' then tab='world_cities';
    when 'location' then tab='world_locations'; else raise exception 'Tipo de lugar inválido.'; end case;
  execute format('select campaign_id from public.%I where id=$1 for update',tab)
    into existing_campaign using eid;
  if existing_campaign is not null and existing_campaign<>cid then
    raise exception 'O lugar pertence a outra campanha.' using errcode='42501';
  end if;
  execute format('insert into public.%I(id,campaign_id,name,description,image_path,type,location,notes,visible_to_players)
    values(($1->>''id'')::uuid,($1->>''campaign_id'')::uuid,trim($1->>''name''),coalesce($1->>''description'',''''),$1->>''image_path'',coalesce($1->>''type'',''''),coalesce($1->>''location'',''''),coalesce($1->>''notes'',''''),coalesce(($1->>''visible_to_players'')::boolean,false))
    on conflict(id) do update set name=excluded.name,description=excluded.description,image_path=excluded.image_path,type=excluded.type,location=excluded.location,notes=excluded.notes,visible_to_players=excluded.visible_to_players',tab) using p_payload;
  if kind='city' then
    update public.world_cities set region_id=(p_payload->>'region_id')::uuid,
      population=(p_payload->>'population')::bigint,
      government=coalesce(p_payload->>'government','') where id=eid;
  elsif kind='location' then
    update public.world_locations
    set region_id=(p_payload->>'region_id')::uuid, city_id=(p_payload->>'city_id')::uuid
    where id=eid;
  end if;
  execute format('insert into public.%I(entry_id,secrets,private_notes) values($1,$2,$3)
    on conflict(entry_id) do update set secrets=excluded.secrets,private_notes=excluded.private_notes',tab||'_private')
    using eid,coalesce(p_payload->>'secrets',''),coalesce(p_payload->>'private_notes','');
  return eid;
end $$;

-- Incorporate city_id into conflict/retry equality checks to avoid silently losing moves.
create or replace function public.save_world_entry_checked(p_payload jsonb,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare tab text;current_row jsonb;cid uuid=(p_payload->>'campaign_id')::uuid;eid uuid=(p_payload->>'id')::uuid;
begin
 if auth.uid() is null or not private.is_campaign_owner(cid) then
  raise exception 'Apenas o mestre pode salvar este lugar.' using errcode='42501';end if;
 tab=case p_payload->>'kind' when 'region' then 'world_regions' when 'city' then 'world_cities' when 'location' then 'world_locations' end;
 if tab is null or eid is null then raise exception 'Tipo de lugar inválido.';end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) into current_row using eid;
 if current_row is not null then
  declare secrets jsonb;begin
   execute format('select to_jsonb(r) from public.%I r where entry_id=$1',tab||'_private') into secrets using eid;
   current_row=current_row||(coalesce(secrets,'{}')-array['entry_id','created_at','updated_at']);
  end;
  if (current_row->>'updated_at')::timestamptz is distinct from p_expected_updated_at and not exists(
   select 1 from unnest(array['id','campaign_id','name','description','image_path','type','location','notes','visible_to_players','region_id','city_id','population','government','secrets','private_notes']) k where p_payload ? k and coalesce(p_payload->k,'null'::jsonb) is distinct from coalesce(current_row->k,'null'::jsonb)
  ) then return jsonb_build_object('created_at',current_row->'created_at','updated_at',current_row->'updated_at');end if;
 end if;
 if (current_row is null and p_expected_updated_at is not null) or (current_row is not null and (current_row->>'updated_at')::timestamptz is distinct from p_expected_updated_at) then
  raise exception 'Este lugar mudou ou foi removido. Recarregue antes de salvar. Seu rascunho foi preservado.' using errcode='40001';
 end if;
 perform public.save_world_entry(p_payload);
 execute format('select to_jsonb(t) from public.%I t where id=$1',tab) into current_row using eid;
 return jsonb_build_object('created_at',current_row->'created_at','updated_at',current_row->'updated_at');
end $$;
revoke all on function public.save_world_entry(jsonb), public.save_world_entry_checked(jsonb,timestamptz) from public,anon;
grant execute on function public.save_world_entry(jsonb), public.save_world_entry_checked(jsonb,timestamptz) to authenticated;
commit;

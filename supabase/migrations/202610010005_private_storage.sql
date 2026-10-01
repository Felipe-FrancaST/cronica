-- A private bucket: NO public asset URLs for campaign media.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('campaign-media','campaign-media',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function private.can_access_media(p_name text,p_write boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare entity text=split_part(p_name,'/',1); raw_id text=split_part(p_name,'/',2); target uuid;
begin
  if auth.uid() is null or raw_id!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or split_part(p_name,'/',3)='' then return false; end if;
  target=raw_id::uuid;
  case entity
    when 'profiles' then return case when p_write then target=auth.uid() else private.can_read_profile(target) end;
    when 'campaigns' then return case when p_write then private.is_campaign_owner(target) else private.can_read_campaign(target) end;
    when 'characters' then return private.can_edit_character(target);
    when 'npcs' then return case when p_write then private.can_edit_npc(target) else private.can_read_npc(target) end;
    when 'world_regions' then return case when p_write then private.is_campaign_owner(private.world_campaign('region',target)) else private.can_read_world('region',target) end;
    when 'world_cities' then return case when p_write then private.is_campaign_owner(private.world_campaign('city',target)) else private.can_read_world('city',target) end;
    when 'world_locations' then return case when p_write then private.is_campaign_owner(private.world_campaign('location',target)) else private.can_read_world('location',target) end;
    else return false;
  end case;
end $$;
revoke all on function private.can_access_media(text,boolean) from public,anon;
grant execute on function private.can_access_media(text,boolean) to authenticated;
create policy cronica_media_read on storage.objects for select to authenticated
using(bucket_id='campaign-media' and private.can_access_media(name,false));
create policy cronica_media_create on storage.objects for insert to authenticated
with check(bucket_id='campaign-media' and private.can_access_media(name,true));
-- Immutable random object names. Replacements create a new object instead.
create policy cronica_media_delete on storage.objects for delete to authenticated
using(bucket_id='campaign-media' and private.can_access_media(name,true));

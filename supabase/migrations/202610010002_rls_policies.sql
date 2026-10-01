-- These helpers are not exposed in the public API. SECURITY DEFINER breaks
-- recursive policies, with a pinned search_path and authorization from auth.uid().
create function private.is_campaign_owner(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.campaigns where id=p_id and owner_id=(select auth.uid()));
$$;
create function private.can_read_campaign(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.campaigns c where c.id=p_id and (c.owner_id=(select auth.uid()) or exists(select 1 from public.campaign_members m where m.campaign_id=c.id and m.user_id=(select auth.uid()))));
$$;
create function private.can_read_profile(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select p_id=(select auth.uid()) or exists(
    select 1 from public.campaigns c where private.can_read_campaign(c.id)
    and (c.owner_id=p_id or exists(select 1 from public.campaign_members m where m.campaign_id=c.id and m.user_id=p_id))
  ) or exists(select 1 from public.characters ch where ch.owner_id=p_id and private.is_campaign_owner(ch.campaign_id));
$$;
create function private.can_edit_character(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.characters c where c.id=p_id and (private.is_campaign_owner(c.campaign_id) or (c.owner_id=(select auth.uid()) and private.can_read_campaign(c.campaign_id))));
$$;
create function private.character_owner_allowed(p_campaign uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
  select (p_user=(select auth.uid()) and private.can_read_campaign(p_campaign))
    or (private.is_campaign_owner(p_campaign) and exists(select 1 from public.campaign_members where campaign_id=p_campaign and user_id=p_user));
$$;
create function private.can_read_npc(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.npcs n where n.id=p_id and (private.is_campaign_owner(n.campaign_id) or (n.visible_to_players and private.can_read_campaign(n.campaign_id))));
$$;
create function private.can_edit_npc(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.npcs n where n.id=p_id and private.is_campaign_owner(n.campaign_id));
$$;
create function private.world_campaign(p_kind text,p_id uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
declare result uuid;
begin
  case p_kind
    when 'region' then select campaign_id into result from public.world_regions where id=p_id;
    when 'city' then select campaign_id into result from public.world_cities where id=p_id;
    when 'location' then select campaign_id into result from public.world_locations where id=p_id;
    else return null;
  end case;
  return result;
end $$;
create function private.can_read_world(p_kind text,p_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare cid uuid; visible boolean;
begin
  cid=private.world_campaign(p_kind,p_id);
  if private.is_campaign_owner(cid) then return true; end if;
  if not private.can_read_campaign(cid) then return false; end if;
  case p_kind
    when 'region' then select visible_to_players into visible from public.world_regions where id=p_id;
    when 'city' then select visible_to_players into visible from public.world_cities where id=p_id;
    when 'location' then select visible_to_players into visible from public.world_locations where id=p_id;
    else return false;
  end case;
  return coalesce(visible,false);
end $$;

do $$ declare t text; begin
  foreach t in array array['profiles','rpg_systems','campaigns','campaign_members','characters','character_attributes','character_skills','character_inventory','character_spells','world_regions','world_cities','world_locations','world_regions_private','world_cities_private','world_locations_private','npcs','npc_stats','npc_attacks','npc_spells'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
grant insert,update,delete on public.campaigns,public.campaign_members,public.characters,public.character_attributes,public.character_skills,public.character_inventory,public.character_spells,public.world_regions,public.world_cities,public.world_locations,public.world_regions_private,public.world_cities_private,public.world_locations_private,public.npcs,public.npc_stats,public.npc_attacks,public.npc_spells to authenticated;
grant update(name,avatar_path,preferences) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(private.can_read_profile(id));
create policy profiles_edit on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy systems_read on public.rpg_systems for select to authenticated using(active);
create policy campaigns_read on public.campaigns for select to authenticated using(owner_id=(select auth.uid()) or private.can_read_campaign(id));
create policy campaigns_create on public.campaigns for insert to authenticated with check(owner_id=(select auth.uid()));
create policy campaigns_edit on public.campaigns for update to authenticated using(private.is_campaign_owner(id)) with check(owner_id=(select auth.uid()));
create policy campaigns_delete on public.campaigns for delete to authenticated using(private.is_campaign_owner(id));
create policy members_read on public.campaign_members for select to authenticated using(private.can_read_campaign(campaign_id));
create policy members_create on public.campaign_members for insert to authenticated with check(private.is_campaign_owner(campaign_id) and user_id<>(select auth.uid()));
create policy members_delete on public.campaign_members for delete to authenticated using(private.is_campaign_owner(campaign_id));
create policy characters_read on public.characters for select to authenticated using(private.is_campaign_owner(campaign_id) or (owner_id=(select auth.uid()) and private.can_read_campaign(campaign_id)));
create policy characters_create on public.characters for insert to authenticated with check(private.character_owner_allowed(campaign_id,owner_id));
create policy characters_edit on public.characters for update to authenticated using(private.is_campaign_owner(campaign_id) or (owner_id=(select auth.uid()) and private.can_read_campaign(campaign_id))) with check(private.is_campaign_owner(campaign_id) or (owner_id=(select auth.uid()) and private.can_read_campaign(campaign_id)));
create policy characters_delete on public.characters for delete to authenticated using(private.can_edit_character(id));
do $$ declare t text; begin
  foreach t in array array['character_attributes','character_skills','character_inventory','character_spells'] loop
    execute format('create policy child_read on public.%I for select to authenticated using(private.can_edit_character(character_id))',t);
    execute format('create policy child_create on public.%I for insert to authenticated with check(private.can_edit_character(character_id))',t);
    execute format('create policy child_edit on public.%I for update to authenticated using(private.can_edit_character(character_id)) with check(private.can_edit_character(character_id))',t);
    execute format('create policy child_delete on public.%I for delete to authenticated using(private.can_edit_character(character_id))',t);
  end loop;
end $$;
do $$ declare t text; k text; begin
  for t,k in select * from (values('world_regions','region'),('world_cities','city'),('world_locations','location')) as v(t,k) loop
    execute format('create policy world_read on public.%I for select to authenticated using(private.is_campaign_owner(campaign_id) or (visible_to_players and private.can_read_campaign(campaign_id)))',t);
    execute format('create policy world_create on public.%I for insert to authenticated with check(private.is_campaign_owner(campaign_id))',t);
    execute format('create policy world_edit on public.%I for update to authenticated using(private.is_campaign_owner(campaign_id)) with check(private.is_campaign_owner(campaign_id))',t);
    execute format('create policy world_delete on public.%I for delete to authenticated using(private.is_campaign_owner(campaign_id))',t);
    execute format('create policy secrets_read on public.%I for select to authenticated using(private.is_campaign_owner(private.world_campaign(%L,entry_id)))',t||'_private',k);
    execute format('create policy secrets_create on public.%I for insert to authenticated with check(private.is_campaign_owner(private.world_campaign(%L,entry_id)))',t||'_private',k);
    execute format('create policy secrets_edit on public.%I for update to authenticated using(private.is_campaign_owner(private.world_campaign(%L,entry_id))) with check(private.is_campaign_owner(private.world_campaign(%L,entry_id)))',t||'_private',k,k);
    execute format('create policy secrets_delete on public.%I for delete to authenticated using(private.is_campaign_owner(private.world_campaign(%L,entry_id)))',t||'_private',k);
  end loop;
end $$;
create policy npcs_read on public.npcs for select to authenticated using(private.is_campaign_owner(campaign_id) or (visible_to_players and private.can_read_campaign(campaign_id)));
create policy npcs_create on public.npcs for insert to authenticated with check(private.is_campaign_owner(campaign_id));
create policy npcs_edit on public.npcs for update to authenticated using(private.is_campaign_owner(campaign_id)) with check(private.is_campaign_owner(campaign_id));
create policy npcs_delete on public.npcs for delete to authenticated using(private.is_campaign_owner(campaign_id));
do $$ declare t text; begin
  foreach t in array array['npc_stats','npc_attacks','npc_spells'] loop
    execute format('create policy npc_child_read on public.%I for select to authenticated using(private.can_read_npc(npc_id))',t);
    execute format('create policy npc_child_create on public.%I for insert to authenticated with check(private.can_edit_npc(npc_id))',t);
    execute format('create policy npc_child_edit on public.%I for update to authenticated using(private.can_edit_npc(npc_id)) with check(private.can_edit_npc(npc_id))',t);
    execute format('create policy npc_child_delete on public.%I for delete to authenticated using(private.can_edit_npc(npc_id))',t);
  end loop;
end $$;
revoke execute on all functions in schema private from public,anon;
grant execute on all functions in schema private to authenticated;

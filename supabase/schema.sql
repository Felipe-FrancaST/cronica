-- Generated from versioned migrations. Execute once on a new Supabase project.
-- 202610010001_initial_schema.sql
-- Authentication identity is auth.users, managed by Supabase Auth.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  email text not null,
  avatar_path text,
  preferences jsonb not null default '{}' check (jsonb_typeof(preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_lower_idx on public.profiles(lower(email));

create table public.rpg_systems (
  id uuid primary key default gen_random_uuid(), name text not null,
  slug text not null unique, description text not null default '', version text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  rpg_system_id uuid not null references public.rpg_systems(id),
  name text not null check(length(trim(name)) between 1 and 120),
  description text not null default '', theme text not null default '', cover_path text,
  status text not null default 'active' check(status in ('active','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,rpg_system_id)
);
create index campaigns_owner_status_idx on public.campaigns(owner_id,status);
create table public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check(status='active'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(campaign_id,user_id)
);
create index campaign_members_user_campaign_idx on public.campaign_members(user_id,campaign_id);
create table public.characters (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null,
  rpg_system_id uuid not null, owner_id uuid not null references public.profiles(id),
  name text not null check(length(trim(name)) between 1 and 120), portrait_path text,
  appearance text not null default '', biography text not null default '',
  system_data jsonb not null default '{}' check(jsonb_typeof(system_data)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (campaign_id,rpg_system_id) references public.campaigns(id,rpg_system_id) on delete cascade
);
create index characters_campaign_owner_idx on public.characters(campaign_id,owner_id);
create index characters_owner_idx on public.characters(owner_id);
create table public.character_attributes (
  id uuid primary key default gen_random_uuid(), character_id uuid not null references public.characters(id) on delete cascade,
  ability text not null, score integer not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(character_id,ability)
);
create table public.character_skills (
  id uuid primary key default gen_random_uuid(), character_id uuid not null references public.characters(id) on delete cascade,
  skill text not null, proficiency smallint not null check(proficiency between 0 and 2),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(character_id,skill)
);
create table public.character_inventory (
  id uuid primary key default gen_random_uuid(), character_id uuid not null references public.characters(id) on delete cascade,
  data jsonb not null check(jsonb_typeof(data)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index character_inventory_character_idx on public.character_inventory(character_id);
create table public.character_spells (
  id uuid primary key default gen_random_uuid(), character_id uuid not null references public.characters(id) on delete cascade,
  data jsonb not null check(jsonb_typeof(data)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index character_spells_character_idx on public.character_spells(character_id);

-- Public world content and GM secrets live in distinct RLS-protected rows.
create table public.world_regions (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 120), description text not null default '',
  image_path text, type text not null default '', location text not null default '', notes text not null default '',
  visible_to_players boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,campaign_id)
);
create index world_regions_campaign_idx on public.world_regions(campaign_id,visible_to_players);
create table public.world_cities (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 120), description text not null default '',
  image_path text, type text not null default '', location text not null default '', notes text not null default '',
  region_id uuid, population bigint check(population>=0), government text not null default '',
  visible_to_players boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(region_id,campaign_id) references public.world_regions(id,campaign_id)
);
create index world_cities_campaign_idx on public.world_cities(campaign_id,visible_to_players);
create table public.world_locations (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 120), description text not null default '',
  image_path text, type text not null default '', location text not null default '', notes text not null default '',
  region_id uuid, visible_to_players boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(region_id,campaign_id) references public.world_regions(id,campaign_id)
);
create index world_locations_campaign_idx on public.world_locations(campaign_id,visible_to_players);
create table public.world_regions_private (
  entry_id uuid primary key references public.world_regions(id) on delete cascade,
  secrets text not null default '', private_notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.world_cities_private (
  entry_id uuid primary key references public.world_cities(id) on delete cascade,
  secrets text not null default '', private_notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.world_locations_private (
  entry_id uuid primary key references public.world_locations(id) on delete cascade,
  secrets text not null default '', private_notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.npcs (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null, rpg_system_id uuid not null,
  name text not null check(length(trim(name)) between 1 and 120), image_path text,
  race text not null default '', type text not null default '', level integer not null default 1 check(level between 1 and 30),
  age text not null default '', appearance text not null default '', personality text not null default '',
  biography text not null default '', location text not null default '', faction text not null default '',
  relationship text not null default 'Neutra', status text not null default 'Vivo',
  visible_to_players boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(campaign_id,rpg_system_id) references public.campaigns(id,rpg_system_id) on delete cascade
);
create index npcs_campaign_visibility_idx on public.npcs(campaign_id,visible_to_players);
create table public.npc_stats (
  npc_id uuid primary key references public.npcs(id) on delete cascade,
  abilities jsonb not null default '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}',
  hp_current integer not null default 10 check(hp_current>=0), hp_max integer not null default 10 check(hp_max>0),
  ac integer not null default 10 check(ac>=0), abilities_text text not null default '',
  resistances text not null default '', weaknesses text not null default '', inventory text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(hp_current<=hp_max), check(jsonb_typeof(abilities)='object')
);
create table public.npc_attacks (
  id uuid primary key default gen_random_uuid(), npc_id uuid not null references public.npcs(id) on delete cascade,
  data jsonb not null check(jsonb_typeof(data)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index npc_attacks_npc_idx on public.npc_attacks(npc_id);
create table public.npc_spells (
  id uuid primary key default gen_random_uuid(), npc_id uuid not null references public.npcs(id) on delete cascade,
  data jsonb not null check(jsonb_typeof(data)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index npc_spells_npc_idx on public.npc_spells(npc_id);

create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
create function private.lock_context() returns trigger language plpgsql set search_path='' as $$
declare field text;
begin
  foreach field in array tg_argv loop
    if to_jsonb(new)->field is distinct from to_jsonb(old)->field then
      raise exception 'O vínculo deste registro não pode ser alterado.' using errcode='42501';
    end if;
  end loop;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['profiles','rpg_systems','campaigns','campaign_members','characters','character_attributes','character_skills','character_inventory','character_spells','world_regions','world_cities','world_locations','world_regions_private','world_cities_private','world_locations_private','npcs','npc_stats','npc_attacks','npc_spells'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
  end loop;
end $$;
create trigger lock_context before update on public.campaigns for each row execute function private.lock_context('id','owner_id','rpg_system_id');
create trigger lock_context before update on public.campaign_members for each row execute function private.lock_context('id','campaign_id','user_id');
create trigger lock_context before update on public.characters for each row execute function private.lock_context('id','campaign_id','owner_id','rpg_system_id');
create trigger lock_context before update on public.npcs for each row execute function private.lock_context('id','campaign_id','rpg_system_id');
do $$ declare t text; begin
  foreach t in array array['character_attributes','character_skills','character_inventory','character_spells'] loop
    execute format('create trigger lock_context before update on public.%I for each row execute function private.lock_context(''id'',''character_id'')',t);
  end loop;
  foreach t in array array['world_regions','world_cities','world_locations'] loop
    execute format('create trigger lock_context before update on public.%I for each row execute function private.lock_context(''id'',''campaign_id'')',t);
  end loop;
  foreach t in array array['world_regions_private','world_cities_private','world_locations_private'] loop
    execute format('create trigger lock_context before update on public.%I for each row execute function private.lock_context(''entry_id'')',t);
  end loop;
  foreach t in array array['npc_stats','npc_attacks','npc_spells'] loop
    execute format('create trigger lock_context before update on public.%I for each row execute function private.lock_context(''npc_id'')',t);
  end loop;
end $$;

create function private.unlink_region() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.world_cities set region_id=null where region_id=old.id;
  update public.world_locations set region_id=null where region_id=old.id;
  return old;
end $$;
create trigger unlink_region before delete on public.world_regions for each row execute function private.unlink_region();

create function private.sync_auth_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    insert into public.profiles(id,name,email) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Aventureiro'),100),new.email);
  else
    update public.profiles set email=new.email where id=new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.sync_auth_profile();
create trigger on_auth_email_updated after update of email on auth.users for each row execute function private.sync_auth_profile();
-- Also support accounts created before this migration.
insert into public.profiles(id,name,email)
select id,left(coalesce(nullif(trim(raw_user_meta_data->>'name'),''),'Aventureiro'),100),email from auth.users where email is not null
on conflict(id) do nothing;


-- 202610010002_rls_policies.sql
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


-- 202610010003_seed_rpg_systems.sql
insert into public.rpg_systems(id,name,slug,description,version,active)
values('00000000-0000-4000-8000-000000000001','D&D 5e','dnd5e','Dungeons & Dragons, quinta edição (2014). Regras básicas do SRD 5.1.','SRD 5.1',true)
on conflict(slug) do update set name=excluded.name,description=excluded.description,version=excluded.version,active=true;


-- 202610010004_transactional_services.sql
-- Exact-email member resolution is the only intentional SECURITY DEFINER RPC.
-- The caller is verified as the campaign owner BEFORE any account lookup.
create function public.add_campaign_member_by_email(p_campaign_id uuid,p_email text)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; result uuid;
begin
  if auth.uid() is null or not private.is_campaign_owner(p_campaign_id) then
    raise exception 'Apenas o mestre desta campanha pode adicionar jogadores.' using errcode='42501';
  end if;
  select id into target from public.profiles where lower(email)=lower(trim(p_email));
  if target is null then raise exception 'Este usuário ainda não possui uma conta.'; end if;
  if target=auth.uid() then raise exception 'Você já é o mestre desta campanha.'; end if;
  if exists(select 1 from public.campaign_members where campaign_id=p_campaign_id and user_id=target) then
    raise exception 'Este jogador já está na campanha.';
  end if;
  insert into public.campaign_members(campaign_id,user_id) values(p_campaign_id,target) returning id into result;
  return result;
exception when unique_violation then raise exception 'Este jogador já está na campanha.';
end $$;

-- Character writes are atomic and use the CALLER's RLS privileges.
create function public.save_character(p_payload jsonb,p_expected_updated_at timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cid uuid=(p_payload->>'id')::uuid; s jsonb=p_payload->'sheet'; old_row public.characters;
  saved public.characters; system_slug text; attribute text; entry jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  select * into old_row from public.characters where id=cid for update;
  if old_row.id is not null and p_expected_updated_at is not null and old_row.updated_at<>p_expected_updated_at then
    raise exception 'Esta ficha foi atualizada em outra sessão. Feche e reabra antes de salvar.';
  end if;
  if old_row.id is not null and (old_row.owner_id<>(p_payload->>'owner_id')::uuid or old_row.campaign_id<>(p_payload->>'campaign_id')::uuid or old_row.rpg_system_id<>(p_payload->>'rpg_system_id')::uuid) then
    raise exception 'O vínculo do personagem não pode ser alterado.' using errcode='42501';
  end if;
  if jsonb_typeof(s) is distinct from 'object' then raise exception 'A ficha é inválida.'; end if;
  select slug into system_slug from public.rpg_systems where id=(p_payload->>'rpg_system_id')::uuid;
  if system_slug='dnd5e' then
    if coalesce((s->>'level')::integer,0) not between 1 and 20 then raise exception 'O nível deve estar entre 1 e 20.'; end if;
    foreach attribute in array array['str','dex','con','int','wis','cha'] loop
      if coalesce((s->'abilities'->>attribute)::integer,0) not between 1 and 30 then raise exception 'Os atributos devem estar entre 1 e 30.'; end if;
    end loop;
    if coalesce((s->>'hp_current')::integer,-1)<0 or coalesce((s->>'hp_temp')::integer,-1)<0 or coalesce((s->>'xp')::bigint,-1)<0 then raise exception 'PV e experiência não podem ser negativos.'; end if;
    if s->>'hp_max_override' is not null and (s->>'hp_max_override')::integer<1 then raise exception 'O máximo de PV deve ser positivo.'; end if;
  end if;
  if jsonb_typeof(s->'inventory') is distinct from 'array' or jsonb_typeof(s->'spells') is distinct from 'array' or jsonb_typeof(s->'abilities') is distinct from 'object' or jsonb_typeof(s->'skills') is distinct from 'object' then raise exception 'Os registros da ficha são inválidos.'; end if;
  insert into public.characters(id,campaign_id,rpg_system_id,owner_id,name,portrait_path,appearance,biography,system_data)
  values(cid,(p_payload->>'campaign_id')::uuid,(p_payload->>'rpg_system_id')::uuid,(p_payload->>'owner_id')::uuid,trim(p_payload->>'name'),p_payload->>'portrait_path',coalesce(p_payload->>'appearance',''),coalesce(p_payload->>'biography',''),s-array['abilities','skills','inventory','spells'])
  on conflict(id) do update set name=excluded.name,portrait_path=excluded.portrait_path,appearance=excluded.appearance,biography=excluded.biography,system_data=excluded.system_data
  returning * into saved;
  delete from public.character_attributes where character_id=cid;
  insert into public.character_attributes(character_id,ability,score) select cid,key,value::integer from jsonb_each_text(s->'abilities');
  delete from public.character_skills where character_id=cid;
  insert into public.character_skills(character_id,skill,proficiency) select cid,key,value::smallint from jsonb_each_text(s->'skills');
  delete from public.character_inventory where character_id=cid;
  for entry in select value from jsonb_array_elements(s->'inventory') loop
    if length(trim(entry->>'name'))=0 or coalesce((entry->>'quantity')::integer,0)<1 or coalesce((entry->>'weight')::numeric,-1)<0 then raise exception 'Confira a quantidade e o peso dos itens.'; end if;
    insert into public.character_inventory(id,character_id,data) values((entry->>'id')::uuid,cid,entry-'id');
  end loop;
  delete from public.character_spells where character_id=cid;
  for entry in select value from jsonb_array_elements(s->'spells') loop
    if coalesce(length(trim(entry->>'name')),0)=0 or coalesce((entry->>'level')::integer,-1) not between 0 and 9 then raise exception 'Confira o nome e o nível das magias.'; end if;
    insert into public.character_spells(id,character_id,data) values((entry->>'id')::uuid,cid,entry-'id');
  end loop;
  return jsonb_build_object('id',saved.id,'updated_at',saved.updated_at);
end $$;

create function public.save_world_entry(p_payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare kind text=p_payload->>'kind'; tab text; cid uuid=(p_payload->>'campaign_id')::uuid;
  eid uuid=(p_payload->>'id')::uuid; existing_campaign uuid;
begin
  if auth.uid() is null or not private.is_campaign_owner(cid) then raise exception 'Apenas o mestre desta campanha pode construir o mundo.' using errcode='42501'; end if;
  case kind when 'region' then tab='world_regions'; when 'city' then tab='world_cities'; when 'location' then tab='world_locations'; else raise exception 'Tipo de lugar inválido.'; end case;
  execute format('select campaign_id from public.%I where id=$1 for update',tab) into existing_campaign using eid;
  if existing_campaign is not null and existing_campaign<>cid then raise exception 'O lugar pertence a outra campanha.' using errcode='42501'; end if;
  execute format('insert into public.%I(id,campaign_id,name,description,image_path,type,location,notes,visible_to_players)
    values(($1->>''id'')::uuid,($1->>''campaign_id'')::uuid,trim($1->>''name''),coalesce($1->>''description'',''''),$1->>''image_path'',coalesce($1->>''type'',''''),coalesce($1->>''location'',''''),coalesce($1->>''notes'',''''),coalesce(($1->>''visible_to_players'')::boolean,false))
    on conflict(id) do update set name=excluded.name,description=excluded.description,image_path=excluded.image_path,type=excluded.type,location=excluded.location,notes=excluded.notes,visible_to_players=excluded.visible_to_players',tab) using p_payload;
  if kind='city' then
    update public.world_cities set region_id=(p_payload->>'region_id')::uuid,population=(p_payload->>'population')::bigint,government=coalesce(p_payload->>'government','') where id=eid;
  elsif kind='location' then
    update public.world_locations set region_id=(p_payload->>'region_id')::uuid where id=eid;
  end if;
  execute format('insert into public.%I(entry_id,secrets,private_notes) values($1,$2,$3) on conflict(entry_id) do update set secrets=excluded.secrets,private_notes=excluded.private_notes',tab||'_private')
    using eid,coalesce(p_payload->>'secrets',''),coalesce(p_payload->>'private_notes','');
  return eid;
end $$;

create function public.save_npc(p_payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare nid uuid=(p_payload->>'id')::uuid; cid uuid=(p_payload->>'campaign_id')::uuid;
  old_row public.npcs; entry jsonb; attribute text;
begin
  if auth.uid() is null or not private.is_campaign_owner(cid) then raise exception 'Apenas o mestre desta campanha pode alterar NPCs.' using errcode='42501'; end if;
  select * into old_row from public.npcs where id=nid for update;
  if old_row.id is not null and (old_row.campaign_id<>cid or old_row.rpg_system_id<>(p_payload->>'rpg_system_id')::uuid) then raise exception 'O vínculo do NPC não pode ser alterado.' using errcode='42501'; end if;
  foreach attribute in array array['str','dex','con','int','wis','cha'] loop
    if coalesce((p_payload->'abilities'->>attribute)::integer,0) not between 1 and 30 then raise exception 'Os atributos devem estar entre 1 e 30.'; end if;
  end loop;
  insert into public.npcs(id,campaign_id,rpg_system_id,name,image_path,race,type,level,age,appearance,personality,biography,location,faction,relationship,status,visible_to_players)
  values(nid,cid,(p_payload->>'rpg_system_id')::uuid,trim(p_payload->>'name'),p_payload->>'image_path',coalesce(p_payload->>'race',''),coalesce(p_payload->>'type',''),(p_payload->>'level')::integer,coalesce(p_payload->>'age',''),coalesce(p_payload->>'appearance',''),coalesce(p_payload->>'personality',''),coalesce(p_payload->>'biography',''),coalesce(p_payload->>'location',''),coalesce(p_payload->>'faction',''),coalesce(p_payload->>'relationship','Neutra'),coalesce(p_payload->>'status','Vivo'),coalesce((p_payload->>'visible_to_players')::boolean,false))
  on conflict(id) do update set name=excluded.name,image_path=excluded.image_path,race=excluded.race,type=excluded.type,level=excluded.level,age=excluded.age,appearance=excluded.appearance,personality=excluded.personality,biography=excluded.biography,location=excluded.location,faction=excluded.faction,relationship=excluded.relationship,status=excluded.status,visible_to_players=excluded.visible_to_players;
  insert into public.npc_stats(npc_id,abilities,hp_current,hp_max,ac,abilities_text,resistances,weaknesses,inventory)
  values(nid,p_payload->'abilities',(p_payload->>'hp_current')::integer,(p_payload->>'hp_max')::integer,(p_payload->>'ac')::integer,coalesce(p_payload->>'abilities_text',''),coalesce(p_payload->>'resistances',''),coalesce(p_payload->>'weaknesses',''),coalesce(p_payload->>'inventory',''))
  on conflict(npc_id) do update set abilities=excluded.abilities,hp_current=excluded.hp_current,hp_max=excluded.hp_max,ac=excluded.ac,abilities_text=excluded.abilities_text,resistances=excluded.resistances,weaknesses=excluded.weaknesses,inventory=excluded.inventory;
  delete from public.npc_attacks where npc_id=nid;
  for entry in select value from jsonb_array_elements(p_payload->'attacks') loop
    if coalesce(length(trim(entry->>'name')),0)=0 then raise exception 'Dê um nome a cada ataque.'; end if;
    insert into public.npc_attacks(id,npc_id,data) values((entry->>'id')::uuid,nid,entry-'id');
  end loop;
  delete from public.npc_spells where npc_id=nid;
  for entry in select value from jsonb_array_elements(p_payload->'spells') loop
    if coalesce(length(trim(entry->>'name')),0)=0 or coalesce((entry->>'level')::integer,-1) not between 0 and 9 then raise exception 'Confira o nome e o nível das magias.'; end if;
    insert into public.npc_spells(id,npc_id,data) values((entry->>'id')::uuid,nid,entry-'id');
  end loop;
  return nid;
end $$;

revoke all on function public.add_campaign_member_by_email(uuid,text),public.save_character(jsonb,timestamptz),public.save_world_entry(jsonb),public.save_npc(jsonb) from public,anon;
grant execute on function public.add_campaign_member_by_email(uuid,text),public.save_character(jsonb,timestamptz),public.save_world_entry(jsonb),public.save_npc(jsonb) to authenticated;


-- 202610010005_private_storage.sql
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


-- 202610010006_realtime.sql
-- Realtime is optional acceleration; clients also refresh on focus/every 30 s.
do $$ declare t text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['characters','npcs','campaigns','campaign_members','world_regions','world_cities','world_locations'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;


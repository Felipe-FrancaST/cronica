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

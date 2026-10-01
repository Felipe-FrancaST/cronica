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


-- 202610010007_tactical_vtt.sql
-- Tactical VTT v1. Logical grid coordinates are authoritative; Canvas/WebGL are presentation layers only.
create table public.battle_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 120),
  status text not null default 'preparing' check(status in ('preparing','active','ended')),
  round integer not null default 0 check(round >= 0),
  turn_index integer not null default 0 check(turn_index >= 0),
  active_token_id uuid,
  restrict_movement_to_turn boolean not null default true,
  turn_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,campaign_id)
);
create index battle_sessions_campaign_idx on public.battle_sessions(campaign_id,status);

create table public.battle_maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  battle_session_id uuid not null,
  name text not null check(length(trim(name)) between 1 and 120),
  description text not null default '',
  width integer not null default 30 check(width between 1 and 500),
  height integer not null default 20 check(height between 1 and 500),
  grid_size integer not null default 1 check(grid_size > 0),
  cell_size integer not null default 64 check(cell_size between 16 and 256),
  scale_per_cell numeric(10,4) not null default 1.5 check(scale_per_cell > 0),
  scale_unit text not null default 'm' check(scale_unit in ('m','ft')),
  diagonal_rule text not null default 'one' check(diagonal_rule in ('one','sqrt2','five-ten-five')),
  background_image text,
  background_offset_x numeric(12,4) not null default 0,
  background_offset_y numeric(12,4) not null default 0,
  background_scale numeric(10,4) not null default 1 check(background_scale > 0),
  grid_visible boolean not null default true,
  grid_opacity numeric(4,3) not null default 0.45 check(grid_opacity between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,campaign_id),
  foreign key(battle_session_id,campaign_id) references public.battle_sessions(id,campaign_id) on delete cascade
);
create index battle_maps_campaign_idx on public.battle_maps(campaign_id,created_at);
create index battle_maps_session_idx on public.battle_maps(battle_session_id);

create table public.battle_map_cells (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.battle_maps(id) on delete cascade,
  x integer not null check(x >= 0),
  y integer not null check(y >= 0),
  z integer not null default 0,
  terrain_type text not null default 'normal',
  movement_cost numeric(10,4) not null default 1 check(movement_cost > 0),
  blocked boolean not null default false,
  metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(map_id,x,y,z)
);
create index battle_map_cells_map_xy_idx on public.battle_map_cells(map_id,x,y,z);

-- Sparse scene objects keep walls/doors/obstacles/effects independent from the 2D renderer.
-- geometry is intentionally renderer-agnostic so the same logical scene can be projected in Three.js later.
create table public.battle_map_objects (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.battle_maps(id) on delete cascade,
  object_type text not null check(length(trim(object_type)) between 1 and 60),
  geometry jsonb not null default '{}' check(jsonb_typeof(geometry)='object'),
  z numeric(10,4) not null default 0,
  blocks_movement boolean not null default false,
  blocks_vision boolean not null default false,
  visible boolean not null default true,
  metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index battle_map_objects_map_idx on public.battle_map_objects(map_id,object_type);

create table public.battle_map_tokens (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  map_id uuid not null,
  character_id uuid references public.characters(id) on delete cascade,
  npc_id uuid references public.npcs(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 120),
  image text,
  x integer not null default 0 check(x >= 0),
  y integer not null default 0 check(y >= 0),
  z integer not null default 0,
  size numeric(6,2) not null default 1 check(size > 0),
  movement_speed numeric(10,4) not null check(movement_speed >= 0),
  movement_remaining numeric(10,4) not null check(movement_remaining >= 0),
  movement_unit text not null default 'm' check(movement_unit in ('m','ft')),
  controlled_by uuid references public.profiles(id) on delete set null,
  visible boolean not null default true,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(map_id,campaign_id) references public.battle_maps(id,campaign_id) on delete cascade,
  check(character_id is null or npc_id is null)
);
create index battle_map_tokens_map_idx on public.battle_map_tokens(map_id,visible);
create index battle_map_tokens_character_idx on public.battle_map_tokens(character_id) where character_id is not null;
create index battle_map_tokens_npc_idx on public.battle_map_tokens(npc_id) where npc_id is not null;

alter table public.battle_sessions add constraint battle_sessions_active_token_fk
  foreign key(active_token_id) references public.battle_map_tokens(id) on delete set null;

create table public.battle_turn_order (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.battle_sessions(id) on delete cascade,
  token_id uuid not null references public.battle_map_tokens(id) on delete cascade,
  position integer not null check(position >= 0),
  initiative numeric(10,3) not null default 0,
  created_at timestamptz not null default now(),
  unique(session_id,token_id),
  unique(session_id,position)
);
create index battle_turn_order_session_idx on public.battle_turn_order(session_id,position);

create table public.battle_movements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  session_id uuid references public.battle_sessions(id) on delete set null,
  token_id uuid not null references public.battle_map_tokens(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  from_x integer not null,
  from_y integer not null,
  to_x integer not null,
  to_y integer not null,
  movement_cost numeric(10,4) not null check(movement_cost >= 0),
  movement_unit text not null check(movement_unit in ('m','ft')),
  path jsonb not null default '[]' check(jsonb_typeof(path)='array'),
  turn_round integer,
  created_at timestamptz not null default now()
);
create index battle_movements_token_created_idx on public.battle_movements(token_id,created_at desc);
create index battle_movements_campaign_created_idx on public.battle_movements(campaign_id,created_at desc);

create function private.validate_battle_cell_bounds() returns trigger language plpgsql set search_path='' as $$
declare m public.battle_maps;
begin
  select * into m from public.battle_maps where id=new.map_id;
  if m.id is null or new.x>=m.width or new.y>=m.height then raise exception 'Célula fora dos limites do mapa.'; end if;
  return new;
end $$;
create function private.validate_battle_token_context() returns trigger language plpgsql set search_path='' as $$
declare m public.battle_maps; cid uuid;
begin
  select * into m from public.battle_maps where id=new.map_id;
  if m.id is null or m.campaign_id<>new.campaign_id or new.x>=m.width or new.y>=m.height then raise exception 'Token fora do contexto do mapa.'; end if;
  if new.character_id is not null then select campaign_id into cid from public.characters where id=new.character_id; if cid is distinct from new.campaign_id then raise exception 'Personagem não pertence à campanha do mapa.'; end if; end if;
  if new.npc_id is not null then select campaign_id into cid from public.npcs where id=new.npc_id; if cid is distinct from new.campaign_id then raise exception 'NPC não pertence à campanha do mapa.'; end if; end if;
  if new.controlled_by is not null and not exists(
    select 1 from public.campaigns c where c.id=new.campaign_id and (c.owner_id=new.controlled_by or exists(select 1 from public.campaign_members cm where cm.campaign_id=c.id and cm.user_id=new.controlled_by))
  ) then raise exception 'O controlador do token não pertence à campanha.'; end if;
  return new;
end $$;
create function private.validate_battle_map_resize() returns trigger language plpgsql set search_path='' as $$
begin
  if (new.width<old.width or new.height<old.height) and (
    exists(select 1 from public.battle_map_tokens t where t.map_id=new.id and (t.x>=new.width or t.y>=new.height)) or
    exists(select 1 from public.battle_map_cells c where c.map_id=new.id and (c.x>=new.width or c.y>=new.height))
  ) then raise exception 'Reposicione tokens e terrenos antes de reduzir os limites do mapa.'; end if;
  return new;
end $$;
create trigger validate_battle_cell_bounds before insert or update on public.battle_map_cells for each row execute function private.validate_battle_cell_bounds();
create trigger validate_battle_token_context before insert or update on public.battle_map_tokens for each row execute function private.validate_battle_token_context();
create trigger validate_battle_map_resize before update of width,height on public.battle_maps for each row execute function private.validate_battle_map_resize();

create trigger touch_updated_at before update on public.battle_sessions for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.battle_maps for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.battle_map_cells for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.battle_map_objects for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.battle_map_tokens for each row execute function private.touch_updated_at();

create function private.battle_map_campaign(p_map uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select campaign_id from public.battle_maps where id=p_map;
$$;
create function private.battle_session_campaign(p_session uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select campaign_id from public.battle_sessions where id=p_session;
$$;
create function private.can_read_battle_token(p_token uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.battle_map_tokens t
    where t.id=p_token and private.can_read_campaign(t.campaign_id)
      and (private.is_campaign_owner(t.campaign_id) or t.visible or t.controlled_by=(select auth.uid())
        or exists(select 1 from public.characters c where c.id=t.character_id and c.owner_id=(select auth.uid())))
  );
$$;
create function private.can_control_battle_token(p_token uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.battle_map_tokens t
    where t.id=p_token and private.can_read_campaign(t.campaign_id)
      and (private.is_campaign_owner(t.campaign_id) or t.controlled_by=(select auth.uid())
        or exists(select 1 from public.characters c where c.id=t.character_id and c.owner_id=(select auth.uid())))
  );
$$;

alter table public.battle_sessions enable row level security;
alter table public.battle_maps enable row level security;
alter table public.battle_map_cells enable row level security;
alter table public.battle_map_objects enable row level security;
alter table public.battle_map_tokens enable row level security;
alter table public.battle_turn_order enable row level security;
alter table public.battle_movements enable row level security;

revoke all on public.battle_sessions,public.battle_maps,public.battle_map_cells,public.battle_map_objects,public.battle_map_tokens,public.battle_turn_order,public.battle_movements from anon,authenticated;
grant select on public.battle_sessions,public.battle_maps,public.battle_map_cells,public.battle_map_objects,public.battle_map_tokens,public.battle_turn_order,public.battle_movements to authenticated;
grant insert,update,delete on public.battle_sessions,public.battle_maps,public.battle_map_cells,public.battle_map_objects,public.battle_map_tokens,public.battle_turn_order to authenticated;

create policy battle_sessions_read on public.battle_sessions for select to authenticated using(private.can_read_campaign(campaign_id));
create policy battle_sessions_create on public.battle_sessions for insert to authenticated with check(private.is_campaign_owner(campaign_id));
create policy battle_sessions_edit on public.battle_sessions for update to authenticated using(private.is_campaign_owner(campaign_id)) with check(private.is_campaign_owner(campaign_id));
create policy battle_sessions_delete on public.battle_sessions for delete to authenticated using(private.is_campaign_owner(campaign_id));

create policy battle_maps_read on public.battle_maps for select to authenticated using(private.can_read_campaign(campaign_id));
create policy battle_maps_create on public.battle_maps for insert to authenticated with check(private.is_campaign_owner(campaign_id));
create policy battle_maps_edit on public.battle_maps for update to authenticated using(private.is_campaign_owner(campaign_id)) with check(private.is_campaign_owner(campaign_id));
create policy battle_maps_delete on public.battle_maps for delete to authenticated using(private.is_campaign_owner(campaign_id));

create policy battle_cells_read on public.battle_map_cells for select to authenticated using(private.can_read_campaign(private.battle_map_campaign(map_id)));
create policy battle_cells_create on public.battle_map_cells for insert to authenticated with check(private.is_campaign_owner(private.battle_map_campaign(map_id)));
create policy battle_cells_edit on public.battle_map_cells for update to authenticated using(private.is_campaign_owner(private.battle_map_campaign(map_id))) with check(private.is_campaign_owner(private.battle_map_campaign(map_id)));
create policy battle_cells_delete on public.battle_map_cells for delete to authenticated using(private.is_campaign_owner(private.battle_map_campaign(map_id)));

create policy battle_objects_read on public.battle_map_objects for select to authenticated using(private.can_read_campaign(private.battle_map_campaign(map_id)) and (visible or private.is_campaign_owner(private.battle_map_campaign(map_id))));
create policy battle_objects_create on public.battle_map_objects for insert to authenticated with check(private.is_campaign_owner(private.battle_map_campaign(map_id)));
create policy battle_objects_edit on public.battle_map_objects for update to authenticated using(private.is_campaign_owner(private.battle_map_campaign(map_id))) with check(private.is_campaign_owner(private.battle_map_campaign(map_id)));
create policy battle_objects_delete on public.battle_map_objects for delete to authenticated using(private.is_campaign_owner(private.battle_map_campaign(map_id)));

create policy battle_tokens_read on public.battle_map_tokens for select to authenticated using(private.can_read_battle_token(id));
create policy battle_tokens_create on public.battle_map_tokens for insert to authenticated with check(private.is_campaign_owner(campaign_id));
-- Direct token writes are GM-only. Player movement is exclusively through the checked RPC below.
create policy battle_tokens_edit on public.battle_map_tokens for update to authenticated using(private.is_campaign_owner(campaign_id)) with check(private.is_campaign_owner(campaign_id));
create policy battle_tokens_delete on public.battle_map_tokens for delete to authenticated using(private.is_campaign_owner(campaign_id));

create policy battle_turn_order_read on public.battle_turn_order for select to authenticated using(private.is_campaign_owner(private.battle_session_campaign(session_id)) or private.can_read_battle_token(token_id));
create policy battle_turn_order_create on public.battle_turn_order for insert to authenticated with check(private.is_campaign_owner(private.battle_session_campaign(session_id)));
create policy battle_turn_order_edit on public.battle_turn_order for update to authenticated using(private.is_campaign_owner(private.battle_session_campaign(session_id))) with check(private.is_campaign_owner(private.battle_session_campaign(session_id)));
create policy battle_turn_order_delete on public.battle_turn_order for delete to authenticated using(private.is_campaign_owner(private.battle_session_campaign(session_id)));

create policy battle_movements_read on public.battle_movements for select to authenticated using(private.is_campaign_owner(campaign_id) or private.can_read_battle_token(token_id));

create or replace function public.create_battle_map(p_campaign_id uuid,p_payload jsonb) returns public.battle_maps
language plpgsql security definer set search_path='' as $$
declare session_row public.battle_sessions; map_row public.battle_maps;
begin
  if not private.is_campaign_owner(p_campaign_id) then raise exception 'Apenas o mestre pode criar mapas.' using errcode='42501'; end if;
  insert into public.battle_sessions(campaign_id,name,restrict_movement_to_turn)
  values(p_campaign_id,coalesce(nullif(trim(p_payload->>'session_name'),''),coalesce(nullif(trim(p_payload->>'name'),''),'Mesa tática')),coalesce((p_payload->>'restrict_movement_to_turn')::boolean,true))
  returning * into session_row;

  insert into public.battle_maps(campaign_id,battle_session_id,name,description,width,height,cell_size,scale_per_cell,scale_unit,diagonal_rule,grid_visible,grid_opacity)
  values(
    p_campaign_id,session_row.id,coalesce(nullif(trim(p_payload->>'name'),''),'Novo mapa'),coalesce(p_payload->>'description',''),
    coalesce((p_payload->>'width')::integer,30),coalesce((p_payload->>'height')::integer,20),coalesce((p_payload->>'cell_size')::integer,64),
    coalesce((p_payload->>'scale_per_cell')::numeric,1.5),coalesce(nullif(p_payload->>'scale_unit',''),'m'),coalesce(nullif(p_payload->>'diagonal_rule',''),'one'),
    coalesce((p_payload->>'grid_visible')::boolean,true),coalesce((p_payload->>'grid_opacity')::numeric,0.45)
  ) returning * into map_row;
  return map_row;
end $$;

create or replace function public.add_character_to_battle_map(p_map_id uuid,p_character_id uuid,p_x integer default 0,p_y integer default 0) returns public.battle_map_tokens
language plpgsql security definer set search_path='' as $$
declare m public.battle_maps; c public.characters; result public.battle_map_tokens; system_slug text; speed numeric;
begin
  select * into m from public.battle_maps where id=p_map_id;
  if m.id is null or not private.is_campaign_owner(m.campaign_id) then raise exception 'Apenas o mestre pode adicionar personagens.' using errcode='42501'; end if;
  select * into c from public.characters where id=p_character_id and campaign_id=m.campaign_id;
  if c.id is null then raise exception 'Personagem não pertence a esta campanha.'; end if;
  if p_x<0 or p_y<0 or p_x>=m.width or p_y>=m.height then raise exception 'Posição inicial fora do mapa.'; end if;
  if exists(select 1 from public.battle_map_cells where map_id=m.id and x=p_x and y=p_y and z=0 and blocked) then raise exception 'A posição inicial está bloqueada.'; end if;
  if exists(select 1 from public.battle_map_tokens where map_id=m.id and x=p_x and y=p_y and z=0) then raise exception 'A posição inicial já está ocupada.'; end if;
  if exists(select 1 from public.battle_map_tokens where map_id=m.id and character_id=c.id) then raise exception 'Este personagem já está no mapa.'; end if;
  select slug into system_slug from public.rpg_systems where id=c.rpg_system_id;
  if c.system_data ? 'speed_override' and nullif(c.system_data->>'speed_override','') is not null then
    speed=(c.system_data->>'speed_override')::numeric;
  elsif system_slug='dnd5e' then
    speed=case when coalesce(c.system_data->>'race','') in ('Anão','Halfling','Gnomo') then 7.5 else 9 end;
  else
    raise exception 'A ficha não fornece um deslocamento que o VTT consiga interpretar.';
  end if;
  insert into public.battle_map_tokens(campaign_id,map_id,character_id,name,image,x,y,size,movement_speed,movement_remaining,movement_unit,controlled_by,visible)
  values(m.campaign_id,m.id,c.id,c.name,c.portrait_path,p_x,p_y,1,speed,speed,'m',c.owner_id,true)
  returning * into result;
  return result;
end $$;

create or replace function public.add_npc_to_battle_map(p_map_id uuid,p_npc_id uuid,p_movement_speed numeric,p_movement_unit text default 'm',p_x integer default 0,p_y integer default 0) returns public.battle_map_tokens
language plpgsql security definer set search_path='' as $$
declare m public.battle_maps; n public.npcs; result public.battle_map_tokens;
begin
  select * into m from public.battle_maps where id=p_map_id;
  if m.id is null or not private.is_campaign_owner(m.campaign_id) then raise exception 'Apenas o mestre pode adicionar NPCs.' using errcode='42501'; end if;
  select * into n from public.npcs where id=p_npc_id and campaign_id=m.campaign_id;
  if n.id is null then raise exception 'NPC não pertence a esta campanha.'; end if;
  if p_movement_speed is null or p_movement_speed<0 or p_movement_unit not in ('m','ft') then raise exception 'Informe um deslocamento válido para o NPC.'; end if;
  if p_x<0 or p_y<0 or p_x>=m.width or p_y>=m.height then raise exception 'Posição inicial fora do mapa.'; end if;
  if exists(select 1 from public.battle_map_cells where map_id=m.id and x=p_x and y=p_y and z=0 and blocked) then raise exception 'A posição inicial está bloqueada.'; end if;
  if exists(select 1 from public.battle_map_tokens where map_id=m.id and x=p_x and y=p_y and z=0) then raise exception 'A posição inicial já está ocupada.'; end if;
  if exists(select 1 from public.battle_map_tokens where map_id=m.id and npc_id=n.id) then raise exception 'Este NPC já está no mapa.'; end if;
  insert into public.battle_map_tokens(campaign_id,map_id,npc_id,name,image,x,y,size,movement_speed,movement_remaining,movement_unit,visible)
  values(m.campaign_id,m.id,n.id,n.name,n.image_path,p_x,p_y,1,p_movement_speed,p_movement_speed,p_movement_unit,n.visible_to_players)
  returning * into result;
  return result;
end $$;

create or replace function public.start_battle_combat(p_session_id uuid,p_order jsonb) returns public.battle_sessions
language plpgsql security definer set search_path='' as $$
declare s public.battle_sessions; item jsonb; idx integer=0; first_token uuid; result public.battle_sessions;
begin
  select * into s from public.battle_sessions where id=p_session_id for update;
  if s.id is null or not private.is_campaign_owner(s.campaign_id) then raise exception 'Apenas o mestre pode iniciar o combate.' using errcode='42501'; end if;
  if p_order is null or jsonb_typeof(p_order)<>'array' or jsonb_array_length(p_order)=0 then raise exception 'Defina a ordem de iniciativa.'; end if;
  delete from public.battle_turn_order where session_id=s.id;
  for item in select value from jsonb_array_elements(p_order) loop
    if not exists(select 1 from public.battle_map_tokens t join public.battle_maps m on m.id=t.map_id where t.id=(item->>'token_id')::uuid and m.battle_session_id=s.id) then
      raise exception 'A ordem contém um token que não pertence à mesa.';
    end if;
    insert into public.battle_turn_order(session_id,token_id,position,initiative)
    values(s.id,(item->>'token_id')::uuid,idx,coalesce((item->>'initiative')::numeric,0));
    if idx=0 then first_token=(item->>'token_id')::uuid; end if;
    idx=idx+1;
  end loop;
  update public.battle_map_tokens set movement_remaining=movement_speed where id=first_token;
  update public.battle_sessions set status='active',round=1,turn_index=0,active_token_id=first_token,turn_started_at=now() where id=s.id returning * into result;
  return result;
end $$;

create or replace function public.advance_battle_turn(p_session_id uuid) returns public.battle_sessions
language plpgsql security definer set search_path='' as $$
declare s public.battle_sessions; total integer; next_index integer; next_round integer; next_token uuid; result public.battle_sessions;
begin
  select * into s from public.battle_sessions where id=p_session_id for update;
  if s.id is null or (not private.is_campaign_owner(s.campaign_id) and (s.active_token_id is null or not private.can_control_battle_token(s.active_token_id))) then raise exception 'Você não pode encerrar este turno.' using errcode='42501'; end if;
  if s.status<>'active' then raise exception 'O combate não está ativo.'; end if;
  select count(*) into total from public.battle_turn_order where session_id=s.id;
  if total=0 then raise exception 'A ordem de iniciativa está vazia.'; end if;
  next_index=(s.turn_index+1)%total;
  next_round=s.round + case when next_index=0 then 1 else 0 end;
  select token_id into next_token from public.battle_turn_order where session_id=s.id and position=next_index;
  update public.battle_map_tokens set movement_remaining=movement_speed where id=next_token;
  update public.battle_sessions set turn_index=next_index,round=next_round,active_token_id=next_token,turn_started_at=now() where id=s.id returning * into result;
  return result;
end $$;

create or replace function public.end_battle_combat(p_session_id uuid) returns public.battle_sessions
language plpgsql security definer set search_path='' as $$
declare s public.battle_sessions; result public.battle_sessions;
begin
  select * into s from public.battle_sessions where id=p_session_id for update;
  if s.id is null or not private.is_campaign_owner(s.campaign_id) then raise exception 'Apenas o mestre pode encerrar o combate.' using errcode='42501'; end if;
  update public.battle_sessions set status='ended',active_token_id=null,turn_started_at=null where id=s.id returning * into result;
  return result;
end $$;

create or replace function public.move_battle_token(p_token_id uuid,p_to_x integer,p_to_y integer,p_path jsonb,p_expected_version bigint,p_force boolean default false) returns public.battle_map_tokens
language plpgsql security definer set search_path='' as $$
declare
  t public.battle_map_tokens; m public.battle_maps; s public.battle_sessions; result public.battle_map_tokens;
  step jsonb; cx integer; cy integer; nx integer; ny integer; diag_count integer=0; step_cost numeric; total_grid_cost numeric=0;
  blocked_cell boolean; terrain_cost numeric; movement_cost numeric; token_owner boolean; item_count integer;
begin
  p_force=coalesce(p_force,false);
  select * into t from public.battle_map_tokens where id=p_token_id for update;
  if t.id is null or not private.can_control_battle_token(t.id) then raise exception 'Você não pode controlar este token.' using errcode='42501'; end if;
  token_owner=private.is_campaign_owner(t.campaign_id);
  if p_force and not token_owner then raise exception 'Somente o mestre pode forçar um movimento.' using errcode='42501'; end if;
  if p_expected_version is null or t.version<>p_expected_version then raise exception 'O token foi movido por outra pessoa. Atualize a mesa e tente novamente.' using errcode='40001'; end if;
  select * into m from public.battle_maps where id=t.map_id;
  select * into s from public.battle_sessions where id=m.battle_session_id;
  if p_to_x<0 or p_to_y<0 or p_to_x>=m.width or p_to_y>=m.height then raise exception 'Destino fora do mapa.'; end if;
  if s.status='active' and s.restrict_movement_to_turn and s.active_token_id<>t.id and not token_owner and not p_force then
    raise exception 'Aguarde o turno deste token.' using errcode='42501';
  end if;
  if p_path is null or jsonb_typeof(p_path)<>'array' then raise exception 'Caminho inválido.'; end if;
  item_count=jsonb_array_length(p_path);
  if item_count=0 or item_count>500 then raise exception 'Caminho inválido.'; end if;
  cx=t.x; cy=t.y;
  for step in select value from jsonb_array_elements(p_path) loop
    nx=(step->>'x')::integer; ny=(step->>'y')::integer;
    if nx<0 or ny<0 or nx>=m.width or ny>=m.height or abs(nx-cx)>1 or abs(ny-cy)>1 or (nx=cx and ny=cy) then raise exception 'O caminho contém uma etapa inválida.'; end if;
    select c.blocked,c.movement_cost into blocked_cell,terrain_cost from public.battle_map_cells c where c.map_id=m.id and c.x=nx and c.y=ny and c.z=t.z;
    blocked_cell=coalesce(blocked_cell,false); terrain_cost=coalesce(terrain_cost,1);
    if blocked_cell then raise exception 'O caminho atravessa uma célula bloqueada.'; end if;
    if nx<>cx and ny<>cy and (
      exists(select 1 from public.battle_map_cells side where side.map_id=m.id and side.z=t.z and side.blocked and ((side.x=nx and side.y=cy) or (side.x=cx and side.y=ny))) or
      exists(select 1 from public.battle_map_tokens other where other.map_id=m.id and other.id<>t.id and other.visible and other.z=t.z and ((other.x=nx and other.y=cy) or (other.x=cx and other.y=ny)))
    ) then raise exception 'O caminho tenta atravessar um canto bloqueado.'; end if;
    if exists(select 1 from public.battle_map_tokens other where other.map_id=m.id and other.id<>t.id and other.visible and other.x=nx and other.y=ny and other.z=t.z) then
      raise exception 'O caminho atravessa um token.';
    end if;
    if nx<>cx and ny<>cy then
      diag_count=diag_count+1;
      step_cost=terrain_cost * case m.diagonal_rule when 'sqrt2' then sqrt(2::numeric) when 'five-ten-five' then case when diag_count%2=0 then 2 else 1 end else 1 end;
    else step_cost=terrain_cost; end if;
    total_grid_cost=total_grid_cost+step_cost;
    cx=nx; cy=ny;
  end loop;
  if cx<>p_to_x or cy<>p_to_y then raise exception 'O caminho não termina no destino informado.'; end if;
  movement_cost=total_grid_cost*m.scale_per_cell;
  if m.scale_unit<>t.movement_unit then
    movement_cost=case when m.scale_unit='m' and t.movement_unit='ft' then movement_cost*3.280839895 else movement_cost/3.280839895 end;
  end if;
  if s.status='active' and movement_cost>t.movement_remaining+0.0001 and not p_force then raise exception 'Movimento acima do deslocamento restante.' using errcode='42501'; end if;
  update public.battle_map_tokens set x=p_to_x,y=p_to_y,movement_remaining=case when s.status='active' then greatest(0,movement_remaining-movement_cost) else movement_remaining end,version=version+1 where id=t.id returning * into result;
  insert into public.battle_movements(campaign_id,session_id,token_id,character_id,from_x,from_y,to_x,to_y,movement_cost,movement_unit,path,turn_round)
  values(t.campaign_id,s.id,t.id,t.character_id,t.x,t.y,p_to_x,p_to_y,movement_cost,t.movement_unit,p_path,case when s.status='active' then s.round else null end);
  return result;
end $$;

revoke execute on function private.battle_map_campaign(uuid), private.battle_session_campaign(uuid), private.can_read_battle_token(uuid), private.can_control_battle_token(uuid), private.validate_battle_cell_bounds(), private.validate_battle_token_context(), private.validate_battle_map_resize() from public,anon;
grant execute on function private.battle_map_campaign(uuid), private.battle_session_campaign(uuid), private.can_read_battle_token(uuid), private.can_control_battle_token(uuid), private.validate_battle_cell_bounds(), private.validate_battle_token_context(), private.validate_battle_map_resize() to authenticated;

revoke execute on function public.create_battle_map(uuid,jsonb), public.add_character_to_battle_map(uuid,uuid,integer,integer), public.add_npc_to_battle_map(uuid,uuid,numeric,text,integer,integer), public.start_battle_combat(uuid,jsonb), public.advance_battle_turn(uuid), public.end_battle_combat(uuid), public.move_battle_token(uuid,integer,integer,jsonb,bigint,boolean) from public,anon;
grant execute on function public.create_battle_map(uuid,jsonb), public.add_character_to_battle_map(uuid,uuid,integer,integer), public.add_npc_to_battle_map(uuid,uuid,numeric,text,integer,integer), public.start_battle_combat(uuid,jsonb), public.advance_battle_turn(uuid), public.end_battle_combat(uuid), public.move_battle_token(uuid,integer,integer,jsonb,bigint,boolean) to authenticated;

-- Extend private media access to map backgrounds, preserving the existing bucket.
create or replace function private.can_access_media(p_name text,p_write boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare entity text=split_part(p_name,'/',1); raw_id text=split_part(p_name,'/',2); target uuid; cid uuid;
begin
  if auth.uid() is null or raw_id!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or split_part(p_name,'/',3)='' then return false; end if;
  target=raw_id::uuid;
  case entity
    when 'profiles' then return case when p_write then target=auth.uid() else private.can_read_profile(target) end;
    when 'campaigns' then return case when p_write then private.is_campaign_owner(target) else private.can_read_campaign(target) end;
    when 'characters' then return case when p_write then private.can_edit_character(target) else private.can_edit_character(target) or exists(select 1 from public.battle_map_tokens t where t.character_id=target and private.can_read_battle_token(t.id)) end;
    when 'npcs' then return case when p_write then private.can_edit_npc(target) else private.can_read_npc(target) or exists(select 1 from public.battle_map_tokens t where t.npc_id=target and private.can_read_battle_token(t.id)) end;
    when 'world_regions' then return case when p_write then private.is_campaign_owner(private.world_campaign('region',target)) else private.can_read_world('region',target) end;
    when 'world_cities' then return case when p_write then private.is_campaign_owner(private.world_campaign('city',target)) else private.can_read_world('city',target) end;
    when 'world_locations' then return case when p_write then private.is_campaign_owner(private.world_campaign('location',target)) else private.can_read_world('location',target) end;
    when 'battle_maps' then cid=private.battle_map_campaign(target); return case when p_write then private.is_campaign_owner(cid) else private.can_read_campaign(cid) end;
    else return false;
  end case;
end $$;

-- Realtime: token movement, turn changes and GM map/cell edits reach every connected client.
do $$ declare t text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['battle_sessions','battle_maps','battle_map_cells','battle_map_objects','battle_map_tokens','battle_turn_order','battle_movements'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;


-- D&D 5e (2014) reference. Client JSON files are the authoritative seed source.
-- Apply this generated migration once, after 202610010007_tactical_vtt.sql.
create table public.dnd_classes (
 id text primary key, rpg_system_id uuid not null references public.rpg_systems(id),
 name text not null, edition text not null check(edition='2014'), hit_die smallint not null,
 caster text not null check(caster in('none','full','half','artificer','pact')),
 spell_ability text, learning text not null, source text not null, data jsonb not null
);
create table public.dnd_races (
 id text primary key, rpg_system_id uuid not null references public.rpg_systems(id),
 name text not null unique, edition text not null check(edition='2014'),
 speed numeric not null check(speed>=0), source text not null, optional boolean not null default false,
 data jsonb not null
);
create table public.dnd_spells (
 id text primary key, rpg_system_id uuid not null references public.rpg_systems(id),
 name text not null, english_name text not null, level smallint not null check(level between 0 and 9),
 school text not null, ritual boolean not null, concentration boolean not null,
 edition text not null check(edition='2014'), source text not null, source_page smallint not null,
 data jsonb not null check(jsonb_typeof(data)='object')
);
create table public.dnd_spell_classes (
 spell_id text not null references public.dnd_spells(id) on delete cascade,
 class_id text not null references public.dnd_classes(id) on delete cascade,
 source text not null, primary key(spell_id,class_id)
);
create table public.dnd_spell_progression (
 class_id text not null references public.dnd_classes(id), subclass_id text not null default '',
 level smallint not null check(level between 1 and 20), slots jsonb not null check(jsonb_typeof(slots)='array'),
 pact_slots smallint not null default 0 check(pact_slots between 0 and 4),
 pact_level smallint not null default 0 check(pact_level between 0 and 5),
 arcanum_levels smallint[] not null default '{}', cantrips smallint not null default 0,
 spells_known smallint, prepared_formula text not null,
 primary key(class_id,subclass_id,level)
);
create index dnd_spells_level_school on public.dnd_spells(level,school,name);
create index dnd_spell_classes_class on public.dnd_spell_classes(class_id,spell_id);
create index dnd_races_source on public.dnd_races(source,name);
-- The catalog is readable by every signed-in player. Only migrations/service_role seed it.
alter table public.dnd_classes enable row level security;
alter table public.dnd_races enable row level security;
alter table public.dnd_spells enable row level security;
alter table public.dnd_spell_classes enable row level security;
alter table public.dnd_spell_progression enable row level security;
create policy dnd_classes_read on public.dnd_classes for select to authenticated using(true);
create policy dnd_races_read on public.dnd_races for select to authenticated using(true);
create policy dnd_spells_read on public.dnd_spells for select to authenticated using(true);
create policy dnd_spell_classes_read on public.dnd_spell_classes for select to authenticated using(true);
create policy dnd_spell_progression_read on public.dnd_spell_progression for select to authenticated using(true);
revoke all on public.dnd_classes,public.dnd_races,public.dnd_spells,public.dnd_spell_classes,public.dnd_spell_progression from public,anon,authenticated;
grant select on public.dnd_classes,public.dnd_races,public.dnd_spells,public.dnd_spell_classes,public.dnd_spell_progression to authenticated;

-- Separate relational references from per-character choices; custom spells keep NULL references.
alter table public.character_spells add column catalog_id text generated always as (nullif(data->>'catalog_id','')) stored references public.dnd_spells(id);
alter table public.character_spells add column class_id text generated always as (nullif(data->>'class_id','')) stored references public.dnd_classes(id);
alter table public.npc_spells add column catalog_id text generated always as (nullif(data->>'catalog_id','')) stored references public.dnd_spells(id);
create unique index character_catalog_spell_once on public.character_spells(character_id,catalog_id) where catalog_id is not null;
create unique index character_arcanum_once on public.character_spells(character_id,(data->>'level')) where data->>'casting_mode'='arcanum';

create function public.validate_dnd_spell_resources() returns trigger
language plpgsql security invoker set search_path='' as $$
declare s jsonb=new.system_data; progress public.dnd_spell_progression; system_slug text;
 chosen_class_id text; sub_id text; char_level integer; entry record; counter integer; maximum integer;
 used jsonb='{}'; pact_used integer=0; arcana jsonb='{}'; race_name text;
begin
 select slug into system_slug from public.rpg_systems where id=new.rpg_system_id;
 if system_slug is distinct from 'dnd5e' then return new; end if;
 chosen_class_id=s->>'class_id'; sub_id=coalesce(s->>'subclass_id','');
 if jsonb_typeof(s->'level') is distinct from 'number' or (s->>'level') !~ '^[0-9]+$' then raise exception 'O nível deve ser inteiro, entre 1 e 20.'; end if;
 char_level=(s->>'level')::integer;
 select * into progress from public.dnd_spell_progression p where p.class_id=chosen_class_id and p.subclass_id=sub_id and p.level=char_level;
 if progress.class_id is null then raise exception 'Classe, nível ou opção de conjuração inválida.'; end if;
 if nullif(s->>'race_id','') is not null then
  select name into race_name from public.dnd_races where id=s->>'race_id';
  if race_name is null or race_name is distinct from s->>'race' then raise exception 'Confira a raça do personagem.'; end if;
 end if;
 if jsonb_typeof(coalesce(s->'slots_used','{}')) is distinct from 'object' then raise exception 'Os espaços de magia são inválidos.'; end if;
 for entry in select key,value from jsonb_each(coalesce(s->'slots_used','{}')) loop
  if entry.key !~ '^[1-9]$' or jsonb_typeof(entry.value) is distinct from 'number' or entry.value::text !~ '^[0-9]+$' then raise exception 'Os usos de magia devem ser inteiros não negativos.'; end if;
  counter=(entry.value::text)::integer; maximum=coalesce((progress.slots->>(entry.key::integer-1))::integer,0);
  if counter>maximum then raise exception 'Os espaços usados excedem o limite da classe e nível.'; end if;
  if progress.pact_slots=0 and maximum>0 then used=used||jsonb_build_object(entry.key,counter); end if;
 end loop;
 if progress.pact_slots>0 then
  -- Legacy warlock sheets stored the one pact pool in slots_used[slot_level].
  pact_used=coalesce((s->>'pact_slots_used')::integer,(s->'slots_used'->>progress.pact_level::text)::integer,0);
 else pact_used=coalesce((s->>'pact_slots_used')::integer,0); end if;
 if s->>'pact_slots_used' is not null and (jsonb_typeof(s->'pact_slots_used') is distinct from 'number' or (s->>'pact_slots_used') !~ '^[0-9]+$') then raise exception 'Os usos de pacto devem ser inteiros não negativos.'; end if;
 if pact_used<0 or pact_used>progress.pact_slots then raise exception 'Os espaços de pacto usados excedem o limite da classe e nível.'; end if;
 if jsonb_typeof(coalesce(s->'arcanum_used','{}')) is distinct from 'object' then raise exception 'Os usos de Arcanos Místicos são inválidos.'; end if;
 for entry in select key,value from jsonb_each(coalesce(s->'arcanum_used','{}')) loop
  if entry.key !~ '^[6-9]$' or jsonb_typeof(entry.value) is distinct from 'number' or entry.value::text !~ '^[01]$' then raise exception 'Os usos de Arcanos Místicos devem ser zero ou um.'; end if;
  if not entry.key::smallint=any(progress.arcanum_levels) then raise exception 'Este Arcano Místico ainda não está disponível.'; end if;
  arcana=arcana||jsonb_build_object(entry.key,entry.value);
 end loop;
 new.system_data=s||jsonb_build_object('slots_used',used,'pact_slots_used',pact_used,'arcanum_used',arcana,'subclass_id',sub_id);
 return new;
end $$;
create trigger characters_validate_dnd_resources before insert or update of system_data,rpg_system_id on public.characters for each row execute function public.validate_dnd_spell_resources();

create function public.validate_dnd_spell_reference() returns trigger
language plpgsql security invoker set search_path='' as $$
declare reference public.dnd_spells; sheet jsonb; lvl integer; choices smallint[];
begin
 if nullif(new.data->>'catalog_id','') is not null then
  select * into reference from public.dnd_spells where id=new.data->>'catalog_id';
  if reference.id is null then raise exception 'Esta magia não existe no catálogo.'; end if;
  if (new.data->>'level')::integer is distinct from reference.level then raise exception 'O círculo da magia difere do catálogo.'; end if;
  -- Canonical descriptions remain canonical; preparation, notes and origin stay with the character.
  new.data=new.data||(reference.data-array['id','classes','edition','class_sources'])||jsonb_build_object('catalog_classes',(select coalesce(jsonb_agg(c.class_id order by c.class_id),'[]') from public.dnd_spell_classes c where c.spell_id=reference.id));
 end if;
 if tg_table_name='character_spells' and new.data->>'casting_mode'='arcanum' then
  select system_data into sheet from public.characters where id=new.character_id;
  lvl=(new.data->>'level')::integer;
  select arcanum_levels into choices from public.dnd_spell_progression where class_id=sheet->>'class_id' and subclass_id=coalesce(sheet->>'subclass_id','') and level=(sheet->>'level')::integer;
  if sheet->>'class_id' is distinct from 'warlock' or not coalesce(lvl::smallint=any(choices),false) then raise exception 'Este Arcano Místico ainda não está disponível.'; end if;
  if reference.id is not null and not exists(select 1 from public.dnd_spell_classes where spell_id=reference.id and class_id='warlock') then raise exception 'Escolha um Arcano Místico da lista do Bruxo.'; end if;
 end if;
 return new;
end $$;
create trigger character_spells_validate_reference before insert or update of data on public.character_spells for each row execute function public.validate_dnd_spell_reference();
create trigger npc_spells_validate_reference before insert or update of data on public.npc_spells for each row execute function public.validate_dnd_spell_reference();
revoke all on function public.validate_dnd_spell_resources(),public.validate_dnd_spell_reference() from public,anon,authenticated;

-- Backfill recognized legacy sheets. Invalid counters are clamped, with a private
-- JSON snapshot retained in the original character record for reconciliation.
create function private.dnd_migrate_counter(p_value jsonb,p_max integer) returns integer
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(p_value)='number'
 then least(p_max::numeric,greatest(0,floor((p_value#>>'{}')::numeric)))::integer else 0 end
$$;
update public.characters c set system_data=c.system_data||jsonb_build_object(
 'race_id',(select r.id from public.dnd_races r where r.name=c.system_data->>'race'),
 'subclass_id',p.subclass_id,
 'slots_used',case when p.pact_slots>0 then '{}'::jsonb else coalesce((
  select jsonb_object_agg(a.idx::text,private.dnd_migrate_counter(c.system_data->'slots_used'->a.idx::text,(a.value::text)::integer))
  from jsonb_array_elements(p.slots) with ordinality a(value,idx) where (a.value::text)::integer>0
 ),'{}'::jsonb) end,
 'pact_slots_used',private.dnd_migrate_counter(coalesce(nullif(c.system_data->'pact_slots_used','null'),c.system_data->'slots_used'->p.pact_level::text),p.pact_slots),
 'arcanum_used',coalesce((select jsonb_object_agg(e.key,private.dnd_migrate_counter(e.value,1))
  from jsonb_each(case when jsonb_typeof(c.system_data->'arcanum_used')='object' then c.system_data->'arcanum_used' else '{}'::jsonb end) e
  where case when e.key~'^[6-9]$' then e.key::smallint=any(p.arcanum_levels) else false end),'{}'::jsonb),
 'resource_migration_backup',jsonb_build_object('slots_used',c.system_data->'slots_used','pact_slots_used',c.system_data->'pact_slots_used','arcanum_used',c.system_data->'arcanum_used')
)
from public.dnd_spell_progression p
where c.rpg_system_id=(select id from public.rpg_systems where slug='dnd5e')
 and p.class_id=c.system_data->>'class_id' and p.subclass_id=coalesce(c.system_data->>'subclass_id','')
 and p.level=case when c.system_data->>'level'~'^[0-9]{1,2}$' then (c.system_data->>'level')::integer else null end;
drop function private.dnd_migrate_counter(jsonb,integer);

-- security_invoker is essential: the characters' original RLS applies to this view.
create view public.dnd_character_casting with (security_invoker=true) as
select c.id as character_id,c.owner_id,c.campaign_id,p.class_id,p.subclass_id,p.level,
 case when p.pact_slots>0 then '[]'::jsonb else p.slots end as spell_slots,
 c.system_data->'slots_used' as slots_used,p.pact_slots,p.pact_level,
 coalesce((c.system_data->>'pact_slots_used')::integer,0) as pact_slots_used,
 p.arcanum_levels,c.system_data->'arcanum_used' as arcanum_used,p.cantrips,p.spells_known,p.prepared_formula
from public.characters c join public.dnd_spell_progression p on p.class_id=c.system_data->>'class_id'
 and p.subclass_id=coalesce(c.system_data->>'subclass_id','') and p.level=(c.system_data->>'level')::integer
join public.rpg_systems r on r.id=c.rpg_system_id and r.slug='dnd5e';
revoke all on public.dnd_character_casting from public,anon;
grant select on public.dnd_character_casting to authenticated;

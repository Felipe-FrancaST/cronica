-- Restore the v19 rules/workshop migration missing from the previous export.
-- Additive and repeatable; character saves retain their existing transactional RLS.
begin;
alter table public.campaign_rules add column if not exists allow_multiclass boolean not null default true;
alter table public.campaign_rules add column if not exists hit_point_method text not null default 'average' check(hit_point_method in('average','maximum','rolled'));
alter table public.campaign_rules add column if not exists attribute_method text not null default 'choice' check(attribute_method in('choice','standard','point-buy','rolled','manual'));
alter table public.campaign_rules add column if not exists players_can_rest boolean not null default true;
alter table public.campaign_rules add column if not exists players_can_create_custom_items boolean not null default true;

-- Drafts need a ledger before a character exists. Campaign and owner are still
-- required, and the character UUID cannot be reused by a different owner.
create table if not exists public.character_hit_point_rolls (
  character_id uuid not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  class_id text not null references public.dnd_classes(id),
  class_level integer not null check(class_level between 1 and 20),
  result integer not null check(result between 1 and 12),
  primary key(character_id,class_id,class_level)
);
create index if not exists character_hit_point_rolls_campaign on public.character_hit_point_rolls(campaign_id);
alter table public.character_hit_point_rolls enable row level security;
revoke all on public.character_hit_point_rolls from public,anon,authenticated;
grant select on public.character_hit_point_rolls to authenticated;
drop policy if exists hp_rolls_read on public.character_hit_point_rolls;
create policy hp_rolls_read on public.character_hit_point_rolls for select to authenticated using(
  private.is_campaign_owner(campaign_id) or (owner_id=auth.uid() and private.can_read_campaign(campaign_id))
);

create or replace function private.ensure_character_hp_rolls(p_campaign uuid,p_character uuid,p_owner uuid,p_levels jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; ordinal bigint; hd integer; n integer; total integer=0; result jsonb; seen text[]='{}';
begin
  if p_character is null or p_owner is null or jsonb_typeof(p_levels) is distinct from 'array' or jsonb_array_length(p_levels) not between 1 and 12 then
    raise exception 'Distribuição de classes inválida.';
  end if;
  -- One lock covers all levels and concurrent retries for this UUID.
  perform pg_advisory_xact_lock(hashtextextended(p_character::text,19));
  if exists(select 1 from public.character_hit_point_rolls where character_id=p_character and (campaign_id<>p_campaign or owner_id<>p_owner)) then
    raise exception 'Você não tem acesso a estes resultados.' using errcode='42501';
  end if;
  for c,ordinal in select value,ordinality from jsonb_array_elements(p_levels) with ordinality loop
    select hit_die into hd from public.dnd_classes where id=c->>'class_id';
    if hd is null or c->>'class_id'=any(seen) or jsonb_typeof(c->'level') is distinct from 'number' or coalesce(c->>'level','')!~'^[0-9]+$' then
      raise exception 'Distribuição de classes inválida.';
    end if;
    n=(c->>'level')::integer; total=total+n; seen=array_append(seen,c->>'class_id');
    if n not between 1 and 20 or total>20 then raise exception 'O nível deve estar entre 1 e 20.'; end if;
    insert into public.character_hit_point_rolls(character_id,campaign_id,owner_id,class_id,class_level,result)
      select p_character,p_campaign,p_owner,c->>'class_id',level,
        case when ordinal=1 and level=1 then hd else floor(random()*hd)::integer+1 end
      from generate_series(1,n) level on conflict do nothing;
  end loop;
  select coalesce(jsonb_object_agg(class_id,roll_values),'{}') into result from (
    select class_id,jsonb_agg(ledger.result order by class_level) roll_values
    from public.character_hit_point_rolls ledger where character_id=p_character group by class_id
  ) rolls;
  return result;
end $$;
revoke all on function private.ensure_character_hp_rolls(uuid,uuid,uuid,jsonb) from public,anon,authenticated;

-- Keep the installed argument names/default expressions and function identity.
-- Removing an existing DEFAULT with CREATE OR REPLACE would raise 42P13.
do $preserve_roll_character_hit_points$
declare function_arguments text;
begin
  select pg_catalog.pg_get_function_arguments(pg_catalog.to_regprocedure('public.roll_character_hit_points(uuid,uuid,jsonb,uuid)')) into function_arguments;
  function_arguments=coalesce(function_arguments,'p_campaign_id uuid,p_character_id uuid,p_levels jsonb,p_owner_id uuid');
  execute 'create or replace function public.roll_character_hit_points('||function_arguments||') '
    ||$function_definition$returns jsonb language plpgsql security definer set search_path='' as $function_body$
declare
  p_campaign_id alias for $1;
  p_character_id alias for $2;
  p_levels alias for $3;
  p_owner_id alias for $4;
 c public.characters;
begin
  p_owner_id=coalesce(p_owner_id,auth.uid());
  if auth.uid() is null or not private.can_read_campaign(p_campaign_id) then raise exception 'Você não tem acesso à campanha.' using errcode='42501'; end if;
  if not private.is_campaign_owner(p_campaign_id) and p_owner_id is distinct from auth.uid() then
    raise exception 'Role somente para sua própria conta.' using errcode='42501';
  end if;
  if not private.character_owner_allowed(p_campaign_id,p_owner_id) then raise exception 'Você não tem acesso a este proprietário.' using errcode='42501'; end if;
  select * into c from public.characters where id=p_character_id for update;
  if c.id is not null and (c.campaign_id<>p_campaign_id or c.owner_id<>p_owner_id) then raise exception 'Você não tem acesso a esta ficha.' using errcode='42501'; end if;
  if not private.is_campaign_owner(p_campaign_id) and exists(select 1 from public.campaign_rules where campaign_id=p_campaign_id and (not players_can_edit_sheets or (c.id is null and not players_can_create_characters))) then
    raise exception 'O mestre desabilitou alterações da ficha.' using errcode='42501';
  end if;
  return private.ensure_character_hp_rolls(p_campaign_id,p_character_id,p_owner_id,p_levels);
end $function_body$;$function_definition$;
end $preserve_roll_character_hit_points$;
revoke all on function public.roll_character_hit_points(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.roll_character_hit_points(uuid,uuid,jsonb,uuid) to authenticated;

create or replace function private.battle_hp_max(p_sheet jsonb) returns integer
language plpgsql stable security definer set search_path='' as $$
declare conmod integer=floor((coalesce((p_sheet->'abilities'->>'con')::integer,10)-10)::numeric/2);
  c jsonb; hd integer; hp integer=0; first boolean=true; racial integer; n integer; hp_value integer;
begin
  if p_sheet->>'hp_max_override' is not null then return greatest(1,(p_sheet->>'hp_max_override')::integer); end if;
  for c in select value from jsonb_array_elements(private.dnd_levels(p_sheet)) loop
    select hit_die into hd from public.dnd_classes where id=c->>'class_id'; hd=coalesce(hd,10);
    for n in 1..(c->>'level')::integer loop
      hp_value=case when (first and n=1) or p_sheet->>'hit_point_method'='maximum' then hd
        when p_sheet->>'hit_point_method'='rolled' then coalesce((p_sheet->'hit_point_rolls'->(c->>'class_id')->>(n-1))::integer,hd/2+1)
        else hd/2+1 end;
      hp=hp+greatest(1,hp_value+conmod);
    end loop;
    if c->>'class_id'='sorcerer' and c->>'subclass_id'='draconic' then hp=hp+(c->>'level')::integer; end if;
    first=false;
  end loop;
  select coalesce((data->>'hp_per_level')::integer,0) into racial from public.dnd_races where name=p_sheet->>'race';
  return greatest(1,hp+coalesce(racial,0)*coalesce((p_sheet->>'level')::integer,1));
end $$;

-- Exact permitted starter names/counts are populated from the shipped catalog.
create table if not exists private.dnd_starter_item_limits (
  class_id text not null,background_id text not null,name text not null,quantity integer not null,
  primary key(class_id,background_id,name)
);
create table if not exists private.character_starter_item_grants (
  character_id uuid not null,name text not null,quantity integer not null,
  primary key(character_id,name)
);
revoke all on private.dnd_starter_item_limits,private.character_starter_item_grants from public,anon,authenticated;

create or replace function private.campaign_character_rules_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.campaign_rules; previous public.characters; s jsonb=new.system_data; entry jsonb; n integer; registered integer; used record;
begin
  if (select slug from public.rpg_systems where id=new.rpg_system_id) is distinct from 'dnd5e' then return new; end if;
  select * into r from public.campaign_rules where campaign_id=new.campaign_id;
  if r.campaign_id is null then return new; end if;
  select * into previous from public.characters where id=new.id;
  if not private.is_campaign_owner(new.campaign_id) then
    if not r.allow_multiclass and jsonb_array_length(private.dnd_levels(s))>1 and
      exists(select 1 from jsonb_array_elements(private.dnd_levels(s)) c where not exists(
        select 1 from jsonb_array_elements(case when previous.id is null then '[]'::jsonb else private.dnd_levels(previous.system_data) end) old_class where old_class->>'class_id'=c->>'class_id'
      )) then raise exception 'O mestre desabilitou novas combinações de multiclasse.'; end if;
    if r.attribute_method<>'choice' and s->'creation'->>'method' is distinct from r.attribute_method and
      (previous.id is null or s->'creation'->>'method' is distinct from previous.system_data->'creation'->>'method') then
      raise exception 'Use o método de atributos definido pelo mestre.';
    end if;
    if r.hit_point_method<>'average' and s->'hp_max_override' is distinct from previous.system_data->'hp_max_override' and s->>'hp_max_override' is not null then
      raise exception 'Somente o mestre pode ajustar o máximo de PV.';
    end if;
    if previous.id is not null and not r.players_can_rest then
      if coalesce((s->>'hit_dice_used')::integer,0)<coalesce((previous.system_data->>'hit_dice_used')::integer,0) or
         coalesce((s->>'pact_slots_used')::integer,0)<coalesce((previous.system_data->>'pact_slots_used')::integer,0) then raise exception 'O descanso é controlado pelo mestre.'; end if;
      foreach entry in array array['"slots_used"'::jsonb,'"feature_uses"'::jsonb,'"arcanum_used"'::jsonb,'"hit_dice_by_class"'::jsonb] loop
        for used in select * from jsonb_each(coalesce(previous.system_data->(entry#>>'{}'),'{}')) loop
          if coalesce((s->(entry#>>'{}')->>used.key)::integer,0)<used.value::integer then raise exception 'O descanso é controlado pelo mestre.'; end if;
        end loop;
      end loop;
    end if;
  end if;
  if coalesce((previous.system_data->'creation'->>'equipment_applied')::boolean,false) and not coalesce((s->'creation'->>'equipment_applied')::boolean,false) then
    raise exception 'O equipamento inicial já foi aplicado e não pode ser reiniciado.';
  end if;
  if coalesce((s->'creation'->>'equipment_applied')::boolean,false) and not coalesce((previous.system_data->'creation'->>'equipment_applied')::boolean,false) then
    insert into private.character_starter_item_grants(character_id,name,quantity)
      select new.id,name,quantity from private.dnd_starter_item_limits
      where class_id=s->>'class_id' and background_id=s->'creation'->>'background_id' on conflict do nothing;
  end if;
  s=s||jsonb_build_object('hit_point_method',r.hit_point_method);
  if r.hit_point_method='rolled' then
    for entry in select value from jsonb_array_elements(private.dnd_levels(s)) loop
      for n in 1..(entry->>'level')::integer loop
        select result into registered from public.character_hit_point_rolls where character_id=new.id and campaign_id=new.campaign_id and owner_id=new.owner_id and class_id=entry->>'class_id' and class_level=n;
        if registered is null or s->'hit_point_rolls'->(entry->>'class_id')->>(n-1) is null then raise exception 'Role os dados de vida pendentes antes de salvar.'; end if;
        if jsonb_typeof(s->'hit_point_rolls'->(entry->>'class_id')->(n-1)) is distinct from 'number' or
          (s->'hit_point_rolls'->(entry->>'class_id')->>(n-1))::numeric<>registered then raise exception 'Use os resultados registrados dos dados de vida.'; end if;
      end loop;
    end loop;
  end if;
  new.system_data=s; return new;
end $$;
revoke all on function private.campaign_character_rules_guard() from public,anon,authenticated;
drop trigger if exists b_campaign_character_rules on public.characters;
create trigger b_campaign_character_rules before insert or update of system_data on public.characters for each row execute function private.campaign_character_rules_guard();

create or replace function private.campaign_custom_item_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.characters; allowed integer; amount integer;
begin
  select * into c from public.characters where id=new.character_id;
  if private.is_campaign_owner(c.campaign_id) or not exists(select 1 from public.campaign_rules where campaign_id=c.campaign_id and not players_can_create_custom_items) then return new; end if;
  if exists(select 1 from public.dnd_items where id=new.data->>'catalog_id' or name=new.data->>'name') then return new; end if;
  if tg_op='UPDATE' and new.data->>'name'=old.data->>'name' then return new; end if;
  -- BEFORE INSERT also runs before the UPDATE branch of an inventory upsert.
  if exists(select 1 from public.character_inventory where id=new.id and character_id=c.id and data->>'name'=new.data->>'name') then return new; end if;
  select quantity into allowed from private.character_starter_item_grants where character_id=c.id and name=new.data->>'name';
  select coalesce(sum((data->>'quantity')::integer),0) into amount from public.character_inventory where character_id=c.id and id<>new.id and data->>'name'=new.data->>'name';
  if allowed is not null and amount+coalesce((new.data->>'quantity')::integer,0)<=allowed then return new; end if;
  raise exception 'O mestre desabilitou novos itens personalizados.' using errcode='42501';
end $$;
revoke all on function private.campaign_custom_item_guard() from public,anon,authenticated;
drop trigger if exists z_campaign_custom_item_guard on public.character_inventory;
create trigger z_campaign_custom_item_guard before insert or update on public.character_inventory for each row execute function private.campaign_custom_item_guard();

-- Keep the installed argument names/default expressions and function identity.
-- Removing an existing DEFAULT with CREATE OR REPLACE would raise 42P13.
do $preserve_save_campaign_rules_v19$
declare function_arguments text;
begin
  select pg_catalog.pg_get_function_arguments(pg_catalog.to_regprocedure('public.save_campaign_rules_v19(uuid,jsonb,timestamptz)')) into function_arguments;
  function_arguments=coalesce(function_arguments,'p_campaign_id uuid,p_rules jsonb,p_expected_updated_at timestamptz default null');
  execute 'create or replace function public.save_campaign_rules_v19('||function_arguments||') '
    ||$function_definition$returns public.campaign_rules language plpgsql security definer set search_path='' as $function_body$
declare
  p_campaign_id alias for $1;
  p_rules alias for $2;
  p_expected_updated_at alias for $3;
 r public.campaign_rules; c public.characters; sheet jsonb; attrs jsonb; maximum integer;
begin
  -- The legacy RPC validates ownership/version and saves the original options.
  -- Defer its level changes until the new HP method and ledger are ready.
  r=public.save_campaign_rules(p_campaign_id,p_rules||jsonb_build_object('lock_player_level',false),p_expected_updated_at);
  update public.campaign_rules set lock_player_level=coalesce((p_rules->>'lock_player_level')::boolean,false),allow_multiclass=coalesce((p_rules->>'allow_multiclass')::boolean,true),
    hit_point_method=coalesce(p_rules->>'hit_point_method','average'),attribute_method=coalesce(p_rules->>'attribute_method','choice'),
    players_can_rest=coalesce((p_rules->>'players_can_rest')::boolean,true),players_can_create_custom_items=coalesce((p_rules->>'players_can_create_custom_items')::boolean,true),
    updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
    where campaign_id=p_campaign_id returning * into r;
  for c in select ch.* from public.characters ch join public.rpg_systems sys on sys.id=ch.rpg_system_id where ch.campaign_id=p_campaign_id and sys.slug='dnd5e' for update of ch loop
    sheet=c.system_data;
    select coalesce(jsonb_object_agg(ability,score),'{}') into attrs from public.character_attributes where character_id=c.id;
    if r.lock_player_level and sheet->>'level' is distinct from r.party_level::text then
      sheet=private.session_level_resources(sheet,r.party_level);
      attrs=private.dnd_adjust_abilities(c.system_data,sheet,attrs);
      update public.character_attributes a set score=(attrs->>a.ability)::integer where a.character_id=c.id;
      sheet=jsonb_set(sheet,'{hit_dice_used}',to_jsonb(least(coalesce((sheet->>'hit_dice_used')::integer,0),r.party_level)));
    end if;
    sheet=sheet||jsonb_build_object('hit_point_method',r.hit_point_method);
    if r.hit_point_method='rolled' then sheet=sheet||jsonb_build_object('hit_point_rolls',private.ensure_character_hp_rolls(p_campaign_id,c.id,c.owner_id,private.dnd_levels(sheet))); end if;
    maximum=private.battle_hp_max(sheet||jsonb_build_object('abilities',attrs));
    sheet=jsonb_set(sheet,'{hp_current}',to_jsonb(least(coalesce((sheet->>'hp_current')::integer,0),maximum)));
    update public.characters set system_data=sheet where id=c.id;
  end loop;
  return r;
end $function_body$;$function_definition$;
end $preserve_save_campaign_rules_v19$;
revoke all on function public.save_campaign_rules_v19(uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.save_campaign_rules_v19(uuid,jsonb,timestamptz) to authenticated;

-- Catalog, metadata checks and the inventory-preserving save RPC follow below.

create or replace function private.battle_is_scenery_kind(p_kind text) returns boolean language sql immutable set search_path='' as $$ select p_kind=any(array['tree','pine','rock','mountain','ruin','water','fire','tent','road','cart','ice','pit','portal','lava','barrel','campfire','boat','bush','flowers','statue','chest','counter','crops','house','gravestone','cross','fence','grass','well','bridge','table','chair','bookshelf','torch','market','signpost','tavern','forge','stable','wall','floor','stairs','bed','rug','doorway','fountain']); $$;
create or replace function private.battle_valid_scenery_variant(p_kind text,p_variant text) returns boolean language sql immutable set search_path='' as $$ select p_variant='default' or case p_kind when 'statue' then p_variant='obelisk' when 'portal' then p_variant in('door','cave')
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
insert into private.dnd_starter_item_limits(class_id,background_id,name,quantity) values
('artificer','acolyte','Símbolo sagrado',1),
('artificer','acolyte','Livro de orações',1),
('artificer','acolyte','Incenso (5 varetas)',1),
('artificer','acolyte','Vestes religiosas',1),
('artificer','acolyte','Roupas comuns',1),
('artificer','acolyte','Bolsa',1),
('artificer','criminal','Pé de cabra',1),
('artificer','criminal','Roupas escuras com capuz',1),
('artificer','criminal','Bolsa',1),
('artificer','folk-hero','Ferramentas de artesão escolhidas',1),
('artificer','folk-hero','Pá',1),
('artificer','folk-hero','Panela de ferro',1),
('artificer','folk-hero','Roupas comuns',1),
('artificer','folk-hero','Bolsa',1),
('artificer','noble','Roupas finas',1),
('artificer','noble','Anel de sinete',1),
('artificer','noble','Documento de linhagem',1),
('artificer','noble','Bolsa',1),
('artificer','sage','Tinta preta',1),
('artificer','sage','Pena',1),
('artificer','sage','Faca pequena',1),
('artificer','sage','Carta de um colega',1),
('artificer','sage','Roupas comuns',1),
('artificer','sage','Bolsa',1),
('artificer','soldier','Insígnia de patente',1),
('artificer','soldier','Troféu de guerra',1),
('artificer','soldier','Conjunto de jogo escolhido',1),
('artificer','soldier','Roupas comuns',1),
('artificer','soldier','Bolsa',1),
('barbarian','acolyte','Machado grande',1),
('barbarian','acolyte','Machadinha',1),
('barbarian','acolyte','Azagaia',1),
('barbarian','acolyte','Pacote de explorador',1),
('barbarian','acolyte','Símbolo sagrado',1),
('barbarian','acolyte','Livro de orações',1),
('barbarian','acolyte','Incenso (5 varetas)',1),
('barbarian','acolyte','Vestes religiosas',1),
('barbarian','acolyte','Roupas comuns',1),
('barbarian','acolyte','Bolsa',1),
('barbarian','criminal','Machado grande',1),
('barbarian','criminal','Machadinha',1),
('barbarian','criminal','Azagaia',1),
('barbarian','criminal','Pacote de explorador',1),
('barbarian','criminal','Pé de cabra',1),
('barbarian','criminal','Roupas escuras com capuz',1),
('barbarian','criminal','Bolsa',1),
('barbarian','folk-hero','Machado grande',1),
('barbarian','folk-hero','Machadinha',1),
('barbarian','folk-hero','Azagaia',1),
('barbarian','folk-hero','Pacote de explorador',1),
('barbarian','folk-hero','Ferramentas de artesão escolhidas',1),
('barbarian','folk-hero','Pá',1),
('barbarian','folk-hero','Panela de ferro',1),
('barbarian','folk-hero','Roupas comuns',1),
('barbarian','folk-hero','Bolsa',1),
('barbarian','noble','Machado grande',1),
('barbarian','noble','Machadinha',1),
('barbarian','noble','Azagaia',1),
('barbarian','noble','Pacote de explorador',1),
('barbarian','noble','Roupas finas',1),
('barbarian','noble','Anel de sinete',1),
('barbarian','noble','Documento de linhagem',1),
('barbarian','noble','Bolsa',1),
('barbarian','sage','Machado grande',1),
('barbarian','sage','Machadinha',1),
('barbarian','sage','Azagaia',1),
('barbarian','sage','Pacote de explorador',1),
('barbarian','sage','Tinta preta',1),
('barbarian','sage','Pena',1),
('barbarian','sage','Faca pequena',1),
('barbarian','sage','Carta de um colega',1),
('barbarian','sage','Roupas comuns',1),
('barbarian','sage','Bolsa',1),
('barbarian','soldier','Machado grande',1),
('barbarian','soldier','Machadinha',1),
('barbarian','soldier','Azagaia',1),
('barbarian','soldier','Pacote de explorador',1),
('barbarian','soldier','Insígnia de patente',1),
('barbarian','soldier','Troféu de guerra',1),
('barbarian','soldier','Conjunto de jogo escolhido',1),
('barbarian','soldier','Roupas comuns',1),
('barbarian','soldier','Bolsa',1),
('barbarian','custom','Machado grande',1),
('barbarian','custom','Machadinha',1),
('barbarian','custom','Azagaia',1),
('barbarian','custom','Pacote de explorador',1),
('bard','acolyte','Rapieira',1),
('bard','acolyte','Armadura de couro',1),
('bard','acolyte','Adaga',1),
('bard','acolyte','Alaúde',1),
('bard','acolyte','Pacote de artista',1),
('bard','acolyte','Símbolo sagrado',1),
('bard','acolyte','Livro de orações',1),
('bard','acolyte','Incenso (5 varetas)',1),
('bard','acolyte','Vestes religiosas',1),
('bard','acolyte','Roupas comuns',1),
('bard','acolyte','Bolsa',1),
('bard','criminal','Rapieira',1),
('bard','criminal','Armadura de couro',1),
('bard','criminal','Adaga',1),
('bard','criminal','Alaúde',1),
('bard','criminal','Pacote de artista',1),
('bard','criminal','Pé de cabra',1),
('bard','criminal','Roupas escuras com capuz',1),
('bard','criminal','Bolsa',1),
('bard','folk-hero','Rapieira',1),
('bard','folk-hero','Armadura de couro',1),
('bard','folk-hero','Adaga',1),
('bard','folk-hero','Alaúde',1),
('bard','folk-hero','Pacote de artista',1),
('bard','folk-hero','Ferramentas de artesão escolhidas',1),
('bard','folk-hero','Pá',1),
('bard','folk-hero','Panela de ferro',1),
('bard','folk-hero','Roupas comuns',1),
('bard','folk-hero','Bolsa',1),
('bard','noble','Rapieira',1),
('bard','noble','Armadura de couro',1),
('bard','noble','Adaga',1),
('bard','noble','Alaúde',1),
('bard','noble','Pacote de artista',1),
('bard','noble','Roupas finas',1),
('bard','noble','Anel de sinete',1),
('bard','noble','Documento de linhagem',1),
('bard','noble','Bolsa',1),
('bard','sage','Rapieira',1),
('bard','sage','Armadura de couro',1),
('bard','sage','Adaga',1),
('bard','sage','Alaúde',1),
('bard','sage','Pacote de artista',1),
('bard','sage','Tinta preta',1),
('bard','sage','Pena',1),
('bard','sage','Faca pequena',1),
('bard','sage','Carta de um colega',1),
('bard','sage','Roupas comuns',1),
('bard','sage','Bolsa',1),
('bard','soldier','Rapieira',1),
('bard','soldier','Armadura de couro',1),
('bard','soldier','Adaga',1),
('bard','soldier','Alaúde',1),
('bard','soldier','Pacote de artista',1),
('bard','soldier','Insígnia de patente',1),
('bard','soldier','Troféu de guerra',1),
('bard','soldier','Conjunto de jogo escolhido',1),
('bard','soldier','Roupas comuns',1),
('bard','soldier','Bolsa',1),
('bard','custom','Rapieira',1),
('bard','custom','Armadura de couro',1),
('bard','custom','Adaga',1),
('bard','custom','Alaúde',1),
('bard','custom','Pacote de artista',1),
('warlock','acolyte','Besta leve',1),
('warlock','acolyte','Virotes',1),
('warlock','acolyte','Foco arcano',1),
('warlock','acolyte','Armadura de couro',1),
('warlock','acolyte','Adaga',1),
('warlock','acolyte','Clava',1),
('warlock','acolyte','Pacote de estudioso',1),
('warlock','acolyte','Símbolo sagrado',1),
('warlock','acolyte','Livro de orações',1),
('warlock','acolyte','Incenso (5 varetas)',1),
('warlock','acolyte','Vestes religiosas',1),
('warlock','acolyte','Roupas comuns',1),
('warlock','acolyte','Bolsa',1),
('warlock','criminal','Besta leve',1),
('warlock','criminal','Virotes',1),
('warlock','criminal','Foco arcano',1),
('warlock','criminal','Armadura de couro',1),
('warlock','criminal','Adaga',1),
('warlock','criminal','Clava',1),
('warlock','criminal','Pacote de estudioso',1),
('warlock','criminal','Pé de cabra',1),
('warlock','criminal','Roupas escuras com capuz',1),
('warlock','criminal','Bolsa',1),
('warlock','folk-hero','Besta leve',1),
('warlock','folk-hero','Virotes',1),
('warlock','folk-hero','Foco arcano',1),
('warlock','folk-hero','Armadura de couro',1),
('warlock','folk-hero','Adaga',1),
('warlock','folk-hero','Clava',1),
('warlock','folk-hero','Pacote de estudioso',1),
('warlock','folk-hero','Ferramentas de artesão escolhidas',1),
('warlock','folk-hero','Pá',1),
('warlock','folk-hero','Panela de ferro',1),
('warlock','folk-hero','Roupas comuns',1),
('warlock','folk-hero','Bolsa',1),
('warlock','noble','Besta leve',1),
('warlock','noble','Virotes',1),
('warlock','noble','Foco arcano',1),
('warlock','noble','Armadura de couro',1),
('warlock','noble','Adaga',1),
('warlock','noble','Clava',1),
('warlock','noble','Pacote de estudioso',1),
('warlock','noble','Roupas finas',1),
('warlock','noble','Anel de sinete',1),
('warlock','noble','Documento de linhagem',1),
('warlock','noble','Bolsa',1),
('warlock','sage','Besta leve',1),
('warlock','sage','Virotes',1),
('warlock','sage','Foco arcano',1),
('warlock','sage','Armadura de couro',1),
('warlock','sage','Adaga',1),
('warlock','sage','Clava',1),
('warlock','sage','Pacote de estudioso',1),
('warlock','sage','Tinta preta',1),
('warlock','sage','Pena',1),
('warlock','sage','Faca pequena',1),
('warlock','sage','Carta de um colega',1),
('warlock','sage','Roupas comuns',1),
('warlock','sage','Bolsa',1),
('warlock','soldier','Besta leve',1),
('warlock','soldier','Virotes',1),
('warlock','soldier','Foco arcano',1),
('warlock','soldier','Armadura de couro',1),
('warlock','soldier','Adaga',1),
('warlock','soldier','Clava',1),
('warlock','soldier','Pacote de estudioso',1),
('warlock','soldier','Insígnia de patente',1),
('warlock','soldier','Troféu de guerra',1),
('warlock','soldier','Conjunto de jogo escolhido',1),
('warlock','soldier','Roupas comuns',1),
('warlock','soldier','Bolsa',1),
('warlock','custom','Besta leve',1),
('warlock','custom','Virotes',1),
('warlock','custom','Foco arcano',1),
('warlock','custom','Armadura de couro',1),
('warlock','custom','Adaga',1),
('warlock','custom','Clava',1),
('warlock','custom','Pacote de estudioso',1),
('cleric','acolyte','Maça',1),
('cleric','acolyte','Cota de escamas',1),
('cleric','acolyte','Besta leve',1),
('cleric','acolyte','Virotes',1),
('cleric','acolyte','Escudo',1),
('cleric','acolyte','Símbolo sagrado',2),
('cleric','acolyte','Pacote de sacerdote',1),
('cleric','acolyte','Livro de orações',1),
('cleric','acolyte','Incenso (5 varetas)',1),
('cleric','acolyte','Vestes religiosas',1),
('cleric','acolyte','Roupas comuns',1),
('cleric','acolyte','Bolsa',1),
('cleric','acolyte','Armadura de couro',1),
('cleric','acolyte','Clava',1),
('cleric','criminal','Maça',1),
('cleric','criminal','Cota de escamas',1),
('cleric','criminal','Besta leve',1),
('cleric','criminal','Virotes',1),
('cleric','criminal','Escudo',1),
('cleric','criminal','Símbolo sagrado',1),
('cleric','criminal','Pacote de sacerdote',1),
('cleric','criminal','Pé de cabra',1),
('cleric','criminal','Roupas escuras com capuz',1),
('cleric','criminal','Bolsa',1),
('cleric','criminal','Armadura de couro',1),
('cleric','criminal','Clava',1),
('cleric','folk-hero','Maça',1),
('cleric','folk-hero','Cota de escamas',1),
('cleric','folk-hero','Besta leve',1),
('cleric','folk-hero','Virotes',1),
('cleric','folk-hero','Escudo',1),
('cleric','folk-hero','Símbolo sagrado',1),
('cleric','folk-hero','Pacote de sacerdote',1),
('cleric','folk-hero','Ferramentas de artesão escolhidas',1),
('cleric','folk-hero','Pá',1),
('cleric','folk-hero','Panela de ferro',1),
('cleric','folk-hero','Roupas comuns',1),
('cleric','folk-hero','Bolsa',1),
('cleric','folk-hero','Armadura de couro',1),
('cleric','folk-hero','Clava',1),
('cleric','noble','Maça',1),
('cleric','noble','Cota de escamas',1),
('cleric','noble','Besta leve',1),
('cleric','noble','Virotes',1),
('cleric','noble','Escudo',1),
('cleric','noble','Símbolo sagrado',1),
('cleric','noble','Pacote de sacerdote',1),
('cleric','noble','Roupas finas',1),
('cleric','noble','Anel de sinete',1),
('cleric','noble','Documento de linhagem',1),
('cleric','noble','Bolsa',1),
('cleric','noble','Armadura de couro',1),
('cleric','noble','Clava',1),
('cleric','sage','Maça',1),
('cleric','sage','Cota de escamas',1),
('cleric','sage','Besta leve',1),
('cleric','sage','Virotes',1),
('cleric','sage','Escudo',1),
('cleric','sage','Símbolo sagrado',1),
('cleric','sage','Pacote de sacerdote',1),
('cleric','sage','Tinta preta',1),
('cleric','sage','Pena',1),
('cleric','sage','Faca pequena',1),
('cleric','sage','Carta de um colega',1),
('cleric','sage','Roupas comuns',1),
('cleric','sage','Bolsa',1),
('cleric','sage','Armadura de couro',1),
('cleric','sage','Clava',1),
('cleric','soldier','Maça',1),
('cleric','soldier','Cota de escamas',1),
('cleric','soldier','Besta leve',1),
('cleric','soldier','Virotes',1),
('cleric','soldier','Escudo',1),
('cleric','soldier','Símbolo sagrado',1),
('cleric','soldier','Pacote de sacerdote',1),
('cleric','soldier','Insígnia de patente',1),
('cleric','soldier','Troféu de guerra',1),
('cleric','soldier','Conjunto de jogo escolhido',1),
('cleric','soldier','Roupas comuns',1),
('cleric','soldier','Bolsa',1),
('cleric','soldier','Armadura de couro',1),
('cleric','soldier','Clava',1),
('cleric','custom','Maça',1),
('cleric','custom','Cota de escamas',1),
('cleric','custom','Besta leve',1),
('cleric','custom','Virotes',1),
('cleric','custom','Escudo',1),
('cleric','custom','Símbolo sagrado',1),
('cleric','custom','Pacote de sacerdote',1),
('cleric','custom','Armadura de couro',1),
('cleric','custom','Clava',1),
('druid','acolyte','Escudo de madeira',1),
('druid','acolyte','Cimitarra',1),
('druid','acolyte','Armadura de couro',1),
('druid','acolyte','Foco druídico',1),
('druid','acolyte','Pacote de explorador',1),
('druid','acolyte','Símbolo sagrado',1),
('druid','acolyte','Livro de orações',1),
('druid','acolyte','Incenso (5 varetas)',1),
('druid','acolyte','Vestes religiosas',1),
('druid','acolyte','Roupas comuns',1),
('druid','acolyte','Bolsa',1),
('druid','criminal','Escudo de madeira',1),
('druid','criminal','Cimitarra',1),
('druid','criminal','Armadura de couro',1),
('druid','criminal','Foco druídico',1),
('druid','criminal','Pacote de explorador',1),
('druid','criminal','Pé de cabra',1),
('druid','criminal','Roupas escuras com capuz',1),
('druid','criminal','Bolsa',1),
('druid','folk-hero','Escudo de madeira',1),
('druid','folk-hero','Cimitarra',1),
('druid','folk-hero','Armadura de couro',1),
('druid','folk-hero','Foco druídico',1),
('druid','folk-hero','Pacote de explorador',1),
('druid','folk-hero','Ferramentas de artesão escolhidas',1),
('druid','folk-hero','Pá',1),
('druid','folk-hero','Panela de ferro',1),
('druid','folk-hero','Roupas comuns',1),
('druid','folk-hero','Bolsa',1),
('druid','noble','Escudo de madeira',1),
('druid','noble','Cimitarra',1),
('druid','noble','Armadura de couro',1),
('druid','noble','Foco druídico',1),
('druid','noble','Pacote de explorador',1),
('druid','noble','Roupas finas',1),
('druid','noble','Anel de sinete',1),
('druid','noble','Documento de linhagem',1),
('druid','noble','Bolsa',1),
('druid','sage','Escudo de madeira',1),
('druid','sage','Cimitarra',1),
('druid','sage','Armadura de couro',1),
('druid','sage','Foco druídico',1),
('druid','sage','Pacote de explorador',1),
('druid','sage','Tinta preta',1),
('druid','sage','Pena',1),
('druid','sage','Faca pequena',1),
('druid','sage','Carta de um colega',1),
('druid','sage','Roupas comuns',1),
('druid','sage','Bolsa',1),
('druid','soldier','Escudo de madeira',1),
('druid','soldier','Cimitarra',1),
('druid','soldier','Armadura de couro',1),
('druid','soldier','Foco druídico',1),
('druid','soldier','Pacote de explorador',1),
('druid','soldier','Insígnia de patente',1),
('druid','soldier','Troféu de guerra',1),
('druid','soldier','Conjunto de jogo escolhido',1),
('druid','soldier','Roupas comuns',1),
('druid','soldier','Bolsa',1),
('druid','custom','Escudo de madeira',1),
('druid','custom','Cimitarra',1),
('druid','custom','Armadura de couro',1),
('druid','custom','Foco druídico',1),
('druid','custom','Pacote de explorador',1),
('sorcerer','acolyte','Besta leve',1),
('sorcerer','acolyte','Virotes',1),
('sorcerer','acolyte','Foco arcano',1),
('sorcerer','acolyte','Adaga',1),
('sorcerer','acolyte','Pacote de explorador',1),
('sorcerer','acolyte','Símbolo sagrado',1),
('sorcerer','acolyte','Livro de orações',1),
('sorcerer','acolyte','Incenso (5 varetas)',1),
('sorcerer','acolyte','Vestes religiosas',1),
('sorcerer','acolyte','Roupas comuns',1),
('sorcerer','acolyte','Bolsa',1),
('sorcerer','criminal','Besta leve',1),
('sorcerer','criminal','Virotes',1),
('sorcerer','criminal','Foco arcano',1),
('sorcerer','criminal','Adaga',1),
('sorcerer','criminal','Pacote de explorador',1),
('sorcerer','criminal','Pé de cabra',1),
('sorcerer','criminal','Roupas escuras com capuz',1),
('sorcerer','criminal','Bolsa',1),
('sorcerer','folk-hero','Besta leve',1),
('sorcerer','folk-hero','Virotes',1),
('sorcerer','folk-hero','Foco arcano',1),
('sorcerer','folk-hero','Adaga',1),
('sorcerer','folk-hero','Pacote de explorador',1),
('sorcerer','folk-hero','Ferramentas de artesão escolhidas',1),
('sorcerer','folk-hero','Pá',1),
('sorcerer','folk-hero','Panela de ferro',1),
('sorcerer','folk-hero','Roupas comuns',1),
('sorcerer','folk-hero','Bolsa',1),
('sorcerer','noble','Besta leve',1),
('sorcerer','noble','Virotes',1),
('sorcerer','noble','Foco arcano',1),
('sorcerer','noble','Adaga',1),
('sorcerer','noble','Pacote de explorador',1),
('sorcerer','noble','Roupas finas',1),
('sorcerer','noble','Anel de sinete',1),
('sorcerer','noble','Documento de linhagem',1),
('sorcerer','noble','Bolsa',1),
('sorcerer','sage','Besta leve',1),
('sorcerer','sage','Virotes',1),
('sorcerer','sage','Foco arcano',1),
('sorcerer','sage','Adaga',1),
('sorcerer','sage','Pacote de explorador',1),
('sorcerer','sage','Tinta preta',1),
('sorcerer','sage','Pena',1),
('sorcerer','sage','Faca pequena',1),
('sorcerer','sage','Carta de um colega',1),
('sorcerer','sage','Roupas comuns',1),
('sorcerer','sage','Bolsa',1),
('sorcerer','soldier','Besta leve',1),
('sorcerer','soldier','Virotes',1),
('sorcerer','soldier','Foco arcano',1),
('sorcerer','soldier','Adaga',1),
('sorcerer','soldier','Pacote de explorador',1),
('sorcerer','soldier','Insígnia de patente',1),
('sorcerer','soldier','Troféu de guerra',1),
('sorcerer','soldier','Conjunto de jogo escolhido',1),
('sorcerer','soldier','Roupas comuns',1),
('sorcerer','soldier','Bolsa',1),
('sorcerer','custom','Besta leve',1),
('sorcerer','custom','Virotes',1),
('sorcerer','custom','Foco arcano',1),
('sorcerer','custom','Adaga',1),
('sorcerer','custom','Pacote de explorador',1),
('fighter','acolyte','Cota de malha',1),
('fighter','acolyte','Espada longa',1),
('fighter','acolyte','Escudo',1),
('fighter','acolyte','Besta leve',1),
('fighter','acolyte','Virotes',1),
('fighter','acolyte','Pacote de explorador',1),
('fighter','acolyte','Símbolo sagrado',1),
('fighter','acolyte','Livro de orações',1),
('fighter','acolyte','Incenso (5 varetas)',1),
('fighter','acolyte','Vestes religiosas',1),
('fighter','acolyte','Roupas comuns',1),
('fighter','acolyte','Bolsa',1),
('fighter','acolyte','Armadura de couro',1),
('fighter','acolyte','Arco longo',1),
('fighter','acolyte','Flechas',1),
('fighter','criminal','Cota de malha',1),
('fighter','criminal','Espada longa',1),
('fighter','criminal','Escudo',1),
('fighter','criminal','Besta leve',1),
('fighter','criminal','Virotes',1),
('fighter','criminal','Pacote de explorador',1),
('fighter','criminal','Pé de cabra',1),
('fighter','criminal','Roupas escuras com capuz',1),
('fighter','criminal','Bolsa',1),
('fighter','criminal','Armadura de couro',1),
('fighter','criminal','Arco longo',1),
('fighter','criminal','Flechas',1),
('fighter','folk-hero','Cota de malha',1),
('fighter','folk-hero','Espada longa',1),
('fighter','folk-hero','Escudo',1),
('fighter','folk-hero','Besta leve',1),
('fighter','folk-hero','Virotes',1),
('fighter','folk-hero','Pacote de explorador',1),
('fighter','folk-hero','Ferramentas de artesão escolhidas',1),
('fighter','folk-hero','Pá',1),
('fighter','folk-hero','Panela de ferro',1),
('fighter','folk-hero','Roupas comuns',1),
('fighter','folk-hero','Bolsa',1),
('fighter','folk-hero','Armadura de couro',1),
('fighter','folk-hero','Arco longo',1),
('fighter','folk-hero','Flechas',1),
('fighter','noble','Cota de malha',1),
('fighter','noble','Espada longa',1),
('fighter','noble','Escudo',1),
('fighter','noble','Besta leve',1),
('fighter','noble','Virotes',1),
('fighter','noble','Pacote de explorador',1),
('fighter','noble','Roupas finas',1),
('fighter','noble','Anel de sinete',1),
('fighter','noble','Documento de linhagem',1),
('fighter','noble','Bolsa',1),
('fighter','noble','Armadura de couro',1),
('fighter','noble','Arco longo',1),
('fighter','noble','Flechas',1),
('fighter','sage','Cota de malha',1),
('fighter','sage','Espada longa',1),
('fighter','sage','Escudo',1),
('fighter','sage','Besta leve',1),
('fighter','sage','Virotes',1),
('fighter','sage','Pacote de explorador',1),
('fighter','sage','Tinta preta',1),
('fighter','sage','Pena',1),
('fighter','sage','Faca pequena',1),
('fighter','sage','Carta de um colega',1),
('fighter','sage','Roupas comuns',1),
('fighter','sage','Bolsa',1),
('fighter','sage','Armadura de couro',1),
('fighter','sage','Arco longo',1),
('fighter','sage','Flechas',1),
('fighter','soldier','Cota de malha',1),
('fighter','soldier','Espada longa',1),
('fighter','soldier','Escudo',1),
('fighter','soldier','Besta leve',1),
('fighter','soldier','Virotes',1),
('fighter','soldier','Pacote de explorador',1),
('fighter','soldier','Insígnia de patente',1),
('fighter','soldier','Troféu de guerra',1),
('fighter','soldier','Conjunto de jogo escolhido',1),
('fighter','soldier','Roupas comuns',1),
('fighter','soldier','Bolsa',1),
('fighter','soldier','Armadura de couro',1),
('fighter','soldier','Arco longo',1),
('fighter','soldier','Flechas',1),
('fighter','custom','Cota de malha',1),
('fighter','custom','Espada longa',1),
('fighter','custom','Escudo',1),
('fighter','custom','Besta leve',1),
('fighter','custom','Virotes',1),
('fighter','custom','Pacote de explorador',1),
('fighter','custom','Armadura de couro',1),
('fighter','custom','Arco longo',1),
('fighter','custom','Flechas',1),
('rogue','acolyte','Rapieira',1),
('rogue','acolyte','Arco curto',1),
('rogue','acolyte','Flechas',1),
('rogue','acolyte','Armadura de couro',1),
('rogue','acolyte','Adaga',1),
('rogue','acolyte','Ferramentas de ladrão',1),
('rogue','acolyte','Pacote de assaltante',1),
('rogue','acolyte','Símbolo sagrado',1),
('rogue','acolyte','Livro de orações',1),
('rogue','acolyte','Incenso (5 varetas)',1),
('rogue','acolyte','Vestes religiosas',1),
('rogue','acolyte','Roupas comuns',1),
('rogue','acolyte','Bolsa',1),
('rogue','criminal','Rapieira',1),
('rogue','criminal','Arco curto',1),
('rogue','criminal','Flechas',1),
('rogue','criminal','Armadura de couro',1),
('rogue','criminal','Adaga',1),
('rogue','criminal','Ferramentas de ladrão',1),
('rogue','criminal','Pacote de assaltante',1),
('rogue','criminal','Pé de cabra',1),
('rogue','criminal','Roupas escuras com capuz',1),
('rogue','criminal','Bolsa',1),
('rogue','folk-hero','Rapieira',1),
('rogue','folk-hero','Arco curto',1),
('rogue','folk-hero','Flechas',1),
('rogue','folk-hero','Armadura de couro',1),
('rogue','folk-hero','Adaga',1),
('rogue','folk-hero','Ferramentas de ladrão',1),
('rogue','folk-hero','Pacote de assaltante',1),
('rogue','folk-hero','Ferramentas de artesão escolhidas',1),
('rogue','folk-hero','Pá',1),
('rogue','folk-hero','Panela de ferro',1),
('rogue','folk-hero','Roupas comuns',1),
('rogue','folk-hero','Bolsa',1),
('rogue','noble','Rapieira',1),
('rogue','noble','Arco curto',1),
('rogue','noble','Flechas',1),
('rogue','noble','Armadura de couro',1),
('rogue','noble','Adaga',1),
('rogue','noble','Ferramentas de ladrão',1),
('rogue','noble','Pacote de assaltante',1),
('rogue','noble','Roupas finas',1),
('rogue','noble','Anel de sinete',1),
('rogue','noble','Documento de linhagem',1),
('rogue','noble','Bolsa',1),
('rogue','sage','Rapieira',1),
('rogue','sage','Arco curto',1),
('rogue','sage','Flechas',1),
('rogue','sage','Armadura de couro',1),
('rogue','sage','Adaga',1),
('rogue','sage','Ferramentas de ladrão',1),
('rogue','sage','Pacote de assaltante',1),
('rogue','sage','Tinta preta',1),
('rogue','sage','Pena',1),
('rogue','sage','Faca pequena',1),
('rogue','sage','Carta de um colega',1),
('rogue','sage','Roupas comuns',1),
('rogue','sage','Bolsa',1),
('rogue','soldier','Rapieira',1),
('rogue','soldier','Arco curto',1),
('rogue','soldier','Flechas',1),
('rogue','soldier','Armadura de couro',1),
('rogue','soldier','Adaga',1),
('rogue','soldier','Ferramentas de ladrão',1),
('rogue','soldier','Pacote de assaltante',1),
('rogue','soldier','Insígnia de patente',1),
('rogue','soldier','Troféu de guerra',1),
('rogue','soldier','Conjunto de jogo escolhido',1),
('rogue','soldier','Roupas comuns',1),
('rogue','soldier','Bolsa',1),
('rogue','custom','Rapieira',1),
('rogue','custom','Arco curto',1),
('rogue','custom','Flechas',1),
('rogue','custom','Armadura de couro',1),
('rogue','custom','Adaga',1),
('rogue','custom','Ferramentas de ladrão',1),
('rogue','custom','Pacote de assaltante',1),
('wizard','acolyte','Bordão',1),
('wizard','acolyte','Foco arcano',1),
('wizard','acolyte','Grimório',1),
('wizard','acolyte','Pacote de estudioso',1),
('wizard','acolyte','Símbolo sagrado',1),
('wizard','acolyte','Livro de orações',1),
('wizard','acolyte','Incenso (5 varetas)',1),
('wizard','acolyte','Vestes religiosas',1),
('wizard','acolyte','Roupas comuns',1),
('wizard','acolyte','Bolsa',1),
('wizard','criminal','Bordão',1),
('wizard','criminal','Foco arcano',1),
('wizard','criminal','Grimório',1),
('wizard','criminal','Pacote de estudioso',1),
('wizard','criminal','Pé de cabra',1),
('wizard','criminal','Roupas escuras com capuz',1),
('wizard','criminal','Bolsa',1),
('wizard','folk-hero','Bordão',1),
('wizard','folk-hero','Foco arcano',1),
('wizard','folk-hero','Grimório',1),
('wizard','folk-hero','Pacote de estudioso',1),
('wizard','folk-hero','Ferramentas de artesão escolhidas',1),
('wizard','folk-hero','Pá',1),
('wizard','folk-hero','Panela de ferro',1),
('wizard','folk-hero','Roupas comuns',1),
('wizard','folk-hero','Bolsa',1),
('wizard','noble','Bordão',1),
('wizard','noble','Foco arcano',1),
('wizard','noble','Grimório',1),
('wizard','noble','Pacote de estudioso',1),
('wizard','noble','Roupas finas',1),
('wizard','noble','Anel de sinete',1),
('wizard','noble','Documento de linhagem',1),
('wizard','noble','Bolsa',1),
('wizard','sage','Bordão',1),
('wizard','sage','Foco arcano',1),
('wizard','sage','Grimório',1),
('wizard','sage','Pacote de estudioso',1),
('wizard','sage','Tinta preta',1),
('wizard','sage','Pena',1),
('wizard','sage','Faca pequena',1),
('wizard','sage','Carta de um colega',1),
('wizard','sage','Roupas comuns',1),
('wizard','sage','Bolsa',1),
('wizard','soldier','Bordão',1),
('wizard','soldier','Foco arcano',1),
('wizard','soldier','Grimório',1),
('wizard','soldier','Pacote de estudioso',1),
('wizard','soldier','Insígnia de patente',1),
('wizard','soldier','Troféu de guerra',1),
('wizard','soldier','Conjunto de jogo escolhido',1),
('wizard','soldier','Roupas comuns',1),
('wizard','soldier','Bolsa',1),
('wizard','custom','Bordão',1),
('wizard','custom','Foco arcano',1),
('wizard','custom','Grimório',1),
('wizard','custom','Pacote de estudioso',1),
('monk','acolyte','Espada curta',1),
('monk','acolyte','Dardo',1),
('monk','acolyte','Pacote de explorador',1),
('monk','acolyte','Símbolo sagrado',1),
('monk','acolyte','Livro de orações',1),
('monk','acolyte','Incenso (5 varetas)',1),
('monk','acolyte','Vestes religiosas',1),
('monk','acolyte','Roupas comuns',1),
('monk','acolyte','Bolsa',1),
('monk','criminal','Espada curta',1),
('monk','criminal','Dardo',1),
('monk','criminal','Pacote de explorador',1),
('monk','criminal','Pé de cabra',1),
('monk','criminal','Roupas escuras com capuz',1),
('monk','criminal','Bolsa',1),
('monk','folk-hero','Espada curta',1),
('monk','folk-hero','Dardo',1),
('monk','folk-hero','Pacote de explorador',1),
('monk','folk-hero','Ferramentas de artesão escolhidas',1),
('monk','folk-hero','Pá',1),
('monk','folk-hero','Panela de ferro',1),
('monk','folk-hero','Roupas comuns',1),
('monk','folk-hero','Bolsa',1),
('monk','noble','Espada curta',1),
('monk','noble','Dardo',1),
('monk','noble','Pacote de explorador',1),
('monk','noble','Roupas finas',1),
('monk','noble','Anel de sinete',1),
('monk','noble','Documento de linhagem',1),
('monk','noble','Bolsa',1),
('monk','sage','Espada curta',1),
('monk','sage','Dardo',1),
('monk','sage','Pacote de explorador',1),
('monk','sage','Tinta preta',1),
('monk','sage','Pena',1),
('monk','sage','Faca pequena',1),
('monk','sage','Carta de um colega',1),
('monk','sage','Roupas comuns',1),
('monk','sage','Bolsa',1),
('monk','soldier','Espada curta',1),
('monk','soldier','Dardo',1),
('monk','soldier','Pacote de explorador',1),
('monk','soldier','Insígnia de patente',1),
('monk','soldier','Troféu de guerra',1),
('monk','soldier','Conjunto de jogo escolhido',1),
('monk','soldier','Roupas comuns',1),
('monk','soldier','Bolsa',1),
('monk','custom','Espada curta',1),
('monk','custom','Dardo',1),
('monk','custom','Pacote de explorador',1),
('paladin','acolyte','Espada longa',1),
('paladin','acolyte','Escudo',1),
('paladin','acolyte','Azagaia',1),
('paladin','acolyte','Cota de malha',1),
('paladin','acolyte','Símbolo sagrado',2),
('paladin','acolyte','Pacote de sacerdote',1),
('paladin','acolyte','Livro de orações',1),
('paladin','acolyte','Incenso (5 varetas)',1),
('paladin','acolyte','Vestes religiosas',1),
('paladin','acolyte','Roupas comuns',1),
('paladin','acolyte','Bolsa',1),
('paladin','criminal','Espada longa',1),
('paladin','criminal','Escudo',1),
('paladin','criminal','Azagaia',1),
('paladin','criminal','Cota de malha',1),
('paladin','criminal','Símbolo sagrado',1),
('paladin','criminal','Pacote de sacerdote',1),
('paladin','criminal','Pé de cabra',1),
('paladin','criminal','Roupas escuras com capuz',1),
('paladin','criminal','Bolsa',1),
('paladin','folk-hero','Espada longa',1),
('paladin','folk-hero','Escudo',1),
('paladin','folk-hero','Azagaia',1),
('paladin','folk-hero','Cota de malha',1),
('paladin','folk-hero','Símbolo sagrado',1),
('paladin','folk-hero','Pacote de sacerdote',1),
('paladin','folk-hero','Ferramentas de artesão escolhidas',1),
('paladin','folk-hero','Pá',1),
('paladin','folk-hero','Panela de ferro',1),
('paladin','folk-hero','Roupas comuns',1),
('paladin','folk-hero','Bolsa',1),
('paladin','noble','Espada longa',1),
('paladin','noble','Escudo',1),
('paladin','noble','Azagaia',1),
('paladin','noble','Cota de malha',1),
('paladin','noble','Símbolo sagrado',1),
('paladin','noble','Pacote de sacerdote',1),
('paladin','noble','Roupas finas',1),
('paladin','noble','Anel de sinete',1),
('paladin','noble','Documento de linhagem',1),
('paladin','noble','Bolsa',1),
('paladin','sage','Espada longa',1),
('paladin','sage','Escudo',1),
('paladin','sage','Azagaia',1),
('paladin','sage','Cota de malha',1),
('paladin','sage','Símbolo sagrado',1),
('paladin','sage','Pacote de sacerdote',1),
('paladin','sage','Tinta preta',1),
('paladin','sage','Pena',1),
('paladin','sage','Faca pequena',1),
('paladin','sage','Carta de um colega',1),
('paladin','sage','Roupas comuns',1),
('paladin','sage','Bolsa',1),
('paladin','soldier','Espada longa',1),
('paladin','soldier','Escudo',1),
('paladin','soldier','Azagaia',1),
('paladin','soldier','Cota de malha',1),
('paladin','soldier','Símbolo sagrado',1),
('paladin','soldier','Pacote de sacerdote',1),
('paladin','soldier','Insígnia de patente',1),
('paladin','soldier','Troféu de guerra',1),
('paladin','soldier','Conjunto de jogo escolhido',1),
('paladin','soldier','Roupas comuns',1),
('paladin','soldier','Bolsa',1),
('paladin','custom','Espada longa',1),
('paladin','custom','Escudo',1),
('paladin','custom','Azagaia',1),
('paladin','custom','Cota de malha',1),
('paladin','custom','Símbolo sagrado',1),
('paladin','custom','Pacote de sacerdote',1),
('ranger','acolyte','Cota de escamas',1),
('ranger','acolyte','Espada curta',1),
('ranger','acolyte','Arco longo',1),
('ranger','acolyte','Flechas',1),
('ranger','acolyte','Pacote de explorador',1),
('ranger','acolyte','Símbolo sagrado',1),
('ranger','acolyte','Livro de orações',1),
('ranger','acolyte','Incenso (5 varetas)',1),
('ranger','acolyte','Vestes religiosas',1),
('ranger','acolyte','Roupas comuns',1),
('ranger','acolyte','Bolsa',1),
('ranger','acolyte','Armadura de couro',1),
('ranger','criminal','Cota de escamas',1),
('ranger','criminal','Espada curta',1),
('ranger','criminal','Arco longo',1),
('ranger','criminal','Flechas',1),
('ranger','criminal','Pacote de explorador',1),
('ranger','criminal','Pé de cabra',1),
('ranger','criminal','Roupas escuras com capuz',1),
('ranger','criminal','Bolsa',1),
('ranger','criminal','Armadura de couro',1),
('ranger','folk-hero','Cota de escamas',1),
('ranger','folk-hero','Espada curta',1),
('ranger','folk-hero','Arco longo',1),
('ranger','folk-hero','Flechas',1),
('ranger','folk-hero','Pacote de explorador',1),
('ranger','folk-hero','Ferramentas de artesão escolhidas',1),
('ranger','folk-hero','Pá',1),
('ranger','folk-hero','Panela de ferro',1),
('ranger','folk-hero','Roupas comuns',1),
('ranger','folk-hero','Bolsa',1),
('ranger','folk-hero','Armadura de couro',1),
('ranger','noble','Cota de escamas',1),
('ranger','noble','Espada curta',1),
('ranger','noble','Arco longo',1),
('ranger','noble','Flechas',1),
('ranger','noble','Pacote de explorador',1),
('ranger','noble','Roupas finas',1),
('ranger','noble','Anel de sinete',1),
('ranger','noble','Documento de linhagem',1),
('ranger','noble','Bolsa',1),
('ranger','noble','Armadura de couro',1),
('ranger','sage','Cota de escamas',1),
('ranger','sage','Espada curta',1),
('ranger','sage','Arco longo',1),
('ranger','sage','Flechas',1),
('ranger','sage','Pacote de explorador',1),
('ranger','sage','Tinta preta',1),
('ranger','sage','Pena',1),
('ranger','sage','Faca pequena',1),
('ranger','sage','Carta de um colega',1),
('ranger','sage','Roupas comuns',1),
('ranger','sage','Bolsa',1),
('ranger','sage','Armadura de couro',1),
('ranger','soldier','Cota de escamas',1),
('ranger','soldier','Espada curta',1),
('ranger','soldier','Arco longo',1),
('ranger','soldier','Flechas',1),
('ranger','soldier','Pacote de explorador',1),
('ranger','soldier','Insígnia de patente',1),
('ranger','soldier','Troféu de guerra',1),
('ranger','soldier','Conjunto de jogo escolhido',1),
('ranger','soldier','Roupas comuns',1),
('ranger','soldier','Bolsa',1),
('ranger','soldier','Armadura de couro',1),
('ranger','custom','Cota de escamas',1),
('ranger','custom','Espada curta',1),
('ranger','custom','Arco longo',1),
('ranger','custom','Flechas',1),
('ranger','custom','Pacote de explorador',1),
('ranger','custom','Armadura de couro',1)
on conflict(class_id,background_id,name) do update set quantity=excluded.quantity;

create or replace function private.scenery_metadata_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.battle_is_scenery_kind(new.object_type) then return new; end if;
 if new.metadata ? 'style' and (jsonb_typeof(new.metadata->'style') is distinct from 'string' or new.metadata->>'style' not in('original','village','forest','coastal','desert','winter','gothic')) then raise exception 'Escolha um estilo válido para os materiais.'; end if;
 return new;
end $$;
revoke all on function private.scenery_metadata_guard() from public,anon,authenticated;
drop trigger if exists b_scenery_metadata_guard on public.battle_map_objects;
create trigger b_scenery_metadata_guard before insert or update on public.battle_map_objects for each row execute function private.scenery_metadata_guard();
-- Keep the installed argument names/default expressions and function identity.
-- Removing an existing DEFAULT with CREATE OR REPLACE would raise 42P13.
do $preserve_save_character$
declare function_arguments text;
begin
  select pg_catalog.pg_get_function_arguments(pg_catalog.to_regprocedure('public.save_character(jsonb,timestamptz)')) into function_arguments;
  function_arguments=coalesce(function_arguments,'p_payload jsonb,p_expected_updated_at timestamptz default null');
  execute 'create or replace function public.save_character('||function_arguments||') '
    ||$function_definition$returns jsonb
language plpgsql security invoker set search_path='' as $function_body$
declare
  p_payload alias for $1;
  p_expected_updated_at alias for $2;
 cid uuid=(p_payload->>'id')::uuid; s jsonb=p_payload->'sheet'; old_row public.characters;
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
    perform private.dnd_validate_build(s,s->'abilities');
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
  for entry in select value from jsonb_array_elements(s->'inventory') loop
    if length(trim(entry->>'name'))=0 or coalesce((entry->>'quantity')::integer,0)<0 or coalesce((entry->>'weight')::numeric,-1)<0 then raise exception 'Confira a quantidade e o peso dos itens.'; end if;
    insert into public.character_inventory(id,character_id,data) values((entry->>'id')::uuid,cid,entry-'id')
      on conflict(id) do update set data=excluded.data where character_inventory.character_id=cid;
    if not found then raise exception 'Este item pertence a outra ficha.' using errcode='42501'; end if;
  end loop;
  delete from public.character_inventory where character_id=cid and not exists(
    select 1 from jsonb_array_elements(s->'inventory') i where (i->>'id')::uuid=character_inventory.id
  );
  delete from public.character_spells where character_id=cid;
  for entry in select value from jsonb_array_elements(s->'spells') loop
    if coalesce(length(trim(entry->>'name')),0)=0 or coalesce((entry->>'level')::integer,-1) not between 0 and 9 then raise exception 'Confira o nome e o nível das magias.'; end if;
    insert into public.character_spells(id,character_id,data) values((entry->>'id')::uuid,cid,entry-'id');
  end loop;
  return jsonb_build_object('id',saved.id,'updated_at',saved.updated_at);
end $function_body$;$function_definition$;
end $preserve_save_character$;

commit;

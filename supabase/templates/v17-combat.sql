-- Source template. The generator produces the ONE executable migration 018.
begin;
do $$ begin
 if to_regprocedure('private.dnd_validate_build(jsonb,jsonb)') is null or to_regclass('public.dnd_character_build_rules') is null then
  raise exception 'Esta atualização requer a multiclasse v16 instalada. Não execute migrações antigas; conclua a recuperação v16 primeiro.';
 end if;
end $$;
alter table public.battle_action_requests drop constraint if exists battle_action_requests_kind_check;
alter table public.battle_action_requests add constraint battle_action_requests_kind_check check(kind in('weapon','spell','item','feature','dash','disengage','dodge','opportunity'));
alter table public.battle_action_requests drop constraint if exists battle_action_requests_cost_check;
alter table public.battle_action_requests add constraint battle_action_requests_cost_check check(cost in('action','bonus','reaction','free'));
alter table public.battle_map_tokens add column if not exists raging boolean not null default false;
alter table public.battle_map_tokens add column if not exists rage_started_round integer;
alter table public.battle_map_tokens add column if not exists rage_activity_at timestamptz;
alter table public.battle_map_tokens add column if not exists rage_checked_at timestamptz;
alter table public.battle_map_tokens add column if not exists sneak_used boolean not null default false;
alter table public.battle_map_tokens add column if not exists hunter_used boolean not null default false;
alter table public.battle_map_tokens add column if not exists surge_used boolean not null default false;
alter table public.battle_map_tokens add column if not exists weapon_attacked boolean not null default false;
alter table public.battle_map_tokens add column if not exists extra_actions integer not null default 0 check(extra_actions between 0 and 1);

create table if not exists public.dnd_items(id text primary key,name text not null,data jsonb not null);
create table if not exists public.dnd_combat_features(id text primary key,data jsonb not null);
alter table public.dnd_items enable row level security;
alter table public.dnd_combat_features enable row level security;
drop policy if exists dnd_items_read on public.dnd_items;
create policy dnd_items_read on public.dnd_items for select to authenticated using(true);
drop policy if exists dnd_combat_features_read on public.dnd_combat_features;
create policy dnd_combat_features_read on public.dnd_combat_features for select to authenticated using(true);
grant select on public.dnd_items,public.dnd_combat_features to authenticated;
revoke all on public.dnd_items,public.dnd_combat_features from anon;
-- CATALOG_SEED

create or replace function private.dnd_inventory_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare definition jsonb; amount numeric; charges integer;
begin
 if coalesce(new.data->>'catalog_id','')<>'' then select data into definition from public.dnd_items where id=new.data->>'catalog_id';
  if definition is null then raise exception 'Referência de item não encontrada no catálogo.';end if;
 else select data into definition from public.dnd_items where name=new.data->>'name';end if;
 if definition is not null then new.data=(definition-array['use','quantity','weight','cost_gp','notes','equipped'])||new.data||jsonb_build_object('catalog_id',definition->>'catalog_id','category',definition->>'category');end if;
 amount=coalesce((new.data->>'quantity')::numeric,0);
 if amount<>floor(amount) or amount<0 or coalesce((new.data->>'weight')::numeric,0)<0 or coalesce(new.data->>'category','') not in('weapon','armor','gear','item','potion','ammunition','tool','focus','consumable','container','treasure','magic') then raise exception 'Confira o tipo, a quantidade e o peso do item.';end if;
 if amount=0 then new.data=new.data||'{"equipped":false}'::jsonb;end if;
 if coalesce(new.data->>'weapon_proficiency','auto') not in('auto','proficient','untrained') or abs(coalesce((new.data->>'weapon_attack_bonus')::numeric,0))>20 or coalesce((new.data->>'weapon_attack_bonus')::numeric,0)<>floor(coalesce((new.data->>'weapon_attack_bonus')::numeric,0)) then raise exception 'Confira a proficiência e o bônus de ataque da arma.';end if;
 charges=coalesce((definition->>'charges')::integer,0);
 if new.data ? 'charges_used' and (coalesce((new.data->>'charges_used')::numeric,-1)<0 or (new.data->>'charges_used')::numeric<>floor((new.data->>'charges_used')::numeric) or (new.data->>'charges_used')::numeric>charges) then raise exception 'Usos do item acima do limite.';end if;
 return new;
end $$;
drop trigger if exists dnd_inventory_guard on public.character_inventory;
create trigger dnd_inventory_guard before insert or update on public.character_inventory for each row execute function private.dnd_inventory_guard();
-- Preserve existing quantities, descriptions and custom damage; classify known legacy items.
update public.character_inventory set data=data;

create or replace function private.dnd_expanded_spell(s jsonb,entry jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare c jsonb;
begin
 if coalesce(nullif(entry->>'class_id',''),s->>'class_id')<>'warlock' then return false;end if;
 select x into c from jsonb_array_elements(private.dnd_levels(s)) x where x->>'class_id'='warlock';
 if coalesce(c->>'subclass_id','')<>'fiend' then return false;end if;
 return coalesce((c->>'subclass_id'='fiend' and (c->>'level')::integer>0 and
  (entry->>'english_name' in('Burning Hands','Command') or
  ((c->>'level')::integer>=3 and entry->>'english_name' in('Blindness/Deafness','Scorching Ray')) or
  ((c->>'level')::integer>=5 and entry->>'english_name' in('Fireball','Stinking Cloud')) or
  ((c->>'level')::integer>=7 and entry->>'english_name' in('Fire Shield','Wall of Fire')) or
  ((c->>'level')::integer>=9 and entry->>'english_name' in('Flame Strike','Hallow')))),false);
end $$;
create or replace function private.dnd_spell_inactive(s jsonb,entry jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare origin jsonb; chosen_id text=coalesce(nullif(entry->>'class_id',''),s->>'class_id'); sub text;
 progress public.dnd_spell_progression; grants jsonb; lvl integer=coalesce((entry->>'level')::integer,0); grant_id text=entry->>'granted_feature'; maxgrants integer=0;
begin
 select c into origin from jsonb_array_elements(private.dnd_levels(s)) c where c->>'class_id'=chosen_id;
 if origin is null then return true;end if;
 sub=case when origin->>'subclass_id' in('eldritch-knight','arcane-trickster') then origin->>'subclass_id' else '' end;
 select * into progress from public.dnd_spell_progression where class_id=chosen_id and subclass_id=sub and level=(origin->>'level')::integer;
 if progress.class_id is null or (progress.cantrips=0 and jsonb_array_length(progress.slots)=0) then return true;end if;
 if nullif(entry->>'granted_path','') is not null then
  if origin->>'subclass_id' is distinct from entry->>'granted_path' then return true;end if;
  select data->'path_spells'->(coalesce(origin->>'subclass_id','')||':'||(origin->>'level')||':'||coalesce(origin->'choices'->'land'->>0,'')) into grants from public.dnd_character_build_rules where class_id=chosen_id;
  return not coalesce(grants ? (entry->>'english_name'),false);
 end if;
 if grant_id='magical-secrets' then
  if chosen_id<>'bard' then return true;end if;
  maxgrants=case when origin->>'subclass_id'='lore' and (origin->>'level')::integer>=6 then 2 else 0 end+case when (origin->>'level')::integer>=10 then 2 else 0 end+case when (origin->>'level')::integer>=14 then 2 else 0 end+case when (origin->>'level')::integer>=18 then 2 else 0 end;
  if maxgrants=0 then return true;end if;
 elsif grant_id='pact-tome' then
  if chosen_id<>'warlock' or (origin->>'level')::integer<3 or not coalesce(origin->'choices'->'pact' ? 'tome',false) or lvl<>0 then return true;end if;
 elsif nullif(grant_id,'') is not null then return true;
 elsif nullif(entry->>'catalog_id','') is not null and not private.dnd_expanded_spell(s,entry) and not exists(select 1 from public.dnd_spell_classes where spell_id=entry->>'catalog_id' and class_id=case when sub<>'' then 'wizard' else chosen_id end) then return true;
 end if;
 if entry->>'casting_mode'='arcanum' then return chosen_id<>'warlock' or not(private.dnd_spell_pools(s)->'arcanum_levels' @> jsonb_build_array(lvl));end if;
 return (lvl=0 and progress.cantrips=0) or lvl>jsonb_array_length(progress.slots);
end $$;

create or replace function private.dnd_healing_dice(s jsonb,expression text) returns text language plpgsql immutable set search_path='' as $$
declare term text[];result text='';
begin
 if not exists(select 1 from jsonb_array_elements(private.dnd_levels(s)) c where c->>'class_id'='cleric' and c->>'subclass_id'='life' and (c->>'level')::integer>=17) then return expression;end if;
 for term in select regexp_matches(regexp_replace(expression,'\s','','g'),'([+-]?)(\d+)(?:d(\d+))?','g') loop
  result=result||coalesce(term[1],'')||case when term[3] is not null then (term[2]::integer*term[3]::integer)::text else term[2] end;
 end loop;return result;
end $$;

create or replace function private.dnd_special_spell_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare s jsonb;c jsonb;g text=new.data->>'granted_feature'; origin text; maximum integer;
begin
 if nullif(g,'') is null then return new;end if;
 select system_data into s from public.characters where id=new.character_id;
 origin=coalesce(nullif(new.data->>'class_id',''),s->>'class_id');
 select x into c from jsonb_array_elements(private.dnd_levels(s)) x where x->>'class_id'=origin;
 maximum=case g when 'pact-tome' then 3 when 'magical-secrets' then
  case when c->>'subclass_id'='lore' and (c->>'level')::integer>=6 then 2 else 0 end+case when (c->>'level')::integer>=10 then 2 else 0 end+case when (c->>'level')::integer>=14 then 2 else 0 end+case when (c->>'level')::integer>=18 then 2 else 0 end else 0 end;
 if private.dnd_spell_inactive(s,new.data) or (select count(*) from public.character_spells where character_id=new.character_id and id<>new.id and data->>'granted_feature'=g and coalesce(nullif(data->>'class_id',''),s->>'class_id')=origin)>=maximum then raise exception 'A concessão especial não está disponível ou excede suas escolhas.';end if;
 return new;
end $$;
drop trigger if exists dnd_special_spell_guard on public.character_spells;
create trigger dnd_special_spell_guard before insert or update on public.character_spells for each row execute function private.dnd_special_spell_guard();

-- A multiclass character may learn the same spell with a different class origin.
-- Keep each origin unique, because it determines learning, casting ability and DC.
drop index if exists public.character_catalog_spell_once;
create unique index if not exists character_catalog_spell_origin_once on public.character_spells(character_id,catalog_id,(coalesce(nullif(data->>'class_id',''),''))) where catalog_id is not null;

create or replace function private.dnd_learning_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare s jsonb;c jsonb;p public.dnd_spell_progression;origin text;entry jsonb;sub text;known integer=0;cantrips integer=0;secrets integer=0;lore integer=0;
begin
 select system_data into s from public.characters where id=new.character_id;
 -- Preserve old incompatible entries as inactive references. They grant no casting.
 if private.dnd_spell_inactive(s,new.data) then return new;end if;
 origin=coalesce(nullif(new.data->>'class_id',''),s->>'class_id');
 if nullif(new.data->>'catalog_id','') is not null and exists(select 1 from public.character_spells q where q.character_id=new.character_id and q.id<>new.id and q.data->>'catalog_id'=new.data->>'catalog_id' and coalesce(nullif(q.data->>'class_id',''),s->>'class_id')=origin) then raise exception 'Esta magia já está no grimório desta classe.';end if;
 select x into c from jsonb_array_elements(private.dnd_levels(s)) x where x->>'class_id'=origin;
 sub=case when c->>'subclass_id' in('eldritch-knight','arcane-trickster') then c->>'subclass_id' else '' end;
 select * into p from public.dnd_spell_progression where class_id=origin and subclass_id=sub and level=(c->>'level')::integer;
 if origin='bard' and c->>'subclass_id'='lore' and (c->>'level')::integer>=6 then lore=2;end if;
 for entry in select data from public.character_spells where character_id=new.character_id and id<>new.id union all select new.data loop
  if coalesce(nullif(entry->>'class_id',''),s->>'class_id')<>origin or private.dnd_spell_inactive(s,entry) or nullif(entry->>'granted_path','') is not null or entry->>'casting_mode'='arcanum' then continue;end if;
  if entry->>'granted_feature'='magical-secrets' then secrets=secrets+1;
  elsif nullif(entry->>'granted_feature','') is null then
   if (entry->>'level')::integer=0 then cantrips=cantrips+1;else known=known+1;end if;
  end if;
 end loop;
 if cantrips>p.cantrips then raise exception 'O limite de truques da classe foi atingido.';end if;
 if p.spells_known is not null and known+greatest(0,secrets-lore)>p.spells_known then raise exception 'O limite de magias conhecidas da classe foi atingido. Remova uma escolha para substituí-la.';end if;
 return new;
end $$;
drop trigger if exists dnd_learning_guard on public.character_spells;
create trigger dnd_learning_guard before insert or update on public.character_spells for each row execute function private.dnd_learning_guard();

create or replace function private.dnd_feature_definition(s jsonb,feature_id text,units integer,raging boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f jsonb; caps jsonb; maximum integer; used integer; resource text;
begin
 select data into f from public.dnd_combat_features where dnd_combat_features.id=feature_id;
 if f is null then raise exception 'Habilidade de combate desconhecida.';end if;
 resource=f->>'resource'; caps=private.dnd_feature_caps(s,s->'abilities');maximum=coalesce((caps->>resource)::integer,0);used=coalesce((s->'feature_uses'->>resource)::integer,0);
 if feature_id='barbarian:end-rage' then if not raging then raise exception 'A Fúria não está ativa.';end if;
 elsif maximum=0 or used+units>maximum then raise exception 'Não há usos disponíveis para esta habilidade.';end if;
 if units<1 or units>1000 or (not coalesce((f->>'variable')::boolean,false) and units<>1) then raise exception 'Quantidade de pontos inválida.';end if;
 if feature_id='barbarian:rage' then
  if raging then raise exception 'A Fúria já está ativa.';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where coalesce((i->>'equipped')::boolean,false) and i->>'armor_type'='heavy' and (i->>'quantity')::integer>0) then raise exception 'Retire a armadura pesada para usar os benefícios da Fúria.';end if;
 elsif feature_id='fighter:second-wind' then f=f||jsonb_build_object('dice','1d10+'||private.dnd_class_level(s,'fighter'));
 elsif feature_id='monk:wholeness' then f=f||jsonb_build_object('dice',(3*private.dnd_class_level(s,'monk'))::text);
 elsif feature_id='paladin:lay-hands' then f=f||jsonb_build_object('dice',units::text);
 elsif feature_id='bard:inspiration' then f=f||jsonb_build_object('note','Inspiração: d'||case when private.dnd_class_level(s,'bard')>=15 then 12 when private.dnd_class_level(s,'bard')>=10 then 10 when private.dnd_class_level(s,'bard')>=5 then 8 else 6 end||'. Mestre e jogador aplicam o dado a uma jogada elegível nos próximos 10 minutos.');
 end if;
 return f||jsonb_build_object('units',units);
end $$;

create or replace function private.dnd_weapon_proficient(item jsonb,s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare classes jsonb=private.dnd_levels(s);primary_class text;simple boolean=coalesce(item->>'weapon_type','simple')='simple';id text=coalesce(item->>'catalog_id','');
begin
 if item->>'weapon_proficiency'='proficient' then return true;end if;
 if item->>'weapon_proficiency'='untrained' then return false;end if;
 if id='unarmed' then return true;end if;
 primary_class=classes->0->>'class_id';
 if exists(select 1 from jsonb_array_elements(classes) c where c->>'class_id' in('barbarian','fighter','paladin','ranger')) then return true;end if;
 if exists(select 1 from jsonb_array_elements(classes) c where c->>'class_id'='monk') and (simple or id='shortsword') then return true;end if;
 if exists(select 1 from jsonb_array_elements(classes) c where c->>'class_id'='warlock') and simple then return true;end if;
 if primary_class in('bard','rogue') then return simple or id in('hand-crossbow','longsword','rapier','shortsword');end if;
 if primary_class in('cleric','artificer') then return simple;end if;
 if primary_class='druid' then return id in('club','dagger','dart','javelin','mace','quarterstaff','scimitar','sickle','sling','spear');end if;
 if primary_class in('wizard','sorcerer') then return id in('dagger','dart','sling','quarterstaff','light-crossbow');end if;
 return false;
end $$;
create or replace function private.dnd_weapon_traits(item jsonb,s jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare txt text=lower(coalesce(item->>'name','')||' '||coalesce(item->>'notes','')||' '||coalesce(item->'properties','[]')::text);ranged boolean; finesse boolean; unarmed boolean; martial boolean; ability text;strmod integer;dexmod integer;
begin
 ranged=item->>'weapon_mode'='ranged' or txt~'(arco|besta|funda|zarabatana)';ranged=coalesce(ranged,false);
 finesse=txt~'(acuidade|adaga|rapieira|cimitarra|espada curta|chicote)';unarmed=coalesce(item->>'catalog_id'='unarmed',false);
 martial=private.dnd_class_level(s,'monk')>0 and not exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i->>'category'='armor' and coalesce((i->>'equipped')::boolean,false) and (i->>'quantity')::integer>0)
  and (unarmed or (not ranged and txt!~'(pesada|duas mãos|duas maos)' and (item->>'weapon_type'='simple' or txt~'(bordão|bordao|lança|lanca|clava|adaga|machadinha|martelo leve|foice|espada curta)')));
 strmod=floor((coalesce((s->'abilities'->>'str')::numeric,10)-10)/2);dexmod=floor((coalesce((s->'abilities'->>'dex')::numeric,10)-10)/2);
 ability=coalesce(nullif(item->>'weapon_ability',''),case when item->>'catalog_id'='net' then 'dex' when ranged and txt!~'arremesso' then 'dex' when finesse or martial then case when dexmod>strmod then 'dex' else 'str' end else 'str' end);
 return jsonb_build_object('ranged',ranged,'finesse',finesse,'unarmed',unarmed,'martial',martial,'ability',ability,'twoHanded',txt~'(duas mãos|duas maos)','light',txt~'leve');
end $$;
create or replace function private.dnd_has_style(s jsonb,id text) returns boolean language sql immutable set search_path='' as $$
 select exists(select 1 from jsonb_array_elements(private.dnd_levels(s)) c where coalesce(c->'choices'->'style' ? id,false) or coalesce(c->'choices'->'second-style' ? id,false))
$$;
create or replace function private.dnd_weapon_effect(item jsonb,s jsonb,opts jsonb default '{}',raging boolean default false) returns jsonb language plpgsql immutable set search_path='' as $$
declare e jsonb=private.dnd_weapon_base(item,s);t jsonb=private.dnd_weapon_traits(item,s);mod integer;dice text;parts jsonb;l integer;monk integer=private.dnd_class_level(s,'monk');sides integer;twohands boolean=coalesce((opts->>'two_handed')::boolean,false);crit integer=20;c jsonb;
begin
 if s->>'class_id'='npc' then return e;end if;
 dice=coalesce(regexp_replace(substring(item->>'damage' from '\d+d\d+(?:\s*[+-]\s*\d+)?'),'\s','','g'),'1');
 if twohands and nullif(item->>'versatile_damage','') is not null then dice=item->>'versatile_damage';end if;
 if coalesce((t->>'martial')::boolean,false) then
  sides=case when monk>=17 then 10 when monk>=11 then 8 when monk>=5 then 6 else 4 end;
  if (t->>'unarmed')::boolean or (dice~'^1d\d+$' and substring(dice from '^1d(\d+)$')::integer<sides) then dice='1d'||sides;end if;
 end if;
 mod=floor((coalesce((s->'abilities'->>(t->>'ability'))::numeric,10)-10)/2);
 if coalesce((opts->>'offhand')::boolean,false) and not private.dnd_has_style(s,'two-weapon') then mod=least(0,mod);end if;
 if raging and not(t->>'ranged')::boolean and t->>'ability'='str' then l=private.dnd_class_level(s,'barbarian');mod=mod+case when l>=16 then 4 when l>=9 then 3 else 2 end;end if;
 if private.dnd_has_style(s,'dueling') and not(t->>'ranged')::boolean and not(t->>'unarmed')::boolean and not(t->>'twoHanded')::boolean and not twohands and not exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i->>'id' is distinct from item->>'id' and i->>'category'='weapon' and coalesce((i->>'equipped')::boolean,false) and (i->>'quantity')::integer>0) then mod=mod+2;end if;
 parts=jsonb_build_array(jsonb_build_object('dice',dice||case when mod>=0 then '+' else '' end||mod,'damageType',e->>'damageType'));
 if coalesce((opts->>'sneak')::boolean,false) then parts=parts||jsonb_build_array(jsonb_build_object('dice',ceil(private.dnd_class_level(s,'rogue')::numeric/2)::integer||'d6','damageType',e->>'damageType'));end if;
 if coalesce((opts->>'hunter')::boolean,false) then parts=parts||jsonb_build_array(jsonb_build_object('dice','1d8','damageType',e->>'damageType'));end if;
 if not(t->>'ranged')::boolean and not(t->>'unarmed')::boolean and private.dnd_class_level(s,'paladin')>=11 then parts=parts||jsonb_build_array(jsonb_build_object('dice','1d8','damageType','radiante'));end if;
 if coalesce((opts->>'smite_level')::integer,0)>0 then parts=parts||jsonb_build_array(jsonb_build_object('dice',(least(5,(opts->>'smite_level')::integer+1)+case when coalesce((opts->>'smite_special')::boolean,false) then 1 else 0 end)||'d8','damageType','radiante'));end if;
 for c in select value from jsonb_array_elements(private.dnd_levels(s)) loop if c->>'class_id'='fighter' and c->>'subclass_id'='champion' then crit=case when (c->>'level')::integer>=15 then 18 when (c->>'level')::integer>=3 then 19 else 20 end;end if;end loop;
 return e||jsonb_build_object('dice',case when item->>'catalog_id'='net' then '' else (select string_agg(p->>'dice','+' order by n) from jsonb_array_elements(parts) with ordinality a(p,n)) end,'damageParts',case when item->>'catalog_id'='net' then '[]'::jsonb else parts end,'kind',case when item->>'catalog_id'='net' then 'utility' else e->>'kind' end,'review',case when item->>'catalog_id'='net' then true else coalesce((e->>'review')::boolean,false) end,'note',case when item->>'catalog_id'='net' then 'Rede não causa dano. O mestre aplica a condição contido e as restrições de tamanho e de ataque descritas no item.' else e->>'note' end,
  'attackBonus',floor((coalesce((s->'abilities'->>(t->>'ability'))::numeric,10)-10)/2)+case when private.dnd_weapon_proficient(item,s) then 2+((s->>'level')::integer-1)/4 else 0 end+coalesce((item->>'weapon_attack_bonus')::integer,0)+case when (t->>'ranged')::boolean and private.dnd_has_style(s,'archery') then 2 else 0 end,'criticalAt',crit,
  'rerollWeaponDice',case when private.dnd_has_style(s,'great-weapon') and not(t->>'ranged')::boolean and ((t->>'twoHanded')::boolean or twohands) then coalesce(substring(dice from '^(\d+)d')::integer,0) else 0 end);
end $$;
create or replace function private.dnd_check_weapon_options(t public.battle_map_tokens,item jsonb,s jsonb,opts jsonb,target_ids jsonb) returns void language plpgsql stable security definer set search_path='' as $$
declare traits jsonb=private.dnd_weapon_traits(item,s);p jsonb;maximum integer;used integer;l integer=coalesce((opts->>'smite_level')::integer,0);kind text=coalesce(opts->>'smite_kind','slot');c jsonb;foe public.battle_map_tokens;target_sheet jsonb;
begin
 if jsonb_typeof(opts) is distinct from 'object' then raise exception 'Opções de ataque inválidas.';end if;
 if item->>'catalog_id'='net' and (coalesce((opts->>'sneak')::boolean,false) or coalesce((opts->>'hunter')::boolean,false) or coalesce((opts->>'smite_level')::integer,0)>0) then raise exception 'Rede não causa dano; o mestre aplica sua condição.';end if;
 if t.npc_id is not null then if opts<>'{}'::jsonb then raise exception 'NPC usa as ações de sua própria ficha.';end if;return;end if;
 p=private.dnd_spell_pools(s);
 if coalesce((opts->>'two_handed')::boolean,false) and (nullif(item->>'versatile_damage','') is null or exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i->>'armor_type'='shield' and coalesce((i->>'equipped')::boolean,false) and (i->>'quantity')::integer>0)) then raise exception 'Duas mãos exige arma versátil e ausência de escudo.';end if;
 if coalesce((opts->>'sneak')::boolean,false) and (private.dnd_class_level(s,'rogue')=0 or t.sneak_used or not((traits->>'ranged')::boolean or (traits->>'finesse')::boolean)) then raise exception 'Ataque Furtivo indisponível para esta arma ou turno.';end if;
 if coalesce((opts->>'offhand')::boolean,false) and (not t.weapon_attacked or t.bonus_used or not coalesce((item->>'equipped')::boolean,false) or not(traits->>'light')::boolean or (traits->>'ranged')::boolean or not exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i->>'id' is distinct from item->>'id' and i->>'category'='weapon' and coalesce((i->>'equipped')::boolean,false) and (i->>'quantity')::integer>0 and (private.dnd_weapon_traits(i,s)->>'light')::boolean and not(private.dnd_weapon_traits(i,s)->>'ranged')::boolean)) then raise exception 'Segunda arma exige duas armas leves corpo a corpo e um ataque realizado neste turno.';end if;
 if coalesce((opts->>'hunter')::boolean,false) then
  select x into c from jsonb_array_elements(private.dnd_levels(s)) x where x->>'class_id'='ranger';
  if c is null or (c->>'level')::integer<3 or c->>'subclass_id'<>'hunter' or not exists(select 1 from jsonb_array_elements_text(coalesce(c->'choices'->'hunter-3','[]')) v where v like 'Matador de Colossos%') or t.hunter_used then raise exception 'Matador de Colossos indisponível.';end if;
  select * into foe from public.battle_map_tokens where id=(target_ids->>0)::uuid;
  if foe.id is null or foe.map_id<>t.map_id or not private.can_read_battle_token(foe.id) then raise exception 'Alvo indisponível nesta mesa.' using errcode='42501';end if;
  target_sheet=private.battle_sheet(foe.id);
  if target_sheet is null or (target_sheet->>'hp_current')::integer>=private.battle_hp_max(target_sheet) then raise exception 'Matador de Colossos exige alvo ferido.';end if;
 end if;
 if l<0 or l>9 then raise exception 'Círculo de Destruição Divina inválido.';end if;
 if l>0 then
  if private.dnd_class_level(s,'paladin')<2 or (traits->>'ranged')::boolean then raise exception 'Destruição Divina exige paladino 2 e ataque corpo a corpo.';end if;
  if kind='slot' then maximum=coalesce((p->'slots'->>(l-1))::integer,0);used=coalesce((s->'slots_used'->>l::text)::integer,0);
  elsif kind='pact' and l=(p->>'pact_level')::integer then maximum=(p->>'pact_slots')::integer;used=coalesce((s->>'pact_slots_used')::integer,0);
  else raise exception 'Recurso incompatível com Destruição Divina.';end if;
  if maximum<=used then raise exception 'Sem espaço disponível para Destruição Divina.';end if;
 end if;
 if nullif(item->>'ammunition','') is not null and not exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i->>'category'='ammunition' and i->>'ammunition'=item->>'ammunition' and (i->>'quantity')::integer>0) then raise exception 'Adicione munição compatível ao inventário antes de disparar.';end if;
end $$;

create or replace function private.dnd_critical_expression(expression text) returns text language plpgsql immutable set search_path='' as $$
declare term text[];result text='';
begin
 for term in select regexp_matches(regexp_replace(expression,'\s','','g'),'([+-]?)(\d+)(?:d(\d+))?','g') loop
  result=result||coalesce(term[1],'')||case when term[3] is not null then (2*term[2]::integer)::text||'d'||term[3] else term[2] end;
 end loop;return result;
end $$;

create or replace function private.dnd_roll_damage_parts(terms jsonb,parts jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare p jsonb;result jsonb='[]';position integer=0;n integer;amount integer;
begin
 for p in select value from jsonb_array_elements(coalesce(parts,'[]')) loop
  select count(*) into n from regexp_matches(p->>'dice','([+-]?)(\d+)(?:d(\d+))?','g');
  amount=0;for i in position..position+n-1 loop amount=amount+coalesce((terms->i->>'subtotal')::integer,0);end loop;position=position+n;
  result=result||jsonb_build_array(jsonb_build_object('damageType',p->>'damageType','amount',greatest(0,amount)));
 end loop;return result;
end $$;
create or replace function private.dnd_damage_amount(t public.battle_map_tokens,s jsonb,e jsonb,roll integer,saved boolean,options jsonb) returns integer language plpgsql stable security definer set search_path='' as $$
declare factor numeric;amount integer=0;parts jsonb;part jsonb;dtype text;v integer;has_evasion boolean=false;
begin
 factor=case when saved then case when coalesce((e->>'halfOnSave')::boolean,false) then 0.5 else 0 end else 1 end;
 has_evasion=t.character_id is not null and (private.dnd_class_level(s,'rogue')>=7 or private.dnd_class_level(s,'monk')>=7 or exists(select 1 from jsonb_array_elements(private.dnd_levels(s)) c where c->>'class_id'='ranger' and c->>'subclass_id'='hunter' and (c->>'level')::integer>=15 and c->'choices'->'hunter-15' ? 'Evasão')) and not coalesce(s->'conditions' ?| array['Incapacitado','Inconsciente','Paralisado','Atordoado','Petrificado'],false);
 if has_evasion and lower(coalesce(e->>'save',''))='dex' and coalesce((e->>'halfOnSave')::boolean,false) then factor=case when saved then 0 else 0.5 end;end if;
 parts=case when jsonb_array_length(coalesce(options->'damage_parts','[]'))>0 then options->'damage_parts' else jsonb_build_array(jsonb_build_object('amount',roll,'damageType',e->>'damageType')) end;
 for part in select value from jsonb_array_elements(parts) loop
  dtype=lower(coalesce(part->>'damageType',''));v=floor((part->>'amount')::numeric*factor);
  if dtype='veneno' and private.dnd_class_level(s,'monk')>=10 then v=0;end if;
  if t.raging and dtype in('cortante','perfurante','concussão','concussao') and not exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i->>'armor_type'='heavy' and coalesce((i->>'equipped')::boolean,false) and (i->>'quantity')::integer>0) then v=floor(v::numeric/2);end if;
  amount=amount+v;
 end loop;return amount;
end $$;
create or replace function private.dnd_attack_roll_detail(expression text,e jsonb) returns jsonb language plpgsql volatile set search_path='' as $$
declare detail jsonb=private.battle_roll_detail(expression,'normal');terms jsonb;term jsonb;vals jsonb;original jsonb;total integer;subtotal integer=0;n integer;v integer;
begin
 n=coalesce((e->>'rerollWeaponDice')::integer,0);if n<1 then return detail;end if;
 terms=detail->'terms';term=terms->0;vals=term->'values';original=vals;
 for i in 0..least(n,jsonb_array_length(vals))-1 loop
  v=(vals->>i)::integer;if v in(1,2) then vals=jsonb_set(vals,array[i::text],to_jsonb(floor(random()*(term->>'sides')::integer)::integer+1));end if;
 end loop;
 select sum(value::integer) into subtotal from jsonb_array_elements_text(vals);
 total=(detail->>'total')::integer-(term->>'subtotal')::integer+subtotal*(term->>'sign')::integer;
 term=term||jsonb_build_object('values',vals,'subtotal',subtotal*(term->>'sign')::integer,'rerolled_from',original);terms=jsonb_set(terms,'{0}',term);
 return detail||jsonb_build_object('terms',terms,'total',total);
end $$;

create or replace function private.dnd_item_special(r public.battle_action_requests,e jsonb) returns void language plpgsql security definer set search_path='' as $$
declare target public.battle_map_tokens;sheet jsonb;condition text;
begin
 if coalesce(e->>'special','') not in('stabilize','antitoxin') then return;end if;
 for target in select * from public.battle_map_tokens where id=any(r.target_ids) and map_id=r.map_id order by id for update loop
  if target.character_id is null then
   if e->>'special'='stabilize' and (private.battle_sheet(target.id)->>'hp_current')::integer<>0 then raise exception 'Estabilizar exige uma criatura com 0 PV.';end if;
   continue; -- NPC death saves and poison saves are narrated by the GM.
  end if;
  perform 1 from public.characters where id=target.character_id for update;sheet=private.battle_sheet(target.id);
  if e->>'special'='stabilize' then
   if (sheet->>'hp_current')::integer<>0 or coalesce((sheet->>'death_failures')::integer,0)>=3 then raise exception 'Só é possível estabilizar uma criatura viva com 0 PV.';end if;
   update public.characters set system_data=system_data||jsonb_build_object('death_successes',0,'death_failures',0) where id=target.character_id;condition='Estável';
  else condition='Antitoxina (1 hora; mestre controla duração)';end if;
  if not coalesce(sheet->'conditions' ? condition,false) then update public.characters set system_data=jsonb_set(system_data,'{conditions}',coalesce(system_data->'conditions','[]')||jsonb_build_array(condition)) where id=target.character_id;end if;
 end loop;
end $$;
-- SQL_OVERRIDES

-- New private helpers remain accessible only through the authorized RPCs.
revoke all on function private.dnd_inventory_guard(),private.dnd_special_spell_guard(),private.dnd_feature_definition(jsonb,text,integer,boolean),private.dnd_weapon_traits(jsonb,jsonb),private.dnd_has_style(jsonb,text),private.dnd_weapon_effect(jsonb,jsonb,jsonb,boolean),private.dnd_weapon_base(jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.dnd_check_weapon_options(public.battle_map_tokens,jsonb,jsonb,jsonb,jsonb),private.dnd_roll_damage_parts(jsonb,jsonb),private.dnd_damage_amount(public.battle_map_tokens,jsonb,jsonb,integer,boolean,jsonb),private.dnd_attack_roll_detail(text,jsonb),private.dnd_item_special(public.battle_action_requests,jsonb) from public,anon,authenticated;
revoke all on function private.dnd_critical_expression(text) from public,anon,authenticated;
revoke all on function private.dnd_weapon_proficient(jsonb,jsonb),private.dnd_learning_guard() from public,anon,authenticated;
revoke all on function private.dnd_expanded_spell(jsonb,jsonb),private.dnd_healing_dice(jsonb,text) from public,anon,authenticated;
-- Pure metadata predicate needed by the existing SECURITY INVOKER spell trigger.
-- It reads only caller-supplied JSON and exposes no records or mutations.
grant execute on function private.dnd_expanded_spell(jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
select 'ATUALIZAÇÃO V17 CONCLUÍDA — magias, habilidades e itens atualizados. Atualize a página do site.' as resultado;

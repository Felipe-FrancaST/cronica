-- v16: backward-compatible character builds. No legacy character is rewritten.
-- New class distribution/choices live in characters.system_data; its existing
-- transactional save_character RPC and campaign RLS continue to own all writes.
create table public.dnd_character_build_rules (
 class_id text primary key references public.dnd_classes(id), data jsonb not null
);
create table public.dnd_backgrounds (
 id text primary key, name text not null, data jsonb not null
);
alter table public.dnd_character_build_rules enable row level security;
alter table public.dnd_backgrounds enable row level security;
create policy build_rules_read on public.dnd_character_build_rules for select to authenticated using(true);
create policy backgrounds_read on public.dnd_backgrounds for select to authenticated using(true);
grant select on public.dnd_character_build_rules,public.dnd_backgrounds to authenticated;

-- CATALOG_SEED

create function private.dnd_levels(s jsonb) returns jsonb language sql immutable set search_path='' as $$
 select case when jsonb_typeof(s->'class_levels')='array' and jsonb_array_length(s->'class_levels')>0 then s->'class_levels'
 else jsonb_build_array(jsonb_build_object('class_id',s->>'class_id','level',s->'level','subclass_id',coalesce(s->>'subclass_id',''))) end
$$;
create function private.dnd_class_level(s jsonb,id text) returns integer language sql immutable set search_path='' as $$
 select coalesce((select (c->>'level')::integer from jsonb_array_elements(private.dnd_levels(s)) c where c->>'class_id'=id limit 1),0)
$$;
create function private.dnd_spell_pools(s jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c jsonb; p public.dnd_spell_progression; cls public.dnd_classes; count_casters integer=0; caster_level integer=0;
 slots jsonb='[]'; single_slots jsonb='[]'; pact_slots integer=0; pact_level integer=0; arcana jsonb='[]'; sub text;
begin
 for c in select value from jsonb_array_elements(private.dnd_levels(s)) loop
  select * into cls from public.dnd_classes where id=c->>'class_id';
  sub=case when c->>'subclass_id' in('eldritch-knight','arcane-trickster') then c->>'subclass_id' else '' end;
  select * into p from public.dnd_spell_progression where class_id=cls.id and subclass_id=sub and level=(c->>'level')::integer;
  if p.class_id is null then raise exception 'Classe, nível ou opção de conjuração inválida.';end if;
  if cls.id='warlock' then pact_slots=p.pact_slots;pact_level=p.pact_level;arcana=to_jsonb(p.arcanum_levels);
  elsif jsonb_array_length(p.slots)>0 then
   count_casters=count_casters+1;single_slots=p.slots;
   caster_level=caster_level+case when sub<>'' then (c->>'level')::integer/3 when cls.data->>'caster'='half' then (c->>'level')::integer/2 when cls.data->>'caster'='artificer' then ceil((c->>'level')::numeric/2)::integer else (c->>'level')::integer end;
  end if;
 end loop;
 if count_casters=1 then slots=single_slots;
 elsif count_casters>1 then select progression.slots into slots from public.dnd_spell_progression progression where progression.class_id='wizard' and progression.subclass_id='' and progression.level=least(20,caster_level);end if;
 return jsonb_build_object('slots',coalesce(slots,'[]'),'pact_slots',pact_slots,'pact_level',pact_level,'arcanum_levels',arcana,'caster_level',caster_level);
end $$;

create function private.dnd_adjust_abilities(previous jsonb,next_sheet jsonb,abilities jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb='{}';a text;c jsonb;points jsonb;old_points integer;new_points integer;score integer;creation jsonb=next_sheet->'creation';
begin
 foreach a in array array['str','dex','con','int','wis','cha'] loop
  old_points=0;new_points=0;
  for c in select value from jsonb_array_elements(private.dnd_levels(previous)) loop for points in select value from jsonb_each(coalesce(c->'improvements','{}')) loop old_points=old_points+coalesce((points->>a)::integer,0);end loop;end loop;
  for c in select value from jsonb_array_elements(private.dnd_levels(next_sheet)) loop for points in select value from jsonb_each(coalesce(c->'improvements','{}')) loop new_points=new_points+coalesce((points->>a)::integer,0);end loop;end loop;
  if creation is not null and creation->>'method'<>'manual' then score=least(20,(creation->'base'->>a)::integer+coalesce((creation->'bonuses'->>a)::integer,0)+new_points);
  else score=(abilities->>a)::integer-old_points+new_points;
   if a in('str','con') and private.dnd_class_level(previous,'barbarian')=20 then score=score-4;end if;
  end if;
  if a in('str','con') and private.dnd_class_level(next_sheet,'barbarian')=20 then score=score+4;end if;
  result=result||jsonb_build_object(a,score);
 end loop;return result;
end $$;
create function private.dnd_feature_caps(s jsonb,abilities jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb='{}';c jsonb;l integer;id text;cha integer=greatest(1,floor((coalesce((abilities->>'cha')::numeric,10)-10)/2));cleric integer;paladin integer;
begin
 for c in select value from jsonb_array_elements(private.dnd_levels(s)) loop
  id=c->>'class_id';l=(c->>'level')::integer;
  if id='barbarian' then result=result||jsonb_build_object('barbarian:rage',case when l>=20 then 999 when l>=17 then 6 when l>=12 then 5 when l>=6 then 4 when l>=3 then 3 else 2 end);end if;
  if id='bard' then result=result||jsonb_build_object('bard:inspiration',cha);end if;
  if id='druid' and l>=2 then result=result||jsonb_build_object('druid:wild-shape',case when l>=20 then 999 else 2 end);if c->>'subclass_id'='land' then result=result||'{"druid:natural-recovery":1}';end if;end if;
  if id='fighter' then result=result||'{"fighter:second-wind":1}';if l>=2 then result=result||jsonb_build_object('fighter:action-surge',case when l>=17 then 2 else 1 end);end if;if l>=9 then result=result||jsonb_build_object('fighter:indomitable',case when l>=17 then 3 when l>=13 then 2 else 1 end);end if;end if;
  if id='monk' and l>=2 then result=result||jsonb_build_object('monk:ki',l);if c->>'subclass_id'='open-hand' and l>=6 then result=result||'{"monk:wholeness":1}';end if;end if;
  if id='sorcerer' and l>=2 then result=result||jsonb_build_object('sorcerer:points',l);end if;
  if id='paladin' then result=result||jsonb_build_object('paladin:lay-hands',5*l,'paladin:divine-sense',greatest(0,1+floor((coalesce((abilities->>'cha')::numeric,10)-10)/2)));if l>=14 then result=result||jsonb_build_object('paladin:cleansing',cha);end if;if l>=20 and c->>'subclass_id'='devotion' then result=result||'{"paladin:holy-nimbus":1}';end if;end if;
  if id='rogue' and l>=20 then result=result||'{"rogue:luck":1}';end if;
  if id='wizard' then result=result||'{"wizard:arcane-recovery":1}';end if;
  if id='warlock' and c->>'subclass_id'='fiend' then if l>=6 then result=result||'{"warlock:luck":1}';end if;if l>=14 then result=result||'{"warlock:hell":1}';end if;end if;
 end loop;
 cleric=private.dnd_class_level(s,'cleric');paladin=private.dnd_class_level(s,'paladin');
 if cleric>=2 or paladin>=3 then result=result||jsonb_build_object('shared:channel-divinity',case when cleric>=18 then 3 when cleric>=6 then 2 else 1 end);end if;
 return result;
end $$;
create function private.dnd_validate_build(s jsonb,abilities jsonb default null) returns void language plpgsql stable security definer set search_path='' as $$
declare levels jsonb=private.dnd_levels(s); c jsonb; rules jsonb; seen text[]='{}'; total integer=0; l integer; chosen_class text; sub text;
 entry record; choice jsonb; v jsonb; option jsonb; group_req jsonb; met boolean; a text; sum_points integer; points jsonb;
 creation jsonb=s->'creation'; vals integer[]; expected integer[]; rolls jsonb; r jsonb; n integer; cost integer=0; bonus integer; improvement integer; final integer;
 backgrounds jsonb; max_count integer; key text;caps jsonb;
begin
 if jsonb_typeof(levels)<>'array' or jsonb_array_length(levels)>13 then raise exception 'Distribuição de classes inválida.';end if;
 if s ? 'class_levels' and (jsonb_typeof(s->'class_levels') is distinct from 'array' or jsonb_array_length(s->'class_levels')=0) then raise exception 'Distribua ao menos um nível de classe.';end if;
 for c in select value from jsonb_array_elements(levels) loop
  chosen_class=c->>'class_id';select data into rules from public.dnd_character_build_rules where class_id=chosen_class;
  if rules is null or chosen_class=any(seen) or jsonb_typeof(c->'level') is distinct from 'number' or (c->>'level')!~'^[0-9]+$' then raise exception 'Cada classe deve aparecer uma vez, com nível inteiro.';end if;
  l=(c->>'level')::integer;if l not between 1 and 20 then raise exception 'O nível da classe deve estar entre 1 e 20.';end if;
  total=total+l;seen=array_append(seen,chosen_class);sub=coalesce(c->>'subclass_id','');
  if sub<>'' and (l<(rules->>'subclass_level')::integer or not exists(select 1 from jsonb_array_elements(rules->'paths') p where p->>'id'=sub)) then raise exception 'Caminho de classe inválido ou indisponível neste nível.';end if;
  if abilities is not null and jsonb_array_length(levels)>1 then
   for group_req in select value from jsonb_array_elements(rules->'requirements') loop
    met=false;for a in select value from jsonb_array_elements_text(group_req) loop if coalesce((abilities->>a)::integer,0)>=13 then met=true;end if;end loop;
    if not met then raise exception 'Multiclasse exige os atributos mínimos de todas as classes escolhidas.';end if;
   end loop;
  end if;
  if c ? 'choices' and jsonb_typeof(c->'choices')<>'object' then raise exception 'Escolhas de classe inválidas.';end if;
  for entry in select * from jsonb_each(coalesce(c->'choices','{}')) loop
   choice=rules->'choices'->(sub||':'||l||':'||case when cardinality(seen)=1 then 'initial' else 'multi' end)->entry.key;
   if jsonb_typeof(entry.value)<>'array' or choice is null then raise exception 'Escolha de habilidade indisponível.';end if;
   if jsonb_array_length(entry.value)>(choice->>'count')::integer or (select count(distinct x::text) from jsonb_array_elements(entry.value) x)<>jsonb_array_length(entry.value) then raise exception 'Confira a quantidade de escolhas de habilidade.';end if;
   for v in select value from jsonb_array_elements(entry.value) loop
    select o into option from jsonb_array_elements(choice->'options') o where o->'id'=v;
    if option is null or coalesce((option->>'level')::integer,0)>l or (option ? 'pact' and not coalesce(c->'choices'->'pact','[]') ? (option->>'pact')) then raise exception 'A opção de habilidade não cumpre os requisitos.';end if;
   end loop;
  end loop;
  if coalesce(c->'choices'->'style','[]') ?| array(select value from jsonb_array_elements_text(coalesce(c->'choices'->'second-style','[]'))) then raise exception 'Escolha estilos de luta diferentes.';end if;
  if c ? 'improvements' and jsonb_typeof(c->'improvements')<>'object' then raise exception 'Melhorias de atributo inválidas.';end if;
  for entry in select * from jsonb_each(coalesce(c->'improvements','{}')) loop
   if entry.key!~'^[0-9]+$' or entry.key::integer>l or not rules->'asi_levels' @> jsonb_build_array(entry.key::integer) or jsonb_typeof(entry.value)<>'object' then raise exception 'Melhoria de atributo indisponível.';end if;
   sum_points=0;for key,v in select * from jsonb_each(entry.value) loop
    if key<>all(array['str','dex','con','int','wis','cha']) or jsonb_typeof(v)<>'number' or v::text!~'^[012]$' then raise exception 'Pontos de atributo inválidos.';end if;
    sum_points=sum_points+v::integer;
   end loop;if sum_points>2 then raise exception 'Distribua no máximo 2 pontos por melhoria.';end if;
  end loop;
 end loop;
 if total<>coalesce((s->>'level')::integer,0) or total not between 1 and 20 or levels->0->>'class_id' is distinct from s->>'class_id' or coalesce(levels->0->>'subclass_id','') is distinct from coalesce(s->>'subclass_id','') then raise exception 'A soma das classes deve corresponder ao nível total e à classe inicial.';end if;
 for entry in select * from jsonb_each(coalesce(s->'hit_dice_by_class','{}')) loop
  if jsonb_typeof(entry.value)<>'number' or entry.value::text!~'^[0-9]+$' or entry.value::integer>private.dnd_class_level(s,entry.key) then raise exception 'Dados de Vida usados excedem os níveis da classe.';end if;
 end loop;
 if abilities is not null then
  caps=private.dnd_feature_caps(s,abilities);
  for entry in select * from jsonb_each(coalesce(s->'feature_uses','{}')) loop if jsonb_typeof(entry.value)<>'number' or entry.value::text!~'^[0-9]+$' or entry.value::integer>coalesce((caps->>entry.key)::integer,0) then raise exception 'Usos de habilidades excedem o limite da classe.';end if;end loop;
 end if;
 if creation is not null and creation<>'null'::jsonb then
  if jsonb_typeof(creation)<>'object' or creation->>'method' not in('standard','point-buy','rolled','manual') then raise exception 'Método de atributos inválido.';end if;
  vals='{}';foreach a in array array['str','dex','con','int','wis','cha'] loop
   if jsonb_typeof(creation->'base'->a) is distinct from 'number' or (creation->'base'->>a)!~'^[0-9]+$' then raise exception 'Atributos iniciais devem ser inteiros.';end if;
   n=(creation->'base'->>a)::integer;if n not between 1 and 30 then raise exception 'Atributo inicial inválido.';end if;vals=array_append(vals,n);
   if creation->>'method'='point-buy' then if n not between 8 and 15 then raise exception 'Compra de pontos exige atributos entre 8 e 15.';end if;cost=cost+case when n>=14 then 2*n-21 else n-8 end;end if;
   bonus=coalesce((creation->'bonuses'->>a)::integer,0);if bonus not between 0 and 2 then raise exception 'Bônus de origem inválido.';end if;
   improvement=0;for c in select value from jsonb_array_elements(levels) loop for points in select value from jsonb_each(coalesce(c->'improvements','{}')) loop improvement=improvement+coalesce((points->>a)::integer,0);end loop;end loop;
   final=least(20,n+bonus+improvement)+case when a in('str','con') and private.dnd_class_level(s,'barbarian')=20 then 4 else 0 end;
   if abilities is not null and creation->>'method'<>'manual' and final is distinct from (abilities->>a)::integer then raise exception 'Atributos finais devem corresponder à base, origem e melhorias.';end if;
  end loop;
  select array_agg(x order by x) into vals from unnest(vals) x;
  if creation->>'method'='standard' and vals<>array[8,10,12,13,14,15] then raise exception 'Distribua o conjunto padrão uma vez por atributo.';end if;
  if creation->>'method'='point-buy' and cost>27 then raise exception 'Orçamento máximo: 27 pontos.';end if;
  if creation->>'method'='rolled' then
   rolls=creation->'rolls';if jsonb_typeof(rolls) is distinct from 'array' or jsonb_array_length(rolls)<>6 then raise exception 'Registre seis rolagens de 4d6.';end if;expected='{}';
   for r in select value from jsonb_array_elements(rolls) loop
    if jsonb_typeof(r)<>'array' or jsonb_array_length(r)<>4 or exists(select 1 from jsonb_array_elements(r) x where jsonb_typeof(x)<>'number' or x::text!~'^[1-6]$') then raise exception 'Rolagem inicial inválida.';end if;
    select sum(x::integer)-min(x::integer) into n from jsonb_array_elements(r) x;expected=array_append(expected,n);
   end loop;select array_agg(x order by x) into expected from unnest(expected) x;if vals<>expected then raise exception 'Atributos devem usar os resultados das rolagens.';end if;
  end if;
  if nullif(creation->>'background_id','') is not null then
   select data into backgrounds from public.dnd_backgrounds where id=creation->>'background_id';if backgrounds is null then raise exception 'Antecedente inválido.';end if;
   if jsonb_typeof(coalesce(creation->'background_skills','[]'))<>'array' or jsonb_array_length(coalesce(creation->'background_skills','[]'))>2 then raise exception 'Escolha até duas perícias de antecedente.';end if;
   max_count=case when creation->>'background_id'='custom' then 2 else (backgrounds->>'languages')::integer+(backgrounds->>'toolChoices')::integer end;
   if jsonb_array_length(coalesce(creation->'background_languages','[]'))+jsonb_array_length(coalesce(creation->'background_tools','[]'))>max_count then raise exception 'Limite de idiomas/ferramentas excedido.';end if;
  end if;
 end if;
end $$;

create or replace function public.validate_dnd_spell_resources() returns trigger language plpgsql security invoker set search_path='' as $$
declare s jsonb=new.system_data;p jsonb;entry record;used jsonb='{}';arcana jsonb='{}';n integer;maximum integer;pact integer;race_name text;
begin
 if (select slug from public.rpg_systems where id=new.rpg_system_id) is distinct from 'dnd5e' then return new;end if;
 perform private.dnd_validate_build(s);p=private.dnd_spell_pools(s);
 if nullif(s->>'race_id','') is not null then select name into race_name from public.dnd_races where id=s->>'race_id';if race_name is null or race_name is distinct from s->>'race' then raise exception 'Confira a raça do personagem.';end if;end if;
 if jsonb_typeof(coalesce(s->'slots_used','{}'))<>'object' then raise exception 'Espaços de magia inválidos.';end if;
 for entry in select * from jsonb_each(coalesce(s->'slots_used','{}')) loop
  if entry.key!~'^[1-9]$' or jsonb_typeof(entry.value)<>'number' or entry.value::text!~'^[0-9]+$' then raise exception 'Usos de magia devem ser inteiros não negativos.';end if;
  n=entry.value::integer;maximum=coalesce((p->'slots'->>(entry.key::integer-1))::integer,0);
  -- Only legacy warlock records use slots_used as the pact counter.
  if not s ? 'class_levels' and s->>'class_id'='warlock' and entry.key::integer=(p->>'pact_level')::integer then maximum=(p->>'pact_slots')::integer;end if;
  if n>maximum then raise exception 'Os espaços usados excedem o limite da classe e nível.';end if;
  if coalesce((p->'slots'->>(entry.key::integer-1))::integer,0)>0 then used=used||jsonb_build_object(entry.key,n);end if;
 end loop;
 pact=coalesce((s->>'pact_slots_used')::integer,case when s->>'class_id'='warlock' and not s ? 'class_levels' then (s->'slots_used'->>(p->>'pact_level'))::integer end,0);
 if (s ? 'pact_slots_used' and (jsonb_typeof(s->'pact_slots_used')<>'number' or (s->>'pact_slots_used')!~'^[0-9]+$')) or pact<0 or pact>(p->>'pact_slots')::integer then raise exception 'Espaços de pacto usados excedem o limite.';end if;
 if jsonb_typeof(coalesce(s->'arcanum_used','{}'))<>'object' then raise exception 'Usos de Arcanos Místicos inválidos.';end if;
 for entry in select * from jsonb_each(coalesce(s->'arcanum_used','{}')) loop
  if entry.key!~'^[6-9]$' or jsonb_typeof(entry.value)<>'number' or entry.value::text!~'^[01]$' or not p->'arcanum_levels' @> jsonb_build_array(entry.key::integer) then raise exception 'Este Arcano Místico ainda não está disponível.';end if;
  arcana=arcana||jsonb_build_object(entry.key,entry.value);
 end loop;
 new.system_data=s||jsonb_build_object('slots_used',used,'pact_slots_used',pact,'arcanum_used',arcana);
 return new;
end $$;

create function private.dnd_build_attribute_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid; c public.characters; attrs jsonb;
begin
 if tg_table_name='characters' then cid=new.id;else cid=coalesce(new.character_id,old.character_id);end if;
 select * into c from public.characters where id=cid;if c.id is null or (select slug from public.rpg_systems where id=c.rpg_system_id)<>'dnd5e' then return null;end if;
 select jsonb_object_agg(ability,score) into attrs from public.character_attributes where character_id=cid;
 perform private.dnd_validate_build(c.system_data,attrs);return null;
end $$;
create constraint trigger dnd_build_attributes_character after insert or update on public.characters deferrable initially deferred for each row execute function private.dnd_build_attribute_guard();
create constraint trigger dnd_build_attributes_scores after insert or update or delete on public.character_attributes deferrable initially deferred for each row execute function private.dnd_build_attribute_guard();

create or replace function private.session_level_resources(p_sheet jsonb,p_level integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb=p_sheet;levels jsonb;items jsonb='[]';c jsonb;i integer;delta integer;take integer;p jsonb;slots jsonb='{}';arcana jsonb='{}';entry record;maximum integer;
begin
 if p_sheet ? 'class_levels' then
  levels=private.dnd_levels(p_sheet);delta=p_level-(p_sheet->>'level')::integer;
  if delta>=0 then levels=jsonb_set(levels,'{0,level}',to_jsonb((levels->0->>'level')::integer+delta));
  else
   take=least((levels->0->>'level')::integer-1,-delta);levels=jsonb_set(levels,'{0,level}',to_jsonb((levels->0->>'level')::integer-take));delta=delta+take;
   i=jsonb_array_length(levels)-1;while i>0 and delta<0 loop take=least((levels->i->>'level')::integer,-delta);levels=jsonb_set(levels,array[i::text,'level'],to_jsonb((levels->i->>'level')::integer-take));delta=delta+take;i=i-1;end loop;
  end if;
  for c in select value from jsonb_array_elements(levels) loop
   if (c->>'level')::integer>0 then
    if (c->>'level')::integer<(select (data->>'subclass_level')::integer from public.dnd_character_build_rules where class_id=c->>'class_id') then c=c||'{"subclass_id":""}';end if;
    c=c||jsonb_build_object('improvements',coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(c->'improvements','{}')) where key::integer<=(c->>'level')::integer),'{}'));
    -- Choices remain only if the new level still makes them available.
    select data->'choices'->(coalesce(c->>'subclass_id','')||':'||(c->>'level')||':'||case when jsonb_array_length(items)=0 then 'initial' else 'multi' end) into p from public.dnd_character_build_rules where class_id=c->>'class_id';
    c=c||jsonb_build_object('choices',coalesce((select jsonb_object_agg(key,(select coalesce(jsonb_agg(v),'[]') from (select value v from jsonb_array_elements(value) limit (p->key->>'count')::integer) x)) from jsonb_each(coalesce(c->'choices','{}')) where p ? key),'{}'));
    items=items||jsonb_build_array(c);
   end if;
  end loop;s=s||jsonb_build_object('class_levels',items,'subclass_id',coalesce(items->0->>'subclass_id',''));
 end if;
 s=s||jsonb_build_object('level',p_level);p=private.dnd_spell_pools(s);
 for entry in select * from jsonb_each(coalesce(s->'slots_used','{}')) loop maximum=coalesce((p->'slots'->>(entry.key::integer-1))::integer,0);if maximum>0 then slots=slots||jsonb_build_object(entry.key,least(entry.value::integer,maximum));end if;end loop;
 for entry in select * from jsonb_each(coalesce(s->'arcanum_used','{}')) loop if p->'arcanum_levels' @> jsonb_build_array(entry.key::integer) then arcana=arcana||jsonb_build_object(entry.key,entry.value);end if;end loop;
 return s||jsonb_build_object('slots_used',slots,'pact_slots_used',least(coalesce((s->>'pact_slots_used')::integer,0),(p->>'pact_slots')::integer),'arcanum_used',arcana,'feature_uses','{}'::jsonb,'hit_dice_by_class','{}'::jsonb);
end $$;

create or replace function private.battle_hp_max(p_sheet jsonb) returns integer language plpgsql stable security definer set search_path='' as $$
declare c jsonb;hd integer;conmod integer=floor((coalesce((p_sheet->'abilities'->>'con')::numeric,10)-10)/2);hp integer=0;first boolean=true;racial integer;
begin
 if nullif(p_sheet->>'hp_max_override','') is not null then return greatest(1,(p_sheet->>'hp_max_override')::integer);end if;
 for c in select value from jsonb_array_elements(private.dnd_levels(p_sheet)) loop
  select hit_die into hd from public.dnd_classes where id=c->>'class_id';hd=coalesce(hd,10);
  hp=hp+case when first then greatest(1,hd+conmod) else 0 end+((c->>'level')::integer-case when first then 1 else 0 end)*greatest(1,hd/2+1+conmod);
  if c->>'class_id'='sorcerer' and c->>'subclass_id'='draconic' then hp=hp+(c->>'level')::integer;end if;first=false;
 end loop;select coalesce((data->>'hp_per_level')::integer,0) into racial from public.dnd_races where name=p_sheet->>'race';
 return greatest(1,hp+coalesce(racial,0)*coalesce((p_sheet->>'level')::integer,1));
end $$;
create function private.dnd_spell_ability(s jsonb,entry jsonb) returns text language plpgsql stable security definer set search_path='' as $$
declare chosen_id text=coalesce(nullif(entry->>'class_id',''),s->>'class_id'); c jsonb; ability text;
begin
 select x into c from jsonb_array_elements(private.dnd_levels(s)) x where x->>'class_id'=chosen_id;
 select spell_ability into ability from public.dnd_classes where id=chosen_id;
 if c->>'subclass_id' in('eldritch-knight','arcane-trickster') then ability='int';end if;return ability;
end $$;
create function private.dnd_attack_count(s jsonb) returns integer language plpgsql immutable set search_path='' as $$
declare c jsonb;l integer;
begin
 l=private.dnd_class_level(s,'fighter');if l>=20 then return 4;elsif l>=11 then return 3;end if;
 for c in select value from jsonb_array_elements(private.dnd_levels(s)) loop
  if (c->>'class_id' in('fighter','barbarian','monk','paladin','ranger') and (c->>'level')::integer>=5) or (c->>'class_id'='warlock' and (c->>'level')::integer>=5 and c->'choices'->'pact' ? 'blade' and c->'choices'->'invocations' ? 'thirsting-blade') then return 2;end if;
 end loop;return 1;
end $$;
create function private.dnd_spell_inactive(s jsonb,entry jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare origin jsonb;chosen_id text=coalesce(nullif(entry->>'class_id',''),s->>'class_id');sub text;progress public.dnd_spell_progression;grants jsonb;
begin
 select c into origin from jsonb_array_elements(private.dnd_levels(s)) c where c->>'class_id'=chosen_id;
 if nullif(entry->>'granted_path','') is not null then
  if origin is null or origin->>'subclass_id' is distinct from entry->>'granted_path' then return true;end if;
  select data->'path_spells'->(coalesce(origin->>'subclass_id','')||':'||(origin->>'level')||':'||coalesce(origin->'choices'->'land'->>0,'')) into grants from public.dnd_character_build_rules where class_id=chosen_id;
  if not coalesce(grants ? (entry->>'english_name'),false) then return true;end if;
 end if;
 if entry->>'casting_mode'='bonus' then return false;end if;
 if origin is null then return true;end if;
 if entry->>'casting_mode'='arcanum' then return chosen_id<>'warlock' or not(private.dnd_spell_pools(s)->'arcanum_levels' @> jsonb_build_array((entry->>'level')::integer));end if;
 sub=case when origin->>'subclass_id' in('eldritch-knight','arcane-trickster') then origin->>'subclass_id' else '' end;
 select * into progress from public.dnd_spell_progression where class_id=chosen_id and subclass_id=sub and level=(origin->>'level')::integer;
 return progress.class_id is null or ((entry->>'level')::integer=0 and progress.cantrips=0) or (entry->>'level')::integer>jsonb_array_length(progress.slots);
end $$;
create function private.dnd_spell_bonus(s jsonb,entry jsonb,e jsonb,cast_level integer) returns integer language plpgsql immutable set search_path='' as $$
declare bonus integer=0;c jsonb;origin text=coalesce(nullif(entry->>'class_id',''),s->>'class_id');
begin
 for c in select value from jsonb_array_elements(private.dnd_levels(s)) loop
  if e->>'kind'='healing' and (entry->>'level')::integer>0 and c->>'class_id'='cleric' and c->>'subclass_id'='life' then bonus=bonus+2+cast_level;end if;
  if e->>'kind'='damage' and origin='wizard' and entry->>'school'='Evocação' and c->>'class_id'='wizard' and c->>'subclass_id'='evocation' and (c->>'level')::integer>=10 then bonus=bonus+floor(((s->'abilities'->>'int')::numeric-10)/2)::integer;end if;
  if e->>'kind'='damage' and origin='sorcerer' and c->>'class_id'='sorcerer' and c->>'subclass_id'='draconic' and (c->>'level')::integer>=6 and nullif(e->>'damageType','') is not null and lower(c->'choices'->'dragon'->>0) like '%'||lower(e->>'damageType')||'%' then bonus=bonus+floor(((s->'abilities'->>'cha')::numeric-10)/2)::integer;end if;
 end loop;return bonus;
end $$;
create or replace function private.battle_check_resource(t public.battle_map_tokens,entry jsonb,rkind text,rlevel integer) returns void language plpgsql security definer set search_path='' as $$
declare s jsonb=private.battle_sheet(t.id);p jsonb;l integer=coalesce((entry->>'level')::integer,0);used integer;maximum integer;origin jsonb;own_progress public.dnd_spell_progression;sub text;
begin
 if t.npc_id is not null then return;end if;p=private.dnd_spell_pools(s);
 if private.dnd_spell_inactive(s,entry) then raise exception 'Esta magia está indisponível na progressão atual.';end if;
 if coalesce(entry->>'casting_mode','class') not in('bonus','arcanum') then
  select c into origin from jsonb_array_elements(private.dnd_levels(s)) c where c->>'class_id'=coalesce(nullif(entry->>'class_id',''),s->>'class_id');
  sub=case when origin->>'subclass_id' in('eldritch-knight','arcane-trickster') then origin->>'subclass_id' else '' end;
  select * into own_progress from public.dnd_spell_progression where class_id=origin->>'class_id' and subclass_id=sub and level=(origin->>'level')::integer;
  if origin is null or l>jsonb_array_length(own_progress.slots) then raise exception 'Esta classe ainda não pode conjurar esse círculo de magia.';end if;
 end if;
 if l=0 then if rkind<>'cantrip' or rlevel<>0 then raise exception 'Truques não gastam espaços.';end if;return;end if;
 if not coalesce((entry->>'prepared')::boolean,false) and not coalesce((entry->>'always_prepared')::boolean,false) and coalesce(entry->>'casting_mode','')<>'arcanum' then raise exception 'Prepare ou marque a magia como conhecida antes de conjurar.';end if;
 if rlevel<l then raise exception 'O círculo escolhido é inferior ao da magia.';end if;
 if rkind='slot' and coalesce(entry->>'casting_mode','class')<>'arcanum' then maximum=coalesce((p->'slots'->>(rlevel-1))::integer,0);used=coalesce((s->'slots_used'->>rlevel::text)::integer,0);
 elsif rkind='pact' and rlevel=(p->>'pact_level')::integer and coalesce(entry->>'casting_mode','class')<>'arcanum' then maximum=(p->>'pact_slots')::integer;used=coalesce((s->>'pact_slots_used')::integer,0);
 elsif rkind='arcanum' and entry->>'casting_mode'='arcanum' and rlevel=l and p->'arcanum_levels' @> jsonb_build_array(l) then maximum=1;used=coalesce((s->'arcanum_used'->>l::text)::integer,0);
 else raise exception 'Recurso de conjuração incompatível com a classe.';end if;
 if coalesce(maximum,0)<=coalesce(used,0) then raise exception 'Não há espaços ou usos disponíveis para esta magia.';end if;
end $$;

-- RPC_OVERRIDES

-- Preserve the existing casting-view columns while exposing the shared pools
-- and the complete distribution. Per-class learning uses that class's level.
create or replace view public.dnd_character_casting with (security_invoker=true) as
select c.id as character_id,c.owner_id,c.campaign_id,p.class_id,p.subclass_id,p.level,
 pools.data->'slots' as spell_slots,c.system_data->'slots_used' as slots_used,
 (pools.data->>'pact_slots')::smallint as pact_slots,(pools.data->>'pact_level')::smallint as pact_level,
 coalesce((c.system_data->>'pact_slots_used')::integer,0) as pact_slots_used,
 array(select value::smallint from jsonb_array_elements_text(pools.data->'arcanum_levels')) as arcanum_levels,
 c.system_data->'arcanum_used' as arcanum_used,p.cantrips,p.spells_known,p.prepared_formula,
 (c.system_data->>'level')::integer as total_level,private.dnd_levels(c.system_data) as class_levels
from public.characters c
join public.dnd_spell_progression p on p.class_id=c.system_data->>'class_id'
 and p.subclass_id=case when c.system_data->>'subclass_id' in('eldritch-knight','arcane-trickster') then c.system_data->>'subclass_id' else '' end
 and p.level=private.dnd_class_level(c.system_data,c.system_data->>'class_id')
join public.rpg_systems r on r.id=c.rpg_system_id and r.slug='dnd5e'
cross join lateral (select private.dnd_spell_pools(c.system_data) as data) pools;

revoke all on function private.dnd_levels(jsonb),private.dnd_class_level(jsonb,text),private.dnd_spell_pools(jsonb),private.dnd_validate_build(jsonb,jsonb),private.dnd_build_attribute_guard(),private.dnd_spell_ability(jsonb,jsonb),private.dnd_attack_count(jsonb) from public,anon,authenticated;
grant execute on function private.dnd_levels(jsonb),private.dnd_class_level(jsonb,text),private.dnd_spell_pools(jsonb),private.dnd_validate_build(jsonb,jsonb) to authenticated;
revoke all on function private.dnd_spell_inactive(jsonb,jsonb) from public,anon;
grant execute on function private.dnd_spell_inactive(jsonb,jsonb) to authenticated;

-- Private helpers run only inside the authenticated RPCs below.
create or replace function private.dnd37_training(s jsonb,expertise boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb=coalesce(s->'skills','{}');id text;c jsonb;choice record;rules jsonb;race text;
begin
 foreach id in array array(select value from jsonb_array_elements_text(coalesce(s->'creation'->'class_skills','[]')||coalesce(s->'creation'->'background_skills','[]')||coalesce(s->'creation'->'race_skills','[]'))) loop
  result=result||jsonb_build_object(id,greatest(1,coalesce((result->>id)::integer,0)));
 end loop;
 select r.id into race from public.dnd_races r where r.name=s->>'race';
 if race in('elfo','alto-elfo','elfo-da-floresta','drow') then result=result||jsonb_build_object('perception',greatest(1,coalesce((result->>'perception')::integer,0)));end if;
 if race='meio-orc' then result=result||jsonb_build_object('intimidation',greatest(1,coalesce((result->>'intimidation')::integer,0)));end if;
 for c in select value from jsonb_array_elements(private.dnd_levels(s)) with ordinality x(value,n) loop
  select data->'choices'->(coalesce(c->>'subclass_id','')||':'||(c->>'level')||':'||case when c=private.dnd_levels(s)->0 then 'initial' else 'multi' end) into rules from public.dnd_character_build_rules where class_id=c->>'class_id';
  for choice in select * from jsonb_each(coalesce(rules,'{}')) loop
   if coalesce((choice.value->>'skills')::boolean,false) or expertise and coalesce((choice.value->>'expertise')::boolean,false) then
    for id in select value from jsonb_array_elements_text(coalesce(c->'choices'->choice.key,'[]')) loop
     result=result||jsonb_build_object(id,greatest(case when coalesce((choice.value->>'expertise')::boolean,false) then 2 else 1 end,coalesce((result->>id)::integer,0)));
    end loop;
   end if;
  end loop;
  if c->>'class_id'='warlock' and (c->>'level')::integer>=2 and coalesce(c->'choices'->'invocations','[]') ? 'beguiling' then
   result=result||jsonb_build_object('deception',greatest(1,coalesce((result->>'deception')::integer,0)),'persuasion',greatest(1,coalesce((result->>'persuasion')::integer,0)));
  end if;
 end loop;
 return result;
end $$;

create or replace function private.dnd37_validate_sheet(p_character uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s jsonb;c jsonb;p public.dnd_spell_progression;sp jsonb;entry record;rules jsonb;training jsonb;skill_id text;origin text;sub text;ability text;prepared integer;maximum integer;outside integer;schools text[];racial jsonb;race text;has_hand boolean;
begin
 select system_data||jsonb_build_object('abilities',coalesce((select jsonb_object_agg(ca.ability,ca.score) from public.character_attributes ca where ca.character_id=p_character),'{}'),'skills',coalesce((select jsonb_object_agg(cs.skill,cs.proficiency) from public.character_skills cs where cs.character_id=p_character),'{}')) into s from public.characters where id=p_character;
 if s is null then return;end if;
 for entry in select * from jsonb_each(coalesce(s->'skills','{}')) loop
  if entry.key<>all(array['acrobatics','animal_handling','arcana','athletics','deception','history','insight','intimidation','investigation','medicine','nature','perception','performance','persuasion','religion','sleight_of_hand','stealth','survival']) or entry.value::text not in('0','1','2') then raise exception 'Treinamento de perícia inválido.';end if;
 end loop;
 racial=coalesce(s->'creation'->'race_skills','[]');select r.id into race from public.dnd_races r where r.name=s->>'race';
 if jsonb_typeof(racial)<>'array' or jsonb_array_length(racial)>(case when race='meio-elfo' then 2 else 0 end) or (select count(distinct value) from jsonb_array_elements_text(racial))<>jsonb_array_length(racial) then raise exception 'Confira as perícias concedidas pela raça.';end if;
 for skill_id in select value from jsonb_array_elements_text(racial) loop
  if skill_id<>all(array['acrobatics','animal_handling','arcana','athletics','deception','history','insight','intimidation','investigation','medicine','nature','perception','performance','persuasion','religion','sleight_of_hand','stealth','survival']) then raise exception 'Perícia racial inválida.';end if;
 end loop;
 training=private.dnd37_training(s,false);
 for c in select value from jsonb_array_elements(private.dnd_levels(s)) loop
  select data->'choices'->(coalesce(c->>'subclass_id','')||':'||(c->>'level')||':'||case when c=private.dnd_levels(s)->0 then 'initial' else 'multi' end) into rules from public.dnd_character_build_rules where class_id=c->>'class_id';
  for entry in select * from jsonb_each(coalesce(rules,'{}')) loop
   if coalesce((entry.value->>'expertise')::boolean,false) and not coalesce((entry.value->>'skills')::boolean,false) then
    for skill_id in select value from jsonb_array_elements_text(coalesce(c->'choices'->entry.key,'[]')) loop
     if skill_id<>'thieves-tools' and coalesce((training->>skill_id)::integer,0)=0 then raise exception 'Especialização exige proficiência prévia na perícia.';end if;
    end loop;
   end if;
  end loop;
  origin=c->>'class_id';sub=case when c->>'subclass_id' in('eldritch-knight','arcane-trickster') then c->>'subclass_id' else '' end;
  select * into p from public.dnd_spell_progression where class_id=origin and subclass_id=sub and level=(c->>'level')::integer;
  if p.class_id is null then continue;end if;
  select case when sub<>'' then 'int' else spell_ability end into ability from public.dnd_classes where id=origin;
  maximum=case when jsonb_array_length(p.slots)>0 and (select learning='prepared' from public.dnd_classes where id=origin) then greatest(1,case when origin in('paladin','artificer') then (c->>'level')::integer/2 else (c->>'level')::integer end+floor((coalesce((s->'abilities'->>ability)::numeric,10)-10)/2)::integer) else null end;
  prepared=0;outside=0;has_hand=false;
  schools=case when origin='fighter' then array['Abjuração','Evocação'] else array['Encantamento','Ilusão'] end;
  for sp in select data from public.character_spells where character_id=p_character loop
   if coalesce(nullif(sp->>'class_id',''),s->>'class_id')<>origin or private.dnd_spell_inactive(s,sp) then continue;end if;
   if sp->>'catalog_id'='maos-magicas' then has_hand=true;end if;
   if (sp->>'level')::integer>0 and coalesce(sp->>'casting_mode','')<>'arcanum' and (coalesce((sp->>'prepared')::boolean,false) or coalesce((sp->>'always_prepared')::boolean,false)) and not(nullif(sp->>'granted_path','') is not null and coalesce((sp->>'always_prepared')::boolean,false)) then prepared=prepared+1;end if;
   if sub<>'' and (sp->>'level')::integer>0 and nullif(sp->>'granted_path','') is null and nullif(sp->>'granted_feature','') is null and coalesce(sp->>'school','')<>all(schools) then outside=outside+1;end if;
  end loop;
  if maximum is not null and prepared>maximum then raise exception 'Prepare até % magias da classe %. Truques e concessões da especialização são adicionais.',maximum,origin;end if;
  if sub<>'' and outside>(1+case when (c->>'level')::integer>=8 then 1 else 0 end+case when (c->>'level')::integer>=14 then 1 else 0 end+case when (c->>'level')::integer>=20 then 1 else 0 end) then raise exception 'O limite de magias de outras escolas desta especialização foi excedido.';end if;
  if sub='arcane-trickster' and not has_hand and (select count(*) from public.character_spells where character_id=p_character and (data->>'level')::integer=0 and coalesce(nullif(data->>'class_id',''),s->>'class_id')=origin and nullif(data->>'granted_feature','') is null and not private.dnd_spell_inactive(s,data))>=p.cantrips then raise exception 'Trapaceiro Arcano: Mãos Mágicas ocupa uma das escolhas de truque.';end if;
 end loop;
end $$;
create or replace function private.dnd37_sheet_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='characters' then
  if tg_op='UPDATE' and (new.system_data->'class_id',new.system_data->'level',new.system_data->'subclass_id',new.system_data->'class_levels',new.system_data->'creation',new.system_data->'skills') is not distinct from (old.system_data->'class_id',old.system_data->'level',old.system_data->'subclass_id',old.system_data->'class_levels',old.system_data->'creation',old.system_data->'skills') then return null;end if;
  perform private.dnd37_validate_sheet(new.id);
 elsif tg_op='DELETE' then perform private.dnd37_validate_sheet(old.character_id);
 else perform private.dnd37_validate_sheet(new.character_id);end if;
 return null;
end $$;
drop trigger if exists dnd37_sheet_character on public.characters;
create constraint trigger dnd37_sheet_character after insert or update on public.characters deferrable initially deferred for each row execute function private.dnd37_sheet_guard();
drop trigger if exists dnd37_sheet_scores on public.character_attributes;
create constraint trigger dnd37_sheet_scores after insert or update or delete on public.character_attributes deferrable initially deferred for each row execute function private.dnd37_sheet_guard();
drop trigger if exists dnd37_sheet_spells on public.character_spells;
create constraint trigger dnd37_sheet_spells after insert or update or delete on public.character_spells deferrable initially deferred for each row execute function private.dnd37_sheet_guard();

create table if not exists public.battle_decisions (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
 session_id uuid not null references public.battle_sessions(id) on delete cascade,
 request_id uuid not null references public.battle_action_requests(id) on delete cascade,
 token_id uuid not null references public.battle_map_tokens(id) on delete cascade,
 kind text not null check(kind in('attack','save','damage','concentration','choice')),
 sequence integer not null default 0, label text not null,
 ability text, dc integer, modifier integer not null default 0,
 mode text not null default 'normal' check(mode in('normal','advantage','disadvantage')),
 status text not null default 'pending' check(status in('pending','answered','cancelled')),
 options jsonb not null default '{}', result jsonb not null default '{}',
 answered_by uuid references public.profiles(id) on delete set null,client_id uuid,
 created_at timestamptz not null default now(), answered_at timestamptz,
 unique(request_id,kind,token_id,sequence)
);
create index if not exists battle_decisions_pending on public.battle_decisions(campaign_id,session_id,created_at) where status='pending';
create unique index if not exists battle_decisions_client on public.battle_decisions(answered_by,client_id) where client_id is not null;
alter table public.battle_decisions enable row level security;
drop policy if exists battle_decisions_read on public.battle_decisions;
create policy battle_decisions_read on public.battle_decisions for select to authenticated using(private.can_read_campaign(campaign_id) and private.can_control_battle_token(token_id));
revoke all on public.battle_decisions from public,anon,authenticated;
grant select on public.battle_decisions to authenticated;
create table if not exists private.battle_guides (
 request_id uuid primary key references public.battle_action_requests(id) on delete cascade,
 phase text not null, definition jsonb not null, target_ids uuid[] not null, options jsonb not null default '{}',
 approved_by uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
revoke all on private.battle_guides from public,anon,authenticated;

create or replace function private.dnd37_save_bonus(p_token uuid,p_ability text) returns integer
language plpgsql stable security definer set search_path='' as $$
declare s jsonb=private.battle_sheet(p_token);base jsonb;bonus integer;prof integer;trained boolean;
begin
 bonus=floor((coalesce((s->'abilities'->>p_ability)::numeric,10)-10)/2);if s->>'class_id'='npc' then return bonus;end if;
 select data->'saves' into base from public.dnd_classes where id=s->>'class_id';
 prof=2+((s->>'level')::integer-1)/4;
 trained=coalesce(base ? p_ability,false) or (s->'saves' is distinct from '["str","con"]'::jsonb or s->>'class_id'='fighter') and coalesce(s->'saves' ? p_ability,false) or private.dnd_class_level(s,'monk')>=14 or p_ability='wis' and private.dnd_class_level(s,'rogue')>=15;
 if trained then bonus=bonus+prof;end if;
 if private.dnd_class_level(s,'paladin')>=6 and (s->>'hp_current')::integer>0 and not coalesce(s->'conditions' ? 'Inconsciente',false) then bonus=bonus+greatest(1,floor(((s->'abilities'->>'cha')::numeric-10)/2)::integer);end if;
 return bonus;
end $$;
create or replace function private.dnd37_armor(p_token uuid) returns integer
language plpgsql stable security definer set search_path='' as $$
declare s jsonb=private.battle_sheet(p_token);armor jsonb;shield jsonb;race jsonb;natural_armor jsonb;defense jsonb;ac integer;dex integer;extra integer=0;
begin
 if s->>'class_id'='npc' then return (select ns.ac from public.npc_stats ns where ns.npc_id=(select npc_id from public.battle_map_tokens where id=p_token));end if;
 dex=floor(((s->'abilities'->>'dex')::numeric-10)/2);select data into race from public.dnd_races where name=s->>'race';natural_armor=race->'natural_armor';
 select value into armor from jsonb_array_elements(coalesce(s->'inventory','[]')) where value->>'category'='armor' and value->>'armor_type'<>'shield' and (value->>'quantity')::integer>0 and coalesce((value->>'equipped')::boolean,false) limit 1;
 select value into shield from jsonb_array_elements(coalesce(s->'inventory','[]')) where value->>'armor_type'='shield' and (value->>'quantity')::integer>0 and coalesce((value->>'equipped')::boolean,false) limit 1;
 if natural_armor->>'when'='shell' then armor=null;end if;
 ac=10+dex;
 if armor is not null then ac=coalesce((armor->>'armor_base')::integer,10)+case armor->>'armor_type' when 'heavy' then 0 when 'medium' then least(2,dex) else dex end;
 else
  select value into defense from jsonb_array_elements(private.dnd_levels(s)) where value->>'class_id' in('barbarian','monk') limit 1;
  if defense->>'class_id'='barbarian' then ac=ac+floor(((s->'abilities'->>'con')::numeric-10)/2);elsif defense->>'class_id'='monk' and shield is null then ac=ac+floor(((s->'abilities'->>'wis')::numeric-10)/2);end if;
  if exists(select 1 from jsonb_array_elements(private.dnd_levels(s)) c where c->>'class_id'='sorcerer' and c->>'subclass_id'='draconic') then ac=greatest(ac,13+dex);end if;
 end if;
 if armor is not null and private.dnd_has_style(s,'defense') then ac=ac+1;end if;
 if natural_armor is not null and (armor is null or natural_armor->>'when'<>'unarmored') then ac=greatest(ac,(natural_armor->>'base')::integer+case when nullif(natural_armor->>'ability','') is null then 0 else floor(((s->'abilities'->>(natural_armor->>'ability'))::numeric-10)/2)::integer end);end if;
 return ac+case when shield is null then 0 else coalesce((shield->>'armor_base')::integer,2) end+coalesce((s->>'ac_bonus')::integer,0)+coalesce((race->>'armor_bonus')::integer,0)+private.campaign_item_bonus(s,'ac')::integer;
end $$;

create or replace function private.battle37_add_decision(q public.battle_action_requests,p_token uuid,p_kind text,p_sequence integer,p_label text,p_ability text default null,p_dc integer default null,p_modifier integer default 0,p_mode text default 'normal',p_options jsonb default '{}') returns void
language sql security definer set search_path='' as $$
 insert into public.battle_decisions(campaign_id,session_id,request_id,token_id,kind,sequence,label,ability,dc,modifier,mode,options)
 values(q.campaign_id,q.session_id,q.id,p_token,p_kind,p_sequence,p_label,p_ability,p_dc,p_modifier,p_mode,p_options)
 on conflict(request_id,kind,token_id,sequence) do nothing
$$;

create or replace function private.battle37_target_range(a public.battle_map_tokens,t public.battle_map_tokens,m public.battle_maps) returns numeric
language sql stable set search_path='' as $$
 select private.battle_target_range(a,jsonb_build_object('x',greatest(t.x,least(a.x,t.x+t.size-1)),'y',greatest(t.y,least(a.y,t.y+t.size-1))),m)
$$;
create or replace function private.battle37_attack_mode(a public.battle_map_tokens,t public.battle_map_tokens,m public.battle_maps) returns text
language plpgsql stable security definer set search_path='' as $$
declare actor_conditions jsonb=coalesce(private.battle_sheet(a.id)->'conditions','[]');target_conditions jsonb=coalesce(private.battle_sheet(t.id)->'conditions','[]');adv boolean;dis boolean;distance numeric=private.battle37_target_range(a,t,m);
begin
 adv=target_conditions ?| array['Cego','Impedido','Paralisado','Petrificado','Atordoado','Inconsciente'] or actor_conditions ? 'Invisível' or distance<=1.50001 and target_conditions ? 'Caído';
 dis=actor_conditions ?| array['Cego','Envenenado','Impedido','Caído'] or target_conditions ? 'Invisível' or distance>1.50001 and target_conditions ? 'Caído' or t.dodging and not(actor_conditions ? 'Invisível') and not(target_conditions ?| array['Cego','Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado']);
 return case when adv=dis then 'normal' when adv then 'advantage' else 'disadvantage' end;
end $$;

create or replace function private.battle37_next(p_request uuid) returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests;g private.battle_guides;a public.battle_map_tokens;t public.battle_map_tokens;m public.battle_maps;s jsonb;e jsonb;entry jsonb;ability text;dc integer;bonus integer;count_attacks integer;target_id uuid;ids uuid[];i integer;mode text;
begin
 select * into q from public.battle_action_requests where id=p_request for update;
 select * into g from private.battle_guides where request_id=q.id for update;
 if q.status<>'pending' or g.request_id is null then return q;end if;
 if exists(select 1 from public.battle_decisions where request_id=q.id and status='pending') then return q;end if;
 select * into a from public.battle_map_tokens where id=q.token_id;select * into m from public.battle_maps where id=q.map_id;
 e=g.definition;s=private.battle_sheet(a.id);
 if g.phase='choice' then
  if exists(select 1 from public.battle_decisions where request_id=q.id and kind='choice' and result->>'choice'='cancel') then
   update public.battle_action_requests set status='cancelled',resolution=jsonb_build_object('guided',true,'message','Conjuração cancelada antes de gastar recursos.'),resolved_at=now() where id=q.id returning * into q;
   return q;
  end if;
  update public.battle_spell_effects set active=false where token_id=q.token_id and concentration and active;
  update public.battle_action_requests set resolution=resolution||'{"checks_started":true}'::jsonb where id=q.id;
  update private.battle_guides set phase='checks' where request_id=q.id;g.phase='checks';
 end if;
 if g.phase='checks' then
  if q.kind in('weapon','opportunity') or coalesce((e->>'attackRoll')::boolean,false) then
   count_attacks=coalesce((e->>'attackCount')::integer,1);
   bonus=coalesce((e->>'attackBonus')::integer,(g.options->>'attack_bonus')::integer);
   if bonus is null and q.kind='spell' and a.character_id is not null then
    ability=private.dnd_spell_ability(s,e->'entry');bonus=2+((s->>'level')::integer-1)/4+floor(((s->'abilities'->>ability)::numeric-10)/2)::integer;
   end if;
   if bonus is null then raise exception 'Informe o bônus de ataque deste NPC ou efeito personalizado.';end if;
   for i in 1..count_attacks loop
    target_id=coalesce((e->'attackTargets'->>(i-1))::uuid,g.target_ids[1+(i-1)%greatest(1,cardinality(g.target_ids))]);
    if target_id is null then raise exception 'Escolha uma criatura para cada ataque.';end if;
    select * into t from public.battle_map_tokens where id=target_id;
    mode=coalesce(g.options->>'attack_mode',private.battle37_attack_mode(a,t,m));
    -- Dodge only imposes disadvantage on attacks the defender can see. The GM confirms this in the review.
    perform private.battle37_add_decision(q,a.id,'attack',i,q.name||case when count_attacks>1 then ' · raio '||i||'/'||count_attacks else ' · ataque' end,null,null,bonus,mode,jsonb_build_object('target_id',case when private.can_read_battle_token(target_id) then target_id else null end,'critical_at',coalesce((e->>'criticalAt')::integer,20)));
   end loop;
   update private.battle_guides set phase='attacks' where request_id=q.id;
  elsif nullif(e->>'save','') is not null then
   ability=case upper(e->>'save') when 'FOR' then 'str' when 'STR' then 'str' when 'DES' then 'dex' when 'DEX' then 'dex' when 'CON' then 'con' when 'INT' then 'int' when 'SAB' then 'wis' when 'WIS' then 'wis' when 'CAR' then 'cha' when 'CHA' then 'cha' else null end;
   if ability is null then raise exception 'Atributo da salvaguarda inválido.';end if;
   dc=coalesce((e->>'save_dc')::integer,(g.options->>'dc')::integer);
   if dc is null and q.kind='spell' and a.character_id is not null then
    entry=private.battle_sheet(a.id);dc=8+2+((entry->>'level')::integer-1)/4+floor(((entry->'abilities'->>private.dnd_spell_ability(entry,e->'entry'))::numeric-10)/2)::integer;
   end if;
   if dc is null or dc not between 1 and 40 then raise exception 'Informe uma CD de salvaguarda de 1 a 40 para este efeito.';end if;
   for t in select * from public.battle_map_tokens where id=any(g.target_ids) order by id loop
    bonus=private.dnd37_save_bonus(t.id,ability);
    if t.npc_id is not null then bonus=coalesce((g.options->'save_bonuses'->>t.id::text)::integer,bonus);end if;
    mode=coalesce(g.options->'save_modes'->>t.id::text,'normal');
    if not coalesce(g.options->'save_modes','{}') ? t.id::text then
     if ability='str' and t.raging then mode='advantage';end if;
     if ability='dex' then
      if t.dodging and not coalesce(private.battle_sheet(t.id)->'conditions','[]') ?| array['Cego','Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado'] then mode='advantage';end if;
      if coalesce(private.battle_sheet(t.id)->'conditions','[]') ? 'Impedido' then mode=case when mode='advantage' then 'normal' else 'disadvantage' end;end if;
     end if;
    end if;
    perform private.battle37_add_decision(q,t.id,'save',0,q.name||' · salvaguarda',ability,dc,bonus,mode,jsonb_build_object('half_on_save',coalesce((e->>'halfOnSave')::boolean,false)));
   end loop;
   update private.battle_guides set phase='saves' where request_id=q.id;
  else
   update private.battle_guides set phase='damage' where request_id=q.id;
   if e->>'kind' in('damage','healing','temporary') and coalesce(e->>'dice','')<>'' and (coalesce(e->>'timing','immediate')='immediate' or coalesce((g.options->>'apply_now')::boolean,false)) then
    perform private.battle37_add_decision(q,a.id,'damage',0,q.name||case e->>'kind' when 'healing' then ' · cura' when 'temporary' then ' · PV temporários' else ' · dano' end,null,null,0,'normal',jsonb_build_object('dice',e->>'dice'));
   else
    q=private.battle_resolve_guided_core(q.id,true,g.options||jsonb_build_object('guided',true,'dice','0'));
    update public.battle_action_requests set resolution=resolution||jsonb_build_object('guided',true,'message',case when e->>'kind'='utility' then 'Ação concluída. O mestre acompanha as condições e os efeitos descritos.' else 'Efeito persistente criado. O mestre aplica os gatilhos da descrição.' end) where id=q.id returning * into q;
   end if;
  end if;
  return q;
 end if;
 if g.phase='attacks' and not exists(select 1 from public.battle_decisions where request_id=q.id and kind='attack' and coalesce((result->>'hit')::boolean,false)) then
  q=private.battle_resolve_guided_core(q.id,false,g.options||'{"guided":true}'::jsonb);
  update public.battle_action_requests set resolution=resolution||'{"guided":true,"message":"O ataque não acertou. A ação e a munição foram utilizadas; recursos de dano no acerto foram preservados."}'::jsonb where id=q.id returning * into q;
 elsif g.phase in('attacks','saves') then
  update private.battle_guides set phase='damage' where request_id=q.id;
  if e->>'kind' in('damage','healing','temporary') and coalesce(e->>'dice','')<>'' and (coalesce(e->>'timing','immediate')='immediate' or coalesce((g.options->>'apply_now')::boolean,false)) then
   perform private.battle37_add_decision(q,a.id,'damage',0,q.name||' · aplicar efeito',null,null,0,'normal',jsonb_build_object('dice',e->>'dice','separate_attacks',g.phase='attacks'));
  else
   q=private.battle_resolve_guided_core(q.id,true,g.options||jsonb_build_object('guided',true,'dice','0'));
   update public.battle_action_requests set resolution=resolution||'{"guided":true,"message":"Testes concluídos. O mestre aplica as condições e acompanha a duração da descrição."}'::jsonb where id=q.id returning * into q;
  end if;
 end if;
 return q;
end $$;

create or replace function public.guide_battle_action(p_request_id uuid,p_options jsonb default '{}') returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests;bs public.battle_sessions;a public.battle_map_tokens;m public.battle_maps;e jsonb;ids uuid[];options jsonb=coalesce(p_options,'{}');has_concentration boolean;v jsonb;
begin
 select * into q from public.battle_action_requests where id=p_request_id;
 if q.id is null or not private.is_campaign_owner(q.campaign_id) or not private.can_read_campaign(q.campaign_id) then raise exception 'Somente o mestre pode autorizar a resolução guiada.' using errcode='42501';end if;
 select * into bs from public.battle_sessions where id=q.session_id for update;perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into q from public.battle_action_requests where id=q.id for update;
 if q.status<>'pending' or exists(select 1 from private.battle_guides where request_id=q.id) then return q;end if;
 if bs.status<>'active' or bs.round<>q.round or bs.turn_index<>q.turn_index or bs.turn_started_at is distinct from q.turn_started_at then raise exception 'O turno desta tentativa já terminou.';end if;
 if q.kind='opportunity' then raise exception 'Resolva a reação de oportunidade pelo painel de reações.';end if;
 select * into a from public.battle_map_tokens where id=q.token_id for update;select * into m from public.battle_maps where id=q.map_id;e=q.definition;
 if options ? 'dc' and (jsonb_typeof(options->'dc')<>'number' or (options->>'dc')::numeric<>floor((options->>'dc')::numeric) or (options->>'dc')::integer not between 1 and 40) then raise exception 'CD inválida.';end if;
 if options ? 'attack_bonus' and (jsonb_typeof(options->'attack_bonus')<>'number' or abs((options->>'attack_bonus')::numeric)>50 or (options->>'attack_bonus')::numeric<>floor((options->>'attack_bonus')::numeric)) then raise exception 'Bônus de ataque inválido.';end if;
 if coalesce(options->>'attack_mode','normal') not in('normal','advantage','disadvantage') then raise exception 'Modo de ataque inválido.';end if;
 for v in select value from jsonb_each(coalesce(options->'save_modes','{}')) loop if v#>>'{}' not in('normal','advantage','disadvantage') then raise exception 'Modo de salvaguarda inválido.';end if;end loop;
 for v in select value from jsonb_each(coalesce(options->'save_bonuses','{}')) loop if jsonb_typeof(v)<>'number' or abs(v::numeric)>50 or v::numeric<>floor(v::numeric) then raise exception 'Bônus de salvaguarda inválido.';end if;end loop;
 if options ? 'damageType' then
  if length(options->>'damageType')>40 then raise exception 'Tipo de dano inválido.';end if;
  e=e||jsonb_build_object('damageType',options->>'damageType');
 end if;
 -- Only the GM can narrow an area, e.g. sculpt spells. The server verifies every target's footprint.
 select array_agg(t.id order by t.id) into ids from public.battle_map_tokens t where t.map_id=q.map_id and
  (case when e->>'shape'='single' or coalesce((e->>'selective')::boolean,false) then t.id=any(q.target_ids)
   else private.battle_in_effect(t,a,q.target,e,m.scale_per_cell*case when m.scale_unit='ft' then 0.3 else 1 end) end);
 ids=coalesce(ids,'{}');
 if options ? 'target_ids' then
  if jsonb_typeof(options->'target_ids')<>'array' or exists(select 1 from jsonb_array_elements_text(options->'target_ids') x where not x::uuid=any(ids)) then raise exception 'Um dos alvos está fora da área original.';end if;
  ids=array(select distinct value::uuid from jsonb_array_elements_text(options->'target_ids'));
 end if;
 if cardinality(ids)>200 then raise exception 'O efeito excede 200 criaturas.';end if;
 select exists(select 1 from public.battle_spell_effects where token_id=a.id and active and concentration) into has_concentration;
 insert into private.battle_guides(request_id,phase,definition,target_ids,options,approved_by)
 values(q.id,case when coalesce((e->>'concentration')::boolean,false) and has_concentration then 'choice' else 'checks' end,e,ids,options-'dice'-'targets'-'critical'-'geometry'-'kind'-'defer_player_roll'-'target_ids',auth.uid());
 update public.battle_action_requests set resolution=jsonb_build_object('guided',true,'message','Resolução guiada autorizada. Aguardando as escolhas e rolagens dos participantes.') where id=q.id returning * into q;
 if coalesce((e->>'concentration')::boolean,false) and has_concentration then
  perform private.battle37_add_decision(q,a.id,'choice',0,'Trocar a concentração?',null,null,0,'normal',jsonb_build_object('choices',jsonb_build_array(jsonb_build_object('id','continue','label','Conjurar e encerrar a concentração anterior'),jsonb_build_object('id','cancel','label','Cancelar e manter a concentração atual'))));
 else q=private.battle37_next(q.id);end if;
 return q;
end $$;

create or replace function private.battle37_critical(e jsonb,s jsonb,p_weapon boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare expression text=e->>'dice';parts jsonb='[]';part jsonb;barbarian integer=private.dnd_class_level(s,'barbarian');extra integer=0;
begin
 if p_weapon and not coalesce((private.dnd_weapon_traits(e->'entry',s)->>'ranged')::boolean,false) then extra=case when barbarian>=17 then 3 when barbarian>=13 then 2 when barbarian>=9 then 1 else 0 end;end if;
 for part in select value from jsonb_array_elements(coalesce(e->'damageParts','[]')) loop
  part=part||jsonb_build_object('dice',private.dnd_critical_expression(part->>'dice'));
  if jsonb_array_length(parts)=0 and extra>0 and expression~'^\d+d\d+' then part=part||jsonb_build_object('dice',(part->>'dice')||'+'||extra||'d'||substring(expression from '^\d+d(\d+)'));end if;
  parts=parts||jsonb_build_array(part);
 end loop;
 expression=private.dnd_critical_expression(expression);
 if jsonb_array_length(parts)>0 then select string_agg(p->>'dice','+' order by n) into expression from jsonb_array_elements(parts) with ordinality a(p,n);end if;
 return e||jsonb_build_object('dice',expression,'damageParts',parts,'rerollWeaponDice',coalesce((e->>'rerollWeaponDice')::integer,0)*2,'critical',true);
end $$;
create or replace function private.battle37_record(q public.battle_action_requests,p_token uuid,p_expression text,p_mode text,p_client uuid,p_definition jsonb default null) returns public.battle_dice_rolls
language plpgsql security definer set search_path='' as $$
declare detail jsonb;d public.battle_dice_rolls;t public.battle_map_tokens;
begin
 select * into t from public.battle_map_tokens where id=p_token;
 if p_definition is null then detail=private.battle_roll_detail(p_expression,p_mode);else detail=private.dnd_attack_roll_detail(p_expression,p_definition);end if;
 insert into public.battle_dice_rolls(campaign_id,map_id,rolled_by,client_id,expression,label,visibility,mode,terms,total,request_id,consumed_at)
 values(q.campaign_id,q.map_id,auth.uid(),p_client,detail->>'expression',left(q.name,120),case when t.visible then 'public' when private.is_campaign_owner(q.campaign_id) then 'gm' else 'self' end,p_mode,detail->'terms',(detail->>'total')::integer,q.id,now()) returning * into d;
 return d;
end $$;

create or replace function public.answer_battle_decision(p_decision_id uuid,p_client_id uuid,p_answer jsonb default '{}') returns public.battle_decisions
language plpgsql security definer set search_path='' as $$
declare decision public.battle_decisions;q public.battle_action_requests;bs public.battle_sessions;g private.battle_guides;a public.battle_map_tokens;target public.battle_map_tokens;check_row public.battle_decisions;d public.battle_dice_rolls;detail jsonb;answer_result jsonb='{}';damage_events jsonb='[]';s jsonb;e jsonb;part_effect jsonb;opts jsonb;targets jsonb='{}';rolls jsonb='[]';outcome jsonb;target_id uuid;total integer;natural_roll integer;ac integer;passed boolean;hit boolean;critical boolean;amount integer;mode text;choice text;concentration_effect uuid;checked integer=0;single_bonus integer=0;
begin
 if auth.uid() is null or p_client_id is null then raise exception 'Entre na sua conta para responder.' using errcode='42501';end if;
 select * into decision from public.battle_decisions where id=p_decision_id;
 if decision.id is null or not private.can_read_campaign(decision.campaign_id) or not private.can_control_battle_token(decision.token_id) then raise exception 'Esta decisão pertence a outro participante.' using errcode='42501';end if;
 select * into bs from public.battle_sessions where id=decision.session_id for update;
 perform 1 from public.campaigns where id=decision.campaign_id for update;
 select * into q from public.battle_action_requests where id=decision.request_id for update;
 select * into g from private.battle_guides where request_id=q.id for update;
 select * into decision from public.battle_decisions where id=p_decision_id for update;
 if decision.status<>'pending' then return decision;end if;
 if bs.status<>'active' or bs.round<>q.round or bs.turn_index<>q.turn_index or bs.turn_started_at is distinct from q.turn_started_at or q.status not in('pending','success') or q.status='success' and decision.kind<>'concentration' then
  update public.battle_decisions set status='cancelled',answered_at=now() where id=decision.id returning * into decision;return decision;
 end if;
 if exists(select 1 from public.battle_decisions where answered_by=auth.uid() and client_id=p_client_id and id<>decision.id) or exists(select 1 from public.battle_dice_rolls where rolled_by=auth.uid() and client_id=p_client_id) then raise exception 'Este identificador já pertence a outra resposta.';end if;
 select * into a from public.battle_map_tokens where id=decision.token_id for update;s=private.battle_sheet(a.id);e=g.definition;
 if decision.kind in('attack','damage','choice') and ((s->>'hp_current')::integer<=0 or coalesce(s->'conditions','[]') ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado']) then raise exception 'Este participante não pode agir agora. O mestre pode cancelar a tentativa.';end if;
 if decision.kind='choice' then
  choice=p_answer->>'choice';
  if choice is null or not exists(select 1 from jsonb_array_elements(decision.options->'choices') o where o->>'id'=choice) then raise exception 'Escolha uma das opções apresentadas.';end if;
  answer_result=jsonb_build_object('choice',choice);
 elsif decision.kind in('attack','save','concentration') then
  if decision.kind in('save','concentration') and decision.ability in('str','dex') and coalesce(s->'conditions','[]') ?| array['Inconsciente','Atordoado','Paralisado','Petrificado'] then
   answer_result=jsonb_build_object('passed',false,'automatic',true,'message','A condição atual causa falha automática nesta salvaguarda.');
  else
   d=private.battle37_record(q,a.id,'1d20'||case when decision.modifier>=0 then '+' else '' end||decision.modifier,decision.mode,p_client_id);
   natural_roll=coalesce((select (term->>'subtotal')::integer from jsonb_array_elements(d.terms) term where (term->>'sides')::integer=20 limit 1),0);
   if decision.kind='attack' then
    target_id=coalesce((e->'attackTargets'->>(decision.sequence-1))::uuid,g.target_ids[1+(decision.sequence-1)%greatest(1,cardinality(g.target_ids))]);
    ac=private.dnd37_armor(target_id);critical=natural_roll>=coalesce((e->>'criticalAt')::integer,20);hit=natural_roll<>1 and (natural_roll=20 or critical or d.total>=ac);
    select * into target from public.battle_map_tokens where id=target_id;
    if hit and coalesce(private.battle_sheet(target_id)->'conditions','[]') ?| array['Paralisado','Inconsciente'] and exists(select 1 from public.battle_maps m where m.id=q.map_id and private.battle_target_range(a,jsonb_build_object('x',target.x,'y',target.y),m)<=1.50001) then critical=true;end if;
    answer_result=jsonb_build_object('hit',hit,'critical',critical and hit,'natural',natural_roll,'roll',to_jsonb(d));
   else
    passed=d.total>=decision.dc;answer_result=jsonb_build_object('passed',passed,'roll',to_jsonb(d));
   end if;
  end if;
  if decision.kind='concentration' and not coalesce((answer_result->>'passed')::boolean,false) then
   update public.battle_spell_effects set active=false where token_id=a.id and concentration and active and (decision.options->'effect_ids') @> jsonb_build_array(id::text);
   update public.battle_decisions set status='cancelled',answered_at=now() where request_id=q.id and token_id=a.id and kind='concentration' and status='pending' and id<>decision.id;
  end if;
 elsif decision.kind='damage' then
  opts=g.options||jsonb_build_object('guided',true,'target_ids',to_jsonb(g.target_ids));
  if exists(select 1 from public.battle_decisions where request_id=q.id and kind='attack') then
   -- Each beam has its own attack, critical, damage roll and resistance calculation.
   for check_row in select * from public.battle_decisions where request_id=q.id and kind='attack' and coalesce((battle_decisions.result->>'hit')::boolean,false) order by sequence loop
    target_id=coalesce((e->'attackTargets'->>(check_row.sequence-1))::uuid,g.target_ids[1+(check_row.sequence-1)%greatest(1,cardinality(g.target_ids))]);
    select * into target from public.battle_map_tokens where id=target_id;
    part_effect=case when coalesce((check_row.result->>'critical')::boolean,false) then private.battle37_critical(e,s,q.kind='weapon') else e end;
    if checked>0 and coalesce((e->>'onceBonus')::integer,0)<>0 then part_effect=part_effect||jsonb_build_object('dice',(part_effect->>'dice')||case when (e->>'onceBonus')::integer>0 then '-' else '+' end||abs((e->>'onceBonus')::integer));end if;
    d=private.battle37_record(q,a.id,part_effect->>'dice','normal',case when checked=0 then p_client_id else gen_random_uuid() end,part_effect);checked=checked+1;rolls=rolls||jsonb_build_array(to_jsonb(d));
    detail=jsonb_build_object('damage_parts',private.dnd_roll_damage_parts(d.terms,part_effect->'damageParts'));
    amount=private.dnd_damage_amount(target,private.battle_sheet(target.id),part_effect,greatest(0,d.total),false,detail);
    damage_events=damage_events||jsonb_build_array(jsonb_build_object('token_id',target_id,'amount',amount,'sequence',checked));
    targets=targets||jsonb_build_object(target_id::text,jsonb_build_object('amount',coalesce((targets->target_id::text->>'amount')::integer,0)+amount));
   end loop;
   -- Missed targets are explicitly zero, never damaged by the aggregate roll.
   foreach target_id in array g.target_ids loop if not targets ? target_id::text then targets=targets||jsonb_build_object(target_id::text,jsonb_build_object('amount',0));end if;end loop;
   opts=opts||jsonb_build_object('dice','0','targets',targets);
  else
   d=private.battle37_record(q,a.id,e->>'dice','normal',p_client_id,e);rolls=jsonb_build_array(to_jsonb(d));
   for check_row in select * from public.battle_decisions where request_id=q.id and kind='save' loop
    targets=targets||jsonb_build_object(check_row.token_id::text,jsonb_build_object('saved',coalesce((check_row.result->>'passed')::boolean,false)));
   end loop;
   opts=opts||jsonb_build_object('dice',greatest(0,d.total)::text,'targets',targets,'damage_parts',private.dnd_roll_damage_parts(d.terms,e->'damageParts'));
  end if;
  q=private.battle_resolve_guided_core(q.id,true,opts);
  if coalesce((private.battle_sheet(a.id)->>'hp_current')::integer,0)<=0 then update public.battle_spell_effects set active=false where token_id=a.id and concentration and active;end if;
  if q.status not in('success','failure') then raise exception 'A tentativa não pode ser concluída neste turno.';end if;
  update public.battle_action_requests set resolution=resolution||jsonb_build_object('guided',true,'dice_rolls',rolls,'dice_roll',to_jsonb(d),'dice_roll_id',d.id,'dice',d.expression,'message','Rolagens e recursos aplicados. Confira os resultados por alvo.') where id=q.id returning * into q;
  -- Concentration checks include absorbed temporary HP damage, and stop automatically at zero HP.
  if jsonb_array_length(damage_events)=0 then select coalesce(jsonb_agg(jsonb_build_object('token_id',ae.token_id,'amount',ae.amount,'sequence',0)),'[]') into damage_events from public.battle_action_effects ae where ae.request_id=q.id and ae.kind='damage';end if;
  for outcome in select value from jsonb_array_elements(damage_events) where (value->>'amount')::integer>0 loop
   target_id=(outcome->>'token_id')::uuid;
   if coalesce((private.battle_sheet(target_id)->>'hp_current')::integer,0)>0 and exists(select 1 from public.battle_spell_effects where token_id=target_id and active and concentration) then
    perform private.battle37_add_decision(q,target_id,'concentration',coalesce((outcome->>'sequence')::integer,0),'Manter concentração','con',greatest(10,(outcome->>'amount')::integer/2),private.dnd37_save_bonus(target_id,'con'),'normal',jsonb_build_object('effect_ids',(select jsonb_agg(id::text) from public.battle_spell_effects where token_id=target_id and active and concentration)));
   end if;
  end loop;
  update public.battle_action_requests set resolution=resolution||jsonb_build_object('awaiting_concentration',exists(select 1 from public.battle_decisions where request_id=q.id and kind='concentration' and status='pending')) where id=q.id;
  answer_result=jsonb_build_object('roll',to_jsonb(d),'rolls',rolls,'message','Efeito aplicado aos alvos.');
 end if;
 update public.battle_decisions set status='answered',result=answer_result,answered_by=auth.uid(),client_id=p_client_id,answered_at=now() where id=decision.id returning * into decision;
 if decision.kind in('attack','save') then update public.battle_action_requests set resolution=resolution||'{"checks_started":true}'::jsonb where id=q.id and status='pending';end if;
 if decision.kind in('choice','attack','save') then perform private.battle37_next(q.id);
 elsif decision.kind='concentration' and not exists(select 1 from public.battle_decisions where request_id=q.id and kind='concentration' and status='pending') then update public.battle_action_requests set resolution=resolution||'{"awaiting_concentration":false}'::jsonb where id=q.id;end if;
 return decision;
end $$;

create or replace function public.configure_battle_decision(p_decision_id uuid,p_mode text,p_modifier integer default null) returns public.battle_decisions
language plpgsql security definer set search_path='' as $$
declare d public.battle_decisions;
begin
 select * into d from public.battle_decisions where id=p_decision_id;
 if d.id is null or not private.is_campaign_owner(d.campaign_id) or not private.can_read_campaign(d.campaign_id) then raise exception 'Somente o mestre pode ajustar a vantagem.' using errcode='42501';end if;
 perform 1 from public.battle_sessions where id=d.session_id for update;
 if p_mode is null or p_mode not in('normal','advantage','disadvantage') then raise exception 'Modo inválido.';end if;
 if p_modifier is not null and (abs(p_modifier)>50 or not exists(select 1 from public.battle_map_tokens where id=d.token_id and npc_id is not null)) then raise exception 'Informe o bônus total do NPC; os bônus dos personagens seguem a ficha.';end if;
 update public.battle_decisions set mode=p_mode,modifier=coalesce(p_modifier,modifier) where id=d.id and status='pending' returning * into d;return d;
end $$;

create or replace function private.battle37_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in('cancelled','expired','failure','success') then update public.battle_decisions set status='cancelled',answered_at=now() where request_id=new.id and status='pending' and (new.status<>'success' or kind<>'concentration');end if;return new;
end $$;
drop trigger if exists battle37_cleanup on public.battle_action_requests;
create trigger battle37_cleanup after update of status on public.battle_action_requests for each row execute function private.battle37_cleanup();
create or replace function private.battle37_turn_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='active' and old.status='active' and (new.turn_started_at is distinct from old.turn_started_at or new.active_token_id is distinct from old.active_token_id) and exists(select 1 from public.battle_decisions where session_id=old.id and status='pending') then raise exception 'Conclua ou cancele as rolagens e escolhas pendentes antes de avançar o turno.';end if;
 if new.status<>'active' then update public.battle_decisions set status='cancelled',answered_at=now() where session_id=new.id and status='pending';end if;return new;
end $$;
drop trigger if exists battle37_turn_guard on public.battle_sessions;
create trigger battle37_turn_guard before update on public.battle_sessions for each row execute function private.battle37_turn_guard();

revoke all on function private.battle_resolve_guided_core(uuid,boolean,jsonb),private.dnd37_training(jsonb,boolean),private.dnd37_validate_sheet(uuid),private.dnd37_sheet_guard(),private.dnd37_save_bonus(uuid,text),private.dnd37_armor(uuid),private.battle37_add_decision(public.battle_action_requests,uuid,text,integer,text,text,integer,integer,text,jsonb),private.battle37_next(uuid),private.battle37_target_range(public.battle_map_tokens,public.battle_map_tokens,public.battle_maps),private.battle37_attack_mode(public.battle_map_tokens,public.battle_map_tokens,public.battle_maps),private.battle37_critical(jsonb,jsonb,boolean),private.battle37_record(public.battle_action_requests,uuid,text,text,uuid,jsonb),private.battle37_cleanup(),private.battle37_turn_guard() from public,anon,authenticated;
revoke all on function public.guide_battle_action(uuid,jsonb),public.answer_battle_decision(uuid,uuid,jsonb),public.configure_battle_decision(uuid,text,integer) from public,anon;
grant execute on function public.guide_battle_action(uuid,jsonb),public.answer_battle_decision(uuid,uuid,jsonb),public.configure_battle_decision(uuid,text,integer) to authenticated;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='battle_decisions') then alter publication supabase_realtime add table public.battle_decisions;end if;
end $$;
notify pgrst,'reload schema';

-- A participant cannot fish for a critical by cancelling an already rolled attack.
create or replace function public.cancel_battle_action(p_request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.battle_action_requests;g private.battle_guides;
begin
 select * into r from public.battle_action_requests where id=p_request_id;
 if r.id is null or not private.can_read_campaign(r.campaign_id) or not private.is_campaign_owner(r.campaign_id) and (r.requested_by<>auth.uid() or not private.can_control_battle_token(r.token_id)) then raise exception 'Você não pode cancelar esta tentativa.' using errcode='42501';end if;
 perform 1 from public.battle_sessions where id=r.session_id for update;perform 1 from public.campaigns where id=r.campaign_id for update;
 select * into r from public.battle_action_requests where id=p_request_id for update;
 if r.status not in('pending','approved') then return;end if;
 select * into g from private.battle_guides where request_id=r.id;
 if r.status='pending' and g.request_id is not null and exists(select 1 from public.battle_decisions where request_id=r.id and status='answered' and (kind in('attack','save') or kind='choice' and result->>'choice'='continue')) then
  if not private.is_campaign_owner(r.campaign_id) then raise exception 'As rolagens já começaram. Conclua a sequência ou peça ao mestre para encerrá-la.';end if;
  begin r=private.battle_resolve_guided_core(r.id,false,g.options||'{"guided":true}'::jsonb);
  exception when others then
   -- The GM must still be able to close a request whose source was removed/changed.
   -- This subtransaction rolls back every attempted resource write before flagging manual review.
   update public.battle_action_requests set resolution=resolution||'{"manual_resource_review":true,"message":"A ficha mudou durante a tentativa. O mestre deve conferir manualmente a ação e os recursos ao cancelar."}'::jsonb where id=r.id returning * into r;
  end;
 end if;
 if (r.kind='opportunity' or r.status='approved') and not private.is_campaign_owner(r.campaign_id) then raise exception 'Esta tentativa depende do mestre.' using errcode='42501';end if;
 update public.battle_action_requests set status='cancelled',resolution=resolution||jsonb_build_object('awaiting_roll',false),resolved_at=now() where id=r.id;
 if r.movement_plan_id is not null then perform private.battle_finish_movement(r.movement_plan_id);end if;
end $$;

-- Manual exceptions belong to the GM; old approved exceptions remain intact.
create or replace function private.dnd37_training_permissions() returns trigger language plpgsql security definer set search_path='' as $$
declare initial_saves jsonb;old_saves jsonb='[]';save_id text;
begin
 select data->'saves' into initial_saves from public.dnd_classes where id=new.system_data->>'class_id';
 -- Older clients changed the class while retaining the default fighter saves.
 if new.system_data->>'class_id'<>'fighter' and new.system_data->'saves'='["str","con"]'::jsonb then new.system_data=jsonb_set(new.system_data,'{saves}',coalesce(initial_saves,'[]'));end if;
 if auth.uid() is null or private.is_campaign_owner(new.campaign_id) then return new;end if;
 if tg_op='UPDATE' then old_saves=coalesce(old.system_data->'saves','[]');else select coalesce(system_data->'saves','[]') into old_saves from public.characters where id=new.id;end if;
 for save_id in select value from jsonb_array_elements_text(coalesce(new.system_data->'saves','[]')) loop
  if not coalesce(initial_saves ? save_id,false) and not coalesce(old_saves,'[]') ? save_id then raise exception 'As salvaguardas vêm da classe inicial. Treinamentos extras dependem do mestre.';end if;
 end loop;
 return new;
end $$;
drop trigger if exists dnd37_training_permissions on public.characters;
create trigger dnd37_training_permissions before insert or update on public.characters for each row execute function private.dnd37_training_permissions();
revoke all on function private.dnd37_training_permissions() from public,anon,authenticated;

create table if not exists private.dnd37_skill_grants (
 character_id uuid not null references public.characters(id) on delete cascade,
 skill text not null,proficiency smallint not null check(proficiency between 0 and 2),primary key(character_id,skill)
);
revoke all on private.dnd37_skill_grants from public,anon,authenticated;
insert into private.dnd37_skill_grants select character_id,skill,proficiency from public.character_skills on conflict do nothing;
create or replace function private.dnd37_skill_permission() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid;campaign uuid;allowed smallint=0;gm boolean;
begin
 if tg_op='DELETE' then cid=old.character_id;else cid=new.character_id;end if;
 select campaign_id into campaign from public.characters where id=cid;
 gm=auth.uid() is null or private.is_campaign_owner(campaign);
 if tg_op='DELETE' then
  if gm then delete from private.dnd37_skill_grants where character_id=old.character_id and skill=old.skill;end if;
  return old;
 end if;
 if gm then
  insert into private.dnd37_skill_grants values(new.character_id,new.skill,new.proficiency) on conflict(character_id,skill) do update set proficiency=excluded.proficiency;
 else
  select proficiency into allowed from private.dnd37_skill_grants where character_id=new.character_id and skill=new.skill;
  if new.proficiency>coalesce(allowed,0) then raise exception 'Escolha proficiências e especializações na criação ou nas habilidades da classe. Exceções manuais dependem do mestre.';end if;
 end if;
 return new;
end $$;
drop trigger if exists dnd37_skill_permission on public.character_skills;
create trigger dnd37_skill_permission before insert or update or delete on public.character_skills for each row execute function private.dnd37_skill_permission();
drop trigger if exists dnd37_sheet_skills on public.character_skills;
create constraint trigger dnd37_sheet_skills after insert or update or delete on public.character_skills deferrable initially deferred for each row execute function private.dnd37_sheet_guard();
revoke all on function private.dnd37_skill_permission() from public,anon,authenticated;

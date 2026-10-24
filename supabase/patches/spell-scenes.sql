alter table public.battle_spell_effects add column if not exists expires_round integer;
alter table public.battle_spell_effects add column if not exists expires_at timestamptz;
create index if not exists battle42_active_scene_map on public.battle_spell_effects(map_id,token_id) where active;
create table if not exists private.battle42_events(id uuid primary key default gen_random_uuid(),effect_id uuid not null references public.battle_spell_effects(id) on delete cascade,token_id uuid not null references public.battle_map_tokens(id) on delete cascade,stamp text not null,phase text not null,sequence integer generated always as identity,saved boolean not null default false,done boolean not null default false,unique(effect_id,token_id,stamp,phase));
revoke all on private.battle42_events from public,anon,authenticated;
create or replace function private.battle42_prepare() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests;r integer;ids jsonb;
begin
 select * into q from public.battle_action_requests where id=new.request_id;
 new.definition=new.definition||jsonb_build_object('scene_targets',to_jsonb(q.target_ids),'scene_origin',(select jsonb_build_object('x',x,'y',y) from public.battle_map_tokens where id=new.token_id));
 if new.definition->'entry'->>'catalog_id'='muralha-de-fogo' then new.definition=new.definition||'{"save":"","halfOnSave":false}';end if;
 r=(new.definition->'scene'->>'rounds')::integer;if r>0 then new.expires_round=q.round+r;new.expires_at=clock_timestamp()+make_interval(secs=>r*6);end if;
 if new.definition->'entry'->>'catalog_id'='fogo-das-fadas' then select coalesce(jsonb_agg(token_id),'[]') into ids from public.battle_decisions where request_id=q.id and kind='save' and status='answered' and not coalesce((result->>'passed')::boolean,false);new.definition=new.definition||jsonb_build_object('light_targets',ids);end if;
 if new.definition->'entry'->>'catalog_id' in('luz','produzir-chama','globos-de-luz') then update public.battle_spell_effects set active=false,updated_at=clock_timestamp() where token_id=new.token_id and active and definition->'entry'->>'catalog_id'=new.definition->'entry'->>'catalog_id';end if;
 return new;
end $$;
drop trigger if exists battle42_prepare on public.battle_spell_effects;
create trigger battle42_prepare before insert on public.battle_spell_effects for each row execute function private.battle42_prepare();
create or replace function private.battle42_inside(e public.battle_spell_effects,t public.battle_map_tokens) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.battle_map_tokens;m public.battle_maps;d jsonb=e.definition;
begin
 select * into a from public.battle_map_tokens where id=e.token_id;select * into m from public.battle_maps where id=e.map_id;
 if d->'scene'->>'anchor' is distinct from 'caster' then a.x=coalesce((d->'scene_origin'->>'x')::integer,(e.target->>'x')::integer);a.y=coalesce((d->'scene_origin'->>'y')::integer,(e.target->>'y')::integer);end if;
 return private.battle_in_effect(t,a,e.target,d,m.scale_per_cell*case when m.scale_unit='ft' then .3 else 1 end);
end $$;
create or replace function private.battle42_queue(e public.battle_spell_effects,t public.battle_map_tokens,s public.battle_sessions,p_phase text) returns void language plpgsql security definer set search_path='' as $$
declare v private.battle42_events;q public.battle_action_requests;ability text=nullif(e.definition->>'save','');options jsonb;stamp text;
begin
 if not e.active or s.status<>'active' then return;end if;
 stamp=s.round||':'||s.turn_index||':'||coalesce(s.turn_started_at::text,'');
 insert into private.battle42_events(effect_id,token_id,stamp,phase) values(e.id,t.id,stamp,case when p_phase='end' then 'end' else 'exposure' end) on conflict do nothing returning * into v;if v.id is null then return;end if;
 select * into q from public.battle_action_requests where id=e.request_id;
 options=jsonb_build_object('zone_event_id',v.id,'dice',e.definition->>'dice','zone_stage',case when ability is null then 'damage' else 'save' end);
 perform private.battle37_add_decision(q,t.id,case when ability is null then 'damage' else 'save' end,100000+v.sequence,e.name||' · área persistente · '||t.name,ability,case when ability is null then null else private.battle39_dc(e.token_id,e.definition->'entry') end,case when ability is null then 0 else private.dnd37_save_bonus(t.id,ability) end,'normal',options);
end $$;
create or replace function private.battle42_turn() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.battle_spell_effects;t public.battle_map_tokens;m public.battle_maps;vx numeric;vy numeric;norm numeric;step numeric;angle numeric;
begin
 if new.turn_started_at is not distinct from old.turn_started_at and new.status=old.status then return new;end if;
 update public.battle_spell_effects fx set active=false,updated_at=clock_timestamp() where fx.active and fx.map_id in(select id from public.battle_maps where battle_session_id=new.id) and ((new.status='active' and fx.expires_round<=new.round and fx.token_id=new.active_token_id) or (new.status<>'active' and fx.expires_at<=clock_timestamp()));
 if new.status<>'active' then return new;end if;
 for e in select * from public.battle_spell_effects where active and map_id in(select id from public.battle_maps where battle_session_id=new.id) loop
  if e.definition->'scene'->'triggers' ? 'end' then select * into t from public.battle_map_tokens where id=old.active_token_id;if t.id is not null and t.map_id=e.map_id and private.battle42_inside(e,t) then perform private.battle42_queue(e,t,old,'end');end if;end if;
  if e.token_id=new.active_token_id and e.definition->'scene' ? 'drift' then
   select * into t from public.battle_map_tokens where id=e.token_id;select * into m from public.battle_maps where id=e.map_id;
   step=(e.definition->'scene'->'drift'->>'metres')::numeric/(m.scale_per_cell*case when m.scale_unit='ft' then .3 else 1 end);
   if e.definition->'scene'->'drift'->>'mode'='bearing' then angle=radians(coalesce((e.definition->>'driftDirection')::numeric,0));vx=cos(angle);vy=sin(angle);
   else vx=(e.target->>'x')::numeric+.5-(t.x+t.size/2);vy=(e.target->>'y')::numeric+.5-(t.y+t.size/2);norm=sqrt(vx*vx+vy*vy);if norm=0 then vx=0;vy=1;else vx=vx/norm;vy=vy/norm;end if;end if;
   update public.battle_spell_effects fx set target=jsonb_build_object('x',greatest(0,least(m.width-1,(e.target->>'x')::numeric+vx*step)),'y',greatest(0,least(m.height-1,(e.target->>'y')::numeric+vy*step))),updated_at=clock_timestamp() where fx.id=e.id returning * into e;
  end if;
  if e.definition->'scene'->'triggers' ? 'start' then select * into t from public.battle_map_tokens where id=new.active_token_id;if t.id is not null and t.map_id=e.map_id and private.battle42_inside(e,t) then perform private.battle42_queue(e,t,new,'start');end if;end if;
 end loop;return new;
end $$;
drop trigger if exists zz_battle42_turn on public.battle_sessions;
create trigger zz_battle42_turn after update on public.battle_sessions for each row execute function private.battle42_turn();
create or replace function private.battle42_move() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.battle_spell_effects;s public.battle_sessions;sample public.battle_map_tokens;p jsonb;entered boolean;path jsonb;
begin
 if old.x=new.x and old.y=new.y then return new;end if;
 select * into s from public.battle_sessions where id=(select battle_session_id from public.battle_maps where id=new.map_id);if s.status<>'active' then return new;end if;
 path=coalesce(nullif(current_setting('battle42.path',true),'')::jsonb,'[]');
 for e in select * from public.battle_spell_effects where map_id=new.map_id and active and definition->'scene'->'triggers' ? 'enter' loop
  if private.battle42_inside(e,old) then continue;end if;entered=private.battle42_inside(e,new);
  if not entered then for p in select value from jsonb_array_elements(path) loop sample=new;sample.x=(p->>'x')::integer;sample.y=(p->>'y')::integer;if private.battle42_inside(e,sample) then entered=true;exit;end if;end loop;end if;
  if entered then perform private.battle42_queue(e,new,s,'enter');end if;
 end loop;return new;
end $$;
drop trigger if exists zz_battle42_move on public.battle_map_tokens;
create trigger zz_battle42_move after update of x,y on public.battle_map_tokens for each row execute function private.battle42_move();
create or replace function private.battle42_end() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.active and not new.active then update public.battle_decisions set status='cancelled',answered_at=clock_timestamp() where status='pending' and options->>'zone_stage'<>'concentration' and options->>'zone_event_id' in(select id::text from private.battle42_events where effect_id=new.id);end if;return new;
end $$;
drop trigger if exists battle42_end on public.battle_spell_effects;
create trigger battle42_end after update of active on public.battle_spell_effects for each row execute function private.battle42_end();
create or replace function private.battle42_answer(p_decision_id uuid,p_client_id uuid,p_answer jsonb) returns public.battle_decisions language plpgsql security definer set search_path='' as $$
<<zone_answer>>
declare d public.battle_decisions;v private.battle42_events;e public.battle_spell_effects;q public.battle_action_requests;t public.battle_map_tokens;a public.battle_map_tokens;bs public.battle_sessions;r public.battle_dice_rolls;passed boolean;result jsonb;outcome jsonb;stage text;opts jsonb;damage integer;
begin
 select * into d from public.battle_decisions where id=p_decision_id;if p_client_id is null or auth.uid() is null or not private.battle38_controls(d.token_id) then raise exception 'Esta decisão pertence a outro participante.' using errcode='42501';end if;
 select * into bs from public.battle_sessions where id=d.session_id for update;perform 1 from public.campaigns where id=d.campaign_id for update;select * into d from public.battle_decisions where id=p_decision_id for update;if d.status<>'pending' then return d;end if;
 select * into v from private.battle42_events where id=(d.options->>'zone_event_id')::uuid for update;select * into e from public.battle_spell_effects where id=v.effect_id;stage=d.options->>'zone_stage';
 if bs.status<>'active' or (stage<>'concentration' and (not e.active or v.done)) then update public.battle_decisions set status='cancelled',answered_at=clock_timestamp() where id=d.id returning * into d;return d;end if;
 select * into q from public.battle_action_requests where id=d.request_id;select * into t from public.battle_map_tokens where id=d.token_id for update;select * into a from public.battle_map_tokens where id=e.token_id;
 if exists(select 1 from public.battle_decisions where answered_by=auth.uid() and client_id=p_client_id) or exists(select 1 from public.battle_dice_rolls where rolled_by=auth.uid() and client_id=p_client_id) then raise exception 'Identificador já utilizado em outra resposta.';end if;
 perform set_config('battle39.physical',(coalesce(d.options->>'dice_mode','program')='physical')::text,true);
 if d.options->>'dice_mode'='physical' then if jsonb_typeof(p_answer->'rolls') is distinct from 'array' then raise exception 'Informe as faces dos dados físicos.';end if;perform set_config('battle39.rolls',(p_answer->'rolls')::text,true);perform set_config('battle39.roll_index','0',true);elsif p_answer ? 'rolls' then raise exception 'Esta etapa usa dados do programa.';end if;
 if stage in('save','concentration') then
  if d.ability in('str','dex') and private.battle_sheet(t.id)->'conditions' ?| array['Inconsciente','Atordoado','Paralisado','Petrificado'] then passed=false;result='{"automatic":true}';else r=private.battle37_record(q,t.id,'1d20'||case when d.modifier>=0 then '+' else '' end||d.modifier,d.mode,p_client_id);passed=r.total>=d.dc;result=jsonb_build_object('roll',to_jsonb(r));end if;result=result||jsonb_build_object('passed',passed);
  if stage='concentration' then if not passed then update public.battle_spell_effects set active=false,updated_at=clock_timestamp() where token_id=t.id and active and concentration;end if;
  else update private.battle42_events set saved=passed where id=v.id;if passed and not coalesce((e.definition->>'halfOnSave')::boolean,false) then update private.battle42_events set done=true where id=v.id;else perform private.battle37_add_decision(q,t.id,'damage',100000+v.sequence,e.name||' · dano da área',null,null,0,'normal',d.options||'{"zone_stage":"damage"}');end if;end if;
 else
  r=private.battle37_record(q,t.id,e.definition->>'dice','normal',p_client_id,e.definition);opts=jsonb_build_object('dice',greatest(0,r.total)::text,'target_ids',jsonb_build_array(t.id),'targets',jsonb_build_object(t.id::text,jsonb_build_object('saved',v.saved)));outcome=private.battle_apply_hp(q,a,e.definition,opts);update private.battle42_events set done=true where id=v.id;result=jsonb_build_object('roll',to_jsonb(r),'affected',outcome->'affected');
  select amount into damage from public.battle_action_effects where request_id=q.id and token_id=t.id order by created_at desc,id desc limit 1;
  if damage>0 and coalesce((select concentration_checks from public.campaign_rules where campaign_id=q.campaign_id),true) and coalesce((private.battle_sheet(t.id)->>'hp_current')::integer,0)>0 and exists(select 1 from public.battle_spell_effects where token_id=t.id and active and concentration) then perform private.battle37_add_decision(q,t.id,'concentration',100000+v.sequence,'Concentração após dano da área','con',greatest(10,damage/2),private.dnd37_save_bonus(t.id,'con'),'normal',d.options||'{"zone_stage":"concentration"}');end if;
 end if;
 if d.options->>'dice_mode'='physical' and current_setting('battle39.roll_index',true)::integer<>jsonb_array_length(p_answer->'rolls') then raise exception 'Quantidade de rolagens físicas inválida.';end if;perform set_config('battle39.physical','false',true);
 update public.battle_decisions set status='answered',result=zone_answer.result,answered_by=auth.uid(),client_id=p_client_id,answered_at=clock_timestamp() where id=d.id returning * into d;return d;
end $$;
create or replace function private.battle42_terrain(p_map uuid,p_x integer,p_y integer,p_cost numeric) returns numeric language plpgsql stable security definer set search_path='' as $$
declare e public.battle_spell_effects;t public.battle_map_tokens;
begin t.map_id=p_map;t.x=p_x;t.y=p_y;t.size=1;for e in select * from public.battle_spell_effects where map_id=p_map and active and coalesce((definition->'scene'->>'difficult')::boolean,false) loop if private.battle42_inside(e,t) then return greatest(2,p_cost);end if;end loop;return p_cost;end $$;
create or replace function private.battle42_flame_attack() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.status in('success','failure') and old.status in('pending','approved') and new.kind='spell' and new.definition->'entry'->>'catalog_id'='produzir-chama' and coalesce((new.definition->>'attackRoll')::boolean,false) then update public.battle_spell_effects set active=false,updated_at=clock_timestamp() where token_id=new.token_id and active and definition->'entry'->>'catalog_id'='produzir-chama';end if;return new;end $$;
drop trigger if exists battle42_flame_attack on public.battle_action_requests;
create trigger battle42_flame_attack after update of status on public.battle_action_requests for each row execute function private.battle42_flame_attack();
revoke all on function private.battle42_prepare(),private.battle42_inside(public.battle_spell_effects,public.battle_map_tokens),private.battle42_queue(public.battle_spell_effects,public.battle_map_tokens,public.battle_sessions,text),private.battle42_turn(),private.battle42_move(),private.battle42_end(),private.battle42_answer(uuid,uuid,jsonb),private.battle42_terrain(uuid,integer,integer,numeric),private.battle42_flame_attack() from public,anon,authenticated;

-- Extend installed functions in place, preserving previous security/gameplay fixes.
do $patch42$
declare source text;needle text;
begin
 select pg_get_functiondef('public.request_battle_action(uuid,jsonb,uuid)'::regprocedure) into source;
 if position('battle42 request' in source)=0 then
  needle=' if p_payload ? ''condition_choice'' then';if position(needle in source)=0 then raise exception 'Aplique as migrações até 041 antes de 042.';end if;
  source=replace(source,needle,$patch$
 -- battle42 request
 if kind='spell' then
  e=e||jsonb_build_object('scene_origin',jsonb_build_object('x',t.x,'y',t.y));
  if e->>'shape'='wall' then if coalesce((p_payload->>'area_rotation')::integer,0) not in(0,45,90,135) then raise exception 'Orientação de parede inválida.';end if;e=e||jsonb_build_object('rotation',coalesce((p_payload->>'area_rotation')::integer,0));end if;
  if entry->>'catalog_id'='nuvem-incendiaria' then
   if coalesce((p_payload->>'cloud_direction')::integer,0) not in(0,45,90,135,180,225,270,315) then raise exception 'Direção da nuvem inválida.';end if;
   e=e||jsonb_build_object('driftDirection',coalesce((p_payload->>'cloud_direction')::integer,0));
  end if;
  if entry->>'catalog_id'='produzir-chama' then
   if coalesce(p_payload->>'spell_mode','attack') not in('light','attack') then raise exception 'Escolha iluminar ou arremessar a chama.';end if;
   if p_payload->>'spell_mode'='light' then e=e||'{"kind":"utility","shape":"self","origin":"self","dice":"","attackRoll":false,"maxTargets":1}';target=jsonb_build_object('x',t.x,'y',t.y);ids=array[t.id];else e=jsonb_set(e,'{scene}',coalesce(e->'scene','{}')-'light');e=e||'{"duration":"Instantâneo"}';end if;
  end if;
  if e ? 'durationOverride' then e=e||jsonb_build_object('duration',e->>'durationOverride');end if;
 end if;
$patch$||needle);execute source;
 end if;
 select pg_get_functiondef('private.battle_point_in_effect(numeric,numeric,public.battle_map_tokens,jsonb,jsonb,numeric)'::regprocedure) into source;
 if position('battle42 wall' in source)=0 then
  needle=' if shape=''sphere'' then';if position(needle in source)=0 then raise exception 'Geometria anterior não reconhecida.';end if;
  source=replace(source,needle,$patch$
 -- battle42 wall
 if shape='wall' then return abs(dx*cos(radians(coalesce((e->>'rotation')::numeric,0)))+dy*sin(radians(coalesce((e->>'rotation')::numeric,0)))) <= (e->>'size')::numeric/2+.00001 and abs(-dx*sin(radians(coalesce((e->>'rotation')::numeric,0)))+dy*cos(radians(coalesce((e->>'rotation')::numeric,0)))) <= greatest(scale,(e->>'width')::numeric)/2+.00001;end if;
$patch$||needle);execute source;
 end if;
 select pg_get_functiondef('private.battle_resolve_guided_core(uuid,boolean,jsonb)'::regprocedure) into source;
 source=replace(source,'not in(''single'',''self'',''sphere'',''cone'',''line'',''cube'')','not in(''single'',''self'',''sphere'',''cone'',''line'',''cube'',''wall'')');execute source;
 select pg_get_functiondef('private.battle37_next(uuid)'::regprocedure) into source;
 if position('battle42 trigger' in source)=0 then source=replace(source,'elsif nullif(e->>''save'','''') is not null then','elsif nullif(e->>''save'','''') is not null and coalesce(e->>''timing'',''immediate'')<>''trigger'' then -- battle42 trigger');execute source;end if;
 select pg_get_functiondef('public.move_battle_token(uuid,integer,integer,jsonb,bigint,boolean)'::regprocedure) into source;
 if position('battle42.path' in source)=0 then needle=' perform private.battle_validate_movement';if position(needle in source)=0 then raise exception 'Movimento anterior não reconhecido.';end if;source=replace(source,needle,' perform set_config(''battle42.path'',coalesce(p_path,''[]'')::text,true);'||chr(10)||needle);execute source;end if;
 select pg_get_functiondef('private.battle_footprint_cost(uuid,integer,integer,numeric,numeric,uuid)'::regprocedure) into source;
 if position('battle42_terrain' in source)=0 then needle=' return result;';if position(needle in source)=0 then raise exception 'Terreno anterior não reconhecido.';end if;source=replace(source,needle,' select greatest(result,coalesce(max(private.battle42_terrain(p_map,x,y,result)),result)) into result from generate_series(px,ceil(px+p_size)::integer-1) x cross join generate_series(py,ceil(py+p_size)::integer-1) y;'||chr(10)||needle);execute source;end if;
 select pg_get_functiondef('private.battle_finish_movement(uuid)'::regprocedure) into source;
 if position('battle42.path' in source)=0 then source=replace(source,'  perform private.battle_validate_movement','  perform set_config(''battle42.path'',plan.path::text,true);'||chr(10)||'  perform private.battle_validate_movement');execute source;end if;
 select pg_get_functiondef('public.battle_combat_update(uuid)'::regprocedure) into source;
 if position('battle42 source' in source)=0 then needle='from (select r.* from public.battle_action_requests r where map_id=p_map_id order by created_at desc,id limit 80) q';if position(needle in source)=0 then raise exception 'Resumo de combate anterior não reconhecido.';end if;source=replace(source,needle,'from public.battle_action_requests q where q.map_id=p_map_id and (q.id in(select r.id from public.battle_action_requests r where r.map_id=p_map_id order by r.created_at desc,r.id limit 80) or q.id in(select fx.request_id from public.battle_spell_effects fx where fx.map_id=p_map_id and fx.active) or q.id in(select d.request_id from public.battle_decisions d where d.status=''pending'')) /* battle42 source */');execute source;end if;
 select pg_get_functiondef('public.pulse_battle_spell_v9(uuid,jsonb,integer)'::regprocedure) into source;
 if position('battle42 manual' in source)=0 then needle=' r.target=e.target;';if position(needle in source)=0 then raise exception 'Gatilho manual anterior não reconhecido.';end if;source=replace(source,needle,$patch$
 -- battle42 manual: the enclosing function already authorizes the GM.
 if p_resolution ? 'damageType' then if p_resolution->>'damageType' not in('ácido','concussão','cortante','elétrico','energia','fogo','frio','necrótico','perfurante','psíquico','radiante','trovejante','veneno') then raise exception 'Tipo de dano inválido.';end if;e.definition=e.definition||jsonb_build_object('damageType',p_resolution->>'damageType');end if;
 if p_resolution ? 'halfOnSave' then if jsonb_typeof(p_resolution->'halfOnSave') is distinct from 'boolean' then raise exception 'Opção de salvaguarda inválida.';end if;e.definition=e.definition||jsonb_build_object('halfOnSave',p_resolution->'halfOnSave');end if;
$patch$||needle);execute source;end if;
 select pg_get_functiondef('public.answer_battle_decision(uuid,uuid,jsonb)'::regprocedure) into source;
 if position('battle42_answer' in source)=0 then needle=' select * into decision from public.battle_decisions where id=p_decision_id;';if position(needle in source)=0 then raise exception 'Decisões anteriores não reconhecidas.';end if;source=replace(source,needle,' if exists(select 1 from public.battle_decisions where id=p_decision_id and options ? ''zone_event_id'') then return private.battle42_answer(p_decision_id,p_client_id,p_answer);end if;'||chr(10)||needle);execute source;end if;
end $patch42$;

update public.battle_spell_effects fx set definition=fx.definition||jsonb_build_object('scene',sp.combat->'scene','scene_targets',to_jsonb(q.target_ids),'scene_origin',coalesce(fx.definition->'scene_origin',q.target)),expires_round=case when sp.combat->'scene' ? 'rounds' then q.round+(sp.combat->'scene'->>'rounds')::integer else null end,expires_at=case when sp.combat->'scene' ? 'rounds' then fx.created_at+make_interval(secs=>(sp.combat->'scene'->>'rounds')::integer*6) else null end from public.dnd_spells sp,public.battle_action_requests q where fx.active and q.id=fx.request_id and sp.id=fx.definition->'entry'->>'catalog_id' and not(fx.definition ? 'scene');
update public.battle_spell_effects set active=false,updated_at=clock_timestamp() where active and definition->'entry'->>'catalog_id'='onda-trovejante';

create or replace function private.battle42_move_effect(p_effect_id uuid,p_target jsonb,p_expected_updated_at timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.battle_spell_effects;t public.battle_map_tokens;m public.battle_maps;s public.battle_sessions;spell_id text;travel numeric;dx numeric;dy numeric;distance numeric;scale numeric;victim public.battle_map_tokens;use_bonus boolean;
begin
 select * into e from public.battle_spell_effects where id=p_effect_id;if e.id is null or not private.battle38_controls(e.token_id) then raise exception 'Você não controla este efeito.' using errcode='42501';end if;
 select * into m from public.battle_maps where id=e.map_id;select * into s from public.battle_sessions where id=m.battle_session_id for update;perform 1 from public.campaigns where id=e.campaign_id for update;select * into e from public.battle_spell_effects where id=p_effect_id for update;select * into t from public.battle_map_tokens where id=e.token_id for update;
 spell_id=e.definition->'entry'->>'catalog_id';if spell_id not in('esfera-flamejante','raio-lunar','globos-de-luz') then raise exception 'Este efeito não possui esse movimento.';end if;
 if not e.active or e.updated_at is distinct from p_expected_updated_at then raise exception 'O efeito mudou. Atualize o grid.' using errcode='40001';end if;
 if s.status<>'active' or s.active_token_id<>t.id or coalesce((private.battle_sheet(t.id)->>'hp_current')::integer,0)<=0 then raise exception 'Mova o efeito no turno do conjurador consciente.';end if;
 if private.battle_sheet(t.id)->'conditions' ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado'] then raise exception 'A condição atual impede esta ação.';end if;
 if exists(select 1 from public.battle_decisions where session_id=s.id and status='pending') or exists(select 1 from public.battle_action_requests where session_id=s.id and status in('pending','approved')) then raise exception 'Resolva as rolagens e ações pendentes antes de mover o efeito.';end if;
 if jsonb_typeof(p_target) is distinct from 'object' or jsonb_typeof(p_target->'x') is distinct from 'number' or jsonb_typeof(p_target->'y') is distinct from 'number' then raise exception 'Escolha uma célula no grid.';end if;
 if (p_target->>'x')::numeric<>trunc((p_target->>'x')::numeric) or (p_target->>'y')::numeric<>trunc((p_target->>'y')::numeric) or (p_target->>'x')::numeric not between 0 and m.width-1 or (p_target->>'y')::numeric not between 0 and m.height-1 then raise exception 'Destino fora do grid.';end if;
 dx=abs((p_target->>'x')::numeric-(e.target->>'x')::numeric);dy=abs((p_target->>'y')::numeric-(e.target->>'y')::numeric);scale=m.scale_per_cell*case when m.scale_unit='ft' then .3 else 1 end;
 distance=case m.diagonal_rule when 'sqrt2' then sqrt(dx*dx+dy*dy) when 'five-ten-five' then greatest(dx,dy)+floor(least(dx,dy)/2) else greatest(dx,dy) end*scale;
 if distance=0 then raise exception 'Escolha outro ponto para mover o efeito.';end if;
 travel=case when spell_id='esfera-flamejante' then 9 else 18 end;if distance>travel+.00001 then raise exception 'O efeito pode mover até % metros por uso.',travel;end if;
 if spell_id='globos-de-luz' and private.battle_target_range(t,p_target,m)>36 then raise exception 'Mantenha os globos a até 36 metros do conjurador.';end if;
 use_bonus=spell_id<>'raio-lunar';
 if use_bonus then if t.bonus_used then raise exception 'A ação bônus já foi utilizada.';end if;update public.battle_map_tokens set bonus_used=true,version=version+1 where battle_map_tokens.id=t.id;
 else if t.action_used and t.extra_actions<=0 then raise exception 'A ação já foi utilizada.';end if;update public.battle_map_tokens set action_used=true,extra_actions=case when action_used then greatest(0,extra_actions-1) else extra_actions end,version=version+1 where battle_map_tokens.id=t.id;end if;
 update public.battle_spell_effects set target=p_target,updated_at=clock_timestamp() where battle_spell_effects.id=e.id returning * into e;
 if spell_id='esfera-flamejante' then for victim in select * from public.battle_map_tokens where map_id=e.map_id and x<=(p_target->>'x')::integer and x+size>(p_target->>'x')::integer and y<=(p_target->>'y')::integer and y+size>(p_target->>'y')::integer loop perform private.battle42_queue(e,victim,s,'ram');end loop;end if;
 return e.map_id;
end $$;
revoke all on function private.battle42_move_effect(uuid,jsonb,timestamptz) from public,anon;
grant execute on function private.battle42_move_effect(uuid,jsonb,timestamptz) to authenticated;
create or replace function public.move_battle_spell(p_effect_id uuid,p_target jsonb,p_expected_updated_at timestamptz) returns jsonb language plpgsql security invoker set search_path='' as $$
declare map_id uuid;
begin map_id=private.battle42_move_effect(p_effect_id,p_target,p_expected_updated_at);return public.battle_combat_update(map_id);end $$;
revoke all on function public.move_battle_spell(uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.move_battle_spell(uuid,jsonb,timestamptz) to authenticated;

-- Light/darkness interactions use effect IDs and actual spell levels, never display names.
create or replace function private.battle42_light_points(e public.battle_spell_effects) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare anchor text=e.definition->'scene'->'light'->>'anchor';t public.battle_map_tokens;found boolean=false;
begin
 for t in select * from public.battle_map_tokens where map_id=e.map_id and ((anchor='caster' and id=e.token_id) or (anchor='target' and to_jsonb(id::text) <@ coalesce(e.definition->'scene_targets','[]')) or (anchor='failedTargets' and to_jsonb(id::text) <@ coalesce(e.definition->'light_targets','[]'))) loop found=true;return next jsonb_build_object('x',t.x+t.size/2,'y',t.y+t.size/2);end loop;
 if not found and anchor is distinct from 'failedTargets' then return next jsonb_build_object('x',(e.target->>'x')::numeric+.5,'y',(e.target->>'y')::numeric+.5);end if;return;
end $$;
create or replace function private.battle42_light_interactions(p_map uuid) returns void language plpgsql security definer set search_path='' as $$
declare dark public.battle_spell_effects;lamp public.battle_spell_effects;m public.battle_maps;p jsonb;d jsonb;scale numeric;radius numeric;level integer;dark_level integer;overlap boolean;
begin
 select * into m from public.battle_maps where id=p_map;scale=m.scale_per_cell*case when m.scale_unit='ft' then .3 else 1 end;
 for dark in select * from public.battle_spell_effects where map_id=p_map and active and definition->'entry'->>'catalog_id'='escuridao' loop
  select greatest(q.resource_level,q.spell_level,coalesce(sp.level,0)) into dark_level from public.battle_action_requests q left join public.dnd_spells sp on sp.id=dark.definition->'entry'->>'catalog_id' where q.id=dark.request_id;
  for lamp in select * from public.battle_spell_effects where map_id=p_map and active and definition->'scene' ? 'light' loop
   radius=coalesce((lamp.definition->'scene'->'light'->>'bright')::numeric,0)+coalesce((lamp.definition->'scene'->'light'->>'dim')::numeric,0)+coalesce((dark.definition->>'size')::numeric,4.5);overlap=false;
   for p in select * from private.battle42_light_points(lamp) loop
    for d in select * from private.battle42_light_points(dark) loop
     if power(((p->>'x')::numeric-(d->>'x')::numeric)*scale,2)+power(((p->>'y')::numeric-(d->>'y')::numeric)*scale,2)<=radius*radius then overlap=true;exit;end if;
    end loop;if overlap then exit;end if;
   end loop;
   if overlap then
    if lamp.definition->'entry'->>'catalog_id'='luz-do-dia' and dark_level<=3 then update public.battle_spell_effects set active=false,updated_at=clock_timestamp() where id=dark.id;exit;end if;
    select greatest(q.resource_level,q.spell_level,coalesce(sp.level,0)) into level from public.battle_action_requests q left join public.dnd_spells sp on sp.id=lamp.definition->'entry'->>'catalog_id' where q.id=lamp.request_id;
    if level<=2 then update public.battle_spell_effects set active=false,updated_at=clock_timestamp() where id=lamp.id;end if;
   end if;
  end loop;
 end loop;
end $$;
create or replace function private.battle42_light_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.battle42_light_interactions(new.map_id);return new;end $$;
drop trigger if exists battle42_light_created on public.battle_spell_effects;
create trigger battle42_light_created after insert or update of target on public.battle_spell_effects for each row execute function private.battle42_light_changed();
drop trigger if exists battle42_light_moved on public.battle_map_tokens;
create trigger battle42_light_moved after update of x,y on public.battle_map_tokens for each row execute function private.battle42_light_changed();
revoke all on function private.battle42_light_points(public.battle_spell_effects),private.battle42_light_interactions(uuid),private.battle42_light_changed() from public,anon,authenticated;

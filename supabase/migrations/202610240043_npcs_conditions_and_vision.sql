-- 043: NPCs, condições e visão. Execute após 042.
begin;
update public.dnd_spells set combat=$vision43${"shape":"self","kind":"utility","range":0,"size":0,"width":1.5,"origin":"self","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"Enxerga invisíveis, mas ainda precisa de luz ou de visão no escuro; não atravessa névoa ou paredes.","scene":{"rounds":600}}$vision43$::jsonb where id='ver-o-invisivel';
update public.dnd_spells set combat=$vision43${"shape":"sphere","kind":"utility","range":18,"size":4.5,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","scene":{"visual":"darkness","darkness":"magical","rounds":100,"persistent":true}}$vision43$::jsonb where id='escuridao';
update public.dnd_spells set data=data||'{"range":"18 metros (12 quadrados)"}'::jsonb where id='escuridao';
-- D&D 5e 2014: NPC stat blocks, creature controls, conditions, narrative markers and vision.
alter table public.npc_stats add column if not exists stat_block jsonb not null default '{}';
alter table private.battle_condition_effects add column if not exists source_token_id uuid references public.battle_map_tokens(id) on delete set null;
alter table private.battle_condition_effects add column if not exists source_reach numeric not null default 1.5;
alter table private.battle_condition_effects add column if not exists manual boolean not null default false;
create table if not exists private.battle43_commands(user_id uuid not null,client_id uuid not null,kind text not null,subject uuid not null,payload jsonb not null,map_id uuid not null references public.battle_maps(id) on delete cascade,primary key(user_id,client_id));
revoke all on private.battle43_commands from public,anon,authenticated;

create or replace function private.battle43_exhaustion(s jsonb) returns integer language sql immutable set search_path='' as $$
 select greatest(case when coalesce(s->'conditions','[]') ? 'Exaustão' then 1 else 0 end,least(6,greatest(0,coalesce((s->>'exhaustion')::integer,0))))
$$;
do $$ declare f text;begin
 if to_regprocedure('private.battle_sheet_v42(uuid)') is null then select pg_get_functiondef('private.battle_sheet(uuid)'::regprocedure) into f;execute replace(f,'private.battle_sheet(','private.battle_sheet_v42(');end if;
 if to_regprocedure('private.battle_hp_max_v42(jsonb)') is null then select pg_get_functiondef('private.battle_hp_max(jsonb)'::regprocedure) into f;execute replace(f,'private.battle_hp_max(','private.battle_hp_max_v42(');end if;
 if to_regprocedure('private.save_npc_v42(jsonb)') is null then select pg_get_functiondef('public.save_npc(jsonb)'::regprocedure) into f;execute replace(f,'public.save_npc(','private.save_npc_v42(');end if;
 if to_regprocedure('private.battle_character_speed_v42(uuid)') is null then select pg_get_functiondef('private.battle_character_speed(uuid)'::regprocedure) into f;f=replace(f,'private.battle_character_speed(','private.battle_character_speed_v42(');f=replace(f,'if s->''conditions'' ?|','if false and s->''conditions'' ?|');execute f;end if;
 if to_regprocedure('private.dnd37_save_bonus_v42(uuid,text)') is null then select pg_get_functiondef('private.dnd37_save_bonus(uuid,text)'::regprocedure) into f;execute replace(f,'private.dnd37_save_bonus(','private.dnd37_save_bonus_v42(');end if;
end $$;
create or replace function private.battle43_current(e public.battle_spell_effects) returns boolean language sql stable security definer set search_path='' as $$
 select e.active and (e.expires_at is null or e.expires_at>now() or exists(select 1 from public.battle_sessions s join public.battle_maps m on m.battle_session_id=s.id where m.id=e.map_id and s.status='active'))
$$;
create or replace function private.battle_sheet(p_token uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb=private.battle_sheet_v42(p_token);b jsonb;c jsonb;t public.battle_map_tokens;
begin
 select * into t from public.battle_map_tokens where id=p_token;
 if t.npc_id is not null then select stat_block into b from public.npc_stats where npc_id=t.npc_id;s=s||jsonb_build_object('conditions',coalesce(b->'conditions','[]'),'exhaustion',coalesce((b->>'exhaustion')::integer,0),'stat_block',b);end if;
 select coalesce(jsonb_agg(distinct v),'[]') into c from (select value v from jsonb_array_elements_text(coalesce(s->'conditions','[]')) union select condition from private.battle_condition_effects where token_id=t.id and active union select 'Invisível' where exists(select 1 from public.battle_spell_effects e where e.map_id=t.map_id and private.battle43_current(e) and e.definition->'entry'->>'catalog_id' in('invisibilidade','invisibilidade-maior') and e.definition->'scene_targets' ? t.id::text)) x;
 if c ?| array['Paralisado','Petrificado','Atordoado','Inconsciente'] and not c ? 'Incapacitado' then c=c||'["Incapacitado"]';end if;
 if c ? 'Inconsciente' and not c ? 'Caído' then c=c||'["Caído"]';end if;
 if coalesce((s->>'hp_current')::integer,1)<=0 and not c ? 'Inconsciente' then c=c||'["Inconsciente","Caído","Incapacitado"]';end if;
 if private.battle43_exhaustion(s)>0 and not c ? 'Exaustão' then c=c||'["Exaustão"]';end if;
 return s||jsonb_build_object('conditions',c);
end $$;
create or replace function private.battle_hp_max(p_sheet jsonb) returns integer language sql stable security definer set search_path='' as $$
 select greatest(1,floor(private.battle_hp_max_v42(p_sheet)::numeric/case when private.battle43_exhaustion(p_sheet)>=4 then 2 else 1 end)::integer)
$$;
create or replace function private.battle43_speed(t public.battle_map_tokens) returns numeric language plpgsql stable security definer set search_path='' as $$
declare s jsonb=private.battle_sheet(t.id);v numeric;b jsonb;n integer=private.battle43_exhaustion(s);
begin
 if s is null then return t.movement_speed;end if;
 if t.character_id is not null then v=private.battle_character_speed_v42(t.character_id)/case when t.movement_unit='ft' then .3 else 1 end;
 else b=s->'stat_block';v=coalesce((b->'movement'->>'walk')::numeric/case when t.movement_unit='ft' then .3 else 1 end,(select base_speed from private.battle43_npc_speed where token_id=t.id),t.movement_speed);end if;
 if n>=5 or coalesce(s->'conditions','[]') ?| array['Agarrado','Impedido','Paralisado','Petrificado','Atordoado','Inconsciente','Morto','Dead'] then return 0;end if;
 return greatest(0,coalesce(v,9))/case when n>=2 then 2 else 1 end;
end $$;
-- Preserve explicitly chosen NPC speed when an old NPC has no structured movement.
create table if not exists private.battle43_npc_speed(token_id uuid primary key references public.battle_map_tokens(id) on delete cascade,base_speed numeric not null);
revoke all on private.battle43_npc_speed from public,anon,authenticated;
insert into private.battle43_npc_speed select id,movement_speed from public.battle_map_tokens where npc_id is not null on conflict do nothing;
create or replace function private.battle_character_speed(p_character uuid) returns numeric language plpgsql stable security definer set search_path='' as $$
declare t public.battle_map_tokens;s jsonb;v numeric;
begin select * into t from public.battle_map_tokens where character_id=p_character order by created_at desc limit 1;if t.id is not null then return private.battle43_speed(t)*case when t.movement_unit='ft' then .3 else 1 end;end if;
 select system_data into s from public.characters where id=p_character;v=private.battle_character_speed_v42(p_character);if private.battle43_exhaustion(s)>=5 or coalesce(s->'conditions','[]') ?| array['Agarrado','Impedido','Paralisado','Petrificado','Atordoado','Inconsciente','Morto','Dead'] then return 0;end if;return v/case when private.battle43_exhaustion(s)>=2 then 2 else 1 end;
end $$;
create or replace function private.dnd37_save_bonus(p_token uuid,p_ability text) returns integer language sql stable security definer set search_path='' as $$
 select coalesce((private.battle_sheet(p_token)->'stat_block'->'saving_throws'->>p_ability)::integer,private.dnd37_save_bonus_v42(p_token,p_ability))
$$;
create or replace function public.save_npc(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare id uuid;b jsonb=coalesce(p_payload->'stat_block','{}');v jsonb;k text;
begin
 if jsonb_typeof(b)<>'object' or length(b::text)>20000 then raise exception 'Bloco de estatísticas inválido.';end if;
 foreach k in array array['movement','senses','saving_throws','skills'] loop if b ? k and jsonb_typeof(b->k)<>'object' then raise exception 'Campo % do bloco de estatísticas inválido.',k;end if;end loop;
 foreach k in array array['conditions','condition_immunities'] loop
  if b ? k then if jsonb_typeof(b->k)<>'array' then raise exception 'Lista de condições inválida.';end if;if jsonb_array_length(b->k)>50 then raise exception 'Lista de condições inválida.';end if;end if;
  for v in select value from jsonb_array_elements(coalesce(b->k,'[]')) loop if jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 100 then raise exception 'Condição inválida.';end if;end loop;
 end loop;
 if b ? 'size' and coalesce(b->>'size','') not in('Miúdo','Pequeno','Médio','Grande','Enorme','Imenso') then raise exception 'Tamanho de criatura inválido.';end if;
 for k,v in select * from jsonb_each(coalesce(b->'movement','{}')) loop if k not in('walk','fly','swim','climb','burrow') or jsonb_typeof(v)<>'number' or v::numeric not between 0 and 1000 then raise exception 'Deslocamento do NPC inválido.';end if;end loop;
 for k,v in select * from jsonb_each(coalesce(b->'senses','{}')) loop
  if k in('seeInvisible','blindBeyond') then if jsonb_typeof(v)<>'boolean' then raise exception 'Sentido do NPC inválido.';end if;
  elsif k not in('darkvision','blindsight','devilSight','trueSight') or jsonb_typeof(v)<>'number' or v::numeric not between 0 and 1000 then raise exception 'Alcance de sentido inválido.';end if;
 end loop;
 for k,v in select * from jsonb_each(coalesce(b->'saving_throws','{}')) loop if k not in('str','dex','con','int','wis','cha') or jsonb_typeof(v)<>'number' or v::numeric<>floor(v::numeric) or abs(v::numeric)>50 then raise exception 'Bônus de salvaguarda inválido.';end if;end loop;
 for k,v in select * from jsonb_each(coalesce(b->'skills','{}')) loop if k not in('acrobatics','animal_handling','arcana','athletics','deception','history','insight','intimidation','investigation','medicine','nature','perception','performance','persuasion','religion','sleight_of_hand','stealth','survival') or jsonb_typeof(v)<>'number' or v::numeric<>floor(v::numeric) or abs(v::numeric)>50 then raise exception 'Bônus de perícia inválido.';end if;end loop;
 if coalesce((b->>'exhaustion')::numeric,0) not between 0 and 6 or coalesce((b->>'exhaustion')::numeric,0)<>floor(coalesce((b->>'exhaustion')::numeric,0)) then raise exception 'Exaustão deve estar entre 0 e 6.';end if;
 if b ? 'proficiency' and (jsonb_typeof(b->'proficiency')<>'number' or (b->>'proficiency')::numeric not between 0 and 10 or (b->>'proficiency')::numeric<>floor((b->>'proficiency')::numeric)) then raise exception 'Proficiência inválida.';end if;
 id=private.save_npc_v42(p_payload);update public.npc_stats set stat_block=case when p_payload ? 'stat_block' then b else stat_block end where npc_id=id;return id;
end $$;

create table if not exists private.battle43_movement_spent(token_id uuid primary key references public.battle_map_tokens(id) on delete cascade,stamp timestamptz,spent numeric not null default 0);
revoke all on private.battle43_movement_spent from public,anon,authenticated;
create or replace function private.battle43_sync(p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens;s jsonb;v numeric;maxhp integer;used numeric;stamp timestamptz;previous private.battle43_movement_spent;sync_context text=coalesce(current_setting('battle43.sync',true),'off');rq public.battle_action_requests;g private.battle_guides;
begin
 select * into t from public.battle_map_tokens where id=p_token;if t.id is null or t.character_id is null and t.npc_id is null then return;end if;s=private.battle_sheet(t.id);if s is null then return;end if;v=private.battle43_speed(t);
 select bs.turn_started_at into stamp from public.battle_sessions bs join public.battle_maps m on m.battle_session_id=bs.id where m.id=t.map_id;
 select * into previous from private.battle43_movement_spent where token_id=t.id;
 used=case when previous.stamp is distinct from stamp or t.movement_speed>0 then greatest(0,t.movement_speed-t.movement_remaining) else coalesce(previous.spent,0) end;
 insert into private.battle43_movement_spent values(t.id,stamp,used) on conflict(token_id) do update set stamp=excluded.stamp,spent=excluded.spent;
 -- Preserve spent movement even while the effective speed is zero.
 perform set_config('battle43.sync','on',true);
 update public.battle_map_tokens set movement_remaining=greatest(0,v-used),movement_speed=v where id=t.id and (movement_speed is distinct from v or movement_remaining>v);
 perform set_config('battle43.sync',sync_context,true);
 if coalesce(s->'conditions','[]') ?| array['Incapacitado','Atordoado','Paralisado','Petrificado','Inconsciente','Morto','Dead'] then
  update public.battle_spell_effects set active=false,updated_at=clock_timestamp() where token_id=t.id and active and concentration;
  update public.battle_map_tokens set dodging=false where id=t.id and dodging;
  update public.battle_decisions set status='cancelled',answered_at=clock_timestamp() where token_id=t.id and kind='concentration' and status='pending';
  if coalesce(current_setting('battle43.interrupt',true),'')='' then
   perform set_config('battle43.interrupt','on',true);
   for rq in select * from public.battle_action_requests where token_id=t.id and status='pending' and id::text<>coalesce(current_setting('battle43.resolving',true),'') loop
    select * into g from private.battle_guides where request_id=rq.id;
    if g.request_id is not null and coalesce((rq.resolution->>'checks_started')::boolean,false) then perform private.battle_resolve_guided_core(rq.id,false,g.options||'{"guided":true}');end if;
    update public.battle_action_requests set status='cancelled',resolved_at=clock_timestamp(),resolution=resolution||'{"message":"A condição atual interrompeu a ação. Rolagens já iniciadas preservam o gasto dos recursos."}' where id=rq.id;
    update public.battle_decisions set status='cancelled',answered_at=clock_timestamp() where request_id=rq.id and status='pending';
   end loop;
   perform set_config('battle43.interrupt','',true);
  end if;
 end if;
 perform private.battle43_release_grapples(t.map_id);
 maxhp=private.battle_hp_max(s);
 if t.character_id is not null then if (s->>'hp_current')::integer>maxhp then update public.characters set system_data=jsonb_set(system_data,'{hp_current}',to_jsonb(maxhp)) where id=t.character_id;end if;
 else if (s->>'hp_current')::integer>maxhp then update public.npc_stats set hp_current=maxhp where npc_id=t.npc_id;end if;end if;
end $$;
-- Avoid consuming a cast twice if the caster falls to their own area damage.
do $$ declare f text;begin
 if to_regprocedure('private.battle43_resolve_core(uuid,boolean,jsonb)') is null then select pg_get_functiondef('private.battle_resolve_guided_core(uuid,boolean,jsonb)'::regprocedure) into f;execute replace(f,'private.battle_resolve_guided_core(','private.battle43_resolve_core(');end if;
end $$;
create or replace function private.battle_resolve_guided_core(p_request_id uuid,p_success boolean,p_resolution jsonb default '{}') returns public.battle_action_requests language plpgsql security definer set search_path='' as $$
declare result public.battle_action_requests;previous text=coalesce(current_setting('battle43.resolving',true),'');
begin perform set_config('battle43.resolving',p_request_id::text,true);result=private.battle43_resolve_core(p_request_id,p_success,p_resolution);perform set_config('battle43.resolving',previous,true);return result;end $$;
create or replace function private.battle43_concentration_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.active and new.concentration and (coalesce(private.battle_sheet(new.token_id)->'conditions','[]') ?| array['Incapacitado','Atordoado','Inconsciente','Paralisado','Petrificado','Morto','Dead'] or coalesce((private.battle_sheet(new.token_id)->>'hp_current')::integer,1)<=0) then new.active=false;end if;return new;end $$;
drop trigger if exists battle43_concentration_guard on public.battle_spell_effects;
create trigger battle43_concentration_guard before insert or update of active on public.battle_spell_effects for each row execute function private.battle43_concentration_guard();
create or replace function private.battle43_condition_change() returns trigger language plpgsql security definer set search_path='' as $$
begin if pg_trigger_depth()<8 then perform private.battle43_sync(case when tg_op='DELETE' then old.token_id else new.token_id end);end if;return null;end $$;
drop trigger if exists zz_battle43_condition_change on private.battle_condition_effects;
create trigger zz_battle43_condition_change after insert or update of active or delete on private.battle_condition_effects for each row execute function private.battle43_condition_change();
create or replace function private.battle43_sheet_change() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens;
begin if pg_trigger_depth()>8 then return new;end if;
 if tg_table_name='npc_stats' then update public.npcs set updated_at=clock_timestamp() where id=(to_jsonb(new)->>'npc_id')::uuid;end if;
 for t in select * from public.battle_map_tokens where case when tg_table_name='characters' then character_id=(to_jsonb(new)->>'id')::uuid else npc_id=(to_jsonb(new)->>'npc_id')::uuid end loop perform private.battle43_sync(t.id);end loop;
 return new;
end $$;
drop trigger if exists zz_battle43_sheet_change on public.characters;
create trigger zz_battle43_sheet_change after update of system_data on public.characters for each row when(old.system_data is distinct from new.system_data) execute function private.battle43_sheet_change();
drop trigger if exists zz_battle43_npc_change on public.npc_stats;
create trigger zz_battle43_npc_change after update of stat_block,hp_current on public.npc_stats for each row when(old.stat_block is distinct from new.stat_block or old.hp_current is distinct from new.hp_current) execute function private.battle43_sheet_change();
create or replace function private.battle39_conditions_public(p_campaign uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'token_id',c.token_id,'condition',c.condition,'label',q.name,'repeat_save',c.repeat_save,'dc',c.dc,'source_token_id',c.source_token_id,'manual',c.manual,'expires_round',c.expires_round) order by c.created_at,c.id),'[]') from private.battle_condition_effects c join public.battle_action_requests q on q.id=c.request_id where c.active and q.campaign_id=p_campaign and private.can_read_campaign(p_campaign) and private.can_read_battle_token(c.token_id)
$$;
create or replace function public.list_battle_life(p_campaign_id uuid,p_map_id uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'state',case when s.data->'conditions' ?| array['Morto','Dead'] or coalesce((s.data->>'death_failures')::integer,0)>=3 and (s.data->>'hp_current')::integer=0 then 'dead' when (s.data->>'hp_current')::integer=0 then case when t.npc_id is not null then 'dead' when s.data->'conditions' ? 'Estável' then 'stable' else 'dying' end when s.data->'conditions' ? 'Caído' then 'prone' else 'standing' end)||case when private.is_campaign_owner(p_campaign_id) or private.battle38_controls(t.id) then jsonb_build_object('hp_current',(s.data->>'hp_current')::integer,'hp_max',private.battle_hp_max(s.data),'ac',private.dnd37_armor(t.id),'hp_temp',coalesce((s.data->>'hp_temp')::integer,0),'death_successes',coalesce((s.data->>'death_successes')::integer,0),'death_failures',coalesce((s.data->>'death_failures')::integer,0),'conditions',s.data->'conditions','exhaustion',private.battle43_exhaustion(s.data)) else '{}'::jsonb end),'[]') from public.battle_map_tokens t cross join lateral (select private.battle_sheet(t.id) data) s where t.campaign_id=p_campaign_id and (t.character_id is not null or t.npc_id is not null) and s.data is not null and (p_map_id is null or t.map_id=p_map_id) and private.can_read_campaign(p_campaign_id) and private.can_read_battle_token(t.id)
$$;

create or replace function private.battle43_creature(p_token_id uuid,p_change jsonb,p_client_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens;s public.battle_sessions;q public.battle_action_requests;receipt private.battle43_commands;sheet jsonb;cond text;source uuid;rounds integer;level integer;outcome jsonb;e jsonb;damage integer;note text;
begin
 select * into t from public.battle_map_tokens where id=p_token_id;
 if t.id is null or auth.uid() is null or not private.is_campaign_owner(t.campaign_id) or not private.can_read_campaign(t.campaign_id) then raise exception 'Somente o mestre pode alterar esta criatura.' using errcode='42501';end if;
 if p_client_id is null or jsonb_typeof(p_change)<>'object' or length(p_change::text)>4000 then raise exception 'Comando inválido.';end if;
 select * into s from public.battle_sessions where id=(select battle_session_id from public.battle_maps where id=t.map_id) for update;perform 1 from public.campaigns where id=t.campaign_id for update;
 select * into receipt from private.battle43_commands where user_id=auth.uid() and client_id=p_client_id;
 if receipt.client_id is not null then if receipt.kind<>'creature' or receipt.subject<>t.id or receipt.payload<>p_change then raise exception 'Identificador já utilizado em outro comando.';end if;return receipt.map_id;end if;
 if exists(select 1 from public.campaign_sessions a join public.battle_maps m on m.adventure_session_id=a.id where m.id=t.map_id and a.status='ended') then raise exception 'Esta sessão está encerrada.';end if;
 select * into t from public.battle_map_tokens where id=t.id for update;sheet=private.battle_sheet(t.id);if sheet is null then raise exception 'Vincule uma ficha de NPC ou personagem a este token para alterar sua vida ou condições.';end if;cond=p_change->>'condition';
 if coalesce(p_change->>'operation','') not in('damage','healing','temporary','condition','remove_condition') then raise exception 'Operação inválida.';end if;
 if p_change->>'operation' in('damage','healing','temporary') then
  if jsonb_typeof(p_change->'amount')<>'number' or (p_change->>'amount')::numeric<>floor((p_change->>'amount')::numeric) or (p_change->>'amount')::integer not between 1 and 100000 then raise exception 'Quantidade de PV inválida.';end if;
  if coalesce(p_change->>'damage_type','') not in('','ácido','concussão','cortante','elétrico','energético','fogo','frio','necrótico','perfurante','psíquico','radiante','trovejante','veneno') then raise exception 'Tipo de dano inválido.';end if;
  note=case p_change->>'operation' when 'damage' then 'Dano aplicado pelo mestre' when 'healing' then 'Cura aplicada pelo mestre' else 'PV temporários concedidos pelo mestre' end;
 else note=case when p_change->>'operation'='condition' then cond else 'Remover '||cond end||coalesce(' · '||nullif(left(p_change->>'note',200),''),'');end if;
 insert into public.battle_action_requests(campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,name,cost,target,target_ids,definition,round,turn_index,turn_started_at,status,resolution)
 values(t.campaign_id,s.id,t.map_id,t.id,auth.uid(),p_client_id,'feature',note,'free',jsonb_build_object('x',t.x,'y',t.y),array[t.id],'{"kind":"utility","shape":"single","master_control":true}',s.round,s.turn_index,s.turn_started_at,'success','{}') returning * into q;
 if p_change->>'operation' in('damage','healing','temporary') then
  e=jsonb_build_object('kind',p_change->>'operation','shape','single','damageType',coalesce(p_change->>'damage_type',''),'dice',p_change->>'amount');
  outcome=private.battle_apply_hp(q,t,e,jsonb_build_object('dice',p_change->>'amount','target_ids',jsonb_build_array(t.id),'critical',coalesce((p_change->>'critical')::boolean,false)));
  update public.battle_action_requests set resolution=outcome||jsonb_build_object('message',note),resolved_at=clock_timestamp() where id=q.id;
  select coalesce(sum(amount),0) into damage from public.battle_action_effects where request_id=q.id and kind='damage';
  if damage>0 and coalesce((private.battle_sheet(t.id)->>'hp_current')::integer,0)>0 and coalesce((select concentration_checks from public.campaign_rules where campaign_id=t.campaign_id),true) and exists(select 1 from public.battle_spell_effects where token_id=t.id and active and concentration) then perform private.battle37_add_decision(q,t.id,'concentration',0,'Manter concentração após dano do mestre','con',greatest(10,damage/2),private.dnd37_save_bonus(t.id,'con'),'normal','{}');end if;
 else
  if p_change->>'operation'='remove_condition' then
   if cond is null or length(cond)>100 then raise exception 'Condição inválida.';end if;
   update private.battle_condition_effects set active=false where token_id=t.id and condition=cond and active;
   if t.character_id is not null then update public.characters set system_data=jsonb_set(system_data,'{conditions}',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(system_data->'conditions','[]')) v where v<>cond),'[]'))||case when cond='Exaustão' then '{"exhaustion":0}'::jsonb else '{}'::jsonb end where id=t.character_id;
   else update public.npc_stats set stat_block=jsonb_set(stat_block,'{conditions}',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(stat_block->'conditions','[]')) v where v<>cond),'[]'))||case when cond='Exaustão' then '{"exhaustion":0}'::jsonb else '{}'::jsonb end where npc_id=t.npc_id;end if;
  else
   if cond not in('Agarrado','Amedrontado','Atordoado','Caído','Cego','Enfeitiçado','Envenenado','Impedido','Incapacitado','Inconsciente','Invisível','Paralisado','Petrificado','Surdo','Exaustão') then raise exception 'Condição inválida.';end if;
   if coalesce(sheet->'stat_block'->'condition_immunities','[]') ? cond or cond='Envenenado' and sheet->'conditions' ? 'Petrificado' then raise exception 'Esta criatura é imune à condição %.',cond;end if;
   if cond='Exaustão' then
    level=coalesce((p_change->>'level')::integer,1);if level not between 1 and 6 then raise exception 'Exaustão deve estar entre 1 e 6.';end if;
    if t.character_id is not null then update public.characters set system_data=system_data||jsonb_build_object('exhaustion',level)||case when level=6 then jsonb_build_object('hp_current',0,'death_failures',3,'conditions',coalesce(system_data->'conditions','[]')||'["Morto"]') else '{}'::jsonb end where id=t.character_id;
    else update public.npc_stats set stat_block=stat_block||jsonb_build_object('exhaustion',level)||case when level=6 then jsonb_build_object('conditions',coalesce(stat_block->'conditions','[]')||'["Morto"]') else '{}'::jsonb end,hp_current=case when level=6 then 0 else hp_current end where npc_id=t.npc_id;end if;
   else
    source=nullif(p_change->>'source_token_id','')::uuid;if source is not null and not exists(select 1 from public.battle_map_tokens where id=source and map_id=t.map_id and id<>t.id) then raise exception 'Fonte da condição fora deste mapa.';end if;
    rounds=nullif(p_change->>'rounds','')::integer;if rounds is not null and rounds not between 1 and 10000 then raise exception 'Duração inválida.';end if;
    if source is not null and cond='Agarrado' and coalesce((p_change->>'source_reach')::numeric,1.5) not between .5 and 30 then raise exception 'Alcance do agarrão inválido.';end if;
    insert into private.battle_condition_effects(request_id,token_id,condition,source_token_id,source_reach,expires_round,expiry_scope,manual) values(q.id,t.id,cond,source,coalesce((p_change->>'source_reach')::numeric,1.5),case when rounds is not null then s.round+rounds else null end,'target_start',true);
   end if;
  end if;
 end if;
 perform private.battle43_sync(t.id);
 if t.character_id is not null and s.status='active' and s.active_token_id=t.id then perform private.battle40_ensure_death(s);end if;
 insert into private.battle43_commands values(auth.uid(),p_client_id,'creature',t.id,p_change,t.map_id);return t.map_id;
end $$;
create or replace function public.manage_battle_creature(p_token_id uuid,p_change jsonb,p_client_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m uuid;begin m=private.battle43_creature(p_token_id,p_change,p_client_id);return public.battle_combat_update(m);end $$;

create or replace function private.battle43_senses(t public.battle_map_tokens) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb=private.battle_sheet(t.id);b jsonb;v jsonb;r jsonb;e public.battle_spell_effects;dark numeric=0;devil numeric=0;truth numeric=0;blind numeric=0;invisible boolean=false;blind_beyond boolean=false;
begin
 if t.character_id is not null then
  select data into r from public.dnd_races where id=s->>'race_id' or name=s->>'race' order by (id=s->>'race_id') desc nulls last limit 1;dark=coalesce((r->>'darkvision')::numeric,0);
  if s::text like '%"devil-sight"%' or coalesce(s->>'features','') ~* 'vis[aã]o diab[oó]lica' then devil=36;end if;
  if coalesce(s->>'features','') ~* 'vis[aã]o no escuro superior' then dark=greatest(dark,36);end if;
 else
  b=s->'stat_block';select data into r from public.dnd_races where name=(select race from public.npcs where id=t.npc_id);dark=coalesce((b->'senses'->>'darkvision')::numeric,(r->>'darkvision')::numeric,0);devil=coalesce((b->'senses'->>'devilSight')::numeric,0);truth=coalesce((b->'senses'->>'trueSight')::numeric,0);blind=coalesce((b->'senses'->>'blindsight')::numeric,0);invisible=coalesce((b->'senses'->>'seeInvisible')::boolean,false);blind_beyond=coalesce((b->'senses'->>'blindBeyond')::boolean,false);
 end if;
 for e in select e0.* from public.battle_spell_effects e0 where map_id=t.map_id and private.battle43_current(e0) and (definition->'scene_targets' ? t.id::text or coalesce(jsonb_array_length(definition->'scene_targets'),0)=0 and t.x<=(target->>'x')::numeric and t.x+t.size>(target->>'x')::numeric and t.y<=(target->>'y')::numeric and t.y+t.size>(target->>'y')::numeric) loop
  if e.definition->'entry'->>'catalog_id'='visao-no-escuro' then dark=greatest(dark,18);elsif e.definition->'entry'->>'catalog_id'='visao-da-verdade' then truth=greatest(truth,36);elsif e.definition->'entry'->>'catalog_id'='ver-o-invisivel' then invisible=true;end if;
 end loop;
 return jsonb_build_object('darkvision',dark,'devilSight',devil,'trueSight',truth,'blindsight',blind,'seeInvisible',invisible,'blindBeyond',blind_beyond);
end $$;
create or replace function private.battle43_level(m public.battle_maps,p_x integer,p_y integer) returns integer language plpgsql stable security definer set search_path='' as $$
declare level integer;r jsonb;e public.battle_spell_effects;t public.battle_map_tokens;
begin
 if not m.vision_enabled then return 0;end if;
 level=case case when m.lighting='night' then m.darkness_level else m.day_darkness_level end when 'dim' then 1 when 'dark' then 2 when 'magical' then 3 else 0 end;
 for r in select value from jsonb_array_elements(coalesce(m.darkness_regions,'[]')) loop if p_x>=(r->>'x')::numeric and p_y>=(r->>'y')::numeric and p_x<(r->>'x')::numeric+(r->>'width')::numeric and p_y<(r->>'y')::numeric+(r->>'height')::numeric then level=case r->>'level' when 'dim' then 1 when 'dark' then 2 when 'magical' then 3 else 0 end;end if;end loop;
 for e in select e0.* from public.battle_spell_effects e0 where map_id=m.id and private.battle43_current(e0) and (definition->'scene' ? 'darkness' or coalesce((definition->'scene'->>'opaque')::boolean,false)) loop
  select * into t from public.battle_map_tokens where id=e.token_id;t.x=p_x;t.y=p_y;t.size=1;
  if private.battle42_inside(e,t) then if e.definition->'scene'->>'darkness'='absolute' or coalesce((e.definition->'scene'->>'opaque')::boolean,false) then return 4;else level=3;end if;end if;
 end loop;return level;
end $$;
create or replace function private.battle43_wall(m uuid,x integer,y integer) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.battle_map_cells where map_id=m and battle_map_cells.x=battle43_wall.x and battle_map_cells.y=battle43_wall.y and blocked) or exists(select 1 from public.battle_map_objects o where o.map_id=m and o.visible and o.blocks_vision and x>=floor((o.geometry->>'x')::numeric) and y>=floor((o.geometry->>'y')::numeric) and x<ceil((o.geometry->>'x')::numeric+(o.geometry->>'width')::numeric) and y<ceil((o.geometry->>'y')::numeric+(o.geometry->>'height')::numeric))
$$;
create or replace function private.battle43_ray(m public.battle_maps,fx integer,fy integer,tx integer,ty integer,senses jsonb default '{}') returns boolean language plpgsql stable security definer set search_path='' as $$
declare x integer=fx;y integer=fy;dx integer=abs(tx-fx);dy integer=abs(ty-fy);sx integer=case when fx<tx then 1 else -1 end;sy integer=case when fy<ty then 1 else -1 end;err integer=abs(tx-fx)-abs(ty-fy);twice integer;px integer;py integer;level integer;d numeric;scale numeric=m.scale_per_cell*case when m.scale_unit='ft' then .3 else 1 end;special numeric=greatest(coalesce((senses->>'devilSight')::numeric,0),coalesce((senses->>'trueSight')::numeric,0),coalesce((senses->>'blindsight')::numeric,0));
begin
 loop
  if x<0 or y<0 or x>=m.width or y>=m.height then return false;end if;
  d=sqrt(power(x-fx,2)+power(y-fy,2))*scale;level=private.battle43_level(m,x,y);
  if level=4 and (coalesce((senses->>'blindsight')::numeric,0)<=0 or d>coalesce((senses->>'blindsight')::numeric,0)) then return false;end if;if level=3 then if special<=0 or d>special then if not private.battle43_magic_lit(m,x,y) then return false;end if;end if;end if;
  if (x<>fx or y<>fy) and (x<>tx or y<>ty) and private.battle43_wall(m.id,x,y) then return false;end if;
  if x=tx and y=ty then exit;end if;px=x;py=y;twice=2*err;if twice > -dy then err=err-dy;x=x+sx;end if;if twice<dx then err=err+dx;y=y+sy;end if;
  if x<>px and y<>py and private.battle43_wall(m.id,x,py) and private.battle43_wall(m.id,px,y) then return false;end if;
 end loop;return true;
end $$;
create or replace function private.battle43_magic_lit(m public.battle_maps,x integer,y integer) returns boolean language plpgsql stable security definer set search_path='' as $$
declare e public.battle_spell_effects;p jsonb;castlevel integer;radius numeric;scale numeric=m.scale_per_cell*case when m.scale_unit='ft' then .3 else 1 end;
begin
 for e in select e0.* from public.battle_spell_effects e0 where map_id=m.id and private.battle43_current(e0) and definition->'scene' ? 'light' loop
  select greatest(q.resource_level,q.spell_level,coalesce(s.level,0)) into castlevel from public.battle_action_requests q left join public.dnd_spells s on s.id=e.definition->'entry'->>'catalog_id' where q.id=e.request_id;if coalesce(castlevel,0)<3 then continue;end if;
  radius=(e.definition->'scene'->'light'->>'bright')::numeric+(e.definition->'scene'->'light'->>'dim')::numeric;
  for p in select * from private.battle42_light_points(e) loop
   if sqrt(power(x+.5-(p->>'x')::numeric,2)+power(y+.5-(p->>'y')::numeric,2))*scale<=radius and private.battle43_ray(m,floor((p->>'x')::numeric)::integer,floor((p->>'y')::numeric)::integer,x,y,'{"devilSight":10000}') then return true;end if;
  end loop;
 end loop;return false;
end $$;
create or replace function private.battle43_illumination(m public.battle_maps,p_x integer,p_y integer) returns integer language plpgsql stable security definer set search_path='' as $$
declare level integer=private.battle43_level(m,p_x,p_y);o public.battle_map_objects;e public.battle_spell_effects;p jsonb;radius numeric;bright numeric;d numeric;lx numeric;ly numeric;scale numeric=m.scale_per_cell*case when m.scale_unit='ft' then .3 else 1 end;castlevel integer;
begin
 if level=0 or level=4 then return level;end if;
 if level<>3 then
  for o in select * from public.battle_map_objects where map_id=m.id and visible and coalesce((metadata->>'light_enabled')::boolean,true) and (metadata->>'light_enabled'='true' or object_type in('torch','campfire','fire','forge','lava','portal','lanternpost','candelabra','fireplace','beacon','altar','magiccircle') or object_type in('rock','stalagmite') and metadata->>'variant'='crystal' or object_type='mountain' and metadata->>'variant'='volcano') loop
   radius=coalesce((o.metadata->>'light_radius')::numeric,case o.object_type when 'torch' then case when o.metadata->>'variant'='arcane' then 9 else 12 end when 'campfire' then case when o.metadata->>'variant'='brazier' then 12 else 9 end when 'fire' then 10.5 when 'forge' then 6 when 'lava' then 9 when 'portal' then 7.5 when 'lanternpost' then 10.5 when 'candelabra' then 4.5 when 'fireplace' then 9 when 'beacon' then 9 when 'altar' then case when o.metadata->>'variant'='arcane' then 6 else 3 end when 'magiccircle' then 4.5 else 4.5 end);lx=(o.geometry->>'x')::numeric+(o.geometry->>'width')::numeric/2;ly=(o.geometry->>'y')::numeric+(o.geometry->>'height')::numeric/2;
   d=sqrt(power(p_x+.5-lx,2)+power(p_y+.5-ly,2))*scale;
   if d<=radius and private.battle43_ray(m,floor(lx)::integer,floor(ly)::integer,p_x,p_y,'{}') then level=least(level,case when d<=radius/2 then 0 else 1 end);end if;
  end loop;
 end if;
 for e in select e0.* from public.battle_spell_effects e0 where map_id=m.id and private.battle43_current(e0) and definition->'scene' ? 'light' loop
  bright=(e.definition->'scene'->'light'->>'bright')::numeric;radius=bright+(e.definition->'scene'->'light'->>'dim')::numeric;
  select greatest(q.resource_level,q.spell_level,coalesce((q.definition->'entry'->>'level')::integer,0),coalesce(s.level,0)) into castlevel from public.battle_action_requests q left join public.dnd_spells s on s.id=q.definition->'entry'->>'catalog_id' where q.id=e.request_id;
  if level=3 and coalesce(castlevel,0)<3 then continue;end if;
  for p in select * from private.battle42_light_points(e) loop
   lx=(p->>'x')::numeric;ly=(p->>'y')::numeric;d=sqrt(power(p_x+.5-lx,2)+power(p_y+.5-ly,2))*scale;
   if d<=radius and private.battle43_ray(m,floor(lx)::integer,floor(ly)::integer,p_x,p_y,case when castlevel>=3 then '{"devilSight":10000}'::jsonb else '{}'::jsonb end) then level=least(level,case when d<=bright then 0 else 1 end);end if;
  end loop;
 end loop;return level;
end $$;
create or replace function private.battle43_can_see(a public.battle_map_tokens,t public.battle_map_tokens,m public.battle_maps) returns boolean language plpgsql stable security definer set search_path='' as $$
declare s jsonb=private.battle_sheet(a.id);senses jsonb=private.battle43_senses(a);d numeric=sqrt(power((a.x+a.size/2)-(t.x+t.size/2),2)+power((a.y+a.size/2)-(t.y+t.size/2),2))*m.scale_per_cell*case when m.scale_unit='ft' then .3 else 1 end;level integer;blind boolean;invisible boolean;
begin
 if a.map_id<>t.map_id or (s->>'hp_current')::integer<=0 or s->'conditions' ?| array['Inconsciente','Morto','Dead'] then return false;end if;
 blind=coalesce((senses->>'blindsight')::numeric,0)>0 and d<=coalesce((senses->>'blindsight')::numeric,0);
 if (s->'conditions' ? 'Cego' or coalesce((senses->>'blindBeyond')::boolean,false)) and not blind then return false;end if;
 if exists(select 1 from public.battle_map_fog where map_id=m.id and x=floor(t.x+t.size/2) and y=floor(t.y+t.size/2)) then return false;end if;
 if not private.battle43_ray(m,floor(a.x+a.size/2)::integer,floor(a.y+a.size/2)::integer,floor(t.x+t.size/2)::integer,floor(t.y+t.size/2)::integer,senses) then return false;end if;
 level=private.battle43_illumination(m,floor(t.x+t.size/2)::integer,floor(t.y+t.size/2)::integer);
 if not blind and (level=4 or level=3 and d>greatest((senses->>'devilSight')::numeric,(senses->>'trueSight')::numeric) or level=2 and d>greatest((senses->>'darkvision')::numeric,(senses->>'devilSight')::numeric,(senses->>'trueSight')::numeric)) then return false;end if;
 invisible=coalesce(private.battle_sheet(t.id)->'conditions','[]') ? 'Invisível' and not exists(select 1 from public.battle_spell_effects e where e.map_id=m.id and active and definition->'entry'->>'catalog_id'='fogo-das-fadas' and definition->'light_targets' ? t.id::text);
 if invisible and not blind and not coalesce((senses->>'seeInvisible')::boolean,false) and d>(senses->>'trueSight')::numeric then return false;end if;return true;
end $$;
create or replace function private.battle37_attack_mode(a public.battle_map_tokens,t public.battle_map_tokens,m public.battle_maps) returns text language plpgsql stable security definer set search_path='' as $$
declare s jsonb=private.battle_sheet(a.id);ac jsonb=coalesce(s->'conditions','[]');tc jsonb=coalesce(private.battle_sheet(t.id)->'conditions','[]');adv boolean;dis boolean;d numeric=private.battle37_target_range(a,t,m);a_see boolean=private.battle43_can_see(a,t,m);t_see boolean=private.battle43_can_see(t,a,m);a_invis boolean;t_invis boolean;c private.battle_condition_effects;source public.battle_map_tokens;
begin
 a_invis=ac ? 'Invisível' and not exists(select 1 from public.battle_spell_effects where map_id=m.id and active and definition->'entry'->>'catalog_id'='fogo-das-fadas' and definition->'light_targets' ? a.id::text);
 t_invis=tc ? 'Invisível' and not exists(select 1 from public.battle_spell_effects where map_id=m.id and active and definition->'entry'->>'catalog_id'='fogo-das-fadas' and definition->'light_targets' ? t.id::text);
 adv=not t_see or tc ?| array['Impedido','Paralisado','Petrificado','Atordoado','Inconsciente'] or a_invis or d<=1.50001 and tc ? 'Caído';
 dis=not a_see or ac ?| array['Envenenado','Impedido','Caído','Desvantagem no próximo ataque'] or private.battle43_exhaustion(s)>=3 or t_invis or d>1.50001 and tc ? 'Caído' or t.dodging and t_see and t.movement_speed>0 and not tc ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado'];
 for c in select * from private.battle_condition_effects where token_id=a.id and active and condition='Amedrontado' and source_token_id is not null loop select * into source from public.battle_map_tokens where id=c.source_token_id;if source.id is not null and private.battle43_can_see(a,source,m) then dis=true;end if;end loop;
 return case when adv=dis then 'normal' when adv then 'advantage' else 'disadvantage' end;
end $$;
create or replace function private.battle43_decision() returns trigger language plpgsql security definer set search_path='' as $$
declare s jsonb=private.battle_sheet(new.token_id);t public.battle_map_tokens;adv boolean=new.mode='advantage';dis boolean=new.mode='disadvantage';n integer=private.battle43_exhaustion(s);is_check boolean=coalesce((new.options->>'ability_check')::boolean,false);
begin
 if new.kind not in('save','condition','concentration') then return new;end if;select * into t from public.battle_map_tokens where id=new.token_id;
 if is_check then if n>=1 or s->'conditions' ? 'Envenenado' then dis=true;end if;
 else if n>=3 then dis=true;end if;if new.ability='dex' and s->'conditions' ? 'Impedido' then dis=true;end if;if new.ability='dex' and t.dodging and t.movement_speed>0 and not coalesce(s->'conditions','[]') ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado'] then adv=true;end if;if new.ability='str' and t.raging then adv=true;end if;end if;
 new.mode=case when adv=dis then 'normal' when adv then 'advantage' else 'disadvantage' end;new.options=new.options||jsonb_build_object('roll_plan',private.battle39_plan(new));return new;
end $$;

drop trigger if exists zz_battle43_decision on public.battle_decisions;
create trigger zz_battle43_decision before insert on public.battle_decisions for each row execute function private.battle43_decision();
create or replace function private.battle43_condition_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare s jsonb=private.battle_sheet(new.token_id);
begin if new.active and (coalesce(s->'stat_block'->'condition_immunities','[]') ? new.condition or new.condition='Envenenado' and s->'conditions' ? 'Petrificado') then return null;end if;return new;end $$;
drop trigger if exists battle43_condition_guard on private.battle_condition_effects;
create trigger battle43_condition_guard before insert or update of active on private.battle_condition_effects for each row execute function private.battle43_condition_guard();

create or replace function private.dnd_damage_amount(t public.battle_map_tokens,s jsonb,e jsonb,roll integer,saved boolean,options jsonb) returns integer language plpgsql stable security definer set search_path='' as $$
declare factor numeric;amount integer=0;parts jsonb;part jsonb;dtype text;v integer;resist boolean;immune boolean;vulnerable boolean;resistances text='';weaknesses text='';immunities text='';has_evasion boolean;
begin
 factor=case when saved then case when coalesce((e->>'halfOnSave')::boolean,false) then .5 else 0 end else 1 end;
 has_evasion=t.character_id is not null and (private.dnd_class_level(s,'rogue')>=7 or private.dnd_class_level(s,'monk')>=7 or exists(select 1 from jsonb_array_elements(private.dnd_levels(s)) c where c->>'class_id'='ranger' and c->>'subclass_id'='hunter' and (c->>'level')::integer>=15 and c->'choices'->'hunter-15' ? 'Evasão')) and not coalesce(s->'conditions','[]') ?| array['Incapacitado','Inconsciente','Paralisado','Atordoado','Petrificado'];
 if has_evasion and lower(coalesce(e->>'save',''))='dex' and coalesce((e->>'halfOnSave')::boolean,false) then factor=case when saved then 0 else .5 end;end if;
 if t.npc_id is not null then select ns.resistances,ns.weaknesses,ns.stat_block->>'damage_immunities' into resistances,weaknesses,immunities from public.npc_stats ns where ns.npc_id=t.npc_id;end if;
 parts=case when jsonb_array_length(coalesce(options->'damage_parts','[]'))>0 then options->'damage_parts' else jsonb_build_array(jsonb_build_object('amount',roll,'damageType',e->>'damageType')) end;
 for part in select value from jsonb_array_elements(parts) loop
  dtype=translate(lower(coalesce(part->>'damageType','')),'áéíóúãõçêô','aeiouaoceo');v=floor((part->>'amount')::numeric*factor);
  immune=dtype<>'' and dtype=any(regexp_split_to_array(translate(lower(coalesce(immunities,'')),'áéíóúãõçêô','aeiouaoceo'),'\s*[,;]\s*')) or dtype='veneno' and (private.dnd_class_level(s,'monk')>=10 or s->'conditions' ? 'Petrificado');
  resist=coalesce(s->'conditions','[]') ? 'Petrificado' or dtype<>'' and dtype=any(regexp_split_to_array(translate(lower(coalesce(resistances,'')),'áéíóúãõçêô','aeiouaoceo'),'\s*[,;]\s*')) or t.raging and dtype in('cortante','perfurante','concussao') and not exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i->>'armor_type'='heavy' and coalesce((i->>'equipped')::boolean,false) and (i->>'quantity')::integer>0);
  vulnerable=dtype<>'' and dtype=any(regexp_split_to_array(translate(lower(coalesce(weaknesses,'')),'áéíóúãõçêô','aeiouaoceo'),'\s*[,;]\s*'));
  if immune then v=0;else if resist then v=floor(v::numeric/2);end if;if vulnerable then v=v*2;end if;end if;amount=amount+v;
 end loop;return amount;
end $$;

create or replace function private.battle43_release_grapples(p_map uuid) returns void language plpgsql security definer set search_path='' as $$
declare c private.battle_condition_effects;a public.battle_map_tokens;t public.battle_map_tokens;m public.battle_maps;
begin select * into m from public.battle_maps where id=p_map;
 for c in select * from private.battle_condition_effects where active and condition='Agarrado' and source_token_id is not null and token_id in(select id from public.battle_map_tokens where map_id=p_map) loop
  select * into a from public.battle_map_tokens where id=c.source_token_id;select * into t from public.battle_map_tokens where id=c.token_id;
  if a.id is null or a.map_id<>t.map_id or coalesce(private.battle_sheet(a.id)->'conditions','[]') ?| array['Incapacitado','Inconsciente','Paralisado','Atordoado','Petrificado','Morto','Dead'] or coalesce((private.battle_sheet(a.id)->>'hp_current')::integer,0)<=0 or private.battle37_target_range(a,t,m)>c.source_reach then update private.battle_condition_effects set active=false where id=c.id;end if;
 end loop;
end $$;
create or replace function private.battle43_moved() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.battle43_release_grapples(new.map_id);return new;end $$;
drop trigger if exists zz_battle43_moved on public.battle_map_tokens;
create trigger zz_battle43_moved after update of x,y,map_id on public.battle_map_tokens for each row execute function private.battle43_moved();
create or replace function private.battle43_validate_move(t public.battle_map_tokens,path jsonb,forced boolean) returns void language plpgsql security definer set search_path='' as $$
declare c private.battle_condition_effects;a public.battle_map_tokens;p jsonb;sample public.battle_map_tokens=t;m public.battle_maps;before numeric;after numeric;s jsonb=private.battle_sheet(t.id);
begin
 if forced and private.is_campaign_owner(t.campaign_id) then return;end if;
 if coalesce((s->>'hp_current')::integer,1)<=0 or private.battle43_exhaustion(s)>=5 or coalesce(s->'conditions','[]') ?| array['Agarrado','Impedido','Inconsciente','Paralisado','Atordoado','Petrificado','Morto','Dead'] then raise exception 'A condição atual impede deslocamento.';end if;
 select * into m from public.battle_maps where id=t.map_id;
 for c in select * from private.battle_condition_effects where token_id=t.id and active and condition='Amedrontado' and source_token_id is not null loop
  select * into a from public.battle_map_tokens where id=c.source_token_id;sample=t;before=private.battle37_target_range(a,sample,m);
  for p in select value from jsonb_array_elements(coalesce(path,'[]')) loop sample.x=(p->>'x')::integer;sample.y=(p->>'y')::integer;after=private.battle37_target_range(a,sample,m);if after<before-.00001 then raise exception 'Amedrontado: você não pode se aproximar voluntariamente da fonte do medo.';end if;before=after;end loop;
 end loop;
end $$;
create or replace function private.battle43_request_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare c private.battle_condition_effects;a public.battle_map_tokens;t public.battle_map_tokens;m public.battle_maps;
begin
 if new.definition->>'master_control'='true' then return new;end if;
 if new.kind not in('weapon','spell','feature','item','opportunity') or not(new.definition->>'kind'='damage' or coalesce((new.definition->>'attackRoll')::boolean,false) or nullif(new.definition->>'condition','') is not null or nullif(new.definition->>'save','') is not null) then return new;end if;
 select * into a from public.battle_map_tokens where id=new.token_id;select * into m from public.battle_maps where id=new.map_id;
 for c in select * from private.battle_condition_effects where token_id=a.id and active and condition='Enfeitiçado' and source_token_id is not null loop select * into t from public.battle_map_tokens where id=c.source_token_id;
  if t.id=any(new.target_ids) or new.definition->>'shape' not in('single','self') and private.battle_in_effect(t,a,new.target,new.definition,m.scale_per_cell*case when m.scale_unit='ft' then .3 else 1 end) then raise exception 'Enfeitiçado: você não pode atacar ou prejudicar a fonte do encantamento.';end if;
 end loop;return new;
end $$;
drop trigger if exists battle43_request_guard on public.battle_action_requests;
create trigger battle43_request_guard before insert on public.battle_action_requests for each row execute function private.battle43_request_guard();

create or replace function private.battle43_narrative(p_request_id uuid,p_options jsonb,p_client_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests;t public.battle_map_tokens;s public.battle_sessions;m public.battle_maps;fx public.battle_spell_effects;receipt private.battle43_commands;g jsonb=p_options->'geometry';point jsonb=p_options->'target';d jsonb;scene jsonb;has_other boolean;
begin
 select * into q from public.battle_action_requests where id=p_request_id;
 if auth.uid() is null or q.id is null or not private.is_campaign_owner(q.campaign_id) or not private.can_read_campaign(q.campaign_id) then raise exception 'Somente o mestre pode manter a marcação narrativa.' using errcode='42501';end if;
 if p_client_id is null then raise exception 'Identificador de comando ausente.';end if;
 select * into s from public.battle_sessions where id=q.session_id for update;perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into receipt from private.battle43_commands where user_id=auth.uid() and client_id=p_client_id;if receipt.client_id is not null then if receipt.kind<>'narrative' or receipt.subject<>q.id or receipt.payload<>p_options then raise exception 'Identificador já utilizado em outro comando.';end if;return receipt.map_id;end if;
 if q.status<>'success' or q.kind<>'spell' or q.definition->>'kind'<>'utility' then raise exception 'Escolha uma magia narrativa que já foi utilizada.';end if;
 select * into m from public.battle_maps where id=q.map_id;select * into t from public.battle_map_tokens where id=q.token_id;
 if exists(select 1 from public.campaign_sessions where id=m.adventure_session_id and status='ended') then raise exception 'Esta sessão está encerrada.';end if;
 if jsonb_typeof(g)<>'object' or g->>'shape' not in('sphere','cube','line','cone','wall') or g->>'origin' not in('point','self') or coalesce((g->>'size')::numeric,0) not between .1 and 1000 or coalesce((g->>'width')::numeric,0) not between .1 and 1000 or abs(coalesce((g->>'rotation')::numeric,0))>360 then raise exception 'Área narrativa inválida.';end if;
 if p_options->>'visual' not in('arcane','radiant','spirit','mist','fire','vines','barrier') then raise exception 'Aparência inválida.';end if;
 if jsonb_typeof(point)<>'object' or coalesce((point->>'x')::numeric,-1) not between 0 and m.width-1 or coalesce((point->>'y')::numeric,-1) not between 0 and m.height-1 then raise exception 'Escolha uma posição dentro do mapa.';end if;
 select e0.* into fx from public.battle_spell_effects e0 where request_id=q.id and private.battle43_current(e0) order by created_at desc limit 1 for update;
 if fx.id is null and exists(select 1 from public.battle_spell_effects where request_id=q.id) then raise exception 'O efeito já terminou. Conjure novamente para criar um novo efeito.';end if;
 d=coalesce(fx.definition,q.definition);scene=coalesce(d->'scene','{}')||jsonb_build_object('persistent',true,'visual',p_options->>'visual','narrative_marker',true);
 d=d||g||jsonb_build_object('scene',scene,'scene_origin',jsonb_build_object('x',t.x,'y',t.y));
 if fx.id is not null then update public.battle_spell_effects set definition=d,target=point,updated_at=clock_timestamp() where id=fx.id;
 else
  has_other=exists(select 1 from public.battle_spell_effects where token_id=t.id and active and concentration);
  if coalesce((d->>'concentration')::boolean,false) and has_other then raise exception 'O conjurador já mantém outra concentração.';end if;
  insert into public.battle_spell_effects(request_id,campaign_id,map_id,token_id,name,definition,target,concentration,duration) values(q.id,q.campaign_id,q.map_id,q.token_id,q.name,d,point,coalesce((d->>'concentration')::boolean,false),coalesce(d->>'duration','Marcador narrativo · até o mestre encerrar'));
 end if;
 insert into private.battle43_commands values(auth.uid(),p_client_id,'narrative',q.id,p_options,q.map_id);return q.map_id;
end $$;
create or replace function public.keep_narrative_spell(p_request_id uuid,p_options jsonb,p_client_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m uuid;begin m=private.battle43_narrative(p_request_id,p_options,p_client_id);return public.battle_combat_update(m);end $$;

do $$ declare f text;begin
 select pg_get_functiondef('private.battle_apply_hp_v11(public.battle_action_requests,public.battle_map_tokens,jsonb,jsonb)'::regprocedure) into f;
 if position('battle43_npc_maximum' in f)=0 then f=replace(f,'select hp_current,hp_max,hp_temp into hp,maxhp,temp from public.npc_stats where npc_id=t.npc_id for update;', 'select hp_current,hp_max,hp_temp into hp,maxhp,temp from public.npc_stats where npc_id=t.npc_id for update; maxhp=private.battle_hp_max(private.battle_sheet(t.id)); -- battle43_npc_maximum');execute f;end if;
end $$;
create or replace function private.battle43_fall() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.active and new.condition='Inconsciente' then insert into private.battle_condition_effects(request_id,token_id,condition,manual) values(new.request_id,new.token_id,'Caído',new.manual) on conflict do nothing;end if;return new;
end $$;
drop trigger if exists battle43_fall on private.battle_condition_effects;
create trigger battle43_fall after insert on private.battle_condition_effects for each row execute function private.battle43_fall();
create or replace function private.battle43_end_invisibility() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in('success','failure') and old.status not in('success','failure') and (new.kind in('weapon','spell','opportunity') or coalesce((new.definition->>'attackRoll')::boolean,false)) then update public.battle_spell_effects e set active=false,updated_at=clock_timestamp() where e.active and e.definition->'entry'->>'catalog_id'='invisibilidade' and e.request_id<>new.id and e.definition->'scene_targets' ? new.token_id::text;end if;return new;
end $$;
drop trigger if exists zz_battle43_end_invisibility on public.battle_action_requests;
create trigger zz_battle43_end_invisibility after update of status on public.battle_action_requests for each row execute function private.battle43_end_invisibility();

do $$ declare f text;needle text;begin
 select pg_get_functiondef('public.rest_character(uuid,text,jsonb,uuid)'::regprocedure) into f;
 if position('battle43_long_rest' in f)=0 then needle='levels=private.dnd_levels(s);maximum=private.battle_hp_max(s);';if position(needle in f)=0 then raise exception 'Descanso anterior não reconhecido.';end if;
 f=replace(f,needle,'-- battle43_long_rest: time, uninterrupted rest, food and water are confirmed in the dialog.'||chr(10)||' if p_kind=''long'' then s=s||jsonb_build_object(''exhaustion'',greatest(0,private.battle43_exhaustion(s)-1),''conditions'',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(s->''conditions'',''[]'')) v where v<>''Exaustão''),''[]''));end if;'||chr(10)||needle);execute f;end if;
end $$;

do $$ declare f text;begin
 select pg_get_functiondef('public.end_battle_condition(uuid)'::regprocedure) into f;
 if position('battle43_prone' in f)=0 then f=replace(f,'cost=t.movement_speed/2;', '-- battle43_prone: zero speed prevents standing.'||chr(10)||'  if t.movement_speed<=0 or coalesce(private.battle_sheet(t.id)->''conditions'',''[]'') ?| array[''Impedido'',''Agarrado'',''Paralisado'',''Petrificado'',''Atordoado'',''Inconsciente'',''Incapacitado''] then raise exception ''A condição atual impede levantar.'';end if;cost=t.movement_speed/2;');execute f;end if;
end $$;
-- Apply small changes to current validated implementations. Prior migrations stay immutable.
do $$ declare f text;needle text;begin
 select pg_get_functiondef('public.move_battle_token(uuid,integer,integer,jsonb,bigint,boolean)'::regprocedure) into f;
 if position('battle43_validate_move' in f)=0 then needle=' perform private.battle_validate_movement';if position(needle in f)=0 then raise exception 'Versão do movimento não reconhecida.';end if;f=replace(f,needle,' perform private.battle43_validate_move(t,p_path,coalesce(p_force,false));'||chr(10)||needle);
  f=replace(f,'''Impedido'',''Paralisado'',''Incapacitado'',''Inconsciente''','''Impedido'',''Paralisado'',''Inconsciente''');f=replace(f,'if s.status=''active'' and private.battle_sheet(t.id)->''conditions''','if s.status=''active'' and not coalesce(p_force,false) and private.battle_sheet(t.id)->''conditions''');execute f;end if;
 select pg_get_functiondef('private.battle_footprint_cost(uuid,integer,integer,numeric,numeric,uuid)'::regprocedure) into f;
 if position('battle43_crawl' in f)=0 then needle=' return result;';if position(needle in f)=0 then raise exception 'Custo de deslocamento não reconhecido.';end if;f=replace(f,needle,' -- battle43_crawl: add one unit per unit crawled, including difficult terrain.'||chr(10)||' if coalesce(private.battle_sheet(p_token)->''conditions'',''[]'') ? ''Caído'' then result=result+1;end if;'||chr(10)||needle);execute f;end if;
 select pg_get_functiondef('private.battle39_dc(uuid,jsonb)'::regprocedure) into f;
 if position('stat_block' in f)=0 then f=replace(f,'return 8+2+(greatest(1,coalesce((s->>''level'')::integer,1))-1)/4+', 'return 8+coalesce((s->''stat_block''->>''proficiency'')::integer,2+(greatest(1,coalesce((s->>''level'')::integer,1))-1)/4)+');execute f;end if;
end $$;

create or replace function private.battle43_token_size() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb;
begin
 if new.npc_id is not null and new.size=1 then
  select stat_block into b from public.npc_stats where npc_id=new.npc_id;
  new.size=case b->>'size' when 'Miúdo' then .5 when 'Grande' then 2 when 'Enorme' then 3 when 'Imenso' then 4 else 1 end;
  if private.battle_footprint_cost(new.map_id,new.x,new.y,new.z,new.size,new.id) is null then raise exception 'O tamanho da criatura exige uma área livre maior.';end if;
 end if;return new;
end $$;
drop trigger if exists aaa_battle43_token_size on public.battle_map_tokens;
create trigger aaa_battle43_token_size before insert on public.battle_map_tokens for each row execute function private.battle43_token_size();
create or replace function private.battle43_npc_base_edit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.npc_id is not null and new.movement_speed is distinct from old.movement_speed and coalesce(current_setting('battle43.sync',true),'off')<>'on' and not exists(select 1 from public.npc_stats where npc_id=new.npc_id and coalesce(stat_block->'movement','{}') ? 'walk') then insert into private.battle43_npc_speed values(new.id,new.movement_speed) on conflict(token_id) do update set base_speed=excluded.base_speed;end if;return new;
end $$;
drop trigger if exists battle43_npc_base_edit on public.battle_map_tokens;
create trigger battle43_npc_base_edit before update of movement_speed on public.battle_map_tokens for each row execute function private.battle43_npc_base_edit();
create or replace function private.battle43_token_insert() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.npc_id is not null then insert into private.battle43_npc_speed values(new.id,new.movement_speed) on conflict do nothing;end if;perform private.battle43_sync(new.id);return new;end $$;
drop trigger if exists zz_battle43_token_insert on public.battle_map_tokens;
create trigger zz_battle43_token_insert after insert on public.battle_map_tokens for each row execute function private.battle43_token_insert();
create or replace function private.battle43_turn() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens;speed numeric;
begin if new.status='active' and old.status<>'active' then update public.battle_spell_effects e set active=false,updated_at=clock_timestamp() where e.active and e.expires_at<=clock_timestamp() and e.map_id in(select id from public.battle_maps where battle_session_id=new.id);end if;if new.status='active' and (new.turn_started_at is distinct from old.turn_started_at or new.status is distinct from old.status) then select * into t from public.battle_map_tokens where id=new.active_token_id;speed=private.battle43_speed(t);update public.battle_map_tokens set movement_speed=speed,movement_remaining=speed where id=t.id;end if;return new;end $$;
drop trigger if exists zz_battle43_turn on public.battle_sessions;
create trigger zz_battle43_turn after update on public.battle_sessions for each row execute function private.battle43_turn();

-- Keep the original 2014 invisibility condition's roll benefits; Faerie Fire suppresses them.
do $$ declare f text;begin
 select pg_get_functiondef('private.battle37_attack_mode(public.battle_map_tokens,public.battle_map_tokens,public.battle_maps)'::regprocedure) into f;
 f=replace(f,'private.battle37_attack_mode(a battle_map_tokens, t battle_map_tokens, m battle_maps)','private.battle43_attack_mode(a battle_map_tokens, t battle_map_tokens, m battle_maps, p_ignore_mockery boolean)');
 f=replace(f,'private.battle37_attack_mode(a public.battle_map_tokens, t public.battle_map_tokens, m public.battle_maps)','private.battle43_attack_mode(a public.battle_map_tokens, t public.battle_map_tokens, m public.battle_maps, p_ignore_mockery boolean)');
 -- pg_get_functiondef may spell types without schema qualification; replace the header robustly.
 f=regexp_replace(f,'FUNCTION private\.battle37_attack_mode\([^\n]+\)','FUNCTION private.battle43_attack_mode(a public.battle_map_tokens,t public.battle_map_tokens,m public.battle_maps,p_ignore_mockery boolean)');
 f=replace(f,'or ac ?| array[''Envenenado'',''Impedido'',''Caído'',''Desvantagem no próximo ataque'']','or ac ?| array[''Envenenado'',''Impedido'',''Caído''] or (not p_ignore_mockery and ac ? ''Desvantagem no próximo ataque'')');execute f;
end $$;
create or replace function private.battle39_attack_mode(a public.battle_map_tokens,t public.battle_map_tokens,m public.battle_maps,p_ignore_mockery boolean) returns text language sql stable security definer set search_path='' as $$select private.battle43_attack_mode(a,t,m,p_ignore_mockery)$$;

do $$ declare f record;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'battle43_%' or p.proname in('battle_sheet_v42','battle_hp_max_v42','save_npc_v42','battle_character_speed_v42','dnd37_save_bonus_v42')) loop execute format('revoke all on function %s from public,anon,authenticated',f.oid::regprocedure);end loop;
end $$;
revoke all on function public.manage_battle_creature(uuid,jsonb,uuid),public.keep_narrative_spell(uuid,jsonb,uuid),public.save_npc(jsonb) from public,anon;
grant execute on function private.battle43_creature(uuid,jsonb,uuid),private.battle43_narrative(uuid,jsonb,uuid),public.manage_battle_creature(uuid,jsonb,uuid),public.keep_narrative_spell(uuid,jsonb,uuid),public.save_npc(jsonb) to authenticated;

notify pgrst,'reload schema';
commit;

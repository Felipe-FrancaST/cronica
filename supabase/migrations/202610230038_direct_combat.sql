-- 038: autonomous turns, participant ownership and compact combat replies. Apply after 037.

begin;

create or replace function private.battle38_controls(p_token uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.battle_map_tokens t left join public.characters c on c.id=t.character_id
 where t.id=p_token and private.can_read_campaign(t.campaign_id) and
 case when t.npc_id is not null then private.is_campaign_owner(t.campaign_id)
 else c.owner_id=auth.uid() and not private.is_campaign_owner(t.campaign_id) end)
$$;
revoke all on function private.battle38_controls(uuid) from public,anon;
grant execute on function private.battle38_controls(uuid) to authenticated;
drop policy if exists battle_decisions_read on public.battle_decisions;
create policy battle_decisions_read on public.battle_decisions for select to authenticated using(private.battle38_controls(token_id));

-- Invoker reads keep every existing RLS boundary, including hidden tokens and private decisions.
create or replace function public.battle_combat_update(p_map_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('map_id',p_map_id,
 'sessions',coalesce((select jsonb_agg(s) from public.battle_sessions s where s.id=(select battle_session_id from public.battle_maps where id=p_map_id)),'[]'),
 'tokens',coalesce((select jsonb_agg(t) from public.battle_map_tokens t where t.map_id=p_map_id),'[]'),
 'actions',coalesce((select jsonb_agg(q) from (select r.* from public.battle_action_requests r where map_id=p_map_id order by created_at desc,id limit 80) q),'[]'),
 'decisions',coalesce((select jsonb_agg(d) from public.battle_decisions d where status='pending' and session_id=(select battle_session_id from public.battle_maps where id=p_map_id)),'[]'),
 'movementPlans',coalesce((select jsonb_agg(p) from public.battle_movement_plans p where status='pending' and session_id=(select battle_session_id from public.battle_maps where id=p_map_id)),'[]'),
 'spellEffects',coalesce((select jsonb_agg(e) from public.battle_spell_effects e where map_id=p_map_id and active),'[]'))
$$;
create or replace function public.perform_battle_action(p_token_id uuid,p_payload jsonb,p_client_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare q public.battle_action_requests;
begin
 q=public.request_battle_action(p_token_id,p_payload,p_client_id);
 return public.battle_combat_update(q.map_id)||jsonb_build_object('action',to_jsonb(q));
end $$;
create or replace function public.answer_battle_decision_fast(p_decision_id uuid,p_client_id uuid,p_answer jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d public.battle_decisions;m uuid;
begin
 d=public.answer_battle_decision(p_decision_id,p_client_id,p_answer);
 select map_id into m from public.battle_action_requests where id=d.request_id;
 return public.battle_combat_update(m)||jsonb_build_object('decision',to_jsonb(d));
end $$;
revoke all on function public.battle_combat_update(uuid),public.perform_battle_action(uuid,jsonb,uuid),public.answer_battle_decision_fast(uuid,uuid,jsonb) from public,anon;
grant execute on function public.battle_combat_update(uuid),public.perform_battle_action(uuid,jsonb,uuid),public.answer_battle_decision_fast(uuid,uuid,jsonb) to authenticated;

create or replace function private.battle38_waiting() returns trigger
language plpgsql security definer set search_path='' as $$
declare waiting text;
begin
 select string_agg(distinct case when t.visible and not private.battle_area_hidden(t.map_id,t.x,t.y,t.size,t.size) then t.name else 'Criatura do mestre' end||' · '||case d.kind when 'save' then 'salvaguarda' when 'concentration' then 'concentração' when 'attack' then 'ataque' when 'damage' then 'dano' else 'escolha' end, ', ')
 into waiting from public.battle_decisions d join public.battle_map_tokens t on t.id=d.token_id where d.request_id=new.request_id and d.status='pending';
 update public.battle_action_requests set resolution=resolution||jsonb_build_object('waiting_for',coalesce(waiting,'')) where id=new.request_id;
 return new;
end $$;
revoke all on function private.battle38_waiting() from public,anon,authenticated;
drop trigger if exists battle38_waiting on public.battle_decisions;
create trigger battle38_waiting after insert or update of status on public.battle_decisions for each row execute function private.battle38_waiting();

create or replace function public.finish_battle_turn(p_session_id uuid,p_map_id uuid,p_turn_started_at timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.battle_maps where id=p_map_id and battle_session_id=p_session_id) then raise exception 'Mapa fora deste combate.';end if;
 perform private.battle38_finish(p_session_id,p_turn_started_at);
 return public.battle_combat_update(p_map_id);
end $$;
revoke all on function public.finish_battle_turn(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.finish_battle_turn(uuid,uuid,timestamptz) to authenticated;

create or replace function private.battle38_opportunity_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind='opportunity' and new.status='pending' then perform private.battle38_begin_opportunity(new.id,'{}');end if;
 return new;
end $$;
revoke all on function private.battle38_opportunity_trigger() from public,anon,authenticated;
drop trigger if exists battle38_opportunity on public.battle_action_requests;
create trigger battle38_opportunity after insert on public.battle_action_requests for each row execute function private.battle38_opportunity_trigger();

create or replace function private.battle38_finish(p_session uuid,p_started timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare s public.battle_sessions;
begin
 select * into s from public.battle_sessions where id=p_session for update;
 if auth.uid() is null or s.id is null or not private.can_read_campaign(s.campaign_id) then raise exception 'Você não tem acesso a este combate.' using errcode='42501';end if;
 if p_started is null then raise exception 'Recarregue o turno antes de encerrá-lo.';end if;
 if s.turn_started_at is distinct from p_started then return;end if;
 perform public.advance_battle_turn(s.id);
end $$;
revoke all on function private.battle38_finish(uuid,timestamptz) from public,anon;
grant execute on function private.battle38_finish(uuid,timestamptz) to authenticated;


create or replace function public.guide_battle_action(p_request_id uuid,p_options jsonb default '{}') returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests;bs public.battle_sessions;a public.battle_map_tokens;m public.battle_maps;e jsonb;ids uuid[];options jsonb=coalesce(p_options,'{}');has_concentration boolean;v jsonb;
begin
 select * into q from public.battle_action_requests where id=p_request_id;
 if q.id is null or not private.battle38_controls(q.token_id) or not private.can_read_campaign(q.campaign_id) then raise exception 'Esta ação pertence a outro participante.' using errcode='42501';end if;
 if options<>'{}'::jsonb and not private.is_campaign_owner(q.campaign_id) then raise exception 'As regras da ficha são calculadas pelo servidor.' using errcode='42501';end if;
 select * into bs from public.battle_sessions where id=q.session_id for update;perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into q from public.battle_action_requests where id=q.id for update;
 if q.status<>'pending' or exists(select 1 from private.battle_guides where request_id=q.id) then return q;end if;
 if bs.status<>'active' or bs.round<>q.round or bs.turn_index<>q.turn_index or bs.turn_started_at is distinct from q.turn_started_at then raise exception 'O turno desta tentativa já terminou.';end if;

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
 values(q.id,case when (q.kind='opportunity' or coalesce((e->>'concentration')::boolean,false) and has_concentration) then 'choice' else 'checks' end,e,ids,options-'dice'-'targets'-'critical'-'geometry'-'kind'-'defer_player_roll'-'target_ids',auth.uid());
 update public.battle_action_requests set resolution=jsonb_build_object('guided',true,'message','Ação iniciada. Aguardando as escolhas e rolagens dos participantes.') where id=q.id returning * into q;
 if (q.kind='opportunity' or coalesce((e->>'concentration')::boolean,false) and has_concentration) then
  perform private.battle37_add_decision(q,a.id,'choice',0,case when q.kind='opportunity' then 'Usar sua reação para atacar?' else 'Trocar a concentração?' end,null,null,0,'normal',jsonb_build_object('choices',jsonb_build_array(jsonb_build_object('id','continue','label',case when q.kind='opportunity' then 'Atacar com a reação' else 'Conjurar e encerrar a concentração anterior' end),jsonb_build_object('id','cancel','label',case when q.kind='opportunity' then 'Não atacar e liberar o movimento' else 'Cancelar e manter a concentração atual' end))));
 else q=private.battle37_next(q.id);end if;
 return q;
end $$;

create or replace function private.battle38_begin_opportunity(p_request_id uuid,p_options jsonb default '{}') returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests;bs public.battle_sessions;a public.battle_map_tokens;m public.battle_maps;e jsonb;ids uuid[];options jsonb=coalesce(p_options,'{}');has_concentration boolean;v jsonb;
begin
 select * into q from public.battle_action_requests where id=p_request_id;
 if q.id is null or q.kind<>'opportunity' then raise exception 'Esta ação pertence a outro participante.' using errcode='42501';end if;
 if options<>'{}'::jsonb and not private.is_campaign_owner(q.campaign_id) then raise exception 'As regras da ficha são calculadas pelo servidor.' using errcode='42501';end if;
 select * into bs from public.battle_sessions where id=q.session_id for update;perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into q from public.battle_action_requests where id=q.id for update;
 if q.status<>'pending' or exists(select 1 from private.battle_guides where request_id=q.id) then return q;end if;
 if bs.status<>'active' or bs.round<>q.round or bs.turn_index<>q.turn_index or bs.turn_started_at is distinct from q.turn_started_at then raise exception 'O turno desta tentativa já terminou.';end if;

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
 values(q.id,case when (q.kind='opportunity' or coalesce((e->>'concentration')::boolean,false) and has_concentration) then 'choice' else 'checks' end,e,ids,options-'dice'-'targets'-'critical'-'geometry'-'kind'-'defer_player_roll'-'target_ids',auth.uid());
 update public.battle_action_requests set resolution=jsonb_build_object('guided',true,'message','Ação iniciada. Aguardando as escolhas e rolagens dos participantes.') where id=q.id returning * into q;
 if (q.kind='opportunity' or coalesce((e->>'concentration')::boolean,false) and has_concentration) then
  perform private.battle37_add_decision(q,a.id,'choice',0,case when q.kind='opportunity' then 'Usar sua reação para atacar?' else 'Trocar a concentração?' end,null,null,0,'normal',jsonb_build_object('choices',jsonb_build_array(jsonb_build_object('id','continue','label',case when q.kind='opportunity' then 'Atacar com a reação' else 'Conjurar e encerrar a concentração anterior' end),jsonb_build_object('id','cancel','label',case when q.kind='opportunity' then 'Não atacar e liberar o movimento' else 'Cancelar e manter a concentração atual' end))));
 else q=private.battle37_next(q.id);end if;
 return q;
end $$;

revoke all on function private.battle38_begin_opportunity(uuid,jsonb) from public,anon,authenticated;

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
   update public.battle_action_requests set status='cancelled',resolution=jsonb_build_object('guided',true,'message',case when q.kind='opportunity' then 'Reação dispensada. Movimento liberado.' else 'Conjuração cancelada antes de gastar recursos.' end),resolved_at=now() where id=q.id returning * into q;
   if q.movement_plan_id is not null then perform private.battle_finish_movement(q.movement_plan_id);end if;
   return q;
  end if;
  if q.kind<>'opportunity' then update public.battle_spell_effects set active=false where token_id=q.token_id and concentration and active;end if;
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

create or replace function public.request_battle_action(p_token_id uuid,p_payload jsonb,p_client_id uuid) returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens; m public.battle_maps; s public.battle_sessions; entry jsonb; e jsonb; sheet jsonb;
 result public.battle_action_requests; source uuid; kind text=p_payload->>'kind'; cost text='action'; rkind text='none'; rlevel integer=0;
 target jsonb=p_payload->'target'; ids uuid[]; attack_ids uuid[]; attack_count integer=1; sp public.dnd_spells; ability text; modifier integer; dice text; pulse_dice text; lvl integer=0; cname text; f jsonb; wopts jsonb=coalesce(p_payload->'weapon_options','{}'); units integer=coalesce((p_payload->>'feature_units')::integer,1); itemdef jsonb;
begin
 if auth.uid() is null or p_client_id is null then raise exception 'Entre na sua conta para agir.' using errcode='42501'; end if;
 select * into result from public.battle_action_requests where requested_by=auth.uid() and client_id=p_client_id;
 if result.id is not null then
  if not private.can_read_campaign(result.campaign_id) or not private.battle38_controls(result.token_id) then raise exception 'Você não tem mais acesso a esta tentativa.' using errcode='42501'; end if; return result;
 end if;
 select * into m from public.battle_maps where id=(select map_id from public.battle_map_tokens where id=p_token_id);
 select * into s from public.battle_sessions where id=m.battle_session_id for update;
 select * into t from public.battle_map_tokens where id=p_token_id for update;
 select * into result from public.battle_action_requests where requested_by=auth.uid() and client_id=p_client_id;
 if result.id is not null then
  if not private.can_read_campaign(result.campaign_id) or not private.battle38_controls(result.token_id) then raise exception 'Você não tem mais acesso a esta tentativa.' using errcode='42501'; end if; return result;
 end if;
 if t.id is null or not private.battle38_controls(t.id) then raise exception 'Você não controla esse personagem.' using errcode='42501'; end if;
 if s.status<>'active' or s.active_token_id is distinct from t.id then raise exception 'Aguarde o turno deste personagem.'; end if;
 if exists(select 1 from public.battle_action_requests q where q.session_id=s.id and q.status in('pending','approved') and (q.token_id=t.id or q.kind='opportunity')) then raise exception 'Aguarde a decisão do mestre sobre a tentativa pendente.'; end if;
 sheet=private.battle_sheet(t.id);
 if coalesce((sheet->>'hp_current')::integer,0)<=0 then raise exception 'Um personagem com 0 PV não pode executar esta ação.'; end if;
 if sheet->'conditions' ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado'] then raise exception 'A condição do personagem impede ações e reações.'; end if;
 if kind not in('weapon','spell','item','feature','dash','disengage','dodge') then raise exception 'Ação inválida.'; end if;
 if kind='item' then
  if t.character_id is null then raise exception 'NPC usa os itens descritos na sua ficha.';end if;
  source=(p_payload->>'source_id')::uuid;
  select data||jsonb_build_object('id',id) into entry from public.character_inventory where id=source and character_id=t.character_id for update;
  if entry is null then raise exception 'O item não está no inventário deste personagem.';end if;
  if nullif(entry->>'campaign_item_id','') is not null then
   e=private.campaign_item_use(entry,p_payload->>'item_function_id');
   cost=e->>'cost';cname=entry->>'name'||' · '||(e->>'name');
  else
  select data into itemdef from public.dnd_items where id=entry->>'catalog_id';
  if entry is null or itemdef->'use' is null or (entry->>'quantity')::integer<1 or (itemdef ? 'charges' and coalesce((entry->>'charges_used')::integer,0)>=(itemdef->>'charges')::integer) then raise exception 'Item esgotado ou sem uso de combate definido.';end if;
  e=itemdef->'use'||jsonb_build_object('shape','single','origin','point','size',0,'width',1.5,'maxTargets',1,'timing','immediate','review',true,'damageType',case entry->>'catalog_id' when 'acid' then 'ácido' when 'holy-water' then 'radiante' else '' end,'item_catalog',entry->>'catalog_id');cname=entry->>'name';

  end if;
 elsif kind='feature' then
  if t.character_id is null then raise exception 'NPC usa as habilidades descritas na própria ficha.';end if;
  f=private.dnd_feature_definition(sheet,p_payload->>'feature_id',units,t.raging);
  if f->>'operation'='surge' and t.surge_used then raise exception 'Surto de Ação só pode ser usado uma vez por turno.';end if;
  e=f||jsonb_build_object('shape',case when (f->>'self')::boolean then 'self' else 'single' end,'origin',case when (f->>'self')::boolean then 'self' else 'point' end,'size',0,'width',1.5,'maxTargets',1,'timing','immediate','review',f->>'operation'='manual');
  cost=f->>'cost';cname=f->>'name';entry=f;
 elsif kind in('weapon','spell') then
  source=(p_payload->>'source_id')::uuid;
  if kind='weapon' then
   if t.character_id is not null then
    if source=t.id then entry=jsonb_build_object('id',source,'name','Ataque desarmado','catalog_id','unarmed','category','weapon','quantity',1,'damage','1 concussão','notes','');
    else select data||jsonb_build_object('id',id) into entry from public.character_inventory where id=source and character_id=t.character_id and data->>'category'='weapon' and coalesce((data->>'quantity')::integer,0)>0;end if;
   else select data into entry from public.npc_attacks where id=source and npc_id=t.npc_id; end if;
   if entry is null then raise exception 'Esta arma não está na ficha do personagem.'; end if;
   if entry->>'catalog_id'='net' and t.action_used and t.attacks_remaining>0 then raise exception 'A rede exige uma ação inteira; conclua os ataques desta ação antes de usá-la.';end if;
   perform private.dnd_check_weapon_options(t,entry,sheet,wopts,coalesce(p_payload->'target_ids','[]'));
   e=private.dnd_weapon_effect(entry,sheet,wopts,t.raging);entry=entry||jsonb_build_object('weapon_options',wopts);cname=entry->>'name';
   if coalesce((wopts->>'offhand')::boolean,false) then cost='bonus';end if;
   if coalesce((wopts->>'smite_level')::integer,0)>0 then rkind=coalesce(wopts->>'smite_kind','slot');rlevel=(wopts->>'smite_level')::integer;end if;
   if coalesce((wopts->>'sneak')::boolean,false) then e=e||'{"review":true,"note":"Ataque Furtivo: o mestre confirma vantagem ou aliado adjacente e ausência de desvantagem."}'::jsonb;end if;
   if coalesce((wopts->>'smite_special')::boolean,false) then e=e||'{"review":true,"note":"O mestre confirma que o alvo é morto-vivo ou ínfero para o dado radiante adicional."}'::jsonb;end if;
  else
   if t.character_id is not null then select data into entry from public.character_spells where id=source and character_id=t.character_id;
   else select data into entry from public.npc_spells where id=source and npc_id=t.npc_id; end if;
   if entry is null then raise exception 'Esta magia não está na ficha do personagem.'; end if;
   select * into sp from public.dnd_spells where id=entry->>'catalog_id';
   e=case when sp.id is not null then sp.combat else '{"shape":"single","kind":"utility","range":9,"size":0,"width":1.5,"origin":"point","dice":"","review":true,"timing":"immediate","note":"Magia personalizada: o mestre configura os efeitos na aprovação."}'::jsonb end;
   lvl=coalesce(sp.level,(entry->>'level')::integer,0); entry=entry||jsonb_build_object('level',lvl);
   cname=coalesce(sp.name,entry->>'name'); rkind=coalesce(p_payload->>'resource_kind',case when lvl=0 then 'cantrip' else 'slot' end); rlevel=coalesce((p_payload->>'resource_level')::integer,lvl);
   if t.raging then raise exception 'Não é possível conjurar enquanto a Fúria está ativa.';end if;
   perform private.battle_check_resource(t,entry,rkind,rlevel);
   if lower(coalesce(sp.data->>'casting_time',entry->>'casting_time','1 ação')) like '%bônus%' then cost='bonus';
   elsif lower(coalesce(sp.data->>'casting_time',entry->>'casting_time','1 ação')) like '%rea%' then cost='reaction'; end if;
   if t.bonus_spell_cast and (cost<>'action' or lvl>0) then raise exception 'Após magia bônus, só um truque com tempo de 1 ação pode ser conjurado neste turno.'; end if;
   if cost='bonus' and t.action_spell_level>0 then raise exception 'Uma magia de ação de círculo 1 ou maior impede conjuração bônus neste turno.'; end if;
   ability=private.dnd_spell_ability(sheet,entry);
   modifier=floor((coalesce((sheet->'abilities'->>ability)::numeric,10)-10)/2);
   dice=coalesce(e->>'dice','');
   if e ? 'sizePerSlot' then e=e||jsonb_build_object('size',(e->>'size')::numeric+greatest(0,rlevel-lvl)*(e->>'sizePerSlot')::numeric); end if;
   if coalesce((e->>'cantripScale')::boolean,false) and lvl=0 then
    dice=regexp_replace(dice,'^(\d+)d',((substring(dice from '^\d+'))::integer*case when (sheet->>'level')::integer>=17 then 4 when (sheet->>'level')::integer>=11 then 3 when (sheet->>'level')::integer>=5 then 2 else 1 end)::text||'d');
   end if;
   if coalesce(e->>'upcast','')<>'' and rlevel>lvl then for i in 1..((rlevel-lvl)/greatest(1,coalesce((e->>'upcastEvery')::integer,1))) loop dice=dice||'+'||(e->>'upcast'); end loop; end if;
   if e ? 'pulseDice' then
    pulse_dice=e->>'pulseDice';
    if coalesce(e->>'pulseUpcast','')<>'' and rlevel>lvl then for i in lvl+1..rlevel loop pulse_dice=pulse_dice||'+'||(e->>'pulseUpcast'); end loop; end if;
    e=e||jsonb_build_object('pulseDice',pulse_dice);
   end if;
   if coalesce((e->>'ability')::boolean,false) then dice=dice||case when modifier>=0 then '+' else '' end||modifier; end if;
   if coalesce(e->>'dice','')<>'' and private.dnd_spell_bonus(sheet,entry,e,rlevel)<>0 then dice=dice||case when private.dnd_spell_bonus(sheet,entry,e,rlevel)>=0 then '+' else '' end||private.dnd_spell_bonus(sheet,entry,e,rlevel);end if;
   if e->>'kind'='healing' and lvl>0 then dice=private.dnd_healing_dice(sheet,dice);end if;
   e=e||jsonb_build_object('dice',dice,'concentration',coalesce(sp.concentration,false),'duration',coalesce(sp.data->>'duration',entry->>'duration',''),'description',coalesce(sp.data->>'description',entry->>'description',''),'casting_time',coalesce(sp.data->>'casting_time',entry->>'casting_time','1 ação'));
   if lower(e->>'casting_time') ~ '(minuto|hora)' then e=e||'{"review":true,"timing":"trigger","note":"Conjuração longa: o mestre acompanha o tempo e conclui o efeito somente após a duração necessária."}'::jsonb; end if;
  end if;
 elsif kind in('dash','disengage') and private.dnd_class_level(sheet,'rogue')>=2 and p_payload->>'cost'='bonus' then
  cost='bonus'; cname=case kind when 'dash' then 'Disparada (Ação Ardilosa)' else 'Desengajar (Ação Ardilosa)' end;
 else cname=case kind when 'dash' then 'Disparada' when 'disengage' then 'Desengajar' else 'Esquivar' end; end if;
 if cost='action' and t.action_used and t.extra_actions=0 and not(kind='weapon' and t.attacks_remaining>0) then raise exception 'A ação deste turno já foi utilizada.'; end if;
 if cost='bonus' and t.bonus_used then raise exception 'A ação bônus já foi utilizada.'; end if;
 if cost='reaction' and t.reaction_used then raise exception 'A reação já foi utilizada.'; end if;
 e=coalesce(e,'{"shape":"self","kind":"utility","origin":"self","range":0,"size":0,"dice":""}'::jsonb);
 
 if coalesce((e->>'levelBeams')::boolean,false) then attack_count=case when (sheet->>'level')::integer>=17 then 4 when (sheet->>'level')::integer>=11 then 3 when (sheet->>'level')::integer>=5 then 2 else 1 end;
 else attack_count=coalesce((e->>'attackCount')::integer,1)+greatest(0,rlevel-lvl)*coalesce((e->>'attacksPerSlot')::integer,0);end if;
 if attack_count>1 then
  e=e||jsonb_build_object('attackCount',attack_count,'maxTargets',attack_count);
  if kind='spell' and entry->>'catalog_id'<>'rajada-mistica' then e=e||jsonb_build_object('onceBonus',private.dnd_spell_bonus(sheet,entry,e,rlevel));end if;
 end if;
 if kind='item' and (entry->>'catalog_id' in('acid','holy-water') or coalesce((e->>'attackRoll')::boolean,false)) then e=e||jsonb_build_object('attackRoll',true,'attackBonus',coalesce((e->>'attack_bonus')::integer,floor(((sheet->'abilities'->>'dex')::numeric-10)/2)::integer));end if;
 target=coalesce(target,jsonb_build_object('x',t.x,'y',t.y));
 if jsonb_typeof(target->'x') is distinct from 'number' or jsonb_typeof(target->'y') is distinct from 'number' or (target->>'x')::numeric<>floor((target->>'x')::numeric) or (target->>'y')::numeric<>floor((target->>'y')::numeric) or (target->>'x')::integer<0 or (target->>'x')::integer>=m.width or (target->>'y')::integer<0 or (target->>'y')::integer>=m.height then raise exception 'Alvo fora do mapa.'; end if;
 if e->>'origin'<>'self' and private.battle_target_range(t,target,m)>coalesce((e->>'range')::numeric,0)+0.00001 then raise exception 'Alvo fora do alcance.'; end if;
 ids=array(select distinct value::uuid from jsonb_array_elements_text(coalesce(p_payload->'target_ids','[]')));
 if cardinality(ids)>coalesce((e->>'maxTargets')::integer,1) then raise exception 'Quantidade de alvos acima do limite da magia.'; end if;
 if exists(select 1 from unnest(ids) v where not exists(select 1 from public.battle_map_tokens q where q.id=v and q.map_id=t.map_id and private.can_read_battle_token(q.id))) then raise exception 'Alvo não pertence ao mapa ou não está visível.' using errcode='42501'; end if;
 if e->>'shape'='single' and (e->>'kind' in('damage','healing','temporary') or kind in('item','feature','weapon')) and cardinality(ids)<1 then raise exception 'Selecione uma criatura como alvo.'; end if;
 if exists(select 1 from public.battle_map_tokens q where q.id=any(ids) and case when attack_count>1 then private.battle37_target_range(t,q,m)>coalesce((e->>'range')::numeric,0)+0.00001 else not private.battle_in_effect(q,t,target,e,m.scale_per_cell*case when m.scale_unit='ft' then 0.3 else 1 end) end) then raise exception 'Alvo fora da área indicada.'; end if;

 if p_payload ? 'attack_targets' then
  if attack_count<=1 or jsonb_typeof(p_payload->'attack_targets')<>'array' or jsonb_array_length(p_payload->'attack_targets')<>attack_count then raise exception 'Escolha um alvo para cada raio.';end if;
  attack_ids=array(select value::uuid from jsonb_array_elements_text(p_payload->'attack_targets'));
  if exists(select 1 from unnest(attack_ids) id where not(id=any(ids))) then raise exception 'Os raios devem usar os alvos selecionados.';end if;
  e=e||jsonb_build_object('attackTargets',to_jsonb(attack_ids));
 end if;
 insert into public.battle_action_requests(campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,source_id,name,cost,resource_kind,resource_level,spell_level,target,target_ids,definition,round,turn_index,turn_started_at)
 values(t.campaign_id,s.id,t.map_id,t.id,auth.uid(),p_client_id,kind,source,cname,cost,rkind,rlevel,lvl,target,ids,e||jsonb_build_object('entry',entry,'actor_x',t.x,'actor_y',t.y),s.round,s.turn_index,s.turn_started_at) returning * into result;
 return public.guide_battle_action(result.id,'{}');
end $$;

create or replace function public.answer_battle_decision(p_decision_id uuid,p_client_id uuid,p_answer jsonb default '{}') returns public.battle_decisions
language plpgsql security definer set search_path='' as $$
declare decision public.battle_decisions;q public.battle_action_requests;bs public.battle_sessions;g private.battle_guides;a public.battle_map_tokens;target public.battle_map_tokens;check_row public.battle_decisions;d public.battle_dice_rolls;detail jsonb;answer_result jsonb='{}';damage_events jsonb='[]';s jsonb;e jsonb;part_effect jsonb;opts jsonb;targets jsonb='{}';rolls jsonb='[]';outcome jsonb;target_id uuid;total integer;natural_roll integer;ac integer;passed boolean;hit boolean;critical boolean;amount integer;mode text;choice text;concentration_effect uuid;checked integer=0;single_bonus integer=0;
begin
 if auth.uid() is null or p_client_id is null then raise exception 'Entre na sua conta para responder.' using errcode='42501';end if;
 select * into decision from public.battle_decisions where id=p_decision_id;
 if decision.id is null or not private.can_read_campaign(decision.campaign_id) or not private.battle38_controls(decision.token_id) then raise exception 'Esta decisão pertence a outro participante.' using errcode='42501';end if;
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
 if not exists(select 1 from public.battle_decisions check_decision join public.battle_map_tokens t on t.id=check_decision.token_id where check_decision.id=p_decision_id and t.npc_id is not null) then raise exception 'O mestre configura somente testes de NPCs.' using errcode='42501';end if;
 select * into d from public.battle_decisions where id=p_decision_id;
 if d.id is null or not private.is_campaign_owner(d.campaign_id) or not private.can_read_campaign(d.campaign_id) then raise exception 'Somente o mestre pode ajustar a vantagem.' using errcode='42501';end if;
 perform 1 from public.battle_sessions where id=d.session_id for update;
 if p_mode is null or p_mode not in('normal','advantage','disadvantage') then raise exception 'Modo inválido.';end if;
 if p_modifier is not null and (abs(p_modifier)>50 or not exists(select 1 from public.battle_map_tokens where id=d.token_id and npc_id is not null)) then raise exception 'Informe o bônus total do NPC; os bônus dos personagens seguem a ficha.';end if;
 update public.battle_decisions set mode=p_mode,modifier=coalesce(p_modifier,modifier) where id=d.id and status='pending' returning * into d;return d;
end $$;

create or replace function public.advance_battle_turn(p_session_id uuid) returns public.battle_sessions
language plpgsql security definer set search_path='' as $$
declare s public.battle_sessions; total integer; next_index integer; next_round integer; next_token uuid; result public.battle_sessions;
begin
  select * into s from public.battle_sessions where id=p_session_id for update;
  if s.id is null or (s.active_token_id is null or not private.battle38_controls(s.active_token_id)) then raise exception 'Você não pode encerrar este turno.' using errcode='42501'; end if;
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

create or replace function public.approve_battle_action(p_request_id uuid,p_success boolean,p_resolution jsonb default '{}') returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests; result public.battle_action_requests; opts jsonb=coalesce(p_resolution,'{}')-'defer_player_roll'-'roll_id'; kind text; expression text;parts jsonb;part jsonb;actor_sheet jsonb;barbarian integer;extra integer;critdef jsonb;
begin
 select * into q from public.battle_action_requests where id=p_request_id;
 if coalesce((q.resolution->>'guided')::boolean,false) then raise exception 'Esta ação é automática. Cada participante deve concluir suas próprias rolagens.' using errcode='42501';end if;
 if q.id is null or not private.is_campaign_owner(q.campaign_id) then raise exception 'Apenas o mestre pode decidir.' using errcode='42501'; end if;
 perform 1 from public.battle_sessions where id=q.session_id for update;
 perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into q from public.battle_action_requests where id=p_request_id for update;
 if q.status<>'pending' then return q; end if;
 expression=coalesce(q.definition->>'dice','');
 if (expression='' or coalesce((q.definition->>'review')::boolean,false)) and opts ? 'dice' then expression=coalesce(opts->>'dice',expression); end if;
 kind=coalesce(opts->>'kind',q.definition->>'kind','utility');
 if p_success and expression is distinct from coalesce(q.definition->>'dice','') then
  update public.battle_action_requests set definition=definition-array['damageParts','rerollWeaponDice'] where id=q.id returning * into q;
 end if;
 if p_success and coalesce((opts->>'critical')::boolean,false) then
  if kind<>'damage' or q.definition->>'shape'<>'single' or coalesce(q.definition->>'save','')<>'' then raise exception 'Crítico é válido apenas para dano de ataque contra alvo único.';end if;
  actor_sheet=private.battle_sheet(q.token_id);barbarian=private.dnd_class_level(actor_sheet,'barbarian');extra=0;
  if q.kind in('weapon','opportunity') and not(private.dnd_weapon_traits(q.definition->'entry',actor_sheet)->>'ranged')::boolean then extra=case when barbarian>=17 then 3 when barbarian>=13 then 2 when barbarian>=9 then 1 else 0 end;end if;
  parts='[]';
  for part in select value from jsonb_array_elements(coalesce(q.definition->'damageParts','[]')) loop
   part=part||jsonb_build_object('dice',private.dnd_critical_expression(part->>'dice'));
   if jsonb_array_length(parts)=0 and extra>0 then part=part||jsonb_build_object('dice',(part->>'dice')||'+'||extra||'d'||substring(expression from '^\d+d(\d+)'));end if;
   parts=parts||jsonb_build_array(part);
  end loop;
  expression=private.dnd_critical_expression(expression);
  if jsonb_array_length(parts)>0 then select string_agg(p->>'dice','+' order by n) into expression from jsonb_array_elements(parts) with ordinality a(p,n);end if;
  critdef=q.definition||jsonb_build_object('dice',expression,'damageParts',parts,'rerollWeaponDice',coalesce((q.definition->>'rerollWeaponDice')::integer,0)*2,'critical',true);
  update public.battle_action_requests set definition=critdef where id=q.id returning * into q;
 end if;
 if p_success and q.kind in('spell','weapon','item','feature') and kind in('damage','healing','temporary') and expression~'d(4|6|8|10|12|20|100)' and (coalesce(q.definition->>'timing','immediate')='immediate' or coalesce((opts->>'apply_now')::boolean,false)) then
  -- Formula is scaled server-side; only GM review can supply an exception/custom effect.
  perform private.battle_check_dice(expression);
  opts=opts||jsonb_build_object('defer_player_roll',true,'dice',expression);
  result=public.resolve_battle_action_v9(q.id,true,opts);
  if result.status='success' and coalesce((result.resolution->>'awaiting_roll')::boolean,false) then
   update private.battle_roll_permits set effect_ids=array(select id from public.battle_spell_effects where request_id=q.id) where request_id=q.id;
   update public.battle_spell_effects set active=false where request_id=q.id;
   update public.battle_action_requests set status='approved' where id=q.id returning * into result;
  end if;
 else result=public.resolve_battle_action(q.id,p_success,opts); end if;
 return result;
end $$;

create or replace function public.resolve_battle_action(p_request_id uuid,p_success boolean,p_resolution jsonb default '{}') returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests; result public.battle_action_requests; r public.battle_dice_rolls; opts jsonb=coalesce(p_resolution,'{}'); expression text; kind text;
begin
 select * into q from public.battle_action_requests where id=p_request_id;
 if coalesce((q.resolution->>'guided')::boolean,false) then raise exception 'Esta ação é automática. Cada participante deve concluir suas próprias rolagens.' using errcode='42501';end if;
 if q.id is null or not private.is_campaign_owner(q.campaign_id) then raise exception 'Apenas o mestre pode decidir.' using errcode='42501'; end if;
 perform 1 from public.battle_sessions where id=q.session_id for update;
 perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into q from public.battle_action_requests where id=p_request_id for update;
 if q.status<>'pending' then return q; end if;
 expression=coalesce(opts->>'dice',q.definition->>'dice',''); kind=coalesce(opts->>'kind',q.definition->>'kind','utility');
 if p_success and q.kind in('spell','weapon','item','feature','opportunity') and kind in('damage','healing','temporary') and (coalesce(q.definition->>'timing','immediate')='immediate' or coalesce((opts->>'apply_now')::boolean,false)) then
  if opts ? 'roll_id' then
   select * into r from public.battle_dice_rolls where id=(opts->>'roll_id')::uuid for update;
   if r.id is null or r.request_id is distinct from q.id or r.rolled_by<>auth.uid() or r.consumed_at is not null then raise exception 'Use uma rolagem desta tentativa que ainda não foi aplicada.'; end if;
  elsif expression<>'' then r=private.battle_record_roll(q.map_id,expression,gen_random_uuid(),q.name,'gm','normal',q.id); end if;
  if r.id is not null then opts=opts||jsonb_build_object('dice',greatest(0,r.total)::text,'damage_parts',private.dnd_roll_damage_parts(r.terms,q.definition->'damageParts')); end if;
 end if;
 result=public.resolve_battle_action_v9(q.id,p_success,opts);
 if result.status='success' and r.id is not null then
  update public.battle_dice_rolls set consumed_at=now() where id=r.id returning * into r;
  update public.battle_action_requests set resolution=resolution||jsonb_build_object('dice',r.expression,'dice_roll_id',r.id,'dice_roll',to_jsonb(r)) where id=q.id returning * into result;
 end if;
 return result;
end $$;

create or replace function public.resolve_battle_action_v9(p_request_id uuid,p_success boolean,p_resolution jsonb default '{}') returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare r public.battle_action_requests; s public.battle_sessions; t public.battle_map_tokens; e jsonb; entry jsonb; sheet jsonb; outcomes jsonb='{}';
 spend boolean; attacks integer=1; opts jsonb=coalesce(p_resolution,'{}');f jsonb;units integer;itemdef jsonb;inv public.character_inventory;wopts jsonb;newdata jsonb;remaining integer;
begin
 select * into r from public.battle_action_requests where id=p_request_id;
 if coalesce((r.resolution->>'guided')::boolean,false) then raise exception 'Esta ação é automática. Cada participante deve concluir suas próprias rolagens.' using errcode='42501';end if;
 if r.id is null or not private.is_campaign_owner(r.campaign_id) then raise exception 'Apenas o mestre desta campanha pode decidir.' using errcode='42501'; end if;
 select * into s from public.battle_sessions where id=r.session_id for update;
 perform 1 from public.campaigns where id=r.campaign_id for update; -- serialize HP/resources across maps of one campaign
 select * into r from public.battle_action_requests where id=p_request_id for update;
 if r.status<>'pending' then return r; end if; -- idempotent, including two browsers clicking simultaneously
 select * into t from public.battle_map_tokens where id=r.token_id for update;
 if s.status<>'active' or s.round<>r.round or s.turn_index<>r.turn_index or s.turn_started_at is distinct from r.turn_started_at then
  update public.battle_action_requests set status='expired',resolved_at=now() where id=r.id returning * into r; return r;
 end if;
 if r.kind<>'opportunity' and s.active_token_id is distinct from t.id then raise exception 'A tentativa pertence a outro turno.'; end if;
 sheet=private.battle_sheet(t.id); e=r.definition; spend=p_success or s.failed_actions_consume;
 if p_success and opts ? 'geometry' then
  if coalesce(opts->'geometry'->>'shape','') not in('single','self','sphere','cone','line','cube') or coalesce(opts->'geometry'->>'origin','') not in('point','self') or coalesce((opts->'geometry'->>'size')::numeric,-1)<0 or (opts->'geometry'->>'size')::numeric>10000 or coalesce((opts->'geometry'->>'width')::numeric,0)<=0 or (opts->'geometry'->>'width')::numeric>10000 then raise exception 'Formato ou dimensão da área inválido.'; end if;
  e=e||jsonb_build_object('shape',opts->'geometry'->>'shape','origin',opts->'geometry'->>'origin','size',(opts->'geometry'->>'size')::numeric,'width',(opts->'geometry'->>'width')::numeric);
 end if;
 if r.kind='feature' and spend then
  f=private.dnd_feature_definition(sheet,e->>'id',(e->>'units')::integer,t.raging);
  if f->>'operation'='surge' and t.surge_used then raise exception 'Surto de Ação já utilizado neste turno.';end if;
  if coalesce(f->>'resource','')<>'' then
   update public.characters set system_data=jsonb_set(system_data,'{feature_uses}',coalesce(system_data->'feature_uses','{}')||jsonb_build_object(f->>'resource',coalesce((system_data->'feature_uses'->>(f->>'resource'))::integer,0)+(f->>'units')::integer)) where id=t.character_id;
  end if;
 elsif r.kind='item' and spend then
  select * into inv from public.character_inventory where id=r.source_id and character_id=t.character_id for update;
  if inv.id is null then raise exception 'O item foi removido.';end if;
  if nullif(inv.data->>'campaign_item_id','') is not null then
   if (inv.data->>'definition_version')::integer is distinct from (e->>'item_version')::integer then raise exception 'A versão deste item mudou. Cancele a tentativa.';end if;
   itemdef=private.campaign_item_use(inv.data,e->>'item_function_id');
   newdata=inv.data||jsonb_build_object('quantity',(inv.data->>'quantity')::integer-(itemdef->>'quantity_cost')::integer,'charges_used',coalesce((inv.data->>'charges_used')::integer,0)+(itemdef->>'charge_cost')::integer);
  else
  select data into itemdef from public.dnd_items where id=inv.data->>'catalog_id';
  if inv.id is null or itemdef->'use' is null or (inv.data->>'quantity')::integer<1 then raise exception 'O item foi removido ou está esgotado.';end if;
  newdata=inv.data;
  if itemdef ? 'charges' then
   remaining=coalesce((inv.data->>'charges_used')::integer,0)+1;
   if remaining>(itemdef->>'charges')::integer then raise exception 'Este item não possui mais usos.';end if;
   newdata=newdata||jsonb_build_object('charges_used',remaining);
   if remaining=(itemdef->>'charges')::integer and (inv.data->>'quantity')::integer>1 then newdata=newdata||jsonb_build_object('quantity',(inv.data->>'quantity')::integer-1,'charges_used',0);end if;
  elsif coalesce((itemdef->'use'->>'consumed')::boolean,false) then newdata=newdata||jsonb_build_object('quantity',(inv.data->>'quantity')::integer-1);end if;

  end if;
  update public.character_inventory set data=newdata where id=inv.id;
 elsif r.kind='weapon' and spend and t.character_id is not null then
  if r.source_id=t.id then entry=jsonb_build_object('id',t.id,'name','Ataque desarmado','catalog_id','unarmed','category','weapon','quantity',1,'damage','1 concussão','notes','');
  else select data||jsonb_build_object('id',id) into entry from public.character_inventory where id=r.source_id and character_id=t.character_id and data->>'category'='weapon' and (data->>'quantity')::integer>0 for update;end if;
  if entry is null then raise exception 'A arma foi removida ou está esgotada.';end if;
  wopts=coalesce(e->'entry'->'weapon_options','{}');
  perform private.dnd_check_weapon_options(t,entry,sheet,wopts,to_jsonb(r.target_ids));
  if p_success and r.resource_level>0 then
   if r.resource_kind='slot' then update public.characters set system_data=jsonb_set(system_data,'{slots_used}',coalesce(system_data->'slots_used','{}')||jsonb_build_object(r.resource_level::text,coalesce((system_data->'slots_used'->>r.resource_level::text)::integer,0)+1)) where id=t.character_id;
   elsif r.resource_kind='pact' then update public.characters set system_data=system_data||jsonb_build_object('pact_slots_used',coalesce((system_data->>'pact_slots_used')::integer,0)+1) where id=t.character_id;end if;
  end if;
  if nullif(entry->>'ammunition','') is not null then
   select * into inv from public.character_inventory where character_id=t.character_id and data->>'category'='ammunition' and data->>'ammunition'=entry->>'ammunition' and (data->>'quantity')::integer>0 order by id limit 1 for update;
   if inv.id is null then raise exception 'Munição compatível esgotada.';end if;
   update public.character_inventory set data=data||jsonb_build_object('quantity',(data->>'quantity')::integer-1) where id=inv.id;
  end if;
  update public.battle_map_tokens set weapon_attacked=weapon_attacked or (r.cost='action' and (private.dnd_weapon_traits(entry,sheet)->>'light')::boolean and not(private.dnd_weapon_traits(entry,sheet)->>'ranged')::boolean),
   sneak_used=sneak_used or (p_success and coalesce((wopts->>'sneak')::boolean,false)),hunter_used=hunter_used or (p_success and coalesce((wopts->>'hunter')::boolean,false)),
   rage_activity_at=case when raging and exists(select 1 from public.battle_map_tokens foe where foe.id=any(r.target_ids) and foe.faction in('enemy','ally') and foe.faction<>t.faction) then now() else rage_activity_at end where id=t.id;
 end if;
 if r.kind='spell' and spend then
  if t.character_id is not null then select data into entry from public.character_spells where id=r.source_id and character_id=t.character_id;
  else select data into entry from public.npc_spells where id=r.source_id and npc_id=t.npc_id; end if;
  if entry is null then raise exception 'A magia foi retirada da ficha. Cancele esta tentativa.'; end if;
  entry=entry||jsonb_build_object('level',r.spell_level); perform private.battle_check_resource(t,entry,r.resource_kind,r.resource_level);
  if t.character_id is not null then
   perform 1 from public.characters where id=t.character_id for update;
   perform private.battle_check_resource(t,entry,r.resource_kind,r.resource_level);
   if r.resource_kind='slot' then update public.characters set system_data=jsonb_set(system_data,'{slots_used}',coalesce(system_data->'slots_used','{}')||jsonb_build_object(r.resource_level::text,coalesce((system_data->'slots_used'->>r.resource_level::text)::integer,0)+1)) where id=t.character_id;
   elsif r.resource_kind='pact' then update public.characters set system_data=system_data||jsonb_build_object('pact_slots_used',coalesce((system_data->>'pact_slots_used')::integer,0)+1) where id=t.character_id;
   elsif r.resource_kind='arcanum' then update public.characters set system_data=jsonb_set(system_data,'{arcanum_used}',coalesce(system_data->'arcanum_used','{}')||jsonb_build_object(r.resource_level::text,1)) where id=t.character_id;
   end if;
  end if;
 end if;
 if spend then
  if r.cost='action' then
   if r.kind='weapon' then
    if t.action_used and t.attacks_remaining<=0 and t.extra_actions=0 then raise exception 'Não há ataques restantes.'; end if;
    if not t.action_used or t.attacks_remaining<=0 then
     attacks=case when e->'entry'->>'catalog_id'='net' then 1 else private.dnd_attack_count(sheet) end;
    else attacks=t.attacks_remaining; end if;
    update public.battle_map_tokens set action_used=true,attacks_remaining=attacks-1,extra_actions=extra_actions-case when t.action_used and t.attacks_remaining<=0 then 1 else 0 end where id=t.id;
   else
    if t.action_used and t.extra_actions=0 then raise exception 'A ação já foi utilizada.';end if;
    update public.battle_map_tokens set action_used=true,attacks_remaining=case when t.action_used then t.attacks_remaining else 0 end,extra_actions=extra_actions-case when t.action_used then 1 else 0 end,action_spell_level=case when r.kind='spell' then r.spell_level else action_spell_level end where id=t.id; end if;
  elsif r.cost='bonus' then
   if t.bonus_used then raise exception 'A ação bônus já foi utilizada.'; end if;
   update public.battle_map_tokens set bonus_used=true,bonus_spell_cast=bonus_spell_cast or r.kind='spell' where id=t.id;
  elsif r.cost='reaction' then
   if t.reaction_used then raise exception 'A reação já foi utilizada.'; end if;
   update public.battle_map_tokens set reaction_used=true where id=t.id;
  end if;
 end if;
 if p_success then
  if r.kind='feature' then
   case e->>'operation'
    when 'rage' then
     update public.battle_map_tokens set raging=true,rage_started_round=s.round,rage_activity_at=null,rage_checked_at=now() where id=t.id;
     update public.battle_spell_effects set active=false where token_id=t.id and concentration and active;
    when 'end-rage' then update public.battle_map_tokens set raging=false where id=t.id;
    when 'surge' then update public.battle_map_tokens set extra_actions=extra_actions+1,surge_used=true where id=t.id;
    when 'dash' then update public.battle_map_tokens set movement_remaining=movement_remaining+movement_speed,movement_bonus=movement_bonus+movement_speed where id=t.id;
    when 'disengage' then update public.battle_map_tokens set disengaged=true where id=t.id;
    when 'dodge' then update public.battle_map_tokens set dodging=true where id=t.id;
    else outcomes=private.battle_apply_hp(r,t,e,opts);
   end case;
  elsif r.kind='dash' then update public.battle_map_tokens set movement_remaining=movement_remaining+movement_speed,movement_bonus=movement_bonus+movement_speed where id=t.id;
  elsif r.kind='disengage' then update public.battle_map_tokens set disengaged=true where id=t.id;
  elsif r.kind='dodge' then update public.battle_map_tokens set dodging=true where id=t.id;
  else
   if r.kind='item' then perform private.dnd_item_special(r,e);end if;
   if opts ? 'kind' then
    if opts->>'kind' not in('damage','healing','temporary','utility') then raise exception 'Efeito inválido.'; end if;
    e=e||jsonb_build_object('kind',opts->>'kind');
   end if;
   if opts ? 'damageType' then e=e||jsonb_build_object('damageType',opts->>'damageType'); end if;
   if coalesce(e->>'timing','immediate')='immediate' or coalesce((opts->>'apply_now')::boolean,false) then outcomes=private.battle_apply_hp(r,t,e,opts); end if;
   if r.kind='spell' and (e ? 'pulseDice' or coalesce(e->>'timing','immediate')='trigger' or lower(coalesce(e->>'duration','')) not like 'instant%') then
    if coalesce((e->>'concentration')::boolean,false) then update public.battle_spell_effects set active=false where token_id=t.id and concentration and active; end if;
    insert into public.battle_spell_effects(request_id,campaign_id,map_id,token_id,name,definition,target,concentration,duration)
    values(r.id,r.campaign_id,r.map_id,t.id,r.name,case when e ? 'pulseDice' then e||jsonb_build_object('dice',e->>'pulseDice') else e end,r.target,coalesce((e->>'concentration')::boolean,false),coalesce(e->>'duration',''));
   end if;
  end if;
 end if;
 update public.battle_action_requests set status=case when p_success then 'success' else 'failure' end,resolution=outcomes||jsonb_build_object('resources_consumed',spend,'dice',coalesce(opts->>'dice',e->>'dice','')),
  resolved_by=auth.uid(),resolved_at=now() where id=r.id returning * into r;
 if r.movement_plan_id is not null then perform private.battle_finish_movement(r.movement_plan_id); end if;
 return r;
end $$;

commit;
-- VTT v10: immutable server dice, consumption of the same result, and checked NPC saves.
begin;
create function private.can_read_battle_map(p_map uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.battle_maps where id=p_map and private.can_read_campaign(campaign_id))$$;
revoke all on function private.can_read_battle_map(uuid) from public,anon;
grant execute on function private.can_read_battle_map(uuid) to authenticated;

create table public.battle_dice_rolls (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 map_id uuid not null references public.battle_maps(id) on delete cascade,
 rolled_by uuid not null references public.profiles(id), client_id uuid not null,
 expression text not null, label text not null default '',
 visibility text not null default 'public' check(visibility in('public','gm','self')),
 mode text not null default 'normal' check(mode in('normal','advantage','disadvantage')),
 terms jsonb not null check(jsonb_typeof(terms)='array'), total integer not null check(total between -100000 and 100000),
 request_id uuid references public.battle_action_requests(id) on delete cascade,
 effect_id uuid references public.battle_spell_effects(id) on delete cascade,
 effect_pulse integer, consumed_at timestamptz, created_at timestamptz not null default now(),
 unique(rolled_by,client_id), check(request_id is null or effect_id is null)
);
create index battle_dice_recent on public.battle_dice_rolls(campaign_id,map_id,created_at desc);
create index battle_dice_rate on public.battle_dice_rolls(rolled_by,created_at desc);
alter table public.battle_dice_rolls enable row level security;
create policy battle_dice_read on public.battle_dice_rolls for select to authenticated using (
 private.can_read_battle_map(map_id) and (visibility='public' or rolled_by=auth.uid() or visibility='gm' and private.is_campaign_owner(campaign_id))
);
revoke all on public.battle_dice_rolls from public,anon,authenticated;
grant select on public.battle_dice_rolls to authenticated;

create function private.battle_roll_detail(p_expression text,p_mode text default 'normal') returns jsonb
language plpgsql volatile set search_path='' as $$
declare expression text=regexp_replace(lower(coalesce(p_expression,'')),'\s','','g');
 part text[]; countdice integer; sides integer; subtotal integer; total integer=0; budget integer=0;
 value integer; vals jsonb; terms jsonb='[]'; sign integer; kept integer; dc integer=0;
begin
 if length(expression)>200 or expression !~ '^[+-]?\d+(d\d+)?([+-]\d+(d\d+)?)*$' then raise exception 'Use uma fórmula como 2d6+3 ou 1d20.'; end if;
 if p_mode not in('normal','advantage','disadvantage') or p_mode is null then raise exception 'Modo de rolagem inválido.'; end if;
 if p_mode<>'normal' and (expression !~ '(^|[+])1d20($|[+-])' or (select count(*) from regexp_matches(expression,'d\d+','g'))<>1) then raise exception 'Vantagem/desvantagem exige um único d20 e modificadores.'; end if;
 for part in select regexp_matches(expression,'([+-]?)(\d+)(?:d(\d+))?','g') loop
  if length(part[2])>6 or length(coalesce(part[3],''))>3 then raise exception 'Quantidade fora do limite.'; end if;
  countdice=part[2]::integer; sign=case when part[1]='-' then -1 else 1 end; subtotal=0; vals='[]'; kept=null;
  if part[3] is null then
   if countdice>100000 then raise exception 'Modificador acima do limite.'; end if;
   subtotal=countdice; sides=null;
  else
   sides=part[3]::integer;
   if sides not in(4,6,8,10,12,20,100) or countdice<1 then raise exception 'Use d4, d6, d8, d10, d12, d20 ou d100.'; end if;
   if p_mode<>'normal' then countdice=2; end if;
   budget=budget+countdice;
   if budget>100 then raise exception 'Use até 100 dados por rolagem.'; end if;
   for i in 1..countdice loop value=floor(random()*sides)::integer+1; vals=vals||to_jsonb(value); subtotal=subtotal+value; end loop;
   if p_mode<>'normal' then
    kept=case when p_mode='advantage' then case when (vals->>0)::integer >= (vals->>1)::integer then 0 else 1 end else case when (vals->>0)::integer <= (vals->>1)::integer then 0 else 1 end end;
    subtotal=(vals->>kept)::integer;
   end if;
  end if;
  total=total+sign*subtotal;
  terms=terms||jsonb_build_array(jsonb_build_object('sign',sign,'count',countdice,'sides',sides,'values',vals,'subtotal',sign*subtotal)||case when kept is null then '{}'::jsonb else jsonb_build_object('kept',kept) end);
 end loop;
 return jsonb_build_object('expression',expression,'mode',p_mode,'terms',terms,'total',greatest(-100000,least(100000,total)));
end $$;

create function private.battle_record_roll(p_map uuid,p_expression text,p_client uuid,p_label text,p_visibility text,p_mode text,p_request uuid default null,p_effect uuid default null) returns public.battle_dice_rolls
language plpgsql security definer set search_path='' as $$
declare m public.battle_maps; r public.battle_dice_rolls; result jsonb; q public.battle_action_requests; e public.battle_spell_effects;
begin
 if auth.uid() is null or p_client is null then raise exception 'Entre na sua conta para rolar.' using errcode='42501'; end if;
 select * into m from public.battle_maps where id=p_map;
 if m.id is null or not private.can_read_battle_map(m.id) then raise exception 'Você não tem acesso a esta mesa.' using errcode='42501'; end if;
 -- Same lock order as actions: session, campaign, request/effect, token, sheet.
 perform 1 from public.battle_sessions where id=m.battle_session_id for update;
 perform 1 from public.campaigns where id=m.campaign_id for update;
 select * into r from public.battle_dice_rolls where rolled_by=auth.uid() and client_id=p_client;
 if r.id is not null then
  if r.map_id<>p_map or r.expression<>regexp_replace(lower(p_expression),'\s','','g') or r.mode is distinct from p_mode or r.request_id is distinct from p_request or r.effect_id is distinct from p_effect then raise exception 'Este identificador pertence a outra rolagem.'; end if;
  return r;
 end if;
 if p_visibility not in('public','gm','self') or p_visibility is null then raise exception 'Visibilidade inválida.'; end if;
 if p_visibility='gm' and not private.is_campaign_owner(m.campaign_id) then raise exception 'Apenas o mestre pode usar rolagens do mestre.' using errcode='42501'; end if;
 if p_request is not null and p_effect is not null then raise exception 'Escolha apenas um contexto de rolagem.'; end if;
 if p_request is not null then
  select * into q from public.battle_action_requests where id=p_request for update;
  if q.id is null or q.map_id<>m.id or q.status<>'pending' or not private.is_campaign_owner(m.campaign_id) then raise exception 'A tentativa não está disponível para esta rolagem.' using errcode='42501'; end if;
  p_visibility='gm';
 end if;
 if p_effect is not null then
  select * into e from public.battle_spell_effects where id=p_effect for update;
  if e.id is null or e.map_id<>m.id or not e.active or not private.is_campaign_owner(m.campaign_id) then raise exception 'Efeito indisponível para esta rolagem.' using errcode='42501'; end if;
  p_visibility='gm';
 end if;
 if p_request is null and p_effect is null and (select count(*) from public.battle_dice_rolls where rolled_by=auth.uid() and request_id is null and effect_id is null and created_at>clock_timestamp()-interval '1 second')>=5 then raise exception 'Aguarde um instante antes da próxima rolagem.'; end if;
 result=private.battle_roll_detail(p_expression,p_mode);
 insert into public.battle_dice_rolls(campaign_id,map_id,rolled_by,client_id,expression,label,visibility,mode,terms,total,request_id,effect_id,effect_pulse)
 values(m.campaign_id,m.id,auth.uid(),p_client,result->>'expression',left(coalesce(p_label,''),120),p_visibility,p_mode,result->'terms',(result->>'total')::integer,p_request,p_effect,case when p_effect is null then null else e.pulses end) returning * into r;
 return r;
end $$;
create function public.roll_battle_dice(p_map_id uuid,p_expression text,p_client_id uuid,p_label text default '',p_visibility text default 'public',p_mode text default 'normal',p_request_id uuid default null,p_effect_id uuid default null) returns public.battle_dice_rolls
language sql security definer set search_path='' as $$select private.battle_record_roll(p_map_id,p_expression,p_client_id,p_label,p_visibility,p_mode,p_request_id,p_effect_id)$$;

-- Preserve 009 verbatim; its transactional rules receive the recorded numerical result.
alter function public.resolve_battle_action(uuid,boolean,jsonb) rename to resolve_battle_action_v9;
revoke all on function public.resolve_battle_action_v9(uuid,boolean,jsonb) from public,anon,authenticated;
create function public.resolve_battle_action(p_request_id uuid,p_success boolean,p_resolution jsonb default '{}') returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare q public.battle_action_requests; result public.battle_action_requests; r public.battle_dice_rolls; opts jsonb=coalesce(p_resolution,'{}'); expression text; kind text;
begin
 select * into q from public.battle_action_requests where id=p_request_id;
 if q.id is null or not private.is_campaign_owner(q.campaign_id) then raise exception 'Apenas o mestre pode decidir.' using errcode='42501'; end if;
 perform 1 from public.battle_sessions where id=q.session_id for update;
 perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into q from public.battle_action_requests where id=p_request_id for update;
 if q.status<>'pending' then return q; end if;
 expression=coalesce(opts->>'dice',q.definition->>'dice',''); kind=coalesce(opts->>'kind',q.definition->>'kind','utility');
 if p_success and q.kind in('spell','weapon','opportunity') and kind in('damage','healing','temporary') and (coalesce(q.definition->>'timing','immediate')='immediate' or coalesce((opts->>'apply_now')::boolean,false)) then
  if opts ? 'roll_id' then
   select * into r from public.battle_dice_rolls where id=(opts->>'roll_id')::uuid for update;
   if r.id is null or r.request_id is distinct from q.id or r.rolled_by<>auth.uid() or r.consumed_at is not null then raise exception 'Use uma rolagem desta tentativa que ainda não foi aplicada.'; end if;
  elsif expression<>'' then r=private.battle_record_roll(q.map_id,expression,gen_random_uuid(),q.name,'gm','normal',q.id); end if;
  if r.id is not null then opts=opts||jsonb_build_object('dice',greatest(0,r.total)::text); end if;
 end if;
 result=public.resolve_battle_action_v9(q.id,p_success,opts);
 if result.status='success' and r.id is not null then
  update public.battle_dice_rolls set consumed_at=now() where id=r.id returning * into r;
  update public.battle_action_requests set resolution=resolution||jsonb_build_object('dice',r.expression,'dice_roll_id',r.id,'dice_roll',to_jsonb(r)) where id=q.id returning * into result;
 end if;
 return result;
end $$;
alter function public.pulse_battle_spell(uuid,jsonb,integer) rename to pulse_battle_spell_v9;
revoke all on function public.pulse_battle_spell_v9(uuid,jsonb,integer) from public,anon,authenticated;
create function public.pulse_battle_spell(p_effect_id uuid,p_resolution jsonb,p_expected_pulses integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.battle_spell_effects; r public.battle_dice_rolls; opts jsonb=coalesce(p_resolution,'{}'); result jsonb; expression text;
begin
 select * into e from public.battle_spell_effects where id=p_effect_id;
 if e.id is null or not private.is_campaign_owner(e.campaign_id) then raise exception 'Apenas o mestre pode aplicar este efeito.' using errcode='42501'; end if;
 perform 1 from public.battle_sessions where id=(select battle_session_id from public.battle_maps where id=e.map_id) for update;
 perform 1 from public.campaigns where id=e.campaign_id for update;
 select * into e from public.battle_spell_effects where id=p_effect_id for update;
 if not e.active or e.pulses<>p_expected_pulses then raise exception 'O efeito mudou. Atualize a mesa.'; end if;
 expression=coalesce(opts->>'dice',e.definition->>'dice','');
 if opts ? 'roll_id' then
  select * into r from public.battle_dice_rolls where id=(opts->>'roll_id')::uuid for update;
  if r.id is null or r.effect_id is distinct from e.id or r.effect_pulse<>e.pulses or r.rolled_by<>auth.uid() or r.consumed_at is not null then raise exception 'Use uma rolagem deste gatilho que ainda não foi aplicada.'; end if;
 elsif expression<>'' then r=private.battle_record_roll(e.map_id,expression,gen_random_uuid(),e.name,'gm','normal',null,e.id); end if;
 if r.id is not null then opts=opts||jsonb_build_object('dice',greatest(0,r.total)::text); end if;
 result=public.pulse_battle_spell_v9(e.id,opts,p_expected_pulses);
 if r.id is not null then update public.battle_dice_rolls set consumed_at=now() where id=r.id returning * into r; result=result||jsonb_build_object('dice_roll',to_jsonb(r)); end if;
 return result;
end $$;

-- A stale NPC sheet must not overwrite damage received while the form was open.
alter function public.save_npc(jsonb) rename to save_npc_v9;
revoke all on function public.save_npc_v9(jsonb) from public,anon,authenticated;
create function public.save_npc(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare old public.npcs; cid uuid=(p_payload->>'campaign_id')::uuid; result uuid; temp integer;
begin
 if not private.is_campaign_owner(cid) then raise exception 'Apenas o mestre pode salvar NPCs.' using errcode='42501'; end if;
 perform 1 from public.campaigns where id=cid for update;
 select * into old from public.npcs where id=(p_payload->>'id')::uuid for update;
 if old.id is not null and p_payload->>'expected_updated_at' is not null and old.updated_at is distinct from (p_payload->>'expected_updated_at')::timestamptz then raise exception 'Este NPC mudou durante a edição. Feche e reabra a ficha para preservar os PV atuais.' using errcode='40001'; end if;
 result=public.save_npc_v9(p_payload);
 temp=coalesce((p_payload->>'hp_temp')::integer,0);
 if temp<0 then raise exception 'PV temporários não podem ser negativos.'; end if;
 update public.npc_stats set hp_temp=temp where npc_id=result;
 update public.battle_map_tokens set name=p_payload->>'name',image=p_payload->>'image_path' where npc_id=result;
 return result;
end $$;
revoke all on function private.battle_roll_detail(text,text),private.battle_record_roll(uuid,text,uuid,text,text,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.roll_battle_dice(uuid,text,uuid,text,text,text,uuid,uuid),public.resolve_battle_action(uuid,boolean,jsonb),public.pulse_battle_spell(uuid,jsonb,integer),public.save_npc(jsonb) from public,anon;
grant execute on function public.roll_battle_dice(uuid,text,uuid,text,text,text,uuid,uuid),public.resolve_battle_action(uuid,boolean,jsonb),public.pulse_battle_spell(uuid,jsonb,integer),public.save_npc(jsonb) to authenticated;
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.battle_dice_rolls; end if; end$$;
notify pgrst,'reload schema';
commit;

create or replace function private.battle39_plan(d public.battle_decisions) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q public.battle_action_requests;g private.battle_guides;e jsonb;s jsonb;c public.battle_decisions;plan jsonb='[]';n integer=0;
begin
 if d.kind='choice' then return plan;end if;
 if d.kind<>'damage' then
  if d.ability in('str','dex') and coalesce(private.battle_sheet(d.token_id)->'conditions','[]') ?| array['Inconsciente','Atordoado','Paralisado','Petrificado'] then return '[]';end if;
  return jsonb_build_array(jsonb_build_object('expression','1d20'||case when d.modifier>=0 then '+' else '' end||d.modifier,'mode',d.mode,'label',d.label));
 end if;
 select * into q from public.battle_action_requests where id=d.request_id;select * into g from private.battle_guides where request_id=d.request_id;s=private.battle_sheet(d.token_id);
 for c in select * from public.battle_decisions where request_id=d.request_id and kind='attack' and (coalesce((result->>'hit')::boolean,false) or coalesce((g.definition->>'missHalf')::boolean,false)) order by sequence loop
  e=case when coalesce((c.result->>'critical')::boolean,false) then private.battle37_critical(g.definition,s,q.kind='weapon') else g.definition end;
  if n>0 and coalesce((g.definition->>'onceBonus')::integer,0)<>0 then e=e||jsonb_build_object('dice',(e->>'dice')||case when (g.definition->>'onceBonus')::integer>0 then '-' else '+' end||abs((g.definition->>'onceBonus')::integer));end if;
  n=n+1;plan=plan||jsonb_build_array(jsonb_build_object('expression',e->>'dice','mode','normal','rerollWeaponDice',coalesce((e->>'rerollWeaponDice')::integer,0),'label','Acerto '||n));
 end loop;
 if n=0 then plan=jsonb_build_array(jsonb_build_object('expression',d.options->>'dice','mode','normal','label',d.label));end if;return plan;
end $$;
create or replace function private.battle39_decision_options() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.campaign_rules;t public.battle_map_tokens;q public.battle_action_requests;mode text;
begin
 select * into r from public.campaign_rules where campaign_id=new.campaign_id;select * into t from public.battle_map_tokens where id=new.token_id;select * into q from public.battle_action_requests where id=new.request_id;
 if tg_op='INSERT' then
  mode=case when t.npc_id is not null and coalesce(r.npc_dice_mode,'inherit')<>'inherit' then r.npc_dice_mode else coalesce(r.combat_dice_mode,'program') end;
  new.options=new.options||jsonb_build_object('dice_mode',mode,'animate',coalesce(r.combat_dice_animation,true),'show_dc',coalesce(r.show_save_dc,true) or t.npc_id is not null,'dc_source',case when new.kind='concentration' then 'Concentração: maior entre 10 e metade do dano.' when q.kind='spell' then 'CD do conjurador: 8 + proficiência + atributo da origem da magia.' else 'CD definida pelo efeito.' end);
 end if;
 new.options=new.options||jsonb_build_object('roll_plan',private.battle39_plan(new));return new;
end $$;
drop trigger if exists battle39_decision_options on public.battle_decisions;
create trigger battle39_decision_options before insert or update of mode,modifier on public.battle_decisions for each row execute function private.battle39_decision_options();
revoke all on function private.battle39_plan(public.battle_decisions),private.battle39_decision_options() from public,anon,authenticated;
do $npc39$ declare definition text;arguments text;begin
 if to_regprocedure('private.save_npc_v38(jsonb)') is null then
  select pg_get_functiondef('public.save_npc(jsonb)'::regprocedure) into definition;
  execute replace(definition,'public.save_npc(','private.save_npc_v38(');
 end if;
 select pg_get_function_arguments('public.save_npc(jsonb)'::regprocedure) into arguments;
 execute 'create or replace function public.save_npc('||arguments||') '||$definition$returns uuid language plpgsql security definer set search_path='' as $body$
 declare p_payload alias for $1;id uuid;
 begin
  id=private.save_npc_v38(p_payload);
  update public.npc_stats set spell_save_dc=case when p_payload ? 'spell_save_dc' then nullif(p_payload->>'spell_save_dc','')::integer else spell_save_dc end,spell_attack_bonus=case when p_payload ? 'spell_attack_bonus' then nullif(p_payload->>'spell_attack_bonus','')::integer else spell_attack_bonus end,spellcasting_ability=coalesce(p_payload->>'spellcasting_ability',spellcasting_ability) where npc_id=id;
  return id;
 end $body$;$definition$;
end $npc39$;
revoke all on function private.save_npc_v38(jsonb) from public,anon,authenticated;
revoke all on function public.save_npc(jsonb) from public,anon;grant execute on function public.save_npc(jsonb) to authenticated;

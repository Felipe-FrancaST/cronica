"""Generate additive migration 040 from immutable, versioned source functions."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
def sql(n):return (root/'supabase'/n).read_text()
def function(s,n):
 m=re.search(r'create(?: or replace)? function '+re.escape(n)+r'\([\s\S]*?end;?\s*\$\$;',s);assert m,n;return m[0]
old=sql('migrations/202610230039_magic_and_dice_rules.sql');answer=function(old,'public.answer_battle_decision')
answer=answer.replace("decision.kind not in('concentration','condition')","decision.kind not in('concentration','condition','death')")
answer=answer.replace(" if decision.kind='choice' then", """ if decision.kind='death' then
  if a.character_id is null or bs.active_token_id<>a.id or (s->>'hp_current')::integer<>0 or coalesce((s->>'death_failures')::integer,0)>=3 or s->'conditions' ?| array['Estável','Morto','Dead'] then
   update public.battle_decisions set status='cancelled',answered_at=now() where id=decision.id returning * into decision;perform set_config('battle39.physical','false',true);return decision;end if;
  d=private.battle37_record(q,a.id,'1d20',decision.mode,p_client_id);
  natural_roll=(select (term->>'subtotal')::integer from jsonb_array_elements(d.terms) term where (term->>'sides')::integer=20 limit 1);
  total=coalesce((s->>'death_successes')::integer,0);amount=coalesce((s->>'death_failures')::integer,0);
  if natural_roll=20 then
   update public.characters set system_data=system_data||'{"hp_current":1,"death_successes":0,"death_failures":0}' where id=a.character_id;
   total=0;amount=0;answer_result=jsonb_build_object('life_state','revived','message','20 natural: você recuperou 1 PV. Continua caído até se levantar.');
  else
   if natural_roll>=10 then total=least(3,total+1);else amount=least(3,amount+case when natural_roll=1 then 2 else 1 end);end if;
   select system_data into s from public.characters where id=a.character_id for update;
   s=s||jsonb_build_object('death_successes',case when total>=3 then 0 else total end,'death_failures',case when total>=3 then 0 else amount end);
   if total>=3 then s=jsonb_set(s,'{conditions}',coalesce(s->'conditions','[]')||'["Estável"]');end if;
   update public.characters set system_data=s where id=a.character_id;
   answer_result=jsonb_build_object('life_state',case when amount>=3 then 'dead' when total>=3 then 'stable' else 'dying' end,'message',case when amount>=3 then 'Três falhas: o personagem morreu.' when total>=3 then 'Você está estável, com 0 PV e inconsciente. As contagens foram zeradas.' when natural_roll=1 then '1 natural: duas falhas contra a morte.' when natural_roll>=10 then 'Um sucesso contra a morte.' else 'Uma falha contra a morte.' end);
  end if;
  answer_result=answer_result||jsonb_build_object('passed',natural_roll>=10,'natural',natural_roll,'roll',to_jsonb(d),'death_successes',total,'death_failures',amount);
 elsif decision.kind='choice' then""")
needle="targets=targets||jsonb_build_object(target_id::text,jsonb_build_object('amount',coalesce((targets->target_id::text->>'amount')::integer,0)+amount));";assert needle in answer
answer=answer.replace(needle,"targets=targets||jsonb_build_object(target_id::text,jsonb_build_object('amount',coalesce((targets->target_id::text->>'amount')::integer,0)+amount,'death_events',coalesce(targets->target_id::text->'death_events','[]')||jsonb_build_array(jsonb_build_object('amount',amount,'critical',coalesce((check_row.result->>'critical')::boolean,false)))));")
answer=answer.replace("  q=private.battle_resolve_guided_core(q.id,true,opts);","  q=private.battle_resolve_guided_core(q.id,true,opts);\n  update public.battle_action_requests set resolution=resolution||jsonb_build_object('critical',exists(select 1 from public.battle_decisions where request_id=q.id and kind='attack' and coalesce((result->>'critical')::boolean,false))) where id=q.id returning * into q;")
hp=function(old,'private.battle_apply_hp_v11');hp=hp.replace("  if kind='healing' and sheet->'conditions' ? 'Cura bloqueada' then amount=0;end if;", "  if kind='healing' and (sheet->'conditions' ?| array['Cura bloqueada','Morto','Dead'] or coalesce((sheet->>'death_failures')::integer,0)>=3) then amount=0;end if;")
needle="   update public.characters set system_data=system_data||jsonb_build_object('hp_current',afterhp,'hp_temp',aftertemp) where id=t.character_id;";assert needle in hp
hp=hp.replace(needle,"   update public.characters set system_data=system_data||case when kind='damage' then private.battle40_damage_state(sheet,amount,temp,coalesce(target_opts->'death_events',jsonb_build_array(jsonb_build_object('amount',amount,'critical',coalesce((opts->>'critical')::boolean,false)))),maxhp) else '{}'::jsonb end||jsonb_build_object('hp_current',afterhp,'hp_temp',aftertemp) where id=t.character_id;")
atlas=function(sql('migrations/202610220034_campaign_map_workshop.sql'),'private.validate_atlas_document');types=(root/'src/features/atlas/types.ts').read_text();symbols=re.findall(r"\['([^']+)', '[^']+', '(?:nature|places|adventure|interior)'\]",types);tokens=re.findall(r"'([^']+)'",types.split('export const TOKEN_ICONS = [')[1].split('] as const;')[0]);assert len(symbols)==68 and len(tokens)==24
for field,ids in [('symbol',symbols),('icon',tokens)]:atlas=re.sub(r"(coalesce\(o->>'"+field+r"',''\) not in )\([^\n]+\)",lambda m:m[1]+'('+','.join("'"+x+"'" for x in ids)+')',atlas)
options=function(sql('patches/magic-decisions.sql'),'private.battle39_decision_options').replace("case when new.kind='concentration' then", "case when new.kind='death' then 'Salvaguarda contra a morte: d20, CD 10, sem atributo ou proficiência. 1 natural: duas falhas. 20 natural: recupera 1 PV.' when new.kind='concentration' then")
compact=old[old.index('create or replace function public.battle_combat_update('):];compact=compact[:compact.index('$$;')+3].replace("'map_id',p_map_id,","'map_id',p_map_id,'lifeStates',public.list_battle_life((select campaign_id from public.battle_maps where id=p_map_id),p_map_id),")
parts=['-- 040: life states, death saves and cartography library. Apply after 039.','begin;',sql('patches/death-saves.sql'),answer,hp,atlas,options,compact,"update public.characters set system_data=system_data where system_data->>'hp_current'='0';\ndo $$ declare s public.battle_sessions;begin for s in select * from public.battle_sessions where status='active' loop perform private.battle40_ensure_death(s);end loop;end $$;",'commit;'];out=root/'supabase/migrations/202610240040_life_and_map_library.sql';out.write_text('\n\n'.join(parts)+'\n');print('040:',out.stat().st_size)

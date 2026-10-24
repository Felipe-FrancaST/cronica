"""Build additive migration 039 from immutable earlier SQL and explicit new patches."""
from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[1]
def read(p):return (root/p).read_text()
def fn(s,name):
 m=re.search(r'create(?: or replace)? function '+re.escape(name)+r'\([\s\S]*?end \$\$;',s)
 if not m:raise ValueError(name)
 return m.group()
v38=read('supabase/migrations/202610230038_direct_combat.sql');v37=read('supabase/migrations/202610230037_sheet_rules_and_guided_combat.sql');v18=read('supabase/migrations/202610070018_spell_access_combat_and_items.sql');v10=read('supabase/migrations/202610050010_battle_dice.sql')
parts=['-- 039: spell saves, physical dice and source-based spell conditions. Apply after 038.','begin;',read('supabase/patches/magic-rules.sql')]
parts+=[fn(v10,'private.battle_roll_detail').replace('create function private.battle_roll_detail','create or replace function private.battle39_manual_detail').replace('floor(random()*sides)::integer+1','private.battle39_face(sides)'),fn(v18,'private.dnd_attack_roll_detail').replace('private.dnd_attack_roll_detail','private.battle39_manual_attack').replace("private.battle_roll_detail(expression,'normal')","private.battle39_manual_detail(expression,'normal')").replace("floor(random()*(term->>'sides')::integer)::integer+1","private.battle39_face((term->>'sides')::integer)")]
record=fn(v37,'private.battle37_record').replace('t public.battle_map_tokens;',"t public.battle_map_tokens;physical boolean=coalesce(current_setting('battle39.physical',true),'false')='true';roll_index integer=coalesce(nullif(current_setting('battle39.roll_index',true),''),'0')::integer;faces jsonb;")
record=record.replace(' if p_definition is null then detail=private.battle_roll_detail',""" if physical then
  faces=current_setting('battle39.rolls',true)::jsonb->roll_index;
  if jsonb_typeof(faces) is distinct from 'array' or jsonb_array_length(faces)>200 then raise exception 'Informe as faces de cada rolagem física.';end if;
  perform set_config('battle39.faces',faces::text,true);perform set_config('battle39.face_index','0',true);
  if p_definition is null then detail=private.battle39_manual_detail(p_expression,p_mode);else detail=private.battle39_manual_attack(p_expression,p_definition);end if;
  if current_setting('battle39.face_index',true)::integer<>jsonb_array_length(faces) then raise exception 'Há faces adicionais que não pertencem à rolagem.';end if;
  perform set_config('battle39.roll_index',(roll_index+1)::text,true);
 elsif p_definition is null then detail=private.battle_roll_detail""")
record=record.replace('request_id,consumed_at)','request_id,consumed_at,source)').replace("q.id,now()) returning * into d;","q.id,now(),case when physical then 'physical' else 'program' end) returning * into d;");parts.append(record)

attackMode=fn(v37,'private.battle37_attack_mode').replace('private.battle37_attack_mode(a public.battle_map_tokens,t public.battle_map_tokens,m public.battle_maps)', 'private.battle39_attack_mode(a public.battle_map_tokens,t public.battle_map_tokens,m public.battle_maps,p_ignore_mockery boolean)').replace("dis=actor_conditions ?|", "dis=(not p_ignore_mockery and actor_conditions ? 'Desvantagem no próximo ataque') or actor_conditions ?|")
parts.append(attackMode)
parts.append("revoke all on function private.battle39_attack_mode(public.battle_map_tokens,public.battle_map_tokens,public.battle_maps,boolean) from public,anon,authenticated;")
next=fn(v38,'private.battle37_next').replace("   if bonus is null and q.kind='spell' and a.character_id is not null then","   if q.kind='spell' then bonus=private.battle39_attack(a.id,e->'entry');end if;\n   if bonus is null and q.kind='spell' and a.character_id is not null then").replace("   dc=coalesce((e->>'save_dc')::integer,(g.options->>'dc')::integer);","   dc=case when q.kind='spell' then private.battle39_dc(a.id,e->'entry') else coalesce((e->>'save_dc')::integer,(g.options->>'dc')::integer) end;");next=next.replace('private.battle37_attack_mode(a,t,m)','private.battle39_attack_mode(a,t,m,i>1)').replace("if g.phase='attacks' and not exists","if g.phase='attacks' and not coalesce((e->>'missHalf')::boolean,false) and not exists");next=next.replace("   if bonus is null then raise exception","   if a.npc_id is not null and q.kind in('weapon','opportunity') then bonus=coalesce((e->'entry'->>'bonus')::integer,bonus);end if;\n   if bonus is null then raise exception");parts.append(next)
request=fn(v38,'public.request_battle_action').replace(" if cardinality(ids)>coalesce((e->>'maxTargets')::integer,1)", " if kind='spell' and coalesce((e->>'targetsPerSlot')::integer,0)>0 then e=e||jsonb_build_object('maxTargets',coalesce((e->>'maxTargets')::integer,1)+greatest(0,rlevel-lvl)*(e->>'targetsPerSlot')::integer);end if;\n if cardinality(ids)>coalesce((e->>'maxTargets')::integer,1)")
request=request.replace(" insert into public.battle_action_requests(campaign_id", " if p_payload ? 'condition_choice' then\n  if kind<>'spell' or entry->>'catalog_id'<>'cegueira-surdez' or coalesce(p_payload->>'condition_choice','') not in('Cego','Surdo') then raise exception 'Escolha de condição inválida.';end if;\n  e=e||jsonb_build_object('condition',p_payload->>'condition_choice');\n end if;\n insert into public.battle_action_requests(campaign_id")
parts.append(request)
# Preserve movement geometry/portals, but check movement-blocking conditions before any movement.
move=fn(read('supabase/migrations/202610050011_player_rolls_and_scenery.sql'),'public.move_battle_token')
move=move.replace(" if exists(select 1 from public.battle_action_requests q where q.session_id=s.id", " if s.status='active' and private.battle_sheet(t.id)->'conditions' ?| array['Impedido','Paralisado','Incapacitado','Inconsciente','Atordoado','Petrificado'] then raise exception 'A condição atual impede deslocamento.';end if;\n if exists(select 1 from public.battle_action_requests q where q.session_id=s.id",1)
move=move.replace('sheet=private.battle_sheet(enemy.id); if',"sheet=private.battle_sheet(enemy.id); if sheet->'conditions' ?| array['Reações bloqueadas','Incapacitado','Paralisado','Atordoado','Inconsciente','Petrificado'] then continue;end if; if");parts.append(move)

answer=fn(v38,'public.answer_battle_decision').replace(" if decision.status<>'pending' then return decision;end if;"," if decision.status<>'pending' then return decision;end if;\n perform set_config('battle39.physical',(coalesce(decision.options->>'dice_mode','program')='physical' and decision.kind<>'choice')::text,true);")
answer=answer.replace(' select * into a from public.battle_map_tokens where id=decision.token_id for update;',""" if coalesce(decision.options->>'dice_mode','program')='physical' and decision.kind<>'choice' then
  if jsonb_typeof(p_answer->'rolls') is distinct from 'array' or jsonb_array_length(p_answer->'rolls')>100 then raise exception 'Informe as faces dos dados físicos.';end if;
  perform set_config('battle39.rolls',(p_answer->'rolls')::text,true);perform set_config('battle39.roll_index','0',true);
 elsif p_answer ? 'rolls' then raise exception 'Esta etapa usa dados do programa.';end if;
 select * into a from public.battle_map_tokens where id=decision.token_id for update;""")
answer=answer.replace(" if decision.kind in('attack','save') then update", """ if coalesce(decision.options->>'dice_mode','program')='physical' and decision.kind<>'choice' and current_setting('battle39.roll_index',true)::integer<>jsonb_array_length(p_answer->'rolls') then raise exception 'A quantidade de rolagens físicas não corresponde aos dados desta etapa.';end if;
 perform set_config('battle39.physical','false',true);
 if decision.kind in('attack','save') then update""")
answer=answer.replace("if coalesce((private.battle_sheet(target_id)->>'hp_current')::integer,0)>0 and exists","if coalesce((select concentration_checks from public.campaign_rules where campaign_id=q.campaign_id),true) and coalesce((private.battle_sheet(target_id)->>'hp_current')::integer,0)>0 and exists")
answer=answer.replace("if bs.status<>'active' or bs.round<>q.round or bs.turn_index<>q.turn_index or bs.turn_started_at is distinct from q.turn_started_at or q.status not in('pending','success') or q.status='success' and decision.kind<>'concentration' then","if bs.status<>'active' or (decision.kind<>'condition' and (bs.round<>q.round or bs.turn_index<>q.turn_index or bs.turn_started_at is distinct from q.turn_started_at)) or q.status not in('pending','success') or q.status='success' and decision.kind not in('concentration','condition') then").replace("decision.kind in('attack','save','concentration')","decision.kind in('attack','save','concentration','condition')").replace("decision.kind in('save','concentration')","decision.kind in('save','concentration','condition')")
answer=answer.replace(" update public.battle_decisions set status='answered',result=answer_result", """ if decision.kind='condition' and decision.options->>'condition_id' is not null then
  update private.battle_condition_effects set active=not coalesce((answer_result->>'passed')::boolean,false) where id=(decision.options->>'condition_id')::uuid;
 end if;
 update public.battle_decisions set status='answered',result=answer_result""");answer=answer.replace("and coalesce((battle_decisions.result->>'hit')::boolean,false) order by sequence", "and (coalesce((battle_decisions.result->>'hit')::boolean,false) or coalesce((e->>'missHalf')::boolean,false)) order by sequence")
answer=answer.replace("    detail=jsonb_build_object('damage_parts'", "    if not coalesce((check_row.result->>'hit')::boolean,false) then part_effect=part_effect||jsonb_build_object('halfOnSave',true);end if;\n    detail=jsonb_build_object('damage_parts'")
answer=answer.replace("part_effect,greatest(0,d.total),false,detail)", "part_effect,greatest(0,d.total),not coalesce((check_row.result->>'hit')::boolean,false),detail)")
answer=answer.replace(" if decision.kind='choice' then", """ if coalesce((decision.options->>'escape')::boolean,false) then
  if bs.active_token_id is distinct from a.id or (a.action_used and coalesce(a.extra_actions,0)<=0) then raise exception 'Escapar exige seu turno e uma ação disponível.';end if;
  if (s->>'hp_current')::integer<=0 or s->'conditions' ?| array['Incapacitado','Paralisado','Atordoado','Inconsciente','Petrificado'] then raise exception 'A condição atual impede esta ação.';end if;
  update public.battle_map_tokens set action_used=true,extra_actions=case when action_used then greatest(0,extra_actions-1) else extra_actions end where id=a.id;
 end if;
 if decision.kind='choice' then""",1)
parts.append(answer)
rules=read('supabase/migrations/202610070019_master_rules_and_scene_workshop.sql');start=rules.index("execute 'create or replace function public.save_campaign_rules_v19");body=rules[rules.index('declare\n  p_campaign_id alias for $1;',start):rules.index('end $function_body$;',start)]+'end $$;';# Keep positional aliases so existing argument names/defaults can be preserved.
fields={'combat_dice_mode':"coalesce(p_rules->>'combat_dice_mode',r.combat_dice_mode)",'npc_dice_mode':"coalesce(p_rules->>'npc_dice_mode',r.npc_dice_mode)"}
for k in ['combat_dice_animation','combat_effects','show_save_dc','concentration_checks']:fields[k]=f"coalesce((p_rules->>'{k}')::boolean,r.{k})"
body=body.replace('  update public.campaign_rules set lock_player_level=', '  update public.campaign_rules set '+','.join(k+'='+v for k,v in fields.items())+',lock_player_level=');parts.append("do $preserve39$ declare arguments text; begin\n select pg_get_function_arguments('public.save_campaign_rules_v19(uuid,jsonb,timestamptz)'::regprocedure) into arguments;\n execute 'create or replace function public.save_campaign_rules_v19('||arguments||') '||$definition$returns public.campaign_rules language plpgsql security definer set search_path='' as $body$\n"+body.removesuffix('end $$;')+"end $body$;$definition$;end $preserve39$;")
parts+=[read('supabase/patches/magic-decisions.sql'),read('supabase/patches/magic-conditions.sql')]
hp=fn(v18,'private.battle_apply_hp_v11').replace('  total_amount=total_amount+amount;', "  if kind='healing' and sheet->'conditions' ? 'Cura bloqueada' then amount=0;end if;\n  total_amount=total_amount+amount;")
hp=hp.replace("ids uuid[]; total integer=0;", "condition_row private.battle_condition_effects;source_request public.battle_action_requests;ids uuid[]; total integer=0;")
hp=hp.replace("  if kind='damage' and amount>0 then", """  if kind='damage' and amount>0 then
   update private.battle_condition_effects c set active=false from public.battle_action_requests src where src.id=c.request_id and c.token_id=t.id and c.active and src.definition->'entry'->>'catalog_id'='padrao-hipnotico';
   for condition_row in select c.* from private.battle_condition_effects c join public.battle_action_requests src on src.id=c.request_id where c.token_id=t.id and c.active and src.definition->'entry'->>'catalog_id'='riso-histerico-de-tasha' loop
    update private.battle_condition_effects set damage_saves=damage_saves+1 where id=condition_row.id returning * into condition_row;
    select * into source_request from public.battle_action_requests where id=condition_row.request_id;
    perform private.battle37_add_decision(source_request,t.id,'condition',-condition_row.damage_saves,source_request.name||' · salvaguarda após dano',condition_row.ability,condition_row.dc,private.dnd37_save_bonus(t.id,condition_row.ability),'advantage',jsonb_build_object('condition_id',condition_row.id,'damage_trigger',true));
   end loop;""")
parts.append(hp)

compact=re.search(r'create or replace function public.battle_combat_update\([\s\S]*?\$\$;',v38).group();parts.append(compact.replace("'map_id',p_map_id,","'map_id',p_map_id,'conditionEffects',public.list_battle_conditions((select campaign_id from public.battle_maps where id=p_map_id)),"))
for id,p in json.loads(read('src/features/vtt/spell-profile-updates.json')).items():parts.append("update public.dnd_spells set combat=$profile$"+json.dumps(p,ensure_ascii=False,separators=(',',':'))+"$profile$::jsonb where id='"+id+"';")
parts+=["revoke all on function private.battle39_face(integer),private.battle39_manual_detail(text,text),private.battle39_manual_attack(text,jsonb) from public,anon,authenticated;",'commit;']
sql='\n\n'.join(parts)+'\n';assert len(sql.encode())<256*1024
(root/'supabase/migrations/202610230039_magic_and_dice_rules.sql').write_text(sql)
print('039 bytes:',len(sql.encode()))

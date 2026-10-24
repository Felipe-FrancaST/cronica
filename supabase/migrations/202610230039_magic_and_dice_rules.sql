-- 039: spell saves, physical dice and source-based spell conditions. Apply after 038.

begin;

alter table public.campaign_rules add column if not exists combat_dice_mode text not null default 'program' check(combat_dice_mode in('program','physical'));
alter table public.campaign_rules add column if not exists npc_dice_mode text not null default 'inherit' check(npc_dice_mode in('inherit','program','physical'));
alter table public.campaign_rules add column if not exists combat_dice_animation boolean not null default true;
alter table public.campaign_rules add column if not exists combat_effects boolean not null default true;
alter table public.campaign_rules add column if not exists show_save_dc boolean not null default true;
alter table public.campaign_rules add column if not exists concentration_checks boolean not null default true;
alter table public.battle_dice_rolls add column if not exists source text not null default 'program' check(source in('program','physical'));
alter table public.npc_stats add column if not exists spell_save_dc integer check(spell_save_dc between 1 and 40);
alter table public.npc_stats add column if not exists spell_attack_bonus integer check(spell_attack_bonus between -50 and 50);
alter table public.npc_stats add column if not exists spellcasting_ability text not null default 'int' check(spellcasting_ability in('str','dex','con','int','wis','cha'));
create or replace function private.battle39_dc(p_token uuid,p_entry jsonb) returns integer language plpgsql stable security definer set search_path='' as $$
declare t public.battle_map_tokens;s jsonb;ability text;fixed integer;
begin
 select * into t from public.battle_map_tokens where id=p_token;s=private.battle_sheet(t.id);
 if t.npc_id is not null then select spell_save_dc,spellcasting_ability into fixed,ability from public.npc_stats where npc_id=t.npc_id;else ability=private.dnd_spell_ability(s,p_entry);end if;
 if fixed is not null then return fixed;end if;
 if ability is null then raise exception 'Defina a origem de conjuração desta magia.';end if;
 return 8+2+(greatest(1,coalesce((s->>'level')::integer,1))-1)/4+floor((coalesce((s->'abilities'->>ability)::numeric,10)-10)/2)::integer;
end $$;
create or replace function private.battle39_attack(p_token uuid,p_entry jsonb) returns integer language plpgsql stable security definer set search_path='' as $$
declare t public.battle_map_tokens;n integer;
begin
 select * into t from public.battle_map_tokens where id=p_token;
 if t.npc_id is not null then select spell_attack_bonus into n from public.npc_stats where npc_id=t.npc_id;end if;return coalesce(n,private.battle39_dc(p_token,p_entry)-8);
end $$;
revoke all on function private.battle39_dc(uuid,jsonb),private.battle39_attack(uuid,jsonb) from public,anon,authenticated;
create or replace function private.battle39_face(p_sides integer) returns integer language plpgsql volatile set search_path='' as $$
declare faces jsonb=current_setting('battle39.faces',true)::jsonb;i integer=coalesce(nullif(current_setting('battle39.face_index',true),''),'0')::integer;v jsonb;n numeric;
begin
 v=faces->i;if v is null or jsonb_typeof(v)<>'number' then raise exception 'Informe todas as faces dos dados, na ordem indicada.';end if;n=v::text::numeric;
 if n<>floor(n) or n<1 or n>p_sides then raise exception 'O resultado do d% deve ser inteiro entre 1 e %.',p_sides,p_sides;end if;
 perform set_config('battle39.face_index',(i+1)::text,true);return n::integer;
end $$;


create or replace function private.battle39_manual_detail(p_expression text,p_mode text default 'normal') returns jsonb
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
   for i in 1..countdice loop value=private.battle39_face(sides); vals=vals||to_jsonb(value); subtotal=subtotal+value; end loop;
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

create or replace function private.battle39_manual_attack(expression text,e jsonb) returns jsonb language plpgsql volatile set search_path='' as $$
declare detail jsonb=private.battle39_manual_detail(expression,'normal');terms jsonb;term jsonb;vals jsonb;original jsonb;total integer;subtotal integer=0;n integer;v integer;
begin
 n=coalesce((e->>'rerollWeaponDice')::integer,0);if n<1 then return detail;end if;
 terms=detail->'terms';term=terms->0;vals=term->'values';original=vals;
 for i in 0..least(n,jsonb_array_length(vals))-1 loop
  v=(vals->>i)::integer;if v in(1,2) then vals=jsonb_set(vals,array[i::text],to_jsonb(private.battle39_face((term->>'sides')::integer)));end if;
 end loop;
 select sum(value::integer) into subtotal from jsonb_array_elements_text(vals);
 total=(detail->>'total')::integer-(term->>'subtotal')::integer+subtotal*(term->>'sign')::integer;
 term=term||jsonb_build_object('values',vals,'subtotal',subtotal*(term->>'sign')::integer,'rerolled_from',original);terms=jsonb_set(terms,'{0}',term);
 return detail||jsonb_build_object('terms',terms,'total',total);
end $$;

create or replace function private.battle37_record(q public.battle_action_requests,p_token uuid,p_expression text,p_mode text,p_client uuid,p_definition jsonb default null) returns public.battle_dice_rolls
language plpgsql security definer set search_path='' as $$
declare detail jsonb;d public.battle_dice_rolls;t public.battle_map_tokens;physical boolean=coalesce(current_setting('battle39.physical',true),'false')='true';roll_index integer=coalesce(nullif(current_setting('battle39.roll_index',true),''),'0')::integer;faces jsonb;
begin
 select * into t from public.battle_map_tokens where id=p_token;
 if physical then
  faces=current_setting('battle39.rolls',true)::jsonb->roll_index;
  if jsonb_typeof(faces) is distinct from 'array' or jsonb_array_length(faces)>200 then raise exception 'Informe as faces de cada rolagem física.';end if;
  perform set_config('battle39.faces',faces::text,true);perform set_config('battle39.face_index','0',true);
  if p_definition is null then detail=private.battle39_manual_detail(p_expression,p_mode);else detail=private.battle39_manual_attack(p_expression,p_definition);end if;
  if current_setting('battle39.face_index',true)::integer<>jsonb_array_length(faces) then raise exception 'Há faces adicionais que não pertencem à rolagem.';end if;
  perform set_config('battle39.roll_index',(roll_index+1)::text,true);
 elsif p_definition is null then detail=private.battle_roll_detail(p_expression,p_mode);else detail=private.dnd_attack_roll_detail(p_expression,p_definition);end if;
 insert into public.battle_dice_rolls(campaign_id,map_id,rolled_by,client_id,expression,label,visibility,mode,terms,total,request_id,consumed_at,source)
 values(q.campaign_id,q.map_id,auth.uid(),p_client,detail->>'expression',left(q.name,120),case when t.visible then 'public' when private.is_campaign_owner(q.campaign_id) then 'gm' else 'self' end,p_mode,detail->'terms',(detail->>'total')::integer,q.id,now(),case when physical then 'physical' else 'program' end) returning * into d;
 return d;
end $$;

create or replace function private.battle39_attack_mode(a public.battle_map_tokens,t public.battle_map_tokens,m public.battle_maps,p_ignore_mockery boolean) returns text
language plpgsql stable security definer set search_path='' as $$
declare actor_conditions jsonb=coalesce(private.battle_sheet(a.id)->'conditions','[]');target_conditions jsonb=coalesce(private.battle_sheet(t.id)->'conditions','[]');adv boolean;dis boolean;distance numeric=private.battle37_target_range(a,t,m);
begin
 adv=target_conditions ?| array['Cego','Impedido','Paralisado','Petrificado','Atordoado','Inconsciente'] or actor_conditions ? 'Invisível' or distance<=1.50001 and target_conditions ? 'Caído';
 dis=(not p_ignore_mockery and actor_conditions ? 'Desvantagem no próximo ataque') or actor_conditions ?| array['Cego','Envenenado','Impedido','Caído'] or target_conditions ? 'Invisível' or distance>1.50001 and target_conditions ? 'Caído' or t.dodging and not(actor_conditions ? 'Invisível') and not(target_conditions ?| array['Cego','Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado']);
 return case when adv=dis then 'normal' when adv then 'advantage' else 'disadvantage' end;
end $$;

revoke all on function private.battle39_attack_mode(public.battle_map_tokens,public.battle_map_tokens,public.battle_maps,boolean) from public,anon,authenticated;

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
   if q.kind='spell' then bonus=private.battle39_attack(a.id,e->'entry');end if;
   if bonus is null and q.kind='spell' and a.character_id is not null then
    ability=private.dnd_spell_ability(s,e->'entry');bonus=2+((s->>'level')::integer-1)/4+floor(((s->'abilities'->>ability)::numeric-10)/2)::integer;
   end if;
   if a.npc_id is not null and q.kind in('weapon','opportunity') then bonus=coalesce((e->'entry'->>'bonus')::integer,bonus);end if;
   if bonus is null then raise exception 'Informe o bônus de ataque deste NPC ou efeito personalizado.';end if;
   for i in 1..count_attacks loop
    target_id=coalesce((e->'attackTargets'->>(i-1))::uuid,g.target_ids[1+(i-1)%greatest(1,cardinality(g.target_ids))]);
    if target_id is null then raise exception 'Escolha uma criatura para cada ataque.';end if;
    select * into t from public.battle_map_tokens where id=target_id;
    mode=coalesce(g.options->>'attack_mode',private.battle39_attack_mode(a,t,m,i>1));
    -- Dodge only imposes disadvantage on attacks the defender can see. The GM confirms this in the review.
    perform private.battle37_add_decision(q,a.id,'attack',i,q.name||case when count_attacks>1 then ' · raio '||i||'/'||count_attacks else ' · ataque' end,null,null,bonus,mode,jsonb_build_object('target_id',case when private.can_read_battle_token(target_id) then target_id else null end,'critical_at',coalesce((e->>'criticalAt')::integer,20)));
   end loop;
   update private.battle_guides set phase='attacks' where request_id=q.id;
  elsif nullif(e->>'save','') is not null then
   ability=case upper(e->>'save') when 'FOR' then 'str' when 'STR' then 'str' when 'DES' then 'dex' when 'DEX' then 'dex' when 'CON' then 'con' when 'INT' then 'int' when 'SAB' then 'wis' when 'WIS' then 'wis' when 'CAR' then 'cha' when 'CHA' then 'cha' else null end;
   if ability is null then raise exception 'Atributo da salvaguarda inválido.';end if;
   dc=case when q.kind='spell' then private.battle39_dc(a.id,e->'entry') else coalesce((e->>'save_dc')::integer,(g.options->>'dc')::integer) end;
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
 if g.phase='attacks' and not coalesce((e->>'missHalf')::boolean,false) and not exists(select 1 from public.battle_decisions where request_id=q.id and kind='attack' and coalesce((result->>'hit')::boolean,false)) then
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
 if kind='spell' and coalesce((e->>'targetsPerSlot')::integer,0)>0 then e=e||jsonb_build_object('maxTargets',coalesce((e->>'maxTargets')::integer,1)+greatest(0,rlevel-lvl)*(e->>'targetsPerSlot')::integer);end if;
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
 if p_payload ? 'condition_choice' then
  if kind<>'spell' or entry->>'catalog_id'<>'cegueira-surdez' or coalesce(p_payload->>'condition_choice','') not in('Cego','Surdo') then raise exception 'Escolha de condição inválida.';end if;
  e=e||jsonb_build_object('condition',p_payload->>'condition_choice');
 end if;
 insert into public.battle_action_requests(campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,source_id,name,cost,resource_kind,resource_level,spell_level,target,target_ids,definition,round,turn_index,turn_started_at)
 values(t.campaign_id,s.id,t.map_id,t.id,auth.uid(),p_client_id,kind,source,cname,cost,rkind,rlevel,lvl,target,ids,e||jsonb_build_object('entry',entry,'actor_x',t.x,'actor_y',t.y),s.round,s.turn_index,s.turn_started_at) returning * into result;
 return public.guide_battle_action(result.id,'{}');
end $$;

create or replace function public.move_battle_token(p_token_id uuid,p_to_x integer,p_to_y integer,p_path jsonb,p_expected_version bigint,p_force boolean default false) returns public.battle_map_tokens
language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens; s public.battle_sessions; result public.battle_map_tokens; enemy public.battle_map_tokens; sheet jsonb; entry jsonb; source uuid; e jsonb; step jsonb; cx integer; cy integer; previous numeric; nextdist numeric; scale numeric; triggered boolean; reach numeric; plan_id uuid;
begin
 select * into t from public.battle_map_tokens where id=p_token_id;
 if t.id is null or not private.can_control_battle_token(t.id) then raise exception 'Você não controla este token.' using errcode='42501'; end if;
 select * into s from public.battle_sessions where id=(select battle_session_id from public.battle_maps where id=t.map_id) for update;
 select * into t from public.battle_map_tokens where id=p_token_id for update;
 if s.status='active' and private.battle_sheet(t.id)->'conditions' ?| array['Impedido','Paralisado','Incapacitado','Inconsciente','Atordoado','Petrificado'] then raise exception 'A condição atual impede deslocamento.';end if;
 if exists(select 1 from public.battle_action_requests q where q.session_id=s.id and q.status in('pending','approved') and (q.token_id=t.id or q.kind='opportunity')) then raise exception 'Aguarde a decisão do mestre antes de mover.'; end if;
 if exists(select 1 from public.battle_movement_plans where token_id=t.id and status='pending') then raise exception 'Este movimento aguarda uma reação.'; end if;
 if s.status='active' and not coalesce(p_force,false) and coalesce((private.battle_sheet(t.id)->>'hp_current')::integer,0)<=0 then raise exception 'Um personagem com 0 PV não pode se mover.'; end if;
 if s.status='active' and not coalesce(p_force,false) and (private.battle_sheet(t.id)->'conditions') ?| array['Agarrado','Impedido','Inconsciente','Atordoado','Paralisado','Petrificado'] then raise exception 'A condição do personagem impede deslocamento.'; end if;
 perform private.battle_validate_movement(p_token_id,p_to_x,p_to_y,p_path,p_expected_version,p_force);
 if s.status='active' and not t.disengaged and not coalesce(p_force,false) then
  select scale_per_cell*case when scale_unit='ft' then 0.3 else 1 end into scale from public.battle_maps where id=t.map_id;
  for enemy in select * from public.battle_map_tokens q where q.map_id=t.map_id and q.id<>t.id and not q.reaction_used and q.faction in('ally','enemy') and t.faction in('ally','enemy') and q.faction<>t.faction order by q.id for update loop
   sheet=private.battle_sheet(enemy.id); if sheet->'conditions' ?| array['Reações bloqueadas','Incapacitado','Paralisado','Atordoado','Inconsciente','Petrificado'] then continue;end if; if coalesce((sheet->>'hp_current')::integer,0)<=0 then continue; end if;
   entry=null; source=null;
   if enemy.character_id is not null then select id,data into source,entry from public.character_inventory where character_id=enemy.character_id and data->>'category'='weapon' and coalesce((data->>'quantity')::integer,0)>0 and data->>'weapon_mode' is distinct from 'ranged' and lower(data->>'name') !~ '(arco|besta|funda|zarabatana)' order by coalesce((data->>'equipped')::boolean,false) desc,id limit 1;
   else select id,data into source,entry from public.npc_attacks where npc_id=enemy.npc_id and lower(coalesce(data->>'name','')||' '||coalesce(data->>'range','')) !~ '(arco|besta|funda|zarabatana|distância|distancia|ranged)' order by id limit 1; end if;
   if entry is null then continue; end if;
   e=private.battle_weapon(entry,sheet); reach=coalesce((e->>'range')::numeric,1.5); cx=t.x; cy=t.y; triggered=false;
   for step in select value from jsonb_array_elements(p_path) loop
    previous=greatest(greatest(0,enemy.x-(cx+t.size-1),cx-(enemy.x+enemy.size-1)),greatest(0,enemy.y-(cy+t.size-1),cy-(enemy.y+enemy.size-1)))*scale;
    cx=(step->>'x')::integer; cy=(step->>'y')::integer;
    nextdist=greatest(greatest(0,enemy.x-(cx+t.size-1),cx-(enemy.x+enemy.size-1)),greatest(0,enemy.y-(cy+t.size-1),cy-(enemy.y+enemy.size-1)))*scale;
    if previous<=reach and nextdist>reach then triggered=true; exit; end if;
   end loop;
   if triggered then
    if plan_id is null then
     insert into public.battle_movement_plans(campaign_id,session_id,token_id,target,path,expected_version,from_x,from_y) values(t.campaign_id,s.id,t.id,jsonb_build_object('x',p_to_x,'y',p_to_y),p_path,p_expected_version,t.x,t.y) returning id into plan_id;
    end if;
    insert into public.battle_action_requests(campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,source_id,movement_plan_id,name,cost,target,target_ids,definition,round,turn_index,turn_started_at)
    values(t.campaign_id,s.id,t.map_id,enemy.id,(select owner_id from public.campaigns where id=t.campaign_id),gen_random_uuid(),'opportunity',source,plan_id,'Ataque de oportunidade: '||enemy.name||' → '||t.name,'reaction',jsonb_build_object('x',t.x,'y',t.y),array[t.id],e||jsonb_build_object('entry',entry,'note','Reação antes de sair do alcance. O mestre verifica visão, arma e condições.'),s.round,s.turn_index,s.turn_started_at) on conflict do nothing;
   end if;
  end loop;
 end if;
 if plan_id is not null then return t; end if;
 result=public.move_battle_token_path_v7(p_token_id,p_to_x,p_to_y,p_path,p_expected_version,p_force); return result;
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
 perform set_config('battle39.physical',(coalesce(decision.options->>'dice_mode','program')='physical' and decision.kind<>'choice')::text,true);
 if bs.status<>'active' or (decision.kind<>'condition' and (bs.round<>q.round or bs.turn_index<>q.turn_index or bs.turn_started_at is distinct from q.turn_started_at)) or q.status not in('pending','success') or q.status='success' and decision.kind not in('concentration','condition') then
  update public.battle_decisions set status='cancelled',answered_at=now() where id=decision.id returning * into decision;return decision;
 end if;
 if exists(select 1 from public.battle_decisions where answered_by=auth.uid() and client_id=p_client_id and id<>decision.id) or exists(select 1 from public.battle_dice_rolls where rolled_by=auth.uid() and client_id=p_client_id) then raise exception 'Este identificador já pertence a outra resposta.';end if;
 if coalesce(decision.options->>'dice_mode','program')='physical' and decision.kind<>'choice' then
  if jsonb_typeof(p_answer->'rolls') is distinct from 'array' or jsonb_array_length(p_answer->'rolls')>100 then raise exception 'Informe as faces dos dados físicos.';end if;
  perform set_config('battle39.rolls',(p_answer->'rolls')::text,true);perform set_config('battle39.roll_index','0',true);
 elsif p_answer ? 'rolls' then raise exception 'Esta etapa usa dados do programa.';end if;
 select * into a from public.battle_map_tokens where id=decision.token_id for update;s=private.battle_sheet(a.id);e=g.definition;
 if decision.kind in('attack','damage','choice') and ((s->>'hp_current')::integer<=0 or coalesce(s->'conditions','[]') ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado']) then raise exception 'Este participante não pode agir agora. O mestre pode cancelar a tentativa.';end if;
 if coalesce((decision.options->>'escape')::boolean,false) then
  if bs.active_token_id is distinct from a.id or (a.action_used and coalesce(a.extra_actions,0)<=0) then raise exception 'Escapar exige seu turno e uma ação disponível.';end if;
  if (s->>'hp_current')::integer<=0 or s->'conditions' ?| array['Incapacitado','Paralisado','Atordoado','Inconsciente','Petrificado'] then raise exception 'A condição atual impede esta ação.';end if;
  update public.battle_map_tokens set action_used=true,extra_actions=case when action_used then greatest(0,extra_actions-1) else extra_actions end where id=a.id;
 end if;
 if decision.kind='choice' then
  choice=p_answer->>'choice';
  if choice is null or not exists(select 1 from jsonb_array_elements(decision.options->'choices') o where o->>'id'=choice) then raise exception 'Escolha uma das opções apresentadas.';end if;
  answer_result=jsonb_build_object('choice',choice);
 elsif decision.kind in('attack','save','concentration','condition') then
  if decision.kind in('save','concentration','condition') and decision.ability in('str','dex') and coalesce(s->'conditions','[]') ?| array['Inconsciente','Atordoado','Paralisado','Petrificado'] then
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
   for check_row in select * from public.battle_decisions where request_id=q.id and kind='attack' and (coalesce((battle_decisions.result->>'hit')::boolean,false) or coalesce((e->>'missHalf')::boolean,false)) order by sequence loop
    target_id=coalesce((e->'attackTargets'->>(check_row.sequence-1))::uuid,g.target_ids[1+(check_row.sequence-1)%greatest(1,cardinality(g.target_ids))]);
    select * into target from public.battle_map_tokens where id=target_id;
    part_effect=case when coalesce((check_row.result->>'critical')::boolean,false) then private.battle37_critical(e,s,q.kind='weapon') else e end;
    if checked>0 and coalesce((e->>'onceBonus')::integer,0)<>0 then part_effect=part_effect||jsonb_build_object('dice',(part_effect->>'dice')||case when (e->>'onceBonus')::integer>0 then '-' else '+' end||abs((e->>'onceBonus')::integer));end if;
    d=private.battle37_record(q,a.id,part_effect->>'dice','normal',case when checked=0 then p_client_id else gen_random_uuid() end,part_effect);checked=checked+1;rolls=rolls||jsonb_build_array(to_jsonb(d));
    if not coalesce((check_row.result->>'hit')::boolean,false) then part_effect=part_effect||jsonb_build_object('halfOnSave',true);end if;
    detail=jsonb_build_object('damage_parts',private.dnd_roll_damage_parts(d.terms,part_effect->'damageParts'));
    amount=private.dnd_damage_amount(target,private.battle_sheet(target.id),part_effect,greatest(0,d.total),not coalesce((check_row.result->>'hit')::boolean,false),detail);
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
   if coalesce((select concentration_checks from public.campaign_rules where campaign_id=q.campaign_id),true) and coalesce((private.battle_sheet(target_id)->>'hp_current')::integer,0)>0 and exists(select 1 from public.battle_spell_effects where token_id=target_id and active and concentration) then
    perform private.battle37_add_decision(q,target_id,'concentration',coalesce((outcome->>'sequence')::integer,0),'Manter concentração','con',greatest(10,(outcome->>'amount')::integer/2),private.dnd37_save_bonus(target_id,'con'),'normal',jsonb_build_object('effect_ids',(select jsonb_agg(id::text) from public.battle_spell_effects where token_id=target_id and active and concentration)));
   end if;
  end loop;
  update public.battle_action_requests set resolution=resolution||jsonb_build_object('awaiting_concentration',exists(select 1 from public.battle_decisions where request_id=q.id and kind='concentration' and status='pending')) where id=q.id;
  answer_result=jsonb_build_object('roll',to_jsonb(d),'rolls',rolls,'message','Efeito aplicado aos alvos.');
 end if;
 if decision.kind='condition' and decision.options->>'condition_id' is not null then
  update private.battle_condition_effects set active=not coalesce((answer_result->>'passed')::boolean,false) where id=(decision.options->>'condition_id')::uuid;
 end if;
 update public.battle_decisions set status='answered',result=answer_result,answered_by=auth.uid(),client_id=p_client_id,answered_at=now() where id=decision.id returning * into decision;
 if coalesce(decision.options->>'dice_mode','program')='physical' and decision.kind<>'choice' and current_setting('battle39.roll_index',true)::integer<>jsonb_array_length(p_answer->'rolls') then raise exception 'A quantidade de rolagens físicas não corresponde aos dados desta etapa.';end if;
 perform set_config('battle39.physical','false',true);
 if decision.kind in('attack','save') then update public.battle_action_requests set resolution=resolution||'{"checks_started":true}'::jsonb where id=q.id and status='pending';end if;
 if decision.kind in('choice','attack','save') then perform private.battle37_next(q.id);
 elsif decision.kind='concentration' and not exists(select 1 from public.battle_decisions where request_id=q.id and kind='concentration' and status='pending') then update public.battle_action_requests set resolution=resolution||'{"awaiting_concentration":false}'::jsonb where id=q.id;end if;
 return decision;
end $$;

do $preserve39$ declare arguments text; begin
 select pg_get_function_arguments('public.save_campaign_rules_v19(uuid,jsonb,timestamptz)'::regprocedure) into arguments;
 execute 'create or replace function public.save_campaign_rules_v19('||arguments||') '||$definition$returns public.campaign_rules language plpgsql security definer set search_path='' as $body$
declare
  p_campaign_id alias for $1;
  p_rules alias for $2;
  p_expected_updated_at alias for $3;
 r public.campaign_rules; c public.characters; sheet jsonb; attrs jsonb; maximum integer;
begin
  -- The legacy RPC validates ownership/version and saves the original options.
  -- Defer its level changes until the new HP method and ledger are ready.
  r=public.save_campaign_rules(p_campaign_id,p_rules||jsonb_build_object('lock_player_level',false),p_expected_updated_at);
  update public.campaign_rules set combat_dice_mode=coalesce(p_rules->>'combat_dice_mode',r.combat_dice_mode),npc_dice_mode=coalesce(p_rules->>'npc_dice_mode',r.npc_dice_mode),combat_dice_animation=coalesce((p_rules->>'combat_dice_animation')::boolean,r.combat_dice_animation),combat_effects=coalesce((p_rules->>'combat_effects')::boolean,r.combat_effects),show_save_dc=coalesce((p_rules->>'show_save_dc')::boolean,r.show_save_dc),concentration_checks=coalesce((p_rules->>'concentration_checks')::boolean,r.concentration_checks),lock_player_level=coalesce((p_rules->>'lock_player_level')::boolean,false),allow_multiclass=coalesce((p_rules->>'allow_multiclass')::boolean,true),
    hit_point_method=coalesce(p_rules->>'hit_point_method','average'),attribute_method=coalesce(p_rules->>'attribute_method','choice'),
    players_can_rest=coalesce((p_rules->>'players_can_rest')::boolean,true),players_can_create_custom_items=coalesce((p_rules->>'players_can_create_custom_items')::boolean,true),
    updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
    where campaign_id=p_campaign_id returning * into r;
  for c in select ch.* from public.characters ch join public.rpg_systems sys on sys.id=ch.rpg_system_id where ch.campaign_id=p_campaign_id and sys.slug='dnd5e' for update of ch loop
    sheet=c.system_data;
    select coalesce(jsonb_object_agg(ability,score),'{}') into attrs from public.character_attributes where character_id=c.id;
    if r.lock_player_level and sheet->>'level' is distinct from r.party_level::text then
      sheet=private.session_level_resources(sheet,r.party_level);
      attrs=private.dnd_adjust_abilities(c.system_data,sheet,attrs);
      update public.character_attributes a set score=(attrs->>a.ability)::integer where a.character_id=c.id;
      sheet=jsonb_set(sheet,'{hit_dice_used}',to_jsonb(least(coalesce((sheet->>'hit_dice_used')::integer,0),r.party_level)));
    end if;
    sheet=sheet||jsonb_build_object('hit_point_method',r.hit_point_method);
    if r.hit_point_method='rolled' then sheet=sheet||jsonb_build_object('hit_point_rolls',private.ensure_character_hp_rolls(p_campaign_id,c.id,c.owner_id,private.dnd_levels(sheet))); end if;
    maximum=private.battle_hp_max(sheet||jsonb_build_object('abilities',attrs));
    sheet=jsonb_set(sheet,'{hp_current}',to_jsonb(least(coalesce((sheet->>'hp_current')::integer,0),maximum)));
    update public.characters set system_data=sheet where id=c.id;
  end loop;
  return r;
end $body$;$definition$;end $preserve39$;

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


create table if not exists private.battle_condition_effects(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.battle_action_requests(id) on delete cascade,
 token_id uuid not null references public.battle_map_tokens(id) on delete cascade,condition text not null,
 expiry_scope text not null default 'round',
 ability text,dc integer,repeat_save text not null default '',expires_round integer,active boolean not null default true,
 damage_saves integer not null default 0,
 created_at timestamptz not null default now(),unique(request_id,token_id,condition)
);
revoke all on private.battle_condition_effects from public,anon,authenticated;
create index if not exists battle_conditions_active_token on private.battle_condition_effects(token_id) where active;
alter table public.battle_decisions drop constraint if exists battle_decisions_kind_check;
alter table public.battle_decisions add constraint battle_decisions_kind_check check(kind in('attack','save','damage','concentration','choice','condition'));
create index if not exists battle_decisions_condition_pending on public.battle_decisions((options->>'condition_id')) where status='pending' and kind='condition';
create or replace function private.battle39_apply_conditions() returns trigger language plpgsql security definer set search_path='' as $$
declare g private.battle_guides;t public.battle_map_tokens;passed boolean;n integer;c uuid;save_ability text;
begin
 if new.status<>'success' or old.status='success' then return new;end if;select * into g from private.battle_guides where request_id=new.id;
 if g.request_id is null or nullif(g.definition->>'condition','') is null and nullif(g.definition->>'effectSave','') is null then return new;end if;
 for t in select * from public.battle_map_tokens where id=any(g.target_ids) loop
  c=null;
  if exists(select 1 from public.battle_decisions where request_id=new.id and kind='attack') and not exists(select 1 from public.battle_decisions where request_id=new.id and kind='attack' and coalesce((result->>'hit')::boolean,false)) then continue;end if;
  select coalesce(bool_or(coalesce((result->>'passed')::boolean,false)),false) into passed from public.battle_decisions where request_id=new.id and token_id=t.id and kind='save';if passed then continue;end if;
  n=coalesce((g.definition->>'conditionRounds')::integer,10);
  if nullif(g.definition->>'condition','') is not null then
   insert into private.battle_condition_effects(request_id,token_id,condition,ability,dc,repeat_save,expiry_scope,expires_round,active)
   values(new.id,t.id,g.definition->>'condition',coalesce(nullif(g.definition->>'effectSave',''),g.definition->>'save'),private.battle39_dc(new.token_id,g.definition->'entry'),coalesce(g.definition->>'repeatSave',''),coalesce(g.definition->>'expiryScope','round'),case when g.definition->>'expiryScope' like 'target_%' then new.round+case when (select position from public.battle_turn_order where session_id=new.session_id and token_id=t.id)<=new.turn_index then 1 else 0 end when n>0 then new.round+n else null end,nullif(g.definition->>'effectSave','') is null)
   on conflict(request_id,token_id,condition) do update set active=excluded.active returning id into c;
  end if;
  save_ability=nullif(g.definition->>'effectSave','');
  if save_ability is not null then perform private.battle37_add_decision(new,t.id,'condition',0,new.name||' · efeito adicional',save_ability,private.battle39_dc(new.token_id,g.definition->'entry'),private.dnd37_save_bonus(t.id,save_ability),'normal',jsonb_build_object('condition_id',c,'post_effect',true,'manual_effect',c is null));end if;
 end loop;return new;
end $$;
drop trigger if exists battle39_apply_conditions on public.battle_action_requests;
create trigger battle39_apply_conditions after update of status on public.battle_action_requests for each row execute function private.battle39_apply_conditions();
create or replace function private.battle39_conditions_public(p_campaign uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'token_id',c.token_id,'condition',c.condition,'label',q.name,'repeat_save',c.repeat_save,'dc',c.dc) order by c.created_at,c.id),'[]') from private.battle_condition_effects c join public.battle_action_requests q on q.id=c.request_id where c.active and q.campaign_id=p_campaign and private.can_read_campaign(p_campaign) and private.can_read_battle_token(c.token_id)
$$;
create or replace function public.list_battle_conditions(p_campaign_id uuid) returns jsonb language sql stable security definer set search_path='' as $$select private.battle39_conditions_public(p_campaign_id)$$;
revoke all on function public.list_battle_conditions(uuid) from public,anon;grant execute on function public.list_battle_conditions(uuid) to authenticated;
create or replace function private.battle39_end_concentration() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.active and not new.active and new.concentration then update private.battle_condition_effects set active=false where request_id=new.request_id;update public.battle_decisions set status='cancelled' where request_id=new.request_id and kind='condition' and status='pending';end if;return new;
end $$;
drop trigger if exists battle39_end_concentration on public.battle_spell_effects;
create trigger battle39_end_concentration after update of active on public.battle_spell_effects for each row execute function private.battle39_end_concentration();
create or replace function private.battle39_condition_turn() returns trigger language plpgsql security definer set search_path='' as $$
declare c private.battle_condition_effects;q public.battle_action_requests;
begin
 if new.status<>'active' then return new;end if;
 if new.turn_started_at is not distinct from old.turn_started_at then return new;end if;
 update private.battle_condition_effects e set active=false from public.battle_action_requests r where r.id=e.request_id and r.session_id=new.id and e.expires_round is not null and e.expires_round<=new.round and ((e.expiry_scope in('round','source_start') and r.token_id=new.active_token_id) or e.expiry_scope='target_start' and e.token_id=new.active_token_id or e.expiry_scope='target_end' and e.token_id=old.active_token_id and e.expires_round<=old.round);
 -- One-round poison ends at the end of the affected creature's next turn.
 update private.battle_condition_effects e set active=false from public.battle_action_requests r where r.id=e.request_id and r.session_id=new.id and e.condition='Envenenado' and e.token_id=old.active_token_id and coalesce((r.definition->>'conditionRounds')::integer,0)=1;
 for c in select e.* from private.battle_condition_effects e join public.battle_action_requests r on r.id=e.request_id where r.session_id=new.id and e.active and e.token_id=old.active_token_id and e.repeat_save='end' loop
  select * into q from public.battle_action_requests where id=c.request_id;
  perform private.battle37_add_decision(q,c.token_id,'condition',new.round*1000+new.turn_index,q.name||' · repetir salvaguarda',c.ability,c.dc,private.dnd37_save_bonus(c.token_id,c.ability),'normal',jsonb_build_object('condition_id',c.id,'repeat_condition',true));
 end loop;return new;
end $$;
drop trigger if exists battle39_condition_turn on public.battle_sessions;
create trigger battle39_condition_turn after update on public.battle_sessions for each row execute function private.battle39_condition_turn();
do $$ declare definition text;begin
 if to_regprocedure('private.battle_sheet_v38(uuid)') is null then select pg_get_functiondef('private.battle_sheet(uuid)'::regprocedure) into definition;execute replace(definition,'private.battle_sheet(','private.battle_sheet_v38(');end if;
end $$;
revoke all on function private.battle_sheet_v38(uuid) from public,anon,authenticated;
create or replace function private.battle_sheet(p_token uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb=private.battle_sheet_v38(p_token);conditions jsonb;
begin
 select coalesce(jsonb_agg(distinct value),'[]') into conditions from (select value from jsonb_array_elements_text(coalesce(s->'conditions','[]')) union select condition from private.battle_condition_effects where token_id=p_token and active) c(value);
 return s||jsonb_build_object('conditions',conditions);
end $$;
revoke all on function private.battle_sheet(uuid) from public,anon,authenticated;
create or replace function public.end_battle_condition(p_condition_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.battle_condition_effects;q public.battle_action_requests;t public.battle_map_tokens;cost numeric;
begin
 select * into c from private.battle_condition_effects where id=p_condition_id;select * into q from public.battle_action_requests where id=c.request_id;
 if q.id is null or not private.can_read_campaign(q.campaign_id) then raise exception 'Você não tem acesso a este efeito.' using errcode='42501';end if;
 perform 1 from public.battle_sessions where id=q.session_id for update;select * into c from private.battle_condition_effects where id=p_condition_id for update;
 if not c.active then return private.battle39_conditions_public(q.campaign_id);end if;
 if not private.is_campaign_owner(q.campaign_id) then
  select * into t from public.battle_map_tokens where id=c.token_id for update;
  if c.condition<>'Caído' or not private.battle38_controls(t.id) or not exists(select 1 from public.battle_sessions where id=q.session_id and status='active' and active_token_id=t.id) then raise exception 'Este efeito termina pela salvaguarda ou pela sua fonte.' using errcode='42501';end if;
  cost=t.movement_speed/2;if t.movement_remaining<cost then raise exception 'Levantar exige metade do deslocamento.';end if;
  update public.battle_map_tokens set movement_remaining=movement_remaining-cost where id=t.id;
 end if;
 update private.battle_condition_effects set active=false where id=c.id;update public.battle_decisions set status='cancelled' where status='pending' and options->>'condition_id'=c.id::text;return private.battle39_conditions_public(q.campaign_id);
end $$;
revoke all on function public.end_battle_condition(uuid) from public,anon;grant execute on function public.end_battle_condition(uuid) to authenticated;
revoke all on function private.battle39_apply_conditions(),private.battle39_conditions_public(uuid),private.battle39_end_concentration(),private.battle39_condition_turn() from public,anon,authenticated;

create or replace function private.battle39_consume_attack_condition() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='attack' and new.status='answered' and old.status='pending' then update private.battle_condition_effects set active=false where token_id=new.token_id and condition='Desvantagem no próximo ataque' and active;end if;return new;
end $$;
drop trigger if exists battle39_consume_attack_condition on public.battle_decisions;
create trigger battle39_consume_attack_condition after update of status on public.battle_decisions for each row execute function private.battle39_consume_attack_condition();
revoke all on function private.battle39_consume_attack_condition() from public,anon,authenticated;

create or replace function private.battle39_condition_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.active and not new.active then update public.battle_decisions set status='cancelled' where kind='condition' and status='pending' and options->>'condition_id'=new.id::text;end if;return new;
end $$;
drop trigger if exists battle39_condition_cleanup on private.battle_condition_effects;
create trigger battle39_condition_cleanup after update of active on private.battle_condition_effects for each row execute function private.battle39_condition_cleanup();
revoke all on function private.battle39_condition_cleanup() from public,anon,authenticated;

alter table private.battle_condition_effects add column if not exists escape_attempts integer not null default 0;
create or replace function public.escape_battle_condition(p_condition_id uuid,p_client_id uuid) returns public.battle_decisions language plpgsql security definer set search_path='' as $$
declare c private.battle_condition_effects;q public.battle_action_requests;s public.battle_sessions;t public.battle_map_tokens;d public.battle_decisions;sheet jsonb;modifier integer;mode text;
begin
 select * into c from private.battle_condition_effects where id=p_condition_id;select * into q from public.battle_action_requests where id=c.request_id;
 if p_client_id is null or q.id is null or not private.battle38_controls(c.token_id) then raise exception 'Este efeito pertence a outro participante.' using errcode='42501';end if;
 select * into s from public.battle_sessions where id=q.session_id for update;perform 1 from public.campaigns where id=q.campaign_id for update;
 select * into d from public.battle_decisions where token_id=c.token_id and options->>'escape_client'=p_client_id::text;
 if d.id is not null then return d;end if;
 select * into c from private.battle_condition_effects where id=c.id for update;select * into t from public.battle_map_tokens where id=c.token_id for update;sheet=private.battle_sheet(t.id);
 if not c.active or q.definition->'entry'->>'catalog_id'<>'constricao' or c.condition<>'Impedido' then raise exception 'Este efeito não oferece este teste para escapar.';end if;
 if s.status<>'active' or s.active_token_id<>t.id or coalesce((sheet->>'hp_current')::integer,0)<=0 or sheet->'conditions' ?| array['Incapacitado','Paralisado','Atordoado','Inconsciente','Petrificado'] then raise exception 'Aguarde seu turno e uma condição que permita agir.';end if;
 if t.action_used and coalesce(t.extra_actions,0)<=0 then raise exception 'Escapar exige uma ação disponível.';end if;
 if exists(select 1 from public.battle_decisions where session_id=s.id and status='pending') or exists(select 1 from public.battle_action_requests where session_id=s.id and status in('pending','approved')) then raise exception 'Conclua as rolagens pendentes antes de tentar escapar.';end if;
 update private.battle_condition_effects set escape_attempts=escape_attempts+1 where id=c.id returning * into c;
 modifier=floor(((sheet->'abilities'->>'str')::numeric-10)/2)::integer+case when private.dnd_class_level(sheet,'bard')>=2 then (2+((sheet->>'level')::integer-1)/4)/2 else 0 end;
 mode=case when t.raging then 'advantage' else 'normal' end;
 perform private.battle37_add_decision(q,t.id,'condition',-1000000-c.escape_attempts,'Escapar de Constrição · usa uma ação','str',c.dc,modifier,mode,jsonb_build_object('condition_id',c.id,'escape',true,'ability_check',true,'escape_client',p_client_id));
 select * into d from public.battle_decisions where token_id=t.id and options->>'escape_client'=p_client_id::text;return d;
end $$;
revoke all on function public.escape_battle_condition(uuid,uuid) from public,anon;grant execute on function public.escape_battle_condition(uuid,uuid) to authenticated;


create or replace function private.battle_apply_hp_v11(r public.battle_action_requests,a public.battle_map_tokens,e jsonb,opts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens; m public.battle_maps; target jsonb; sheet jsonb; amount integer; roll integer;
 hp integer; maxhp integer; temp integer; afterhp integer; aftertemp integer; saved boolean; multiplier numeric; override jsonb; kind text=e->>'kind';
 condition_row private.battle_condition_effects;source_request public.battle_action_requests;ids uuid[]; total integer=0; total_amount integer=0; applied jsonb='[]'; target_opts jsonb; minimum integer;
begin
 select * into m from public.battle_maps where id=r.map_id;
 target=r.target; roll=private.battle_roll(coalesce(opts->>'dice',e->>'dice',''));
 ids=case when opts ? 'target_ids' then array(select distinct value::uuid from jsonb_array_elements_text(opts->'target_ids')) else r.target_ids end;
 if cardinality(ids)>200 then raise exception 'Quantidade de alvos inválida.'; end if;
 if exists(select 1 from unnest(ids) i where not exists(select 1 from public.battle_map_tokens where id=i and map_id=r.map_id)) then raise exception 'Alvo de outra mesa não pode ser afetado.'; end if;
 for t in select * from public.battle_map_tokens q where q.map_id=r.map_id and
  ((coalesce((e->>'selective')::boolean,false) or e->>'shape'='single' or opts ? 'target_ids') and q.id=any(ids) or
   not coalesce((e->>'selective')::boolean,false) and e->>'shape'<>'single' and not(opts ? 'target_ids') and private.battle_in_effect(q,a,target,e,m.scale_per_cell*case when m.scale_unit='ft' then 0.3 else 1 end)) order by q.id for update loop
  if t.character_id is not null then perform 1 from public.characters where id=t.character_id for update;
  else perform 1 from public.npc_stats where npc_id=t.npc_id for update; end if;
  sheet=private.battle_sheet(t.id); if sheet is null then continue; end if;
  target_opts=coalesce(opts->'targets'->t.id::text,'{}'); saved=coalesce((target_opts->>'saved')::boolean,false);
  multiplier=coalesce((target_opts->>'multiplier')::numeric,1);
  if multiplier not in(0,0.5,1,2) then raise exception 'Multiplicador inválido.'; end if;
  amount=greatest(0,least(100000,coalesce((target_opts->>'amount')::integer,floor(floor(roll*case when saved then case when coalesce((e->>'halfOnSave')::boolean,false) then 0.5 else 0 end else 1 end)*multiplier)::integer)));
  if kind='damage' and not(target_opts ? 'amount') then amount=greatest(0,least(100000,floor(private.dnd_damage_amount(t,sheet,e,roll,saved,opts)*multiplier)::integer));end if;
  hp=coalesce((sheet->>'hp_current')::integer,0); maxhp=private.battle_hp_max(sheet); temp=coalesce((sheet->>'hp_temp')::integer,0);
  if coalesce((e->>'restoreFull')::boolean,false) and kind='healing' then amount=greatest(0,maxhp-hp); end if;
  if kind='healing' and sheet->'conditions' ? 'Cura bloqueada' then amount=0;end if;
  total_amount=total_amount+amount;
  if e ? 'pool' and total_amount>(e->>'pool')::integer then raise exception 'A cura distribuída supera a reserva de % PV.',e->>'pool'; end if;
  afterhp=hp; aftertemp=temp;
  if kind='damage' then aftertemp=greatest(0,temp-amount); afterhp=greatest(0,hp-greatest(0,amount-temp));
   if r.kind='spell' and r.name='Doença Plena' then afterhp=greatest(1,afterhp); end if;
  elsif kind='healing' then afterhp=least(maxhp,hp+amount);
  elsif kind='temporary' then aftertemp=greatest(temp,amount);
  else continue; end if;
  if t.character_id is not null then
   perform 1 from public.characters where id=t.character_id for update;
   -- Read again after locking so concurrent sheet saves cannot lose HP changes.
   sheet=private.battle_sheet(t.id); hp=coalesce((sheet->>'hp_current')::integer,0); temp=coalesce((sheet->>'hp_temp')::integer,0); maxhp=private.battle_hp_max(sheet);
   afterhp=case kind when 'damage' then greatest(case when r.name='Doença Plena' then 1 else 0 end,hp-greatest(0,amount-temp)) when 'healing' then least(maxhp,hp+amount) else hp end;
   aftertemp=case kind when 'damage' then greatest(0,temp-amount) when 'temporary' then greatest(temp,amount) else temp end;
   update public.characters set system_data=system_data||jsonb_build_object('hp_current',afterhp,'hp_temp',aftertemp) where id=t.character_id;
  else
   select hp_current,hp_max,hp_temp into hp,maxhp,temp from public.npc_stats where npc_id=t.npc_id for update;
   afterhp=case kind when 'damage' then greatest(case when r.name='Doença Plena' then 1 else 0 end,hp-greatest(0,amount-temp)) when 'healing' then least(maxhp,hp+amount) else hp end;
   aftertemp=case kind when 'damage' then greatest(0,temp-amount) when 'temporary' then greatest(temp,amount) else temp end;
   update public.npc_stats set hp_current=afterhp,hp_temp=aftertemp where npc_id=t.npc_id;
   update public.npcs set updated_at=now() where id=t.npc_id;
  end if;
  insert into public.battle_action_effects(request_id,campaign_id,token_id,kind,amount,hp_before,hp_after,temp_before,temp_after,saved)
  values(r.id,r.campaign_id,t.id,kind,amount,hp,afterhp,temp,aftertemp,saved);
  if t.visible or t.controlled_by=r.requested_by or exists(select 1 from public.characters where id=t.character_id and owner_id=r.requested_by) or exists(select 1 from public.campaigns where id=r.campaign_id and owner_id=r.requested_by) then applied=applied||jsonb_build_array(jsonb_build_object('token_id',t.id,'name',t.name,'amount',case kind when 'healing' then afterhp-hp when 'temporary' then aftertemp-temp else amount end,'kind',kind,'saved',saved)); end if;
  total=total+1;
  if kind='damage' and amount>0 then
   update private.battle_condition_effects c set active=false from public.battle_action_requests src where src.id=c.request_id and c.token_id=t.id and c.active and src.definition->'entry'->>'catalog_id'='padrao-hipnotico';
   for condition_row in select c.* from private.battle_condition_effects c join public.battle_action_requests src on src.id=c.request_id where c.token_id=t.id and c.active and src.definition->'entry'->>'catalog_id'='riso-histerico-de-tasha' loop
    update private.battle_condition_effects set damage_saves=damage_saves+1 where id=condition_row.id returning * into condition_row;
    select * into source_request from public.battle_action_requests where id=condition_row.request_id;
    perform private.battle37_add_decision(source_request,t.id,'condition',-condition_row.damage_saves,source_request.name||' · salvaguarda após dano',condition_row.ability,condition_row.dc,private.dnd37_save_bonus(t.id,condition_row.ability),'advantage',jsonb_build_object('condition_id',condition_row.id,'damage_trigger',true));
   end loop;
   update public.battle_map_tokens set rage_activity_at=case when raging then now() else rage_activity_at end where id=t.id;
   if t.character_id is not null then update public.characters set system_data=jsonb_set(system_data,'{conditions}',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(system_data->'conditions','[]')) v where v<>'Estável'),'[]')) where id=t.character_id;end if;
  end if;
  if kind='healing' and hp=0 and afterhp>0 and t.character_id is not null then
   update public.characters set system_data=system_data||jsonb_build_object('death_successes',0,'death_failures',0,'conditions',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(system_data->'conditions','[]')) v where v not in('Estável','Inconsciente')),'[]')) where id=t.character_id;
  end if;
  if afterhp=0 then update public.battle_spell_effects set active=false where token_id=t.id and concentration and active;update public.battle_map_tokens set raging=false where id=t.id;end if;
 end loop;
 if e ? 'pool' and kind='healing' and total_amount=0 then raise exception 'Distribua a reserva de cura nos valores finais dos alvos antes de aprovar.'; end if;
 if kind='damage' and coalesce((e->>'lifeSteal')::numeric,0)>0 then
  if a.character_id is not null then perform 1 from public.characters where id=a.character_id for update;
  else perform 1 from public.npc_stats where npc_id=a.npc_id for update; end if;
  sheet=private.battle_sheet(a.id); hp=(sheet->>'hp_current')::integer; maxhp=private.battle_hp_max(sheet); temp=coalesce((sheet->>'hp_temp')::integer,0);
  amount=floor(total_amount*(e->>'lifeSteal')::numeric)::integer; afterhp=least(maxhp,hp+amount);
  if a.character_id is not null then update public.characters set system_data=system_data||jsonb_build_object('hp_current',afterhp) where id=a.character_id;
  else update public.npc_stats set hp_current=afterhp where npc_id=a.npc_id; update public.npcs set updated_at=now() where id=a.npc_id; end if;
  insert into public.battle_action_effects(request_id,campaign_id,token_id,kind,amount,hp_before,hp_after,temp_before,temp_after,saved) values(r.id,r.campaign_id,a.id,'healing',amount,hp,afterhp,temp,temp,false);
  applied=applied||jsonb_build_array(jsonb_build_object('token_id',a.id,'name',a.name,'kind','healing','amount',afterhp-hp,'saved',false));
 end if;
 if kind='healing' and r.kind='spell' and r.spell_level>0 and exists(select 1 from jsonb_array_elements(applied) v where v->>'token_id'<>a.id::text and (v->>'amount')::integer>0) then
  sheet=private.battle_sheet(a.id);
  if exists(select 1 from jsonb_array_elements(private.dnd_levels(sheet)) c where c->>'class_id'='cleric' and c->>'subclass_id'='life' and (c->>'level')::integer>=6) then
   hp=(sheet->>'hp_current')::integer;maxhp=private.battle_hp_max(sheet);afterhp=least(maxhp,hp+2+r.resource_level);temp=coalesce((sheet->>'hp_temp')::integer,0);
   update public.characters set system_data=system_data||jsonb_build_object('hp_current',afterhp) where id=a.character_id;
   insert into public.battle_action_effects(request_id,campaign_id,token_id,kind,amount,hp_before,hp_after,temp_before,temp_after,saved) values(r.id,r.campaign_id,a.id,'healing',afterhp-hp,hp,afterhp,temp,temp,false);
   applied=applied||jsonb_build_array(jsonb_build_object('token_id',a.id,'name',a.name,'kind','healing','amount',afterhp-hp,'saved',false));
  end if;
 end if;
 return jsonb_build_object('roll',roll,'affected',applied,'count',jsonb_array_length(applied));
end $$;

create or replace function public.battle_combat_update(p_map_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('map_id',p_map_id,'conditionEffects',public.list_battle_conditions((select campaign_id from public.battle_maps where id=p_map_id)),
 'sessions',coalesce((select jsonb_agg(s) from public.battle_sessions s where s.id=(select battle_session_id from public.battle_maps where id=p_map_id)),'[]'),
 'tokens',coalesce((select jsonb_agg(t) from public.battle_map_tokens t where t.map_id=p_map_id),'[]'),
 'actions',coalesce((select jsonb_agg(q) from (select r.* from public.battle_action_requests r where map_id=p_map_id order by created_at desc,id limit 80) q),'[]'),
 'decisions',coalesce((select jsonb_agg(d) from public.battle_decisions d where status='pending' and session_id=(select battle_session_id from public.battle_maps where id=p_map_id)),'[]'),
 'movementPlans',coalesce((select jsonb_agg(p) from public.battle_movement_plans p where status='pending' and session_id=(select battle_session_id from public.battle_maps where id=p_map_id)),'[]'),
 'spellEffects',coalesce((select jsonb_agg(e) from public.battle_spell_effects e where map_id=p_map_id and active),'[]'))
$$;

update public.dnd_spells set combat=$profile${"shape":"sphere","kind":"utility","range":18,"size":6,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"cha","halfOnSave":false,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='acalmar-emocoes';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":18.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"cha","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='ancora-planar';

update public.dnd_spells set combat=$profile${"shape":"cube","kind":"utility","range":18.0,"size":60.0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='antipatia-simpatia';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":9.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='aprisionamento';

update public.dnd_spells set combat=$profile${"shape":"cube","kind":"utility","range":18,"size":3,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"dex","halfOnSave":false,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","condition":"Caído","repeatSave":"","conditionRounds":0}$profile$::jsonb where id='area-escorregadia';

update public.dnd_spells set combat=$profile${"shape":"self","kind":"temporary","range":0,"size":0,"width":1.5,"origin":"self","dice":"5","damageType":"","ability":false,"upcast":"5","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='armadura-de-agathys';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":36.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='assassino-fantasmagorico';

update public.dnd_spells set combat=$profile${"shape":"self","kind":"utility","range":0,"size":0,"width":1.5,"origin":"self","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='ataque-visual';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":18.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"cha","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","targetsPerSlot":1}$profile$::jsonb where id='banimento';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":18.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"con","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='carne-para-pedra';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":18.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='cativar';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":9.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"con","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","condition":"Cego","repeatSave":"end","conditionRounds":10,"targetsPerSlot":1}$profile$::jsonb where id='cegueira-surdez';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":18.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","targetsPerSlot":1}$profile$::jsonb where id='comando';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":9.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='compulsao';

update public.dnd_spells set combat=$profile${"shape":"sphere","kind":"utility","range":27.0,"size":3.0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='confusao';

update public.dnd_spells set combat=$profile${"shape":"cube","kind":"utility","range":27,"size":6,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"str","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","condition":"Impedido","repeatSave":"","conditionRounds":10}$profile$::jsonb where id='constricao';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":36.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","condition":"Enfeitiçado","repeatSave":"end","conditionRounds":10}$profile$::jsonb where id='coroa-da-loucura';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":18.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='dominar-animais';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":18.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='dominar-monstro';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":18.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='dominar-pessoa';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":9.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","condition":"Enfeitiçado","repeatSave":"","conditionRounds":14400}$profile$::jsonb where id='enfeiticar-animal';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":9.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","condition":"Enfeitiçado","repeatSave":"","conditionRounds":600,"targetsPerSlot":1}$profile$::jsonb where id='enfeiticar-pessoa';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":9.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"dex","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='esfera-resiliente-de-otiluke';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"damage","range":27.0,"size":0,"width":1.5,"origin":"point","dice":"4d4","damageType":"ácido","ability":false,"upcast":"1d4","cantripScale":false,"save":"","halfOnSave":true,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O ataque aplica metade do dano inicial no erro. O dano posterior segue o gatilho da descrição.","pulseDice":"2d4","pulseUpcast":"1d4","pulseOnce":true,"attackRoll":true,"missHalf":true}$profile$::jsonb where id='flecha-acida-de-melf';

update public.dnd_spells set combat=$profile${"shape":"cube","kind":"utility","range":18,"size":6,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"dex","halfOnSave":false,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='fogo-das-fadas';

update public.dnd_spells set combat=$profile${"shape":"cube","kind":"utility","range":18.0,"size":3.0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='forca-fantasmagorica';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":9.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='forcar-duelo';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":27.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","condition":"Paralisado","repeatSave":"end","conditionRounds":10,"targetsPerSlot":1}$profile$::jsonb where id='imobilizar-monstro';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":18.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","condition":"Paralisado","repeatSave":"end","conditionRounds":10,"targetsPerSlot":1}$profile$::jsonb where id='imobilizar-pessoa';

update public.dnd_spells set combat=$profile${"shape":"sphere","kind":"utility","range":30.0,"size":15.0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"dex","halfOnSave":false,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='inverter-a-gravidade';

update public.dnd_spells set combat=$profile${"shape":"cube","kind":"utility","range":36,"size":12,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":true,"maxTargets":6,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='lentidao';

update public.dnd_spells set combat=$profile${"shape":"line","kind":"utility","range":18.0,"size":18.0,"width":1.5,"origin":"self","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"str","halfOnSave":false,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='lufada-de-vento';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":9.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"cha","halfOnSave":false,"selective":true,"maxTargets":3,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","targetsPerSlot":1}$profile$::jsonb where id='maldicao';

update public.dnd_spells set combat=$profile${"shape":"cone","kind":"utility","range":9,"size":9,"width":1.5,"origin":"self","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","condition":"Amedrontado","repeatSave":"","conditionRounds":10}$profile$::jsonb where id='medo';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"damage","range":45.0,"size":0,"width":1.5,"origin":"point","dice":"4d6","damageType":"psíquico","ability":false,"upcast":"","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","effectSave":"int"}$profile$::jsonb where id='mente-debil';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":18.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='missao';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":9.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='modificar-memoria';

update public.dnd_spells set combat=$profile${"shape":"cube","kind":"damage","range":0,"size":4.5,"width":1.5,"origin":"self","dice":"2d8","damageType":"trovejante","ability":false,"upcast":"1d8","cantripScale":false,"save":"con","halfOnSave":true,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"Área persistente: o mestre aplica dano apenas no gatilho da descrição, usando Aplicar efeito."}$profile$::jsonb where id='onda-trovejante';

update public.dnd_spells set combat=$profile${"shape":"cube","kind":"utility","range":36,"size":9,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","condition":"Incapacitado","repeatSave":"","conditionRounds":10}$profile$::jsonb where id='padrao-hipnotico';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":9.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"cha","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='palavra-divina';

update public.dnd_spells set combat=$profile${"shape":"sphere","kind":"utility","range":36.0,"size":9.0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='pavor';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":18.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","attackRoll":true}$profile$::jsonb where id='raio-do-enfraquecimento';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"damage","range":18.0,"size":0,"width":1.5,"origin":"point","dice":"2d8","damageType":"veneno","ability":false,"upcast":"1d8","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","attackRoll":true,"condition":"Envenenado","repeatSave":"","conditionRounds":1,"effectSave":"con"}$profile$::jsonb where id='raio-doentio';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":9.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","condition":"Incapacitado","repeatSave":"end","conditionRounds":10}$profile$::jsonb where id='riso-histerico-de-tasha';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":1.5,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='rogar-maldicao';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":9.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='sugestao';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"utility","range":18.0,"size":0,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='sugestao-em-massa';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"damage","range":1.5,"size":0,"width":1.5,"origin":"point","dice":"1d8","damageType":"elétrico","ability":false,"upcast":"","cantripScale":true,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","attackRoll":true,"condition":"Reações bloqueadas","repeatSave":"","conditionRounds":1,"expiryScope":"target_start"}$profile$::jsonb where id='toque-chocante';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"damage","range":36.0,"size":0,"width":1.5,"origin":"point","dice":"1d8","damageType":"necrótico","ability":false,"upcast":"","cantripScale":true,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","attackRoll":true,"condition":"Cura bloqueada","repeatSave":"","conditionRounds":1,"expiryScope":"source_start"}$profile$::jsonb where id='toque-macabro';

update public.dnd_spells set combat=$profile${"shape":"self","kind":"temporary","range":0,"size":0,"width":1.5,"origin":"self","dice":"1d4+4","damageType":"","ability":false,"upcast":"5","cantripScale":false,"save":"","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":false,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='vitalidade-ilusoria';

update public.dnd_spells set combat=$profile${"shape":"single","kind":"damage","range":18,"size":0,"width":1.5,"origin":"point","dice":"1d4","damageType":"psíquico","ability":false,"upcast":"","cantripScale":true,"save":"wis","halfOnSave":false,"selective":false,"maxTargets":1,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição.","condition":"Desvantagem no próximo ataque","repeatSave":"","conditionRounds":1,"expiryScope":"target_end"}$profile$::jsonb where id='zombaria-malevola';

update public.dnd_spells set combat=$profile${"shape":"sphere","kind":"utility","range":18,"size":4.5,"width":1.5,"origin":"point","dice":"","damageType":"","ability":false,"upcast":"","cantripScale":false,"save":"cha","halfOnSave":false,"selective":false,"maxTargets":99,"timing":"immediate","review":true,"note":"O mestre confirma alvos, condições, cobertura, imunidades e efeitos especiais da descrição."}$profile$::jsonb where id='zona-da-verdade';

revoke all on function private.battle39_face(integer),private.battle39_manual_detail(text,text),private.battle39_manual_attack(text,jsonb) from public,anon,authenticated;

commit;

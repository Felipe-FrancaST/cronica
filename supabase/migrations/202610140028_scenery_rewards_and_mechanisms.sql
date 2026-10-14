-- 028: D&D currencies, discoverable rewards, written clues and linked mechanisms.
-- Requires 027. Safe to reapply; no existing rewards are reset.
begin;
create or replace function private.scenery_valid_coins(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object' and p ?& array['cp','sp','ep','gp','pp'] and
   (p-array['cp','sp','ep','gp','pp'])='{}'::jsonb and not exists(
     select 1 from jsonb_each(case when jsonb_typeof(p)='object' then p else '{}'::jsonb end) e(k,v)
     where jsonb_typeof(v)<>'number' or case when jsonb_typeof(v)='number' then
       (v::text)::numeric<0 or (v::text)::numeric>1000000 or (v::text)::numeric<>floor((v::text)::numeric) else true end
   ),false);
$$;
create or replace function private.scenery_reward_kind(k text) returns boolean
language sql immutable set search_path='' as $$select k=any(array['chest','supplycrate','sarcophagus','treasure','barrel','cart','table','bookshelf','weaponrack','altar','flowers','bush','crops']);$$;
create or replace function private.scenery_configurable(k text) returns boolean
language sql immutable set search_path='' as $$select private.scenery_reward_kind(k) or k=any(array['door','portcullis','cage','secretwall','torch','campfire','forge','lanternpost','candelabra','fireplace','beacon','lever','pressureplate','gong','signpost','gravestone','cross','statue','well','fountain']);$$;
alter table public.scenery_interaction_settings
 add column if not exists coins jsonb not null default '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}' check(private.scenery_valid_coins(coins)),
 add column if not exists discovery_text text not null default '' check(length(discovery_text)<=4000),
 add column if not exists player_enabled boolean not null default true,
 add column if not exists linked_object_id uuid references public.battle_map_objects(id) on delete set null;
create table if not exists public.scenery_reward_claims(
 request_id uuid primary key,
 object_id uuid references public.battle_map_objects(id) on delete set null,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 character_id uuid not null references public.characters(id) on delete cascade,
 coins jsonb not null check(private.scenery_valid_coins(coins)),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.scenery_reward_claims enable row level security;
revoke all on public.scenery_reward_claims from public,anon,authenticated;
grant select on public.scenery_reward_claims to authenticated;
drop policy if exists scenery_rewards_read on public.scenery_reward_claims;
create policy scenery_rewards_read on public.scenery_reward_claims for select to authenticated
 using(private.is_campaign_owner(campaign_id) or exists(select 1 from public.characters c where c.id=character_id and c.owner_id=auth.uid()));
create index if not exists scenery_reward_claims_character_idx on public.scenery_reward_claims(character_id,created_at desc);

create or replace function public.save_scenery_element(p_object jsonb,p_settings jsonb,p_expected_updated_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.battle_map_objects;prior public.battle_map_objects;m public.battle_maps;s public.scenery_interaction_settings;loot public.campaign_items;k public.campaign_items;
 iid uuid=(p_object->>'id')::uuid;requires boolean=coalesce((p_settings->>'requires_key')::boolean,false);locked boolean;keyname text=trim(coalesce(p_settings->>'key_name',''));qty integer=coalesce((p_settings->>'quantity')::integer,1);taken boolean;loot_ver integer;kd jsonb;label text;coins jsonb;clue text=coalesce(p_settings->>'discovery_text','');enabled boolean=coalesce((p_settings->>'player_enabled')::boolean,true);linked uuid=nullif(p_settings->>'linked_object_id','')::uuid;target public.battle_map_objects;
begin
 select * into m from public.battle_maps where id=(p_object->>'map_id')::uuid;
 if m.id is null or not private.is_campaign_owner(m.campaign_id) then raise exception 'Somente o mestre pode configurar elementos.' using errcode='42501';end if;
 perform 1 from public.campaigns where id=m.campaign_id for update;
 perform 1 from public.campaign_sessions where id=m.adventure_session_id for share;
 if exists(select 1 from public.campaign_sessions where id=m.adventure_session_id and status='ended') then raise exception 'A sessão está encerrada.';end if;
 perform 1 from public.battle_sessions where campaign_id=m.campaign_id order by id for update;
 select * into prior from public.battle_map_objects where id=iid for update;
 if prior.id is not null and (prior.map_id<>m.id or p_expected_updated_at is null or prior.updated_at is distinct from p_expected_updated_at) then raise exception 'Este elemento mudou. Reabra a configuração.' using errcode='40001';end if;
 if iid is null or not private.scenery_configurable(p_object->>'object_type') then raise exception 'Este elemento não aceita esta configuração.';end if;
 -- Dates belong to the database. Older clients send empty strings for new objects.
 -- Remove generated fields before PostgreSQL tries to cast the JSON record.
 o=jsonb_populate_record(null::public.battle_map_objects,p_object-array['created_at','updated_at']);
 if prior.id is null then
  perform private.battle_assert_editable(m.id);
  insert into public.battle_map_objects(id,map_id,object_type,geometry,z,visible,blocks_movement,blocks_vision,metadata)
  values(iid,m.id,o.object_type,o.geometry,coalesce(o.z,0),coalesce(o.visible,true),coalesce(o.blocks_movement,false),coalesce(o.blocks_vision,false),coalesce(o.metadata,'{}')-array['interaction_locked','has_loot','loot_taken','interaction_source','has_key']) returning * into o;
 else
  if o.object_type<>prior.object_type or o.geometry<>prior.geometry or o.z<>prior.z or o.visible<>prior.visible then perform private.battle_assert_editable(m.id);end if;
  o.created_at=prior.created_at;o.updated_at=prior.updated_at;
 end if;
 select * into s from public.scenery_interaction_settings where object_id=iid for update;
 coins=coalesce(p_settings->'coins',s.coins,'{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb);
 if not private.scenery_valid_coins(coins) then raise exception 'Moedas: informe quantidades inteiras entre 0 e 1.000.000 em cada denominação.';end if;
 if not private.scenery_reward_kind(o.object_type) and coins<>'{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb then raise exception 'Este elemento não aceita recompensas em moedas.';end if;
 if length(clue)>4000 then raise exception 'A pista deve ter até 4.000 caracteres.';end if;
 if requires and o.object_type not in('chest','supplycrate','sarcophagus','door','portcullis','cage','secretwall') then raise exception 'Este elemento não possui fechadura.';end if;
 if linked is not null then
  select * into target from public.battle_map_objects where id=linked;
  if o.object_type not in('lever','pressureplate','gong') or target.id is null or target.id=iid or target.map_id<>m.id or target.object_type not in('door','portcullis','cage','secretwall','torch','campfire','forge','lanternpost','candelabra','fireplace','beacon') then raise exception 'Vincule o mecanismo a uma passagem ou luz deste mapa.';end if;
 end if;
 if nullif(p_settings->>'loot_item_id','') is not null then
  if not private.scenery_reward_kind(o.object_type) then raise exception 'Escolha um recipiente para guardar itens.';end if;
  select * into loot from public.campaign_items where id=(p_settings->>'loot_item_id')::uuid and campaign_id=m.campaign_id and (not archived or id=s.loot_item_id);
  if loot.id is null then raise exception 'Escolha um item ativo desta campanha.';end if;
  loot_ver=coalesce((p_settings->>'loot_version')::integer,loot.version);
  if not exists(select 1 from private.campaign_item_versions where item_id=loot.id and version=loot_ver and campaign_id=m.campaign_id) then raise exception 'Versão da recompensa inválida.';end if;
  if qty not between 1 and 9999 or exists(select 1 from private.campaign_item_versions where item_id=loot.id and version=loot_ver and (data->>'charges')::integer>0) and qty<>1 then raise exception 'Use 1 a 9.999 unidades; itens com cargas devem ficar separados.';end if;
 end if;
 if requires then
  if length(keyname) not between 1 and 100 then raise exception 'Dê um nome de até 100 caracteres para a chave.';end if;
  select * into k from public.campaign_items where id=s.key_item_id;
  label=coalesce(nullif(o.metadata->>'name',''),case when o.object_type in('chest','supplycrate','sarcophagus') then 'recipiente' else 'passagem' end);
  if k.id is null then
   kd=jsonb_build_object('name',keyname,'category','gear','weight',0.05,'cost_gp',0,'notes','Abre '||label||'. Na Mesa, use Interagir no elemento e escolha esta chave.','rarity','Comum','attunement',false,'charges',0,'functions','[]'::jsonb,'bonuses','{"ac":0,"attack":0,"damage":0,"speed":0}'::jsonb,'tags','["chave"]'::jsonb,'recharge','none','passive_requires_equipped',false,'image_path',null);
   k=public.save_campaign_item(jsonb_build_object('id',gen_random_uuid(),'campaign_id',m.campaign_id,'data',kd,'visible_to_players',false,'private_notes','Criada automaticamente para a fechadura de '||label||'.'),null);
  elsif k.name<>keyname then
   k=public.save_campaign_item(to_jsonb(k)||jsonb_build_object('data',jsonb_set(k.data,'{name}',to_jsonb(keyname)),'private_notes',coalesce((select notes from public.campaign_item_private where item_id=k.id),'')),k.version);
  end if;
 end if;
 locked=requires and coalesce((p_settings->>'locked')::boolean,true);
 taken=coalesce(s.taken,false) and not coalesce((p_settings->>'refill')::boolean,false);
 insert into public.scenery_interaction_settings(object_id,campaign_id,requires_key,locked,key_item_id,loot_item_id,loot_version,quantity,taken,coins,discovery_text,player_enabled,linked_object_id,updated_at)
 values(iid,m.campaign_id,requires,locked,coalesce(k.id,s.key_item_id),loot.id,loot_ver,qty,taken,coins,clue,enabled,linked,clock_timestamp())
 on conflict(object_id) do update set requires_key=excluded.requires_key,locked=excluded.locked,key_item_id=excluded.key_item_id,loot_item_id=excluded.loot_item_id,loot_version=excluded.loot_version,quantity=excluded.quantity,taken=excluded.taken,coins=excluded.coins,discovery_text=excluded.discovery_text,player_enabled=excluded.player_enabled,linked_object_id=excluded.linked_object_id,claim_request_id=case when excluded.taken then scenery_interaction_settings.claim_request_id else null end,claim_character_id=case when excluded.taken then scenery_interaction_settings.claim_character_id else null end,updated_at=excluded.updated_at;
 o.metadata=o.metadata||jsonb_build_object('interaction_source',iid,'interaction_locked',locked,'has_key',requires,'has_loot',loot.id is not null or coins<>'{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb,'loot_taken',taken,'interaction_configured',true,'player_interaction',enabled,'has_clue',length(clue)>0,'has_link',linked is not null);
 if locked and coalesce(o.metadata->>'variant','default') in('open','iron-open') then
  o.metadata=jsonb_set(o.metadata,'{variant}',to_jsonb(case when o.metadata->>'variant'='iron-open' then 'iron' else 'default' end));
  if o.object_type in('door','portcullis','cage','secretwall') then o.blocks_movement=true;o.blocks_vision=o.object_type in('door','secretwall');end if;
 end if;
 perform private.scenery_authorize(o);
 update public.battle_map_objects set object_type=o.object_type,geometry=o.geometry,z=o.z,visible=o.visible,metadata=o.metadata,blocks_movement=o.blocks_movement,blocks_vision=o.blocks_vision where id=iid returning * into o;
 perform private.scenery_clear_permit(iid);
 return jsonb_build_object('object',to_jsonb(o),'key_item_id',k.id,'key_name',k.name,'message',case when requires then 'Elemento salvo. A chave está na seção Itens.' else 'Interações e recompensas salvas.' end);
end $$;

-- The target is chosen privately by the master. The source and target change in
-- one transaction, so a blocked doorway rolls back the lever as well.
create or replace function private.scenery_linked_state() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.scenery_interaction_settings;target public.battle_map_objects;active boolean;v text;
begin
 if new.object_type not in('lever','pressureplate','gong') or
    coalesce(old.metadata->>'variant','default')=coalesce(new.metadata->>'variant','default') then return new;end if;
 select * into s from public.scenery_interaction_settings where object_id=new.id;
 if s.linked_object_id is null then
  if coalesce((new.metadata->>'has_link')::boolean,false) then raise exception 'O alvo deste mecanismo foi removido. Peça ao mestre para configurar outra ligação.';end if;
  return new;
 end if;
 if not private.is_campaign_owner(s.campaign_id) and not private.scenery_operation_allowed(new) then raise exception 'Interação não autorizada.' using errcode='42501';end if;
 select * into target from public.battle_map_objects where id=s.linked_object_id for update;
 if target.id is null or target.map_id<>new.map_id then raise exception 'O vínculo do mecanismo mudou. Peça ao mestre para configurá-lo novamente.';end if;
 active=new.metadata->>'variant'='activated';
 if target.object_type in('torch','campfire','forge','lanternpost','candelabra','fireplace','beacon') then
  target.metadata=target.metadata||jsonb_build_object('light_enabled',active);
 elsif target.object_type in('door','portcullis','cage','secretwall') then
  v=case when coalesce(target.metadata->>'variant','default') like 'iron%' then case when active then 'iron-open' else 'iron' end else case when active then 'open' else 'default' end end;
  target.metadata=target.metadata||jsonb_build_object('variant',v);
  target.blocks_movement=not active;target.blocks_vision=not active and target.object_type in('door','secretwall');
  if active then
   update public.scenery_interaction_settings set locked=false,updated_at=clock_timestamp() where object_id=target.id and locked;
   if target.metadata ? 'interaction_locked' then target.metadata=target.metadata||'{"interaction_locked":false}'::jsonb;end if;
  end if;
 else raise exception 'O alvo do mecanismo não é uma passagem ou luz.';end if;
 perform private.scenery_authorize(target);
 update public.battle_map_objects set metadata=target.metadata,blocks_movement=target.blocks_movement,blocks_vision=target.blocks_vision where id=target.id;
 perform private.scenery_clear_permit(target.id);
 return new;
end $$;
drop trigger if exists scenery_linked_state on public.battle_map_objects;
create trigger scenery_linked_state after update of metadata on public.battle_map_objects
 for each row execute function private.scenery_linked_state();

create or replace function public.get_scenery_contents(p_object_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.battle_map_objects;s public.scenery_interaction_settings;d jsonb;opened boolean;revealed boolean;related jsonb='[]';target public.battle_map_objects;
begin
 select * into o from public.battle_map_objects where id=p_object_id;
 if o.id is null or not private.scenery_readable(o) then raise exception 'Este elemento não está disponível.' using errcode='42501';end if;
 select * into s from public.scenery_interaction_settings where object_id=o.id;
 opened=coalesce(o.metadata->>'variant','default') in('open','iron-open');
 revealed=case when o.object_type in('chest','supplycrate','sarcophagus','door','portcullis','cage','secretwall') then opened
   else coalesce((o.metadata->>'interaction_revealed')::boolean,false) end;
 if revealed and s.loot_item_id is not null and not s.taken then
  select data into d from private.campaign_item_versions where item_id=s.loot_item_id and version=s.loot_version;
 end if;
 if s.linked_object_id is not null and (private.is_campaign_owner(private.battle_map_campaign(o.map_id)) or coalesce((o.metadata->>'interaction_revealed')::boolean,false)) then
  select * into target from public.battle_map_objects where id=s.linked_object_id;
  if target.id is not null and private.scenery_readable(target) then related=jsonb_build_array(to_jsonb(target));end if;
 end if;
 return jsonb_build_object('object',to_jsonb(o),'opened',opened,'locked',coalesce(s.locked,false),'taken',coalesce(s.taken,false),
  'can_interact',private.is_campaign_owner(private.battle_map_campaign(o.map_id)) or coalesce(s.player_enabled,true),'description',case when revealed then nullif(s.discovery_text,'') else null end,
  'coins',case when revealed and not coalesce(s.taken,false) then s.coins else null end,'changed_objects',related,
  'loot',case when d is not null then jsonb_build_object('item_id',s.loot_item_id,'version',s.loot_version,'name',d->>'name','data',d,'quantity',s.quantity) else null end);
end $$;

create or replace function public.interact_scenery(p_object_id uuid,p_token_id uuid,p_intent text default 'open',p_key_inventory_id uuid default null,p_expected_updated_at timestamptz default null,p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.battle_map_objects;m public.battle_maps;s public.scenery_interaction_settings;t public.battle_map_tokens;bs public.battle_sessions;
 keyinv public.character_inventory;d jsonb;inv uuid=gen_random_uuid();sheet jsonb;dx numeric;dy numeric;message text;is_master boolean;
 delivery public.campaign_item_deliveries;claim public.scenery_reward_claims;hero public.characters;coins jsonb;wallet jsonb;k text;amount numeric;revealed boolean;
begin
 select * into o from public.battle_map_objects where id=p_object_id;
 if o.id is null or not private.scenery_readable(o) then raise exception 'Este elemento não está disponível.' using errcode='42501';end if;
 select * into m from public.battle_maps where id=o.map_id;is_master=private.is_campaign_owner(m.campaign_id);
 perform 1 from public.campaigns where id=m.campaign_id for update;
 perform 1 from public.campaign_sessions where id=m.adventure_session_id for share;
 if exists(select 1 from public.campaign_sessions where id=m.adventure_session_id and status='ended') then raise exception 'A sessão está encerrada.';end if;
 perform 1 from public.battle_sessions where campaign_id=m.campaign_id order by id for update;
 select * into o from public.battle_map_objects where id=p_object_id for update;
 if o.id is null or not private.scenery_readable(o) then raise exception 'Este elemento não está disponível.' using errcode='42501';end if;
 select * into t from public.battle_map_tokens where id=p_token_id for update;
 if t.id is null or t.map_id<>o.map_id or not private.can_control_battle_token(t.id) then raise exception 'Escolha um personagem que você controla neste mapa.' using errcode='42501';end if;
 dx=greatest(0,(o.geometry->>'x')::numeric-(t.x+t.size-1),t.x-((o.geometry->>'x')::numeric+(o.geometry->>'width')::numeric-1));
 dy=greatest(0,(o.geometry->>'y')::numeric-(t.y+t.size-1),t.y-((o.geometry->>'y')::numeric+(o.geometry->>'height')::numeric-1));
 if greatest(dx,dy)>1 then raise exception 'Aproxime seu personagem do elemento para interagir.';end if;
 select * into bs from public.battle_sessions where id=m.battle_session_id;
 if not is_master and bs.status='active' and bs.active_token_id is distinct from t.id then raise exception 'Aguarde o turno deste personagem para interagir.';end if;
 sheet=private.battle_sheet(t.id);
 if coalesce((sheet->>'hp_current')::integer,0)<=0 or sheet->'conditions' ?| array['Incapacitado','Inconsciente','Atordoado','Paralisado','Petrificado'] then raise exception 'A condição do personagem impede esta interação.';end if;
 if exists(select 1 from public.battle_action_requests where token_id=t.id and status in('pending','approved')) then raise exception 'Conclua a tentativa pendente antes de interagir.';end if;
 select * into s from public.scenery_interaction_settings where object_id=o.id for update;
 if not is_master and not coalesce(s.player_enabled,true) then raise exception 'Este elemento é controlado pelo mestre.' using errcode='42501';end if;
 if p_intent='take' and p_request_id is not null then
  select * into claim from public.scenery_reward_claims where request_id=p_request_id;
  if claim.request_id is not null then
   if claim.object_id=o.id and claim.character_id=t.character_id then
    return public.get_scenery_contents(o.id)||jsonb_build_object('message','Esta recompensa já foi entregue à sua ficha.');
   end if;
   raise exception 'Este pedido de coleta já foi utilizado.';
  end if;
  -- Receipts created by migration 026 still support safe retries after upgrade.
  if s.taken and s.claim_request_id=p_request_id and s.claim_character_id=t.character_id then
   return public.get_scenery_contents(o.id)||jsonb_build_object('message','Item já recolhido para o seu inventário.');
  end if;
 end if;
 if p_expected_updated_at is null or o.updated_at is distinct from p_expected_updated_at then raise exception 'Este elemento mudou. Reabra antes de interagir.' using errcode='40001';end if;
 if not private.scenery_configurable(o.object_type) then raise exception 'Esta interação é controlada pelo mestre.';end if;
 if p_intent='take' then
  coins=coalesce(s.coins,'{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb);
  revealed=case when o.object_type in('chest','supplycrate','sarcophagus') then coalesce(o.metadata->>'variant','default') in('open','iron-open') else coalesce((o.metadata->>'interaction_revealed')::boolean,false) end;
  if t.character_id is null or not private.scenery_reward_kind(o.object_type) or s.object_id is null or s.taken or not revealed or (s.loot_item_id is null and coins='{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb) then raise exception 'Não há recompensa disponível. Abra ou examine o elemento antes de recolher.';end if;
  if p_request_id is null then raise exception 'Identificador da coleta inválido.';end if;
  select * into hero from public.characters where id=t.character_id and campaign_id=m.campaign_id for update;
  if hero.id is null then raise exception 'Escolha um personagem com ficha nesta campanha.';end if;
  wallet=coalesce(nullif(hero.system_data->'currency','null'),'{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb);
  if jsonb_typeof(wallet)<>'object' then raise exception 'Confira as moedas da ficha antes de recolher.';end if;
  foreach k in array array['cp','sp','ep','gp','pp'] loop
   if wallet ? k and jsonb_typeof(wallet->k)<>'number' then raise exception 'Confira as moedas da ficha antes de recolher.';end if;
   amount=coalesce((wallet->>k)::numeric,0);
   if amount<0 or amount<>floor(amount) or amount+(coins->>k)::numeric>9007199254740991 then raise exception 'As moedas da ficha devem ser inteiras e estar dentro do limite numérico.';end if;
   wallet=jsonb_set(wallet,array[k],to_jsonb(amount+(coins->>k)::numeric));
  end loop;
  if s.loot_item_id is not null then
   select data into d from private.campaign_item_versions where item_id=s.loot_item_id and version=s.loot_version;
   if d is null then raise exception 'A definição do item não está disponível. Avise o mestre.';end if;
   d=d||jsonb_build_object('campaign_item_id',s.loot_item_id,'definition_version',s.loot_version,'quantity',s.quantity,'equipped',false,'attuned',false,'charges_used',0);
  end if;
  o.metadata=o.metadata||'{"loot_taken":true}'::jsonb;
  perform private.scenery_authorize(o,case when d is not null then inv else null end,hero.id,d);
  if d is not null then
   insert into public.character_inventory(id,character_id,data) values(inv,hero.id,d);
   insert into public.campaign_item_deliveries(id,campaign_id,item_id,character_id,inventory_id,item_name,quantity,definition_version)
    values(p_request_id,m.campaign_id,s.loot_item_id,hero.id,inv,d->>'name',s.quantity,s.loot_version) returning * into delivery;
  end if;
  update public.characters set system_data=jsonb_set(system_data,'{currency}',wallet),updated_at=clock_timestamp() where id=hero.id;
  insert into public.scenery_reward_claims(request_id,object_id,campaign_id,character_id,coins) values(p_request_id,o.id,m.campaign_id,hero.id,coins);
  update public.scenery_interaction_settings set taken=true,claim_request_id=p_request_id,claim_character_id=hero.id,updated_at=clock_timestamp() where object_id=o.id;
  message=case when d is not null and coins<>'{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb then 'Item e moedas recolhidos. O inventário e as moedas da sua ficha foram atualizados.'
    when d is not null then 'Você recolheu '||(d->>'name')||'. O item está no seu inventário.' else 'Moedas recolhidas e somadas à sua ficha.' end;
 elsif p_intent in('open','close') and o.object_type in('chest','supplycrate','sarcophagus','door','portcullis','cage','secretwall') then
  if p_intent='open' and coalesce(s.locked,false) then
   select * into keyinv from public.character_inventory where id=p_key_inventory_id and character_id=t.character_id and data->>'campaign_item_id'=s.key_item_id::text and (data->>'quantity')::integer>0 for update;
   if keyinv.id is null then raise exception '%. Use a chave correta do inventário.',case when o.object_type in('chest','supplycrate','sarcophagus') then 'Baú trancado' when o.object_type='door' then 'Porta trancada' else 'Acesso trancado' end;end if;
   update public.scenery_interaction_settings set locked=false,updated_at=clock_timestamp() where object_id=o.id;
   o.metadata=o.metadata||'{"interaction_locked":false}'::jsonb;
  end if;
  o.metadata=jsonb_set(o.metadata,'{variant}',to_jsonb(case when coalesce(o.metadata->>'variant','default') like 'iron%' then case when p_intent='open' then 'iron-open' else 'iron' end else case when p_intent='open' then 'open' else 'default' end end));
  if o.object_type in('door','portcullis','cage','secretwall') then o.blocks_movement=p_intent='close';o.blocks_vision=o.object_type in('door','secretwall') and o.blocks_movement;end if;
  message=case when p_intent='close' then 'Elemento fechado.' when (s.loot_item_id is not null or s.coins<>'{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb) and not s.taken then 'Baú aberto. Você encontrou uma recompensa!' else 'Elemento aberto.' end;
 elsif p_intent='inspect' then
  if o.object_type in('chest','supplycrate','sarcophagus','door','portcullis','cage','secretwall') and coalesce(o.metadata->>'variant','default') not in('open','iron-open') then raise exception 'Abra o elemento antes de examinar o conteúdo.';end if;
  o.metadata=o.metadata||'{"interaction_revealed":true}'::jsonb;
  message=case when nullif(s.discovery_text,'') is not null then 'Você examinou o elemento e encontrou uma pista.' when s.loot_item_id is not null or s.coins<>'{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb then 'Você encontrou uma recompensa.' else 'Nada mais foi encontrado aqui. O mestre pode descrever a cena.' end;
 elsif p_intent in('activate','deactivate') and o.object_type in('lever','pressureplate','gong') then
  o.metadata=o.metadata||jsonb_build_object('variant',case when p_intent='activate' then 'activated' else 'default' end,'interaction_revealed',true);
  message=case when p_intent='activate' then 'Mecanismo acionado.' else 'Mecanismo reposto.' end;
 elsif p_intent in('light-on','light-off') and o.object_type in('torch','campfire','forge','lanternpost','candelabra','fireplace','beacon') then
  o.metadata=o.metadata||jsonb_build_object('light_enabled',p_intent='light-on','interaction_revealed',true);
  message=case when p_intent='light-on' then 'Luz acesa.' else 'Luz apagada.' end;
 else raise exception 'Esta ação não está disponível para este elemento.';
 end if;
 perform private.scenery_authorize(o,case when d is not null then inv else null end,t.character_id,d);
 update public.battle_map_objects set metadata=o.metadata,blocks_movement=o.blocks_movement,blocks_vision=o.blocks_vision where id=o.id returning * into o;
 perform private.scenery_clear_permit(o.id);
 return public.get_scenery_contents(o.id)||jsonb_build_object('message',message,'delivery',to_jsonb(delivery));
end $$;

-- Return both affected objects in the same response for immediate master UI updates.
create or replace function public.set_scenery_mechanism_state(p_object_id uuid,p_variant text,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.set_battle_scenery_state(p_object_id,p_variant,p_expected_updated_at);
 return public.get_scenery_contents(p_object_id);
end $$;

create or replace function private.copy_scenery_settings() returns trigger language plpgsql security definer set search_path='' as $$
declare source uuid;s public.scenery_interaction_settings;cid uuid;source_map uuid;
begin
 if coalesce(new.metadata->>'interaction_source','') !~ '^[0-9a-fA-F-]{36}$' then return new;end if;
 source=(new.metadata->>'interaction_source')::uuid;if source=new.id then return new;end if;
 cid=private.battle_map_campaign(new.map_id);
 select * into s from public.scenery_interaction_settings where object_id=source and campaign_id=cid;
 if s.object_id is null then return new;end if;
 select map_id into source_map from public.battle_map_objects where id=source;
 insert into public.scenery_interaction_settings(object_id,campaign_id,requires_key,locked,key_item_id,loot_item_id,loot_version,quantity,taken,coins,discovery_text,player_enabled,linked_object_id)
 values(new.id,cid,s.requires_key,s.locked,s.key_item_id,s.loot_item_id,s.loot_version,s.quantity,s.taken,s.coins,s.discovery_text,s.player_enabled,case when source_map=new.map_id then s.linked_object_id else null end) on conflict(object_id) do nothing;
 update public.battle_map_objects set metadata=jsonb_set(metadata,'{interaction_source}',to_jsonb(new.id))||jsonb_build_object('has_link',source_map=new.map_id and s.linked_object_id is not null) where id=new.id;
 return new;
end $$;

revoke all on function private.scenery_valid_coins(jsonb),private.scenery_reward_kind(text),private.scenery_configurable(text),private.scenery_linked_state() from public,anon,authenticated;
revoke all on function public.get_scenery_contents(uuid),public.save_scenery_element(jsonb,jsonb,timestamptz),public.interact_scenery(uuid,uuid,text,uuid,timestamptz,uuid),public.set_scenery_mechanism_state(uuid,text,timestamptz) from public,anon;
grant execute on function public.get_scenery_contents(uuid),public.save_scenery_element(jsonb,jsonb,timestamptz),public.interact_scenery(uuid,uuid,text,uuid,timestamptz,uuid),public.set_scenery_mechanism_state(uuid,text,timestamptz) to authenticated;
notify pgrst, 'reload schema';
commit;


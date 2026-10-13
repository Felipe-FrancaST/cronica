-- Light controls and transactional, private lock/treasure configuration.
begin;
create table if not exists public.scenery_interaction_settings (
 object_id uuid primary key references public.battle_map_objects(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 requires_key boolean not null default false, locked boolean not null default false,
 key_item_id uuid references public.campaign_items(id),
 loot_item_id uuid references public.campaign_items(id), loot_version integer,
 quantity integer not null default 1 check(quantity between 1 and 9999),
 taken boolean not null default false, claim_request_id uuid, claim_character_id uuid,
 updated_at timestamptz not null default now()
);
alter table public.scenery_interaction_settings enable row level security;
revoke all on public.scenery_interaction_settings from public,anon,authenticated;
grant select on public.scenery_interaction_settings to authenticated;
drop policy if exists scenery_settings_master on public.scenery_interaction_settings;
create policy scenery_settings_master on public.scenery_interaction_settings for select to authenticated using(private.is_campaign_owner(campaign_id));
create table if not exists private.scenery_operation_permits (
 transaction_id bigint not null, object_id uuid not null, user_id uuid not null,
 payload jsonb not null, inventory_id uuid, character_id uuid, inventory_data jsonb,
 primary key(transaction_id,object_id)
);
revoke all on private.scenery_operation_permits from public,anon,authenticated;
create or replace function private.scenery_authorize(o public.battle_map_objects,p_inventory uuid default null,p_character uuid default null,p_data jsonb default null) returns void language sql security definer set search_path='' as $$
 insert into private.scenery_operation_permits(transaction_id,object_id,user_id,payload,inventory_id,character_id,inventory_data)
 values(txid_current(),o.id,auth.uid(),to_jsonb(o),p_inventory,p_character,p_data)
 on conflict(transaction_id,object_id) do update set payload=excluded.payload,inventory_id=excluded.inventory_id,character_id=excluded.character_id,inventory_data=excluded.inventory_data;
$$;
create or replace function private.scenery_operation_allowed(o public.battle_map_objects) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.scenery_operation_permits p where p.transaction_id=txid_current() and p.object_id=o.id and p.user_id=auth.uid() and
 p.payload->'geometry'=o.geometry and p.payload->'metadata'=o.metadata and p.payload->>'object_type'=o.object_type and p.payload->>'map_id'=o.map_id::text and
 (p.payload->>'blocks_movement')::boolean=o.blocks_movement and (p.payload->>'blocks_vision')::boolean=o.blocks_vision and (p.payload->>'visible')::boolean=o.visible);
$$;
create or replace function private.scenery_inventory_allowed(i public.character_inventory) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.scenery_operation_permits p where p.transaction_id=txid_current() and p.user_id=auth.uid() and p.inventory_id=i.id and p.character_id=i.character_id and p.inventory_data=i.data);
$$;
create or replace function private.scenery_clear_permit(p_object uuid) returns void language sql security definer set search_path='' as $$ delete from private.scenery_operation_permits where transaction_id=txid_current() and object_id=p_object; $$;
create or replace function private.scenery_readable(o public.battle_map_objects) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_battle_map(o.map_id) and (private.is_campaign_owner(private.battle_map_campaign(o.map_id)) or o.visible and not private.battle_area_hidden(o.map_id,(o.geometry->>'x')::numeric,(o.geometry->>'y')::numeric,(o.geometry->>'width')::numeric,(o.geometry->>'height')::numeric));
$$;
create or replace function public.get_scenery_contents(p_object_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.battle_map_objects;s public.scenery_interaction_settings;d jsonb;opened boolean;
begin
 select * into o from public.battle_map_objects where id=p_object_id;
 if o.id is null or not private.scenery_readable(o) then raise exception 'Este elemento não está disponível.' using errcode='42501';end if;
 select * into s from public.scenery_interaction_settings where object_id=o.id;
 opened=coalesce(o.metadata->>'variant','default') in('open','iron-open');
 if opened and s.loot_item_id is not null and not s.taken then
  select data into d from private.campaign_item_versions where item_id=s.loot_item_id and version=s.loot_version;
 end if;
 return jsonb_build_object('object',to_jsonb(o),'opened',opened,'locked',coalesce(s.locked,false),'taken',coalesce(s.taken,false),'loot',case when d is not null then jsonb_build_object('item_id',s.loot_item_id,'version',s.loot_version,'name',d->>'name','data',d,'quantity',s.quantity) else null end);
end $$;

create or replace function public.save_scenery_element(p_object jsonb,p_settings jsonb,p_expected_updated_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.battle_map_objects;prior public.battle_map_objects;m public.battle_maps;s public.scenery_interaction_settings;loot public.campaign_items;k public.campaign_items;
 iid uuid=(p_object->>'id')::uuid;requires boolean=coalesce((p_settings->>'requires_key')::boolean,false);locked boolean;keyname text=trim(coalesce(p_settings->>'key_name',''));qty integer=coalesce((p_settings->>'quantity')::integer,1);taken boolean;loot_ver integer;kd jsonb;label text;
begin
 select * into m from public.battle_maps where id=(p_object->>'map_id')::uuid;
 if m.id is null or not private.is_campaign_owner(m.campaign_id) then raise exception 'Somente o mestre pode configurar elementos.' using errcode='42501';end if;
 perform 1 from public.campaigns where id=m.campaign_id for update;
 perform 1 from public.campaign_sessions where id=m.adventure_session_id for share;
 if exists(select 1 from public.campaign_sessions where id=m.adventure_session_id and status='ended') then raise exception 'A sessão está encerrada.';end if;
 perform 1 from public.battle_sessions where campaign_id=m.campaign_id order by id for update;
 select * into prior from public.battle_map_objects where id=iid for update;
 if prior.id is not null and (prior.map_id<>m.id or p_expected_updated_at is null or prior.updated_at is distinct from p_expected_updated_at) then raise exception 'Este elemento mudou. Reabra a configuração.' using errcode='40001';end if;
 if iid is null or p_object->>'object_type' not in('chest','supplycrate','sarcophagus','door','portcullis','cage','secretwall') then raise exception 'Este elemento não aceita conteúdo ou fechadura.';end if;
 o=jsonb_populate_record(null::public.battle_map_objects,p_object);
 if prior.id is null then
  perform private.battle_assert_editable(m.id);
  insert into public.battle_map_objects(id,map_id,object_type,geometry,z,visible,blocks_movement,blocks_vision,metadata)
  values(iid,m.id,o.object_type,o.geometry,coalesce(o.z,0),coalesce(o.visible,true),coalesce(o.blocks_movement,false),coalesce(o.blocks_vision,false),coalesce(o.metadata,'{}')-array['interaction_locked','has_loot','loot_taken','interaction_source','has_key']) returning * into o;
 else
  if o.object_type<>prior.object_type or o.geometry<>prior.geometry or o.z<>prior.z or o.visible<>prior.visible then perform private.battle_assert_editable(m.id);end if;
  o.created_at=prior.created_at;o.updated_at=prior.updated_at;
 end if;
 select * into s from public.scenery_interaction_settings where object_id=iid for update;
 if nullif(p_settings->>'loot_item_id','') is not null then
  if o.object_type not in('chest','supplycrate','sarcophagus') then raise exception 'Escolha um recipiente para guardar itens.';end if;
  select * into loot from public.campaign_items where id=(p_settings->>'loot_item_id')::uuid and campaign_id=m.campaign_id and not archived;
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
 taken=coalesce(s.taken,false) and s.loot_item_id is not distinct from loot.id and not coalesce((p_settings->>'refill')::boolean,false);
 insert into public.scenery_interaction_settings(object_id,campaign_id,requires_key,locked,key_item_id,loot_item_id,loot_version,quantity,taken,updated_at)
 values(iid,m.campaign_id,requires,locked,coalesce(k.id,s.key_item_id),loot.id,loot_ver,qty,taken,clock_timestamp())
 on conflict(object_id) do update set requires_key=excluded.requires_key,locked=excluded.locked,key_item_id=excluded.key_item_id,loot_item_id=excluded.loot_item_id,loot_version=excluded.loot_version,quantity=excluded.quantity,taken=excluded.taken,claim_request_id=case when excluded.taken then scenery_interaction_settings.claim_request_id else null end,claim_character_id=case when excluded.taken then scenery_interaction_settings.claim_character_id else null end,updated_at=excluded.updated_at;
 o.metadata=o.metadata||jsonb_build_object('interaction_source',iid,'interaction_locked',locked,'has_key',requires,'has_loot',loot.id is not null,'loot_taken',taken);
 if locked and coalesce(o.metadata->>'variant','default') in('open','iron-open') then
  o.metadata=jsonb_set(o.metadata,'{variant}',to_jsonb(case when o.metadata->>'variant'='iron-open' then 'iron' else 'default' end));
  if o.object_type in('door','portcullis','cage','secretwall') then o.blocks_movement=true;o.blocks_vision=o.object_type in('door','secretwall');end if;
 end if;
 perform private.scenery_authorize(o);
 update public.battle_map_objects set object_type=o.object_type,geometry=o.geometry,z=o.z,visible=o.visible,metadata=o.metadata,blocks_movement=o.blocks_movement,blocks_vision=o.blocks_vision where id=iid returning * into o;
 perform private.scenery_clear_permit(iid);
 return jsonb_build_object('object',to_jsonb(o),'key_item_id',k.id,'key_name',k.name,'message',case when requires then 'Elemento salvo. A chave está na seção Itens.' else 'Elemento salvo sem exigir chave.' end);
end $$;

create or replace function public.interact_scenery(p_object_id uuid,p_token_id uuid,p_intent text default 'open',p_key_inventory_id uuid default null,p_expected_updated_at timestamptz default null,p_request_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.battle_map_objects;m public.battle_maps;s public.scenery_interaction_settings;t public.battle_map_tokens;bs public.battle_sessions;keyinv public.character_inventory;d jsonb;inv uuid=gen_random_uuid();sheet jsonb;dx numeric;dy numeric;message text;is_master boolean;qty integer;delivery public.campaign_item_deliveries;
begin
 select * into o from public.battle_map_objects where id=p_object_id;
 if o.id is null or not private.scenery_readable(o) then raise exception 'Este elemento não está disponível.' using errcode='42501';end if;
 select * into m from public.battle_maps where id=o.map_id;is_master=private.is_campaign_owner(m.campaign_id);
 perform 1 from public.campaigns where id=m.campaign_id for update;
 perform 1 from public.campaign_sessions where id=m.adventure_session_id for share;
 if exists(select 1 from public.campaign_sessions where id=m.adventure_session_id and status='ended') then raise exception 'A sessão está encerrada.';end if;
 perform 1 from public.battle_sessions where campaign_id=m.campaign_id order by id for update;
 select * into o from public.battle_map_objects where id=p_object_id for update;
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
 if p_intent='take' and s.taken and s.claim_request_id=p_request_id and s.claim_character_id=t.character_id then
  return public.get_scenery_contents(o.id)||jsonb_build_object('message','Item já recolhido para o seu inventário.');
 end if;
 if p_expected_updated_at is null or o.updated_at is distinct from p_expected_updated_at then raise exception 'Este elemento mudou. Reabra antes de interagir.' using errcode='40001';end if;
 if o.object_type not in('chest','supplycrate','sarcophagus','door','portcullis','cage','secretwall') or p_intent not in('open','close','take') then raise exception 'Esta interação é controlada pelo mestre.';end if;
 if p_intent='take' then
  if t.character_id is null or s.loot_item_id is null or s.taken or coalesce(o.metadata->>'variant','default') not in('open','iron-open') then raise exception 'Abra o recipiente para recolher um item disponível.';end if;
  if p_request_id is null then raise exception 'Identificador da coleta inválido.';end if;
  select data into d from private.campaign_item_versions where item_id=s.loot_item_id and version=s.loot_version;
  d=d||jsonb_build_object('campaign_item_id',s.loot_item_id,'definition_version',s.loot_version,'quantity',s.quantity,'equipped',false,'attuned',false,'charges_used',0);
  o.metadata=o.metadata||'{"loot_taken":true}'::jsonb;
  perform private.scenery_authorize(o,inv,t.character_id,d);
  perform 1 from public.characters where id=t.character_id for update;
  insert into public.character_inventory(id,character_id,data) values(inv,t.character_id,d);
  insert into public.campaign_item_deliveries(id,campaign_id,item_id,character_id,inventory_id,item_name,quantity,definition_version) values(p_request_id,m.campaign_id,s.loot_item_id,t.character_id,inv,d->>'name',s.quantity,s.loot_version) returning * into delivery;
  update public.characters set updated_at=clock_timestamp() where id=t.character_id;
  update public.scenery_interaction_settings set taken=true,claim_request_id=p_request_id,claim_character_id=t.character_id,updated_at=clock_timestamp() where object_id=o.id;
  message='Você recolheu '||(d->>'name')||'. O item está no seu inventário.';
 else
  if p_intent='open' and coalesce(s.locked,false) then
   select * into keyinv from public.character_inventory where id=p_key_inventory_id and character_id=t.character_id and data->>'campaign_item_id'=s.key_item_id::text and (data->>'quantity')::integer>0 for update;
   if keyinv.id is null then raise exception '%. Use a chave correta do inventário.',case when o.object_type in('chest','supplycrate','sarcophagus') then 'Baú trancado' when o.object_type='door' then 'Porta trancada' else 'Acesso trancado' end;end if;
   update public.scenery_interaction_settings set locked=false,updated_at=clock_timestamp() where object_id=o.id;
   o.metadata=o.metadata||'{"interaction_locked":false}'::jsonb;
  end if;
  o.metadata=jsonb_set(o.metadata,'{variant}',to_jsonb(case when coalesce(o.metadata->>'variant','default') like 'iron%' then case when p_intent='open' then 'iron-open' else 'iron' end else case when p_intent='open' then 'open' else 'default' end end));
  if o.object_type in('door','portcullis','cage','secretwall') then o.blocks_movement=p_intent='close';o.blocks_vision=o.object_type in('door','secretwall') and o.blocks_movement;end if;
  message=case when p_intent='close' then 'Elemento fechado.' when s.loot_item_id is not null and not s.taken then 'Baú aberto. Você encontrou um item!' else 'Elemento aberto.' end;
  perform private.scenery_authorize(o);
 end if;
 update public.battle_map_objects set metadata=o.metadata,blocks_movement=o.blocks_movement,blocks_vision=o.blocks_vision where id=o.id returning * into o;
 perform private.scenery_clear_permit(o.id);
 return public.get_scenery_contents(o.id)||jsonb_build_object('message',message,'delivery',to_jsonb(delivery));
end $$;

revoke all on function private.scenery_authorize(public.battle_map_objects,uuid,uuid,jsonb),private.scenery_operation_allowed(public.battle_map_objects),private.scenery_inventory_allowed(public.character_inventory),private.scenery_clear_permit(uuid),private.scenery_readable(public.battle_map_objects) from public,anon,authenticated;
revoke all on function public.get_scenery_contents(uuid),public.save_scenery_element(jsonb,jsonb,timestamptz),public.interact_scenery(uuid,uuid,text,uuid,timestamptz,uuid) from public,anon;
grant execute on function public.get_scenery_contents(uuid),public.save_scenery_element(jsonb,jsonb,timestamptz),public.interact_scenery(uuid,uuid,text,uuid,timestamptz,uuid) to authenticated;
-- Existing guards and master controls are upgraded below, in this transaction.

create or replace function private.battle_is_scenery_kind(p_kind text) returns boolean language sql immutable set search_path='' as $$select p_kind=any(array['tree','pine','rock','mountain','ruin','water','fire','tent','road','cart','ice','pit','portal','lava','barrel','campfire','boat','bush','flowers','statue','chest','counter','crops','house','gravestone','cross','fence','grass','well','bridge','table','chair','bookshelf','torch','market','signpost','tavern','forge','stable','wall','floor','stairs','bed','rug','doorway','fountain','door','portcullis','pillar','altar','sarcophagus','cage','weaponrack','lever','trap','treasure','rubble','web','stalagmite','ladder','magiccircle','barricade','lanternpost','candelabra','fireplace','beacon','gong','pressureplate','secretwall','supplycrate']);$$;
create or replace function private.battle_valid_scenery_variant(p_kind text,p_variant text) returns boolean language sql immutable set search_path='' as $$select p_variant='default' or case p_kind when 'statue' then p_variant='obelisk' when 'secretwall' then p_variant in('open')
when 'supplycrate' then p_variant in('open')
when 'pressureplate' then p_variant in('activated')
when 'gong' then p_variant in('activated')
when 'door' then p_variant in('open','iron','iron-open')
when 'portcullis' then p_variant in('open')
when 'pillar' then p_variant in('broken')
when 'altar' then p_variant in('arcane')
when 'sarcophagus' then p_variant in('open')
when 'cage' then p_variant in('open')
when 'weaponrack' then p_variant in('armor')
when 'lever' then p_variant in('activated')
when 'trap' then p_variant in('runes','disarmed')
when 'treasure' then p_variant in('gems')
when 'stalagmite' then p_variant in('crystal')
when 'ladder' then p_variant in('rope')
when 'magiccircle' then p_variant in('summoning','spent')
when 'barricade' then p_variant in('spikes')
when 'portal' then p_variant in('door','cave')
when 'ice' then p_variant in('snow')
when 'boat' then p_variant in('ship')
when 'barrel' then p_variant in('crate')
when 'campfire' then p_variant in('brazier')
when 'bush' then p_variant in('thorn','desert','frost')
when 'flowers' then p_variant in('mushrooms','roses','sunflowers','lavender','dead')
when 'chest' then p_variant in('open')
when 'tree' then p_variant in('autumn')
when 'rock' then p_variant in('crystal','boulder','pile','moss','desert','ice')
when 'road' then p_variant in('cobblestone')
when 'mountain' then p_variant in('snowy','desert','volcano')
when 'ruin' then p_variant in('wall','arch','columns','temple')
when 'cart' then p_variant in('covered','goods','broken')
when 'tent' then p_variant in('pavilion','desert','war')
when 'counter' then p_variant in('stone','merchant')
when 'crops' then p_variant in('vegetables','pumpkins','corn','vineyard')
when 'house' then p_variant in('cottage','inn','tower','timber','stone','manor','desert','ruined')
when 'tavern' then p_variant in('port','stone','open')
when 'forge' then p_variant in('covered')
when 'stable' then p_variant in('open')
when 'wall' then p_variant in('timber','brick','low')
when 'floor' then p_variant in('wood','tile')
when 'stairs' then p_variant in('stone')
when 'bed' then p_variant in('bunk','royal')
when 'rug' then p_variant in('round','royal')
when 'doorway' then p_variant in('arch','iron')
when 'fountain' then p_variant in('dry','ornate')
when 'gravestone' then p_variant in('ornate','broken')
when 'cross' then p_variant in('stone','rune')
when 'fence' then p_variant in('stone','palisade','iron')
when 'grass' then p_variant in('tall','dry')
when 'well' then p_variant in('roofed','ruined')
when 'bridge' then p_variant in('stone','rope')
when 'table' then p_variant in('round','feast')
when 'chair' then p_variant in('throne','stool')
when 'bookshelf' then p_variant in('scrolls','potions')
when 'torch' then p_variant in('lantern','arcane')
when 'market' then p_variant in('produce','weapons')
when 'signpost' then p_variant in('forked','banner') else false end;$$;

create or replace function private.battle_scenery_bounds() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.battle_maps; g jsonb; x integer; y integer; w integer; h integer; cost numeric; code text; variant text; color text;
begin
 if tg_op='DELETE' then
  select * into m from public.battle_maps where id=old.map_id;
  if m.id is null then return old; end if;
  perform private.battle_assert_editable(m.id);
  perform 1 from public.battle_sessions where id=m.battle_session_id for update;
  update public.battle_maps set updated_at=now() where id=old.map_id;
  return old;
 end if;
 select * into m from public.battle_maps where id=new.map_id;
 if tg_op='UPDATE' and (private.battle_scenery_state_update(old,new) or private.scenery_operation_allowed(new)) then
  if not private.is_campaign_owner(m.campaign_id) and not private.scenery_operation_allowed(new) then raise exception 'Somente o mestre pode interagir com o cenário.' using errcode='42501'; end if;
  perform 1 from public.campaigns where id=m.campaign_id for update;
  perform 1 from public.campaign_sessions where id=m.adventure_session_id for share;
  if exists(select 1 from public.campaign_sessions where id=m.adventure_session_id and status='ended') then raise exception 'A sessão está encerrada e seu histórico é somente para consulta.' using errcode='42501'; end if;
  perform 1 from public.battle_sessions where campaign_id=m.campaign_id order by id for update;
 else
  perform private.battle_assert_editable(m.id);
 end if;
 perform 1 from public.battle_sessions where id=m.battle_session_id for update;
 if tg_op='UPDATE' and new.map_id<>old.map_id then raise exception 'Não transfira objetos entre mapas.'; end if;
 if not private.battle_is_scenery_kind(new.object_type) then
  if new.blocks_movement then raise exception 'Use um objeto de cenário com dimensões válidas para bloquear movimento.'; end if;
  return new;
 end if;
 variant=coalesce(nullif(new.metadata->>'variant',''),'default');
 if not private.battle_valid_scenery_variant(new.object_type,variant) then raise exception 'Variante inválida para este elemento.'; end if;
 new.metadata=jsonb_set(new.metadata,'{variant}',to_jsonb(variant));
 if new.metadata ? 'color' then
  if new.metadata->'color'='null'::jsonb then new.metadata=new.metadata-'color';
  else
   color=new.metadata->>'color';
   if jsonb_typeof(new.metadata->'color')<>'string' or color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Cor inválida: use #RRGGBB.'; end if;
   new.metadata=jsonb_set(new.metadata,'{color}',to_jsonb(lower(color)));
  end if;
 end if;
 if new.metadata ? 'height_metres' and (jsonb_typeof(new.metadata->'height_metres') is distinct from 'number' or (new.metadata->>'height_metres')::numeric not between 0.01 and 300) then raise exception 'Altura visual inválida (maior que zero e até 300 metros).'; end if;
 g=new.geometry;
 if jsonb_typeof(g->'x') is distinct from 'number' or jsonb_typeof(g->'y') is distinct from 'number' or jsonb_typeof(g->'width') is distinct from 'number' or jsonb_typeof(g->'height') is distinct from 'number' then raise exception 'Informe posição e dimensões do objeto.'; end if;
 if (g->>'x')::numeric<>floor((g->>'x')::numeric) or (g->>'y')::numeric<>floor((g->>'y')::numeric) or (g->>'width')::numeric<>floor((g->>'width')::numeric) or (g->>'height')::numeric<>floor((g->>'height')::numeric) then raise exception 'As dimensões devem seguir as células do grid.'; end if;
 x=(g->>'x')::integer; y=(g->>'y')::integer; w=(g->>'width')::integer; h=(g->>'height')::integer;
 if x<0 or y<0 or w<1 or h<1 or w>128 or h>128 or x+w>m.width or y+h>m.height or new.z<>0 or coalesce((g->>'rotation')::numeric,0) not between 0 and 360 then raise exception 'Objeto fora do mapa ou com dimensões inválidas (1 a 128 células).'; end if;
 if new.object_type='portal' then
  code=upper(trim(coalesce(new.metadata->>'portal_code','')));
  if code !~ '^[A-Z0-9_-]{1,24}$' then raise exception 'Código do portal: 1 a 24 letras, números, hífen ou sublinhado.'; end if;
  perform 1 from public.campaigns where id=m.campaign_id for update;
  if (select count(*) from public.battle_map_objects o join public.battle_maps bm on bm.id=o.map_id where bm.campaign_id=m.campaign_id and bm.adventure_session_id=m.adventure_session_id and o.object_type='portal' and upper(trim(o.metadata->>'portal_code'))=code and o.id<>new.id)>=2 then raise exception 'Este código já liga dois portais. Use outro código.'; end if;
  if exists(select 1 from public.battle_map_objects o where o.map_id=m.id and o.object_type='portal' and o.id<>new.id and upper(trim(o.metadata->>'portal_code'))=code and (o.geometry->>'x')::integer<x+w and (o.geometry->>'x')::integer+(o.geometry->>'width')::integer>x and (o.geometry->>'y')::integer<y+h and (o.geometry->>'y')::integer+(o.geometry->>'height')::integer>y) then raise exception 'As duas pontas do portal precisam ocupar áreas diferentes.'; end if;
  new.metadata=jsonb_set(new.metadata,'{portal_code}',to_jsonb(code));
  new.metadata=jsonb_set(new.metadata,'{movement_cost}','1');
  new.blocks_movement=false; new.blocks_vision=false;
 end if;
 cost=coalesce((new.metadata->>'movement_cost')::numeric,1);
 if cost not between 1 and 10 then raise exception 'Custo de movimento inválido (1 a 10).'; end if;
 if new.blocks_movement and exists(select 1 from public.battle_map_tokens t where t.map_id=m.id and t.z=0 and t.x<(new.geometry->>'x')::integer+(new.geometry->>'width')::integer and t.x+t.size>(new.geometry->>'x')::integer and t.y<(new.geometry->>'y')::integer+(new.geometry->>'height')::integer and t.y+t.size>(new.geometry->>'y')::integer) then raise exception 'O objeto bloqueia um personagem. Escolha outra posição.'; end if;
 if tg_op='INSERT' and (select count(*) from public.battle_map_objects where map_id=m.id)>=1200 then raise exception 'Limite de 1200 objetos neste mapa.'; end if;
 update public.battle_maps set updated_at=now() where id=m.id;
 return new;
end $$;
create or replace function private.dnd_inventory_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare definition jsonb; amount numeric; charges integer;cid uuid;prior public.character_inventory;runtime jsonb;master boolean;
begin
 select campaign_id into cid from public.characters where id=new.character_id;
 master=private.is_campaign_owner(cid);
 select * into prior from public.character_inventory where id=new.id;
 if prior.id is not null and prior.character_id<>new.character_id then raise exception 'O vínculo do item não pode ser alterado.' using errcode='42501';end if;
 if nullif(new.data->>'campaign_item_id','') is not null then
  select data into definition from private.campaign_item_versions where item_id=(new.data->>'campaign_item_id')::uuid and version=(new.data->>'definition_version')::integer and campaign_id=cid;
  if definition is null then raise exception 'Versão de item da campanha inválida.';end if;
  if not master and not private.scenery_inventory_allowed(new) then
   if prior.id is null or prior.data->>'campaign_item_id' is distinct from new.data->>'campaign_item_id' or prior.data->>'definition_version' is distinct from new.data->>'definition_version' then raise exception 'Receba os itens da campanha por uma entrega do mestre.' using errcode='42501';end if;
   if (new.data->>'quantity')::numeric>(prior.data->>'quantity')::numeric or coalesce((new.data->>'charges_used')::numeric,0)<coalesce((prior.data->>'charges_used')::numeric,0) then raise exception 'Somente o mestre pode aumentar a quantidade ou restaurar cargas deste item.' using errcode='42501';end if;
  end if;
  if jsonb_typeof(new.data->'quantity') is distinct from 'number' or jsonb_typeof(new.data->'equipped') is distinct from 'boolean' or jsonb_typeof(new.data->'attuned') is distinct from 'boolean' then raise exception 'Quantidade, equipamento ou sintonização inválidos.';end if;
  select jsonb_object_agg(k,v) into runtime from jsonb_each(new.data) e(k,v) where k=any(array['campaign_item_id','definition_version','quantity','equipped','attuned','charges_used','notes']);
  new.data=definition||runtime;
 else
  if prior.id is not null and nullif(prior.data->>'campaign_item_id','') is not null and not master then raise exception 'A origem deste item só pode ser alterada pelo mestre.' using errcode='42501';end if;
  if new.data ?| array['functions','bonuses'] then raise exception 'Crie as funções e os bônus pelo catálogo de itens da campanha.';end if;
 end if;
 if nullif(new.data->>'campaign_item_id','') is null and coalesce(new.data->>'catalog_id','')<>'' then select data into definition from public.dnd_items where id=new.data->>'catalog_id';
  if definition is null then raise exception 'Referência de item não encontrada no catálogo.';end if;
 elsif nullif(new.data->>'campaign_item_id','') is null then select data into definition from public.dnd_items where name=new.data->>'name';end if;
 if definition is not null and nullif(new.data->>'campaign_item_id','') is null then new.data=(definition-array['use','quantity','weight','cost_gp','notes','equipped'])||new.data||jsonb_build_object('catalog_id',definition->>'catalog_id','category',definition->>'category');end if;
 amount=coalesce((new.data->>'quantity')::numeric,0);
 if amount<>floor(amount) or amount<0 or coalesce((new.data->>'weight')::numeric,0)<0 or coalesce(new.data->>'category','') not in('weapon','armor','gear','item','potion','ammunition','tool','focus','consumable','container','treasure','magic') then raise exception 'Confira o tipo, a quantidade e o peso do item.';end if;
 if amount=0 then new.data=new.data||'{"equipped":false}'::jsonb;end if;
 if coalesce(new.data->>'weapon_proficiency','auto') not in('auto','proficient','untrained') or abs(coalesce((new.data->>'weapon_attack_bonus')::numeric,0))>20 or coalesce((new.data->>'weapon_attack_bonus')::numeric,0)<>floor(coalesce((new.data->>'weapon_attack_bonus')::numeric,0)) then raise exception 'Confira a proficiência e o bônus de ataque da arma.';end if;
 charges=coalesce((definition->>'charges')::integer,0);
 if new.data ? 'charges_used' and (coalesce((new.data->>'charges_used')::numeric,-1)<0 or (new.data->>'charges_used')::numeric<>floor((new.data->>'charges_used')::numeric) or (new.data->>'charges_used')::numeric>charges) then raise exception 'Usos do item acima do limite.';end if;
 return new;
end $$;
create or replace function private.battle_scenery_state_update(p_old public.battle_map_objects,p_new public.battle_map_objects)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(
 (to_jsonb(p_old)-array['metadata','blocks_movement','blocks_vision','updated_at'])=(to_jsonb(p_new)-array['metadata','blocks_movement','blocks_vision','updated_at']) and
 (p_old.metadata-array['variant','light_enabled'])=(p_new.metadata-array['variant','light_enabled']) and
 case when p_old.object_type in('torch','campfire','forge','lanternpost','candelabra','fireplace','beacon') then
 coalesce(p_old.metadata->>'variant','default')=coalesce(p_new.metadata->>'variant','default') and coalesce((p_old.metadata->>'light_enabled')::boolean,true) is distinct from (p_new.metadata->>'light_enabled')::boolean
 else coalesce(p_old.metadata->'light_enabled','null')=coalesce(p_new.metadata->'light_enabled','null') and
 case p_old.object_type
 when 'door' then case coalesce(p_old.metadata->>'variant','default') when 'default' then p_new.metadata->>'variant'='open' when 'open' then p_new.metadata->>'variant'='default' when 'iron' then p_new.metadata->>'variant'='iron-open' when 'iron-open' then p_new.metadata->>'variant'='iron' else false end
 when 'lever' then (coalesce(p_old.metadata->>'variant','default')='default' and p_new.metadata->>'variant'='activated') or (p_old.metadata->>'variant'='activated' and p_new.metadata->>'variant'='default')
 when 'pressureplate' then (coalesce(p_old.metadata->>'variant','default')='default' and p_new.metadata->>'variant'='activated') or (p_old.metadata->>'variant'='activated' and p_new.metadata->>'variant'='default')
 when 'gong' then (coalesce(p_old.metadata->>'variant','default')='default' and p_new.metadata->>'variant'='activated') or (p_old.metadata->>'variant'='activated' and p_new.metadata->>'variant'='default')
 when 'trap' then (coalesce(p_old.metadata->>'variant','default') in('default','runes') and p_new.metadata->>'variant'='disarmed') or (p_old.metadata->>'variant'='disarmed' and p_new.metadata->>'variant'='default')
 when 'magiccircle' then (coalesce(p_old.metadata->>'variant','default') in('default','summoning') and p_new.metadata->>'variant'='spent') or (p_old.metadata->>'variant'='spent' and p_new.metadata->>'variant'='default')
 else p_old.object_type in('chest','sarcophagus','cage','portcullis','secretwall','supplycrate') and ((coalesce(p_old.metadata->>'variant','default')='default' and p_new.metadata->>'variant'='open') or (p_old.metadata->>'variant'='open' and p_new.metadata->>'variant'='default')) end end and
 case when p_old.object_type in('door','portcullis','cage','secretwall') then p_new.blocks_movement=(p_new.metadata->>'variant' not in('open','iron-open')) and p_new.blocks_vision=(p_old.object_type in('door','secretwall') and p_new.blocks_movement)
 else p_new.blocks_movement=p_old.blocks_movement and p_new.blocks_vision=p_old.blocks_vision end,false);
$$;
create or replace function public.set_battle_scenery_state(p_object_id uuid,p_variant text,p_expected_updated_at timestamptz)
returns public.battle_map_objects language plpgsql security definer set search_path='' as $$
declare o public.battle_map_objects;changed public.battle_map_objects;cid uuid;sid uuid;s public.scenery_interaction_settings;
begin
 select m.campaign_id,m.adventure_session_id into cid,sid from public.battle_map_objects x join public.battle_maps m on m.id=x.map_id where x.id=p_object_id;
 if cid is null or not private.is_campaign_owner(cid) then raise exception 'Somente o mestre pode interagir com o cenário.' using errcode='42501';end if;
 perform 1 from public.campaigns where id=cid for update;
 perform 1 from public.campaign_sessions where id=sid for share;
 if exists(select 1 from public.campaign_sessions where id=sid and status='ended') then raise exception 'A sessão está encerrada e seu histórico é somente para consulta.';end if;
 perform 1 from public.battle_sessions where campaign_id=cid order by id for update;
 select * into o from public.battle_map_objects where id=p_object_id for update;
 if o.id is null or p_expected_updated_at is null or o.updated_at is distinct from p_expected_updated_at then raise exception 'Este elemento mudou. Atualize a mesa antes de interagir.' using errcode='40001';end if;
 changed=o;select * into s from public.scenery_interaction_settings where object_id=o.id for update;
 if p_variant in('lock','unlock') then
  if not coalesce(s.requires_key,false) then raise exception 'Configure uma chave antes de trancar este elemento.';end if;
  update public.scenery_interaction_settings set locked=p_variant='lock',updated_at=clock_timestamp() where object_id=o.id;
  changed.metadata=changed.metadata||jsonb_build_object('interaction_locked',p_variant='lock');
  if p_variant='lock' then
   changed.metadata=jsonb_set(changed.metadata,'{variant}',to_jsonb(case when coalesce(o.metadata->>'variant','default') like 'iron%' then 'iron' else 'default' end));
   if o.object_type in('door','portcullis','cage','secretwall') then changed.blocks_movement=true;changed.blocks_vision=o.object_type in('door','secretwall');end if;
  end if;
 elsif p_variant in('light-on','light-off') then
  if o.object_type not in('torch','campfire','forge','lanternpost','candelabra','fireplace','beacon') then raise exception 'Esta interação não está disponível para o elemento.';end if;
  changed.metadata=changed.metadata||jsonb_build_object('light_enabled',p_variant='light-on');
 else
  changed.metadata=jsonb_set(changed.metadata,'{variant}',to_jsonb(coalesce(p_variant,'')));
  if o.object_type in('door','portcullis','cage','secretwall') then changed.blocks_movement=p_variant not in('open','iron-open');changed.blocks_vision=o.object_type in('door','secretwall') and changed.blocks_movement;end if;
  if not private.battle_scenery_state_update(o,changed) then raise exception 'Esta interação não está disponível para o elemento.';end if;
  if p_variant in('open','iron-open') and s.locked then
   update public.scenery_interaction_settings set locked=false,updated_at=clock_timestamp() where object_id=o.id;
   changed.metadata=changed.metadata||'{"interaction_locked":false}'::jsonb;
  end if;
 end if;
 perform private.scenery_authorize(changed);
 update public.battle_map_objects set metadata=changed.metadata,blocks_movement=changed.blocks_movement,blocks_vision=changed.blocks_vision where id=o.id returning * into changed;
 perform private.scenery_clear_permit(o.id);return changed;
end $$;
create or replace function private.scenery_emission_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.metadata ? 'light_intensity' and (jsonb_typeof(new.metadata->'light_intensity') is distinct from 'number' or (new.metadata->>'light_intensity')::numeric not between .2 and 3) then raise exception 'Intensidade da luz: use 0,2 a 3.';end if;
 if new.metadata ? 'light_color' and (jsonb_typeof(new.metadata->'light_color') is distinct from 'string' or new.metadata->>'light_color' !~ '^#[0-9a-fA-F]{6}$') then raise exception 'Cor da luz inválida: use #RRGGBB.';end if;
 return new;
end $$;
drop trigger if exists e_scenery_emission_guard on public.battle_map_objects;
create trigger e_scenery_emission_guard before insert or update on public.battle_map_objects for each row execute function private.scenery_emission_guard();
-- A copied map keeps the same matching key and the current treasure state. The
-- master can explicitly refill it, so copying cannot silently duplicate rewards.
create or replace function private.copy_scenery_settings() returns trigger language plpgsql security definer set search_path='' as $$
declare source uuid;s public.scenery_interaction_settings;cid uuid;
begin
 if coalesce(new.metadata->>'interaction_source','') !~ '^[0-9a-fA-F-]{36}$' then return new;end if;
 source=(new.metadata->>'interaction_source')::uuid;if source=new.id then return new;end if;
 cid=private.battle_map_campaign(new.map_id);
 select * into s from public.scenery_interaction_settings where object_id=source and campaign_id=cid;
 if s.object_id is null then return new;end if;
 insert into public.scenery_interaction_settings(object_id,campaign_id,requires_key,locked,key_item_id,loot_item_id,loot_version,quantity,taken)
 values(new.id,cid,s.requires_key,s.locked,s.key_item_id,s.loot_item_id,s.loot_version,s.quantity,s.taken) on conflict(object_id) do nothing;
 update public.battle_map_objects set metadata=jsonb_set(metadata,'{interaction_source}',to_jsonb(new.id)) where id=new.id;
 return new;
end $$;
drop trigger if exists scenery_copy_settings on public.battle_map_objects;
create trigger scenery_copy_settings after insert on public.battle_map_objects for each row execute function private.copy_scenery_settings();
revoke all on function private.scenery_emission_guard(),private.copy_scenery_settings() from public,anon,authenticated;

-- All native elements respect concealed cells, including small containers.
drop policy if exists battle_objects_read on public.battle_map_objects;
create policy battle_objects_read on public.battle_map_objects for select to authenticated using(private.can_read_battle_map(map_id) and
 (private.is_campaign_owner(private.battle_map_campaign(map_id)) or visible and case when private.battle_is_scenery_kind(object_type) then not private.battle_area_hidden(map_id,(geometry->>'x')::numeric,(geometry->>'y')::numeric,(geometry->>'width')::numeric,(geometry->>'height')::numeric) else true end));

commit;

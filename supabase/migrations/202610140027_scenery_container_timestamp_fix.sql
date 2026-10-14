-- 027: accept new container payloads without casting client-owned timestamp placeholders.
-- Requires 026. Safe to reapply; existing items, keys and rewards are preserved.
begin;

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

-- Keep the same RPC signature, default argument and authenticated access.
revoke all on function public.save_scenery_element(jsonb,jsonb,timestamptz) from public,anon;
grant execute on function public.save_scenery_element(jsonb,jsonb,timestamptz) to authenticated;
notify pgrst, 'reload schema';
commit;

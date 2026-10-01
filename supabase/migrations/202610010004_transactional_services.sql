-- Exact-email member resolution is the only intentional SECURITY DEFINER RPC.
-- The caller is verified as the campaign owner BEFORE any account lookup.
create function public.add_campaign_member_by_email(p_campaign_id uuid,p_email text)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; result uuid;
begin
  if auth.uid() is null or not private.is_campaign_owner(p_campaign_id) then
    raise exception 'Apenas o mestre desta campanha pode adicionar jogadores.' using errcode='42501';
  end if;
  select id into target from public.profiles where lower(email)=lower(trim(p_email));
  if target is null then raise exception 'Este usuário ainda não possui uma conta.'; end if;
  if target=auth.uid() then raise exception 'Você já é o mestre desta campanha.'; end if;
  if exists(select 1 from public.campaign_members where campaign_id=p_campaign_id and user_id=target) then
    raise exception 'Este jogador já está na campanha.';
  end if;
  insert into public.campaign_members(campaign_id,user_id) values(p_campaign_id,target) returning id into result;
  return result;
exception when unique_violation then raise exception 'Este jogador já está na campanha.';
end $$;

-- Character writes are atomic and use the CALLER's RLS privileges.
create function public.save_character(p_payload jsonb,p_expected_updated_at timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cid uuid=(p_payload->>'id')::uuid; s jsonb=p_payload->'sheet'; old_row public.characters;
  saved public.characters; system_slug text; attribute text; entry jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  select * into old_row from public.characters where id=cid for update;
  if old_row.id is not null and p_expected_updated_at is not null and old_row.updated_at<>p_expected_updated_at then
    raise exception 'Esta ficha foi atualizada em outra sessão. Feche e reabra antes de salvar.';
  end if;
  if old_row.id is not null and (old_row.owner_id<>(p_payload->>'owner_id')::uuid or old_row.campaign_id<>(p_payload->>'campaign_id')::uuid or old_row.rpg_system_id<>(p_payload->>'rpg_system_id')::uuid) then
    raise exception 'O vínculo do personagem não pode ser alterado.' using errcode='42501';
  end if;
  if jsonb_typeof(s) is distinct from 'object' then raise exception 'A ficha é inválida.'; end if;
  select slug into system_slug from public.rpg_systems where id=(p_payload->>'rpg_system_id')::uuid;
  if system_slug='dnd5e' then
    if coalesce((s->>'level')::integer,0) not between 1 and 20 then raise exception 'O nível deve estar entre 1 e 20.'; end if;
    foreach attribute in array array['str','dex','con','int','wis','cha'] loop
      if coalesce((s->'abilities'->>attribute)::integer,0) not between 1 and 30 then raise exception 'Os atributos devem estar entre 1 e 30.'; end if;
    end loop;
    if coalesce((s->>'hp_current')::integer,-1)<0 or coalesce((s->>'hp_temp')::integer,-1)<0 or coalesce((s->>'xp')::bigint,-1)<0 then raise exception 'PV e experiência não podem ser negativos.'; end if;
    if s->>'hp_max_override' is not null and (s->>'hp_max_override')::integer<1 then raise exception 'O máximo de PV deve ser positivo.'; end if;
  end if;
  if jsonb_typeof(s->'inventory') is distinct from 'array' or jsonb_typeof(s->'spells') is distinct from 'array' or jsonb_typeof(s->'abilities') is distinct from 'object' or jsonb_typeof(s->'skills') is distinct from 'object' then raise exception 'Os registros da ficha são inválidos.'; end if;
  insert into public.characters(id,campaign_id,rpg_system_id,owner_id,name,portrait_path,appearance,biography,system_data)
  values(cid,(p_payload->>'campaign_id')::uuid,(p_payload->>'rpg_system_id')::uuid,(p_payload->>'owner_id')::uuid,trim(p_payload->>'name'),p_payload->>'portrait_path',coalesce(p_payload->>'appearance',''),coalesce(p_payload->>'biography',''),s-array['abilities','skills','inventory','spells'])
  on conflict(id) do update set name=excluded.name,portrait_path=excluded.portrait_path,appearance=excluded.appearance,biography=excluded.biography,system_data=excluded.system_data
  returning * into saved;
  delete from public.character_attributes where character_id=cid;
  insert into public.character_attributes(character_id,ability,score) select cid,key,value::integer from jsonb_each_text(s->'abilities');
  delete from public.character_skills where character_id=cid;
  insert into public.character_skills(character_id,skill,proficiency) select cid,key,value::smallint from jsonb_each_text(s->'skills');
  delete from public.character_inventory where character_id=cid;
  for entry in select value from jsonb_array_elements(s->'inventory') loop
    if length(trim(entry->>'name'))=0 or coalesce((entry->>'quantity')::integer,0)<1 or coalesce((entry->>'weight')::numeric,-1)<0 then raise exception 'Confira a quantidade e o peso dos itens.'; end if;
    insert into public.character_inventory(id,character_id,data) values((entry->>'id')::uuid,cid,entry-'id');
  end loop;
  delete from public.character_spells where character_id=cid;
  for entry in select value from jsonb_array_elements(s->'spells') loop
    if coalesce(length(trim(entry->>'name')),0)=0 or coalesce((entry->>'level')::integer,-1) not between 0 and 9 then raise exception 'Confira o nome e o nível das magias.'; end if;
    insert into public.character_spells(id,character_id,data) values((entry->>'id')::uuid,cid,entry-'id');
  end loop;
  return jsonb_build_object('id',saved.id,'updated_at',saved.updated_at);
end $$;

create function public.save_world_entry(p_payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare kind text=p_payload->>'kind'; tab text; cid uuid=(p_payload->>'campaign_id')::uuid;
  eid uuid=(p_payload->>'id')::uuid; existing_campaign uuid;
begin
  if auth.uid() is null or not private.is_campaign_owner(cid) then raise exception 'Apenas o mestre desta campanha pode construir o mundo.' using errcode='42501'; end if;
  case kind when 'region' then tab='world_regions'; when 'city' then tab='world_cities'; when 'location' then tab='world_locations'; else raise exception 'Tipo de lugar inválido.'; end case;
  execute format('select campaign_id from public.%I where id=$1 for update',tab) into existing_campaign using eid;
  if existing_campaign is not null and existing_campaign<>cid then raise exception 'O lugar pertence a outra campanha.' using errcode='42501'; end if;
  execute format('insert into public.%I(id,campaign_id,name,description,image_path,type,location,notes,visible_to_players)
    values(($1->>''id'')::uuid,($1->>''campaign_id'')::uuid,trim($1->>''name''),coalesce($1->>''description'',''''),$1->>''image_path'',coalesce($1->>''type'',''''),coalesce($1->>''location'',''''),coalesce($1->>''notes'',''''),coalesce(($1->>''visible_to_players'')::boolean,false))
    on conflict(id) do update set name=excluded.name,description=excluded.description,image_path=excluded.image_path,type=excluded.type,location=excluded.location,notes=excluded.notes,visible_to_players=excluded.visible_to_players',tab) using p_payload;
  if kind='city' then
    update public.world_cities set region_id=(p_payload->>'region_id')::uuid,population=(p_payload->>'population')::bigint,government=coalesce(p_payload->>'government','') where id=eid;
  elsif kind='location' then
    update public.world_locations set region_id=(p_payload->>'region_id')::uuid where id=eid;
  end if;
  execute format('insert into public.%I(entry_id,secrets,private_notes) values($1,$2,$3) on conflict(entry_id) do update set secrets=excluded.secrets,private_notes=excluded.private_notes',tab||'_private')
    using eid,coalesce(p_payload->>'secrets',''),coalesce(p_payload->>'private_notes','');
  return eid;
end $$;

create function public.save_npc(p_payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare nid uuid=(p_payload->>'id')::uuid; cid uuid=(p_payload->>'campaign_id')::uuid;
  old_row public.npcs; entry jsonb; attribute text;
begin
  if auth.uid() is null or not private.is_campaign_owner(cid) then raise exception 'Apenas o mestre desta campanha pode alterar NPCs.' using errcode='42501'; end if;
  select * into old_row from public.npcs where id=nid for update;
  if old_row.id is not null and (old_row.campaign_id<>cid or old_row.rpg_system_id<>(p_payload->>'rpg_system_id')::uuid) then raise exception 'O vínculo do NPC não pode ser alterado.' using errcode='42501'; end if;
  foreach attribute in array array['str','dex','con','int','wis','cha'] loop
    if coalesce((p_payload->'abilities'->>attribute)::integer,0) not between 1 and 30 then raise exception 'Os atributos devem estar entre 1 e 30.'; end if;
  end loop;
  insert into public.npcs(id,campaign_id,rpg_system_id,name,image_path,race,type,level,age,appearance,personality,biography,location,faction,relationship,status,visible_to_players)
  values(nid,cid,(p_payload->>'rpg_system_id')::uuid,trim(p_payload->>'name'),p_payload->>'image_path',coalesce(p_payload->>'race',''),coalesce(p_payload->>'type',''),(p_payload->>'level')::integer,coalesce(p_payload->>'age',''),coalesce(p_payload->>'appearance',''),coalesce(p_payload->>'personality',''),coalesce(p_payload->>'biography',''),coalesce(p_payload->>'location',''),coalesce(p_payload->>'faction',''),coalesce(p_payload->>'relationship','Neutra'),coalesce(p_payload->>'status','Vivo'),coalesce((p_payload->>'visible_to_players')::boolean,false))
  on conflict(id) do update set name=excluded.name,image_path=excluded.image_path,race=excluded.race,type=excluded.type,level=excluded.level,age=excluded.age,appearance=excluded.appearance,personality=excluded.personality,biography=excluded.biography,location=excluded.location,faction=excluded.faction,relationship=excluded.relationship,status=excluded.status,visible_to_players=excluded.visible_to_players;
  insert into public.npc_stats(npc_id,abilities,hp_current,hp_max,ac,abilities_text,resistances,weaknesses,inventory)
  values(nid,p_payload->'abilities',(p_payload->>'hp_current')::integer,(p_payload->>'hp_max')::integer,(p_payload->>'ac')::integer,coalesce(p_payload->>'abilities_text',''),coalesce(p_payload->>'resistances',''),coalesce(p_payload->>'weaknesses',''),coalesce(p_payload->>'inventory',''))
  on conflict(npc_id) do update set abilities=excluded.abilities,hp_current=excluded.hp_current,hp_max=excluded.hp_max,ac=excluded.ac,abilities_text=excluded.abilities_text,resistances=excluded.resistances,weaknesses=excluded.weaknesses,inventory=excluded.inventory;
  delete from public.npc_attacks where npc_id=nid;
  for entry in select value from jsonb_array_elements(p_payload->'attacks') loop
    if coalesce(length(trim(entry->>'name')),0)=0 then raise exception 'Dê um nome a cada ataque.'; end if;
    insert into public.npc_attacks(id,npc_id,data) values((entry->>'id')::uuid,nid,entry-'id');
  end loop;
  delete from public.npc_spells where npc_id=nid;
  for entry in select value from jsonb_array_elements(p_payload->'spells') loop
    if coalesce(length(trim(entry->>'name')),0)=0 or coalesce((entry->>'level')::integer,-1) not between 0 and 9 then raise exception 'Confira o nome e o nível das magias.'; end if;
    insert into public.npc_spells(id,npc_id,data) values((entry->>'id')::uuid,nid,entry-'id');
  end loop;
  return nid;
end $$;

revoke all on function public.add_campaign_member_by_email(uuid,text),public.save_character(jsonb,timestamptz),public.save_world_entry(jsonb),public.save_npc(jsonb) from public,anon;
grant execute on function public.add_campaign_member_by_email(uuid,text),public.save_character(jsonb,timestamptz),public.save_world_entry(jsonb),public.save_npc(jsonb) to authenticated;

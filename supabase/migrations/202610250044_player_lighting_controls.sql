-- Atomic GM lighting settings; uses the existing map vision fields.
begin;
create or replace function public.configure_battle_map_vision(p_map_id uuid,p_enabled boolean,p_lighting text,p_darkness text)
returns public.battle_maps language plpgsql security definer set search_path='' as $$
declare m public.battle_maps;
begin
  select * into m from public.battle_maps where id=p_map_id for update;
  if m.id is null or not private.is_campaign_owner(m.campaign_id) then
    raise exception 'Somente o mestre pode alterar a visão do grid.' using errcode='42501';
  end if;
  if p_enabled is null or p_lighting is null or p_lighting not in ('day','night')
    or p_darkness is null or p_darkness not in ('none','dim','dark','magical') then
    raise exception 'Escolha um período e uma iluminação válidos.' using errcode='22023';
  end if;
  if exists(select 1 from public.campaign_sessions where id=m.adventure_session_id and status='ended') then
    raise exception 'A iluminação de um capítulo encerrado não pode mudar.' using errcode='42501';
  end if;
  update public.battle_maps set vision_enabled=p_enabled,lighting=p_lighting,
    darkness_level=case when p_lighting='night' then p_darkness else darkness_level end,
    day_darkness_level=case when p_lighting='day' then p_darkness else day_darkness_level end,
    updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
    where id=p_map_id returning * into m;
  return m;
end $$;
-- A sense with zero range never reveals even the observer's ground cell.
create or replace function private.battle43_can_see(a public.battle_map_tokens,t public.battle_map_tokens,m public.battle_maps) returns boolean language plpgsql stable security definer set search_path='' as $$
declare s jsonb=private.battle_sheet(a.id);senses jsonb=private.battle43_senses(a);d numeric=sqrt(power((a.x+a.size/2)-(t.x+t.size/2),2)+power((a.y+a.size/2)-(t.y+t.size/2),2))*m.scale_per_cell*case when m.scale_unit='ft' then .3 else 1 end;level integer;blind boolean;invisible boolean;
begin
 if a.map_id<>t.map_id or (s->>'hp_current')::integer<=0 or s->'conditions' ?| array['Inconsciente','Morto','Dead'] then return false;end if;
 blind=coalesce((senses->>'blindsight')::numeric,0)>0 and d<=coalesce((senses->>'blindsight')::numeric,0);
 if (s->'conditions' ? 'Cego' or coalesce((senses->>'blindBeyond')::boolean,false)) and not blind then return false;end if;
 if exists(select 1 from public.battle_map_fog where map_id=m.id and x=floor(t.x+t.size/2) and y=floor(t.y+t.size/2)) then return false;end if;
 if not private.battle43_ray(m,floor(a.x+a.size/2)::integer,floor(a.y+a.size/2)::integer,floor(t.x+t.size/2)::integer,floor(t.y+t.size/2)::integer,senses) then return false;end if;
 level=private.battle43_illumination(m,floor(t.x+t.size/2)::integer,floor(t.y+t.size/2)::integer);
 if not blind and (level=4 or level=3 and (greatest((senses->>'devilSight')::numeric,(senses->>'trueSight')::numeric)<=0 or d>greatest((senses->>'devilSight')::numeric,(senses->>'trueSight')::numeric)) or level=2 and (greatest((senses->>'darkvision')::numeric,(senses->>'devilSight')::numeric,(senses->>'trueSight')::numeric)<=0 or d>greatest((senses->>'darkvision')::numeric,(senses->>'devilSight')::numeric,(senses->>'trueSight')::numeric))) then return false;end if;
 invisible=coalesce(private.battle_sheet(t.id)->'conditions','[]') ? 'Invisível' and not exists(select 1 from public.battle_spell_effects e where e.map_id=m.id and active and definition->'entry'->>'catalog_id'='fogo-das-fadas' and definition->'light_targets' ? t.id::text);
 if invisible and not blind and not coalesce((senses->>'seeInvisible')::boolean,false) and (coalesce((senses->>'trueSight')::numeric,0)<=0 or d>(senses->>'trueSight')::numeric) then return false;end if;return true;
end $$;
revoke all on function private.battle43_can_see(public.battle_map_tokens,public.battle_map_tokens,public.battle_maps) from public,anon,authenticated;
revoke all on function public.configure_battle_map_vision(uuid,boolean,text,text) from public,anon;
grant execute on function public.configure_battle_map_vision(uuid,boolean,text,text) to authenticated;
notify pgrst,'reload schema';
commit;

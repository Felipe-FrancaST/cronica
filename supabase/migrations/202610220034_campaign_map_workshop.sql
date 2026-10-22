-- Private cartography workshop. Existing game maps, subscriptions and migrations are preserved.
begin;
create or replace function private.atlas_number(v jsonb,low_value numeric,high_value numeric,whole boolean default false)
returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)='number' then (v#>>'{}')::numeric between low_value and high_value
   and (not whole or trunc((v#>>'{}')::numeric)=(v#>>'{}')::numeric) else false end;
$$;
create or replace function private.atlas_color(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and (v#>>'{}') ~ '^#[0-9a-fA-F]{6}$',false);
$$;
create or replace function private.validate_atlas_document(d jsonb) returns void language plpgsql immutable set search_path='' as $$
declare
 required_keys text[] := array['schema','title','notes','template','seed','width','height','theme','palette','terrain','elevation','baseTerrain','layers','objects','grid','gridColor','gridOpacity','relief','compass','scaleBar','unit','distancePerCell'];
 base_keys text[] := array['id','kind','name','x','y','rotation','opacity','visible','locked'];
 extra_keys text[];
 k text;
 v jsonb;
 o jsonb;
 p jsonb;
 n integer;
 point_count integer:=0;
begin
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>2000000 then raise exception 'Documento de mapa inválido ou maior que 2 MB.';end if;
 if not d ?& required_keys or d-required_keys<>'{}'::jsonb then raise exception 'Estrutura de mapa inválida.';end if;
 if d->'schema'<>'1'::jsonb then raise exception 'Versão de mapa incompatível.';end if;
 foreach k in array array['title','notes','template','seed','theme','grid','unit'] loop
  if jsonb_typeof(d->k)<>'string' then raise exception 'Campo de mapa inválido: %.',k;end if;
 end loop;
 if length(trim(d->>'title')) not between 1 and 120 or length(d->>'notes')>12000 or length(d->>'seed')>80 then raise exception 'Nome ou notas do mapa inválidos.';end if;
 if d->>'template' not in ('blank','island','archipelago','continent','valley','city','dungeon','desert')
  or d->>'theme' not in ('parchment','natural','night','blueprint') or d->>'grid' not in ('none','square','hex') or d->>'unit' not in ('km','m','mi') then raise exception 'Opção de mapa inválida.';end if;
 if not private.atlas_number(d->'width',320,4096,true) or not private.atlas_number(d->'height',320,4096,true)
  or not private.atlas_number(d->'baseTerrain',0,21,true) or not private.atlas_number(d->'distancePerCell',0.01,10000)
  or not private.atlas_number(d->'gridOpacity',0,0.8) or not private.atlas_color(d->'gridColor') then raise exception 'Tamanho, escala ou cor de mapa inválidos.';end if;
 foreach k in array array['relief','compass','scaleBar'] loop if jsonb_typeof(d->k)<>'boolean' then raise exception 'Preferência de mapa inválida.';end if;end loop;
 foreach k in array array['palette','terrain','elevation','layers','objects'] loop if jsonb_typeof(d->k)<>'array' then raise exception 'Coleção de mapa inválida: %.',k;end if;end loop;
 n=ceil((d->>'width')::numeric/16)::integer*ceil((d->>'height')::numeric/16)::integer;
 if jsonb_array_length(d->'palette')<>22 or exists(select 1 from jsonb_array_elements(d->'palette') a where not private.atlas_color(a)) then raise exception 'Paleta de mapa inválida.';end if;
 if jsonb_array_length(d->'terrain')<>n or jsonb_array_length(d->'elevation')<>n then raise exception 'A malha de terreno não corresponde ao tamanho do mapa.';end if;
 if exists(select 1 from jsonb_array_elements(d->'terrain') a where not private.atlas_number(a,0,21,true))
  or exists(select 1 from jsonb_array_elements(d->'elevation') a where not private.atlas_number(a,0,5,true)) then raise exception 'Dados de terreno ou relevo inválidos.';end if;
 if jsonb_array_length(d->'layers')<>6 then raise exception 'Camadas de mapa inválidas.';end if;
 if (select count(distinct a->>'id') from jsonb_array_elements(d->'layers') a)<>6 then raise exception 'Camadas repetidas no mapa.';end if;
 for v in select * from jsonb_array_elements(d->'layers') loop
  if jsonb_typeof(v)<>'object' or not v ?& array['id','visible','locked','opacity'] or v-array['id','visible','locked','opacity']<>'{}'::jsonb
   or coalesce(v->>'id','') not in ('terrain','regions','routes','symbols','tokens','labels') or jsonb_typeof(v->'visible')<>'boolean' or jsonb_typeof(v->'locked')<>'boolean' or not private.atlas_number(v->'opacity',0,1) then raise exception 'Camada de mapa inválida.';end if;
 end loop;
 if jsonb_array_length(d->'objects')>1800 then raise exception 'Limite de 1.800 elementos por mapa.';end if;
 if (select count(distinct a->>'id') from jsonb_array_elements(d->'objects') a)<>jsonb_array_length(d->'objects') then raise exception 'Elementos repetidos no mapa.';end if;
 for o in select * from jsonb_array_elements(d->'objects') loop
  if jsonb_typeof(o)<>'object' or not o ?& base_keys then raise exception 'Elemento de mapa inválido.';end if;
  if jsonb_typeof(o->'id')<>'string' or (o->>'id') !~ '^[a-zA-Z0-9_-]{1,80}$' or jsonb_typeof(o->'name')<>'string' or length(o->>'name')>120
   or not private.atlas_number(o->'x',0,(d->>'width')::numeric) or not private.atlas_number(o->'y',0,(d->>'height')::numeric)
   or not private.atlas_number(o->'rotation',-360,360) or not private.atlas_number(o->'opacity',0,1)
   or jsonb_typeof(o->'visible')<>'boolean' or jsonb_typeof(o->'locked')<>'boolean' then raise exception 'Posição ou propriedade de elemento inválida.';end if;
  case o->>'kind'
   when 'symbol' then
    extra_keys=array['symbol','size','color'];
    if coalesce(o->>'symbol','') not in ('mountain','snowpeak','ridge','volcano','hill','rock','pine','tree','forest','palm','dead-tree','crystal','cactus','city','village','castle','tower','temple','ruin','harbor','lighthouse','house','windmill','farm','bridge','gate','wall','well','fountain','camp','cave','mine','dungeon','graveyard','shrine','obelisk','portal','ship','wreck','chest','skull','flag','fire','door','stairs','trap','altar')
     or not private.atlas_number(o->'size',8,512) or not private.atlas_color(o->'color') then raise exception 'Símbolo de mapa inválido.';end if;
   when 'token' then
    extra_keys=array['icon','size','color','faction','number'];
    if coalesce(o->>'icon','') not in ('warrior','mage','rogue','cleric','ranger','druid','beast','dragon','goblin','undead','boss','party')
     or coalesce(o->>'faction','') not in ('neutral','ally','enemy') or not private.atlas_number(o->'size',16,256)
     or not private.atlas_number(o->'number',0,999,true) or not private.atlas_color(o->'color') then raise exception 'Token de mapa inválido.';end if;
   when 'label' then
    extra_keys=array['text','fontSize','color','font','italic'];
    if jsonb_typeof(o->'text')<>'string' or length(o->>'text') not between 1 and 300 or not private.atlas_number(o->'fontSize',8,144)
     or coalesce(o->>'font','') not in ('serif','sans') or jsonb_typeof(o->'italic')<>'boolean' or not private.atlas_color(o->'color') then raise exception 'Texto de mapa inválido.';end if;
   when 'route' then
    extra_keys=array['points','color','width','style','curved'];
    if coalesce(o->>'style','') not in ('road','trail','river','border','wall','arrow') or jsonb_typeof(o->'curved')<>'boolean'
     or not private.atlas_number(o->'width',1,64) or not private.atlas_color(o->'color') then raise exception 'Rota de mapa inválida.';end if;
   when 'region' then
    extra_keys=array['points','color','fill','width','fillOpacity'];
    if not private.atlas_color(o->'color') or not private.atlas_color(o->'fill') or not private.atlas_number(o->'width',1,32) or not private.atlas_number(o->'fillOpacity',0,1) then raise exception 'Região de mapa inválida.';end if;
   else raise exception 'Tipo de elemento desconhecido.';
  end case;
  if not o ?& extra_keys or o-base_keys-extra_keys<>'{}'::jsonb then raise exception 'Estrutura de elemento inválida.';end if;
  if o->>'kind' in ('route','region') then
   if jsonb_typeof(o->'points')<>'array' then raise exception 'Pontos de rota inválidos.';end if;
   point_count=point_count+jsonb_array_length(o->'points');
   if point_count>20000 then raise exception 'Limite de 20.000 pontos de rotas e regiões por mapa.';end if;
   if jsonb_array_length(o->'points') not between (case when o->>'kind'='route' then 2 else 3 end) and 300 then raise exception 'Quantidade de pontos inválida.';end if;
   for p in select * from jsonb_array_elements(o->'points') loop
    if jsonb_typeof(p)<>'object' or not p ?& array['x','y'] or p-array['x','y']<>'{}'::jsonb or not private.atlas_number(p->'x',-8192,8192) or not private.atlas_number(p->'y',-8192,8192) then raise exception 'Ponto de rota inválido.';end if;
   end loop;
  end if;
 end loop;
end;
$$;
revoke all on function private.atlas_number(jsonb,numeric,numeric,boolean),private.atlas_color(jsonb),private.validate_atlas_document(jsonb) from public,anon,authenticated;

create table if not exists public.campaign_atlas_maps (
 id uuid primary key,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 name text not null check(length(name) between 1 and 120),
 document jsonb not null check(jsonb_typeof(document)='object'),
 revision integer not null default 1 check(revision>0),
 thumbnail text check(thumbnail is null or (length(thumbnail)<=100000 and thumbnail ~ '^data:image/(png|webp);base64,[A-Za-z0-9+/]+=*$')),
 width integer not null check(width between 320 and 4096),height integer not null check(height between 320 and 4096),template text not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create index if not exists campaign_atlas_recent on public.campaign_atlas_maps(campaign_id,updated_at desc,id);
alter table public.campaign_atlas_maps enable row level security;
revoke all on public.campaign_atlas_maps from anon,authenticated;
grant select on public.campaign_atlas_maps to authenticated;
drop policy if exists atlas_owner_read on public.campaign_atlas_maps;
create policy atlas_owner_read on public.campaign_atlas_maps for select to authenticated using(private.is_campaign_owner(campaign_id));

create or replace function public.save_campaign_atlas(p_id uuid,p_campaign_id uuid,p_document jsonb,p_expected_revision integer,p_thumbnail text default null)
returns public.campaign_atlas_maps language plpgsql security definer set search_path='' as $$
declare old_row public.campaign_atlas_maps;result public.campaign_atlas_maps;
begin
 if auth.uid() is null or not private.is_campaign_owner(p_campaign_id) then raise exception 'Somente o mestre da campanha pode criar ou editar mapas.' using errcode='42501';end if;
 perform 1 from public.campaigns where id=p_campaign_id for update;
 perform private.validate_atlas_document(p_document);
 select * into old_row from public.campaign_atlas_maps where id=p_id for update;
 if found then
  if old_row.campaign_id<>p_campaign_id then raise exception 'O vínculo deste mapa não pode ser alterado.' using errcode='42501';end if;
  -- A confirmed write can be retried after its response was lost.
  if old_row.document=p_document and old_row.revision=coalesce(p_expected_revision,0)+1 then return old_row;end if;
  if p_expected_revision is distinct from old_row.revision then raise exception 'Este mapa mudou em outra janela. Recarregue a versão salva ou salve uma cópia.' using errcode='40001';end if;
  update public.campaign_atlas_maps set name=trim(p_document->>'title'),document=p_document,revision=revision+1,thumbnail=p_thumbnail,
   width=(p_document->>'width')::integer,height=(p_document->>'height')::integer,template=p_document->>'template',updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
   where id=p_id returning * into result;
 else
  if p_expected_revision is not null then raise exception 'Este mapa não existe mais. Salve uma cópia para preservar suas alterações.' using errcode='40001';end if;
  if (select count(*) from public.campaign_atlas_maps where campaign_id=p_campaign_id)>=100 then raise exception 'Limite de 100 mapas por campanha. Exporte e remova um mapa para liberar espaço.';end if;
  insert into public.campaign_atlas_maps(id,campaign_id,name,document,thumbnail,width,height,template)
   values(p_id,p_campaign_id,trim(p_document->>'title'),p_document,p_thumbnail,(p_document->>'width')::integer,(p_document->>'height')::integer,p_document->>'template') returning * into result;
 end if;
 return result;
end;
$$;
create or replace function public.delete_campaign_atlas(p_id uuid,p_expected_revision integer) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.campaign_atlas_maps;
begin
 select * into r from public.campaign_atlas_maps where id=p_id for update;
 if not found or auth.uid() is null or not private.is_campaign_owner(r.campaign_id) then raise exception 'Somente o mestre pode excluir este mapa.' using errcode='42501';end if;
 if p_expected_revision is distinct from r.revision then raise exception 'Este mapa mudou em outra janela. Atualize a lista antes de excluir.' using errcode='40001';end if;
 delete from public.campaign_atlas_maps where id=p_id;return p_id;
end;
$$;
revoke all on function public.save_campaign_atlas(uuid,uuid,jsonb,integer,text),public.delete_campaign_atlas(uuid,integer) from public,anon;
grant execute on function public.save_campaign_atlas(uuid,uuid,jsonb,integer,text),public.delete_campaign_atlas(uuid,integer) to authenticated;

-- One saved version sent to the same chapter and calibration reuses its scene.
-- This receipt also resumes uploads after a disconnected browser.
create table if not exists private.atlas_scene_exports (
 source_id uuid not null references public.campaign_atlas_maps(id) on delete cascade,
 source_revision integer not null,
 adventure_session_id uuid not null references public.campaign_sessions(id) on delete cascade,
 columns integer not null,rows integer not null,scale numeric(10,4) not null,
 map_id uuid not null references public.battle_maps(id) on delete cascade,
 primary key(source_id,source_revision,adventure_session_id,columns,rows,scale)
);
revoke all on private.atlas_scene_exports from public,anon,authenticated;
create or replace function public.prepare_atlas_scene(p_id uuid,p_revision integer,p_adventure_session_id uuid,p_columns integer,p_rows integer,p_scale numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare source public.campaign_atlas_maps;target public.battle_maps;cid uuid;calibration numeric(10,4);path text;
begin
 select campaign_id into cid from public.campaign_atlas_maps where id=p_id;
 if cid is null or auth.uid() is null or not private.is_campaign_owner(cid) then raise exception 'Somente o mestre pode enviar este mapa à Mesa.' using errcode='42501';end if;
 perform 1 from public.campaigns where id=cid for update;
 select * into source from public.campaign_atlas_maps where id=p_id for update;
 if source.revision is distinct from p_revision then raise exception 'O mapa mudou. Salve ou recarregue antes de enviar à Mesa.' using errcode='40001';end if;
 if p_adventure_session_id is null then raise exception 'Escolha um capítulo de destino.';end if;
 if p_columns is null or p_rows is null or p_scale is null or p_columns not between 4 and 200 or p_rows not between 4 and 200 or p_scale not between 0.1 and 10000 then raise exception 'Calibração do cenário inválida.';end if;
 calibration=round(p_scale,4);
 perform private.adventure_destination(cid,p_adventure_session_id);
 select m.* into target from private.atlas_scene_exports e join public.battle_maps m on m.id=e.map_id
  where e.source_id=p_id and e.source_revision=p_revision and e.adventure_session_id=p_adventure_session_id and e.columns=p_columns and e.rows=p_rows and e.scale=calibration;
 if not found then
  target=public.create_battle_map(cid,jsonb_build_object('name',source.name,'session_name',source.name,'adventure_session_id',p_adventure_session_id,
   'description','Cenário criado na Oficina de mapas.','width',p_columns,'height',p_rows,'cell_size',64,'scale_per_cell',calibration,'scale_unit','m','diagonal_rule','one','grid_visible',true,'grid_opacity',0.35));
  insert into private.atlas_scene_exports values(p_id,p_revision,p_adventure_session_id,p_columns,p_rows,calibration,target.id);
 end if;
 path='battle_maps/'||target.id||'/atlas-'||p_id||'-r'||p_revision||'.webp';
 return jsonb_build_object('map',to_jsonb(target),'image_path',path);
end;
$$;
create or replace function public.attach_atlas_scene_image(p_map_id uuid) returns public.battle_maps language plpgsql security definer set search_path='' as $$
declare target public.battle_maps;e private.atlas_scene_exports;path text;cid uuid;
begin
 select campaign_id into cid from public.battle_maps where id=p_map_id;
 if cid is null or auth.uid() is null or not private.is_campaign_owner(cid) then raise exception 'Somente o mestre pode concluir este cenário.' using errcode='42501';end if;
 perform 1 from public.campaigns where id=cid for update;
 select * into target from public.battle_maps where id=p_map_id for update;
 if not found then raise exception 'Este cenário foi removido.';end if;
 select * into e from private.atlas_scene_exports where map_id=p_map_id;
 if not found then raise exception 'Este cenário não foi criado pela Oficina de mapas.';end if;
 if target.background_image is not null then return target;end if;
 perform private.adventure_destination(target.campaign_id,target.adventure_session_id);
 if exists(select 1 from public.battle_sessions where id=target.battle_session_id and status<>'preparing') then raise exception 'Encerre o combate antes de concluir a imagem deste cenário.';end if;
 path='battle_maps/'||target.id||'/atlas-'||e.source_id||'-r'||e.source_revision||'.webp';
 if not exists(select 1 from storage.objects where bucket_id='campaign-media' and name=path) then raise exception 'A imagem ainda não foi enviada. Tente concluir o envio novamente.';end if;
 update public.battle_maps set background_image=path where id=p_map_id returning * into target;
 return target;
end;
$$;
revoke all on function public.prepare_atlas_scene(uuid,integer,uuid,integer,integer,numeric),public.attach_atlas_scene_image(uuid) from public,anon;
grant execute on function public.prepare_atlas_scene(uuid,integer,uuid,integer,integer,numeric),public.attach_atlas_scene_image(uuid) to authenticated;
commit;

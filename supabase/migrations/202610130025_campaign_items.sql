-- Campaign-owned item workshop, immutable definitions and transactional grants.
begin;
create table if not exists public.campaign_items (
 id uuid primary key, campaign_id uuid not null references public.campaigns(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100), data jsonb not null,
 visible_to_players boolean not null default false, archived boolean not null default false,
 version integer not null default 1 check(version>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists campaign_items_campaign_idx on public.campaign_items(campaign_id,archived,name);
create table if not exists public.campaign_item_private (
 item_id uuid primary key references public.campaign_items(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 notes text not null default '' check(length(notes)<=12000)
);
create table if not exists private.campaign_item_versions (
 item_id uuid not null references public.campaign_items(id) on delete cascade, version integer not null,
 campaign_id uuid not null references public.campaigns(id) on delete cascade, data jsonb not null,
 primary key(item_id,version)
);
create table if not exists public.campaign_item_deliveries (
 id uuid primary key, campaign_id uuid not null references public.campaigns(id) on delete cascade,
 item_id uuid not null references public.campaign_items(id), character_id uuid not null references public.characters(id) on delete cascade,
 inventory_id uuid not null, item_name text not null, quantity integer not null check(quantity between 1 and 9999),
 definition_version integer not null, created_at timestamptz not null default now()
);
create index if not exists campaign_item_deliveries_campaign_idx on public.campaign_item_deliveries(campaign_id,created_at desc);
revoke all on private.campaign_item_versions from public,anon,authenticated;
alter table public.campaign_items enable row level security;
alter table public.campaign_item_private enable row level security;
alter table public.campaign_item_deliveries enable row level security;
revoke all on public.campaign_items,public.campaign_item_private,public.campaign_item_deliveries from public,anon,authenticated;
grant select on public.campaign_items,public.campaign_item_private,public.campaign_item_deliveries to authenticated;
drop policy if exists campaign_items_read on public.campaign_items;
create policy campaign_items_read on public.campaign_items for select to authenticated using(private.is_campaign_owner(campaign_id) or private.can_read_campaign(campaign_id) and visible_to_players and not archived);
drop policy if exists campaign_item_private_read on public.campaign_item_private;
create policy campaign_item_private_read on public.campaign_item_private for select to authenticated using(private.is_campaign_owner(campaign_id));
drop policy if exists campaign_item_deliveries_read on public.campaign_item_deliveries;
create policy campaign_item_deliveries_read on public.campaign_item_deliveries for select to authenticated using(private.is_campaign_owner(campaign_id) or private.can_read_campaign(campaign_id) and exists(select 1 from public.characters c where c.id=character_id and c.owner_id=auth.uid()));

create or replace function private.item_dice_expression(p_dice text) returns text language plpgsql immutable set search_path='' as $$
declare expression text=regexp_replace(lower(coalesce(p_dice,'')),'\s','','g');part text[];budget integer=0;n integer;sides integer;
begin
 expression=regexp_replace(expression,'(^|[+-])d','\11d','g');
 if length(expression) not between 1 and 200 or expression !~ '^[+-]?[0-9]+(d[0-9]+)?([+-][0-9]+(d[0-9]+)?)*$' then raise exception 'Fórmula de dados inválida.';end if;
 for part in select regexp_matches(expression,'([+-]?)([0-9]+)(?:d([0-9]+))?','g') loop
  if length(part[2])>6 or length(coalesce(part[3],''))>3 then raise exception 'Quantidade fora do limite dos dados.';end if;
  n=part[2]::integer;
  if part[3] is null then if n>100000 then raise exception 'Modificador acima do limite.';end if;
  else sides=part[3]::integer;budget=budget+n;if n<1 or sides not in(4,6,8,10,12,20,100) or budget>100 then raise exception 'Use até 100 dados: d4, d6, d8, d10, d12, d20 ou d100.';end if;end if;
 end loop;
 return expression;
end $$;

create or replace function private.validate_campaign_item(p_data jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare d jsonb;fn jsonb;functions jsonb='[]';ids text[]='{}';key text;value numeric;
begin
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Definição de item inválida.';end if;
 select coalesce(jsonb_object_agg(k,v),'{}') into d from jsonb_each(p_data) e(k,v) where k=any(array['name','category','weight','cost_gp','notes','rarity','attunement','charges','weapon_type','weapon_attack_bonus','properties','versatile_damage','ammunition','armor_base','armor_type','damage','weapon_mode','weapon_range','weapon_ability','functions','bonuses','tags','recharge','passive_requires_equipped','image_path']);
 if jsonb_typeof(d->'name') is distinct from 'string' or length(trim(d->>'name')) not between 1 and 100 then raise exception 'Informe um nome de até 100 caracteres.';end if;
 d=jsonb_set(d,'{name}',to_jsonb(trim(d->>'name')));
 if coalesce(d->>'category','') not in('weapon','armor','gear','item','potion','ammunition','tool','focus','consumable','container','treasure','magic') then raise exception 'Categoria de item inválida.';end if;
 if jsonb_typeof(d->'notes') is distinct from 'string' or length(d->>'notes')>12000 or length(coalesce(d->>'rarity',''))>80 then raise exception 'Descrição ou raridade inválidas.';end if;
 foreach key in array array['weight','cost_gp','charges'] loop
  if jsonb_typeof(d->key) is distinct from 'number' then raise exception 'Informe números válidos para peso, preço e cargas.';end if;
  value=(d->>key)::numeric;
  if value<0 or value>(case key when 'weight' then 100000 when 'charges' then 999 else 1000000000 end) or key='charges' and value<>floor(value) then raise exception 'Peso, preço ou cargas fora do limite.';end if;
 end loop;
 if jsonb_typeof(d->'attunement') is distinct from 'boolean' or jsonb_typeof(d->'passive_requires_equipped') is distinct from 'boolean' then raise exception 'Requisitos do item inválidos.';end if;
 if d->>'recharge' not in('none','manual','short','long','dawn') then raise exception 'Condição de recarga inválida.';end if;
 if jsonb_typeof(d->'tags') is distinct from 'array' or jsonb_array_length(d->'tags')>12 then raise exception 'Use até 12 etiquetas.';end if;
 if exists(select 1 from jsonb_array_elements(d->'tags') t where jsonb_typeof(t)<>'string' or length(t#>>'{}')>40) then raise exception 'Etiquetas inválidas.';end if;
 if jsonb_typeof(d->'bonuses') is distinct from 'object' then raise exception 'Bônus do item inválidos.';end if;
 foreach key in array array['ac','attack','damage','speed'] loop
  if jsonb_typeof(d->'bonuses'->key) is distinct from 'number' then raise exception 'Bônus do item inválidos.';end if;
  value=(d->'bonuses'->>key)::numeric;
  if abs(value)>(case when key='speed' then 120 else 20 end) or key<>'speed' and value<>floor(value) then raise exception 'Bônus do item fora do limite.';end if;
 end loop;
 if d->>'category'='weapon' then
  perform private.item_dice_expression(substring(d->>'damage' from '^[0-9dD+\s-]+'));
  if d->>'weapon_type' not in('simple','martial') or d->>'weapon_mode' not in('melee','ranged') or coalesce((d->>'weapon_range')::numeric,1.5) not between 0 and 600 or abs(coalesce((d->>'weapon_attack_bonus')::numeric,0))>20 or coalesce((d->>'weapon_attack_bonus')::numeric,0)<>floor(coalesce((d->>'weapon_attack_bonus')::numeric,0)) then raise exception 'Configuração de arma inválida.';end if;
  if nullif(d->>'weapon_ability','') is not null and d->>'weapon_ability' not in('str','dex','con','int','wis','cha') then raise exception 'Atributo da arma inválido.';end if;
  if nullif(d->>'versatile_damage','') is not null then perform private.item_dice_expression(d->>'versatile_damage');end if;
 end if;
 if d->>'category'='armor' and (coalesce(d->>'armor_type','') not in('light','medium','heavy','shield') or jsonb_typeof(d->'armor_base') is distinct from 'number' or (d->>'armor_base')::numeric not between 0 and 50 or (d->>'armor_base')::numeric<>floor((d->>'armor_base')::numeric)) then raise exception 'Configuração de armadura inválida.';end if;
 if jsonb_typeof(d->'functions') is distinct from 'array' or jsonb_array_length(d->'functions')>12 then raise exception 'Use até 12 funções por item.';end if;
 for fn in select f.value from jsonb_array_elements(d->'functions') f loop
  if jsonb_typeof(fn) is distinct from 'object' or length(coalesce(fn->>'id','')) not between 1 and 80 or fn->>'id'=any(ids) or length(trim(coalesce(fn->>'name',''))) not between 1 and 80 then raise exception 'Identificador ou nome de função inválido.';end if;
  ids=array_append(ids,fn->>'id');
  if coalesce(fn->>'kind','') not in('healing','damage','temporary','utility') or coalesce(fn->>'cost','') not in('action','bonus','reaction','free') or coalesce(fn->>'shape','') not in('single','self','sphere','cone','line','cube') or coalesce(fn->>'origin','') not in('point','self') then raise exception 'Efeito, área ou ação da função inválidos.';end if;
  if fn->>'kind'<>'utility' then fn=jsonb_set(fn,'{dice}',to_jsonb(private.item_dice_expression(fn->>'dice')));else fn=jsonb_set(fn,'{dice}','""');end if;
  foreach key in array array['range','size','width','charge_cost','quantity_cost'] loop
   if jsonb_typeof(fn->key) is distinct from 'number' then raise exception 'Informe números válidos na função.';end if;
   value=(fn->>key)::numeric;
   if value<0 or value>(case when key in('charge_cost','quantity_cost') then 999 else 600 end) or key='width' and value<=0 or key in('charge_cost','quantity_cost') and value<>floor(value) then raise exception 'Área ou custo da função fora do limite.';end if;
  end loop;
  if (fn->>'charge_cost')::integer>(d->>'charges')::integer then raise exception 'O custo em cargas ultrapassa a capacidade do item.';end if;
  if jsonb_typeof(fn->'requires_equipped') is distinct from 'boolean' or jsonb_typeof(fn->'halfOnSave') is distinct from 'boolean' or jsonb_typeof(fn->'note') is distinct from 'string' or length(fn->>'note')>4000 or length(coalesce(fn->>'damageType',''))>40 or coalesce(fn->>'save','') not in('','FOR','DES','CON','INT','SAB','CAR') then raise exception 'Regras da função inválidas.';end if;
  if fn->>'shape'='self' then fn=fn||'{"origin":"self","range":0}';end if;
  select jsonb_object_agg(k,v) into fn from jsonb_each(fn) e(k,v) where k=any(array['id','name','kind','dice','cost','range','shape','origin','size','width','damageType','save','halfOnSave','charge_cost','quantity_cost','requires_equipped','note']);
  functions=functions||jsonb_build_array(fn);
 end loop;
 return jsonb_set(d,'{functions}',functions);
end $$;

create or replace function public.save_campaign_item(p_payload jsonb,p_expected_version integer default null) returns public.campaign_items language plpgsql security definer set search_path='' as $$
declare iid uuid=(p_payload->>'id')::uuid;cid uuid=(p_payload->>'campaign_id')::uuid;prior public.campaign_items;result public.campaign_items;d jsonb;secret text=coalesce(p_payload->>'private_notes','');
begin
 if not private.is_campaign_owner(cid) then raise exception 'Somente o mestre pode criar e editar itens.' using errcode='42501';end if;
 if iid is null then raise exception 'Identificador do item inválido.';end if;
 perform 1 from public.campaigns where id=cid for update;
 select * into prior from public.campaign_items where id=iid for update;
 if prior.id is not null and (prior.campaign_id<>cid or p_expected_version is null or prior.version<>p_expected_version) then raise exception 'Este item mudou em outra janela. Reabra antes de salvar.' using errcode='40001';end if;
 if prior.id is null and coalesce(p_expected_version,0)<>0 then raise exception 'O item não existe mais. Atualize o catálogo.' using errcode='40001';end if;
 if prior.id is null and (select count(*) from public.campaign_items where campaign_id=cid)>=1000 then raise exception 'Limite de 1000 modelos nesta campanha.';end if;
 d=private.validate_campaign_item(p_payload->'data');
 if length(secret)>12000 then raise exception 'As notas secretas devem ter até 12.000 caracteres.';end if;
 if nullif(d->>'image_path','') is not null and d->>'image_path' not like 'campaigns/'||cid::text||'/%' and d->>'image_path' not like '/images/%' then raise exception 'A imagem deve pertencer a esta campanha.';end if;
 insert into public.campaign_items(id,campaign_id,name,data,visible_to_players,archived,version,updated_at)
 values(iid,cid,d->>'name',d,coalesce((p_payload->>'visible_to_players')::boolean,false),coalesce((p_payload->>'archived')::boolean,false),coalesce(prior.version,0)+1,clock_timestamp())
 on conflict(id) do update set name=excluded.name,data=excluded.data,visible_to_players=excluded.visible_to_players,archived=excluded.archived,version=excluded.version,updated_at=excluded.updated_at returning * into result;
 insert into private.campaign_item_versions(item_id,version,campaign_id,data) values(iid,result.version,cid,d);
 insert into public.campaign_item_private(item_id,campaign_id,notes) values(iid,cid,secret) on conflict(item_id) do update set notes=excluded.notes;
 return result;
end $$;

create or replace function public.give_campaign_item(p_item_id uuid,p_character_id uuid,p_quantity integer,p_request_id uuid,p_expected_version integer)
returns public.campaign_item_deliveries language plpgsql security definer set search_path='' as $$
declare item public.campaign_items;character public.characters;result public.campaign_item_deliveries;inventory uuid=gen_random_uuid();
begin
 select * into item from public.campaign_items where id=p_item_id;
 if item.id is null or not private.is_campaign_owner(item.campaign_id) then raise exception 'Somente o mestre pode entregar itens.' using errcode='42501';end if;
 if p_request_id is null or p_quantity is null or p_quantity not between 1 and 9999 then raise exception 'Entregue de 1 a 9.999 unidades.';end if;
 perform 1 from public.campaigns where id=item.campaign_id for update;
 select * into result from public.campaign_item_deliveries where id=p_request_id;
 if result.id is not null then
  if result.campaign_id<>item.campaign_id or result.item_id<>p_item_id or result.character_id<>p_character_id or result.quantity<>p_quantity then raise exception 'Solicitação de entrega inválida.';end if;return result;
 end if;
 select * into item from public.campaign_items where id=p_item_id for share;
 if item.archived then raise exception 'Reative o modelo antes de entregar este item.';end if;
 if p_expected_version is null or item.version<>p_expected_version then raise exception 'O item mudou. Atualize antes de entregar.' using errcode='40001';end if;
 if (item.data->>'charges')::integer>0 and p_quantity>1 then raise exception 'Entregue cada item com cargas separadamente para preservar sua reserva individual.';end if;
 select * into character from public.characters where id=p_character_id for update;
 if character.id is null or character.campaign_id<>item.campaign_id then raise exception 'Escolha um personagem desta campanha.';end if;
 insert into public.character_inventory(id,character_id,data) values(inventory,character.id,item.data||jsonb_build_object('campaign_item_id',item.id,'definition_version',item.version,'quantity',p_quantity,'equipped',false,'attuned',false,'charges_used',0));
 update public.characters set updated_at=clock_timestamp() where id=character.id;
 insert into public.campaign_item_deliveries(id,campaign_id,item_id,character_id,inventory_id,item_name,quantity,definition_version)
 values(p_request_id,item.campaign_id,item.id,character.id,inventory,item.name,p_quantity,item.version) returning * into result;
 return result;
end $$;

create or replace function public.recharge_campaign_item(p_inventory_id uuid,p_expected_updated_at timestamptz) returns public.character_inventory language plpgsql security definer set search_path='' as $$
declare c public.characters;inv public.character_inventory;
begin
 select c1.* into c from public.characters c1 join public.character_inventory i on i.character_id=c1.id where i.id=p_inventory_id;
 if c.id is null or not private.is_campaign_owner(c.campaign_id) then raise exception 'Somente o mestre pode restaurar cargas.' using errcode='42501';end if;
 perform 1 from public.campaigns where id=c.campaign_id for update;
 select * into c from public.characters where id=c.id for update;
 if p_expected_updated_at is null or c.updated_at is distinct from p_expected_updated_at then raise exception 'A ficha mudou. Atualize antes de restaurar as cargas.' using errcode='40001';end if;
 select * into inv from public.character_inventory where id=p_inventory_id for update;
 if inv.id is null or nullif(inv.data->>'campaign_item_id','') is null or coalesce((inv.data->>'charges')::integer,0)<=0 or inv.data->>'recharge'='none' then raise exception 'Este item não permite recarga.';end if;
 if exists(select 1 from public.battle_action_requests where source_id=inv.id and status in('pending','approved')) then raise exception 'Conclua ou cancele a tentativa pendente antes de restaurar as cargas.';end if;
 update public.character_inventory set data=jsonb_set(data,'{charges_used}','0') where id=inv.id returning * into inv;
 update public.characters set updated_at=clock_timestamp() where id=c.id;
 return inv;
end $$;

create or replace function private.campaign_item_use(p_item jsonb,p_function text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare definition jsonb;fn jsonb;
begin
 select data into definition from private.campaign_item_versions where item_id=(p_item->>'campaign_item_id')::uuid and version=(p_item->>'definition_version')::integer;
 select value into fn from jsonb_array_elements(coalesce(definition->'functions','[]')) where value->>'id'=p_function;
 if fn is null or coalesce((p_item->>'quantity')::integer,0)<greatest(1,(fn->>'quantity_cost')::integer) or (definition->>'attunement')::boolean and not coalesce((p_item->>'attuned')::boolean,false) or (fn->>'requires_equipped')::boolean and not coalesce((p_item->>'equipped')::boolean,false) or (definition->>'charges')::integer-coalesce((p_item->>'charges_used')::integer,0)<(fn->>'charge_cost')::integer then raise exception 'Função indisponível: confira quantidade, cargas, equipamento e sintonização.';end if;
 return fn||jsonb_build_object('maxTargets',case when fn->>'shape' in('single','self') then 1 else 100 end,'timing','immediate','review',true,'item_function_id',fn->>'id','item_version',(p_item->>'definition_version')::integer,'description',definition->>'notes');
end $$;
create or replace function private.campaign_item_bonus(p_sheet jsonb,p_bonus text) returns numeric language sql immutable set search_path='' as $$
 select coalesce(sum((i->'bonuses'->>p_bonus)::numeric),0) from jsonb_array_elements(coalesce(p_sheet->'inventory','[]')) i
 where nullif(i->>'campaign_item_id','') is not null and coalesce((i->>'quantity')::integer,0)>0 and
 (coalesce((i->>'passive_requires_equipped')::boolean,true)=false or coalesce((i->>'equipped')::boolean,false)) and
 (not coalesce((i->>'attunement')::boolean,false) or coalesce((i->>'attuned')::boolean,false));
$$;

revoke all on function private.item_dice_expression(text),private.validate_campaign_item(jsonb),private.campaign_item_use(jsonb,text),private.campaign_item_bonus(jsonb,text) from public,anon,authenticated;
revoke all on function public.save_campaign_item(jsonb,integer),public.give_campaign_item(uuid,uuid,integer,uuid,integer),public.recharge_campaign_item(uuid,timestamptz) from public,anon;
grant execute on function public.save_campaign_item(jsonb,integer),public.give_campaign_item(uuid,uuid,integer,uuid,integer),public.recharge_campaign_item(uuid,timestamptz) to authenticated;

do $$ declare name text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach name in array array['campaign_items','campaign_item_deliveries'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=name) then execute format('alter publication supabase_realtime add table public.%I',name);end if;
  end loop;
 end if;
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
  if not master then
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

create or replace function public.request_battle_action(p_token_id uuid,p_payload jsonb,p_client_id uuid) returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare t public.battle_map_tokens; m public.battle_maps; s public.battle_sessions; entry jsonb; e jsonb; sheet jsonb;
 result public.battle_action_requests; source uuid; kind text=p_payload->>'kind'; cost text='action'; rkind text='none'; rlevel integer=0;
 target jsonb=p_payload->'target'; ids uuid[]; sp public.dnd_spells; ability text; modifier integer; dice text; pulse_dice text; lvl integer=0; cname text; f jsonb; wopts jsonb=coalesce(p_payload->'weapon_options','{}'); units integer=coalesce((p_payload->>'feature_units')::integer,1); itemdef jsonb;
begin
 if auth.uid() is null or p_client_id is null then raise exception 'Entre na sua conta para agir.' using errcode='42501'; end if;
 select * into result from public.battle_action_requests where requested_by=auth.uid() and client_id=p_client_id;
 if result.id is not null then
  if not private.can_read_campaign(result.campaign_id) or not private.can_control_battle_token(result.token_id) then raise exception 'Você não tem mais acesso a esta tentativa.' using errcode='42501'; end if; return result;
 end if;
 select * into m from public.battle_maps where id=(select map_id from public.battle_map_tokens where id=p_token_id);
 select * into s from public.battle_sessions where id=m.battle_session_id for update;
 select * into t from public.battle_map_tokens where id=p_token_id for update;
 select * into result from public.battle_action_requests where requested_by=auth.uid() and client_id=p_client_id;
 if result.id is not null then
  if not private.can_read_campaign(result.campaign_id) or not private.can_control_battle_token(result.token_id) then raise exception 'Você não tem mais acesso a esta tentativa.' using errcode='42501'; end if; return result;
 end if;
 if t.id is null or not private.can_control_battle_token(t.id) then raise exception 'Você não controla esse personagem.' using errcode='42501'; end if;
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
   if coalesce(e->>'upcast','')<>'' and rlevel>lvl then for i in lvl+1..rlevel loop dice=dice||'+'||(e->>'upcast'); end loop; end if;
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
 target=coalesce(target,jsonb_build_object('x',t.x,'y',t.y));
 if jsonb_typeof(target->'x') is distinct from 'number' or jsonb_typeof(target->'y') is distinct from 'number' or (target->>'x')::numeric<>floor((target->>'x')::numeric) or (target->>'y')::numeric<>floor((target->>'y')::numeric) or (target->>'x')::integer<0 or (target->>'x')::integer>=m.width or (target->>'y')::integer<0 or (target->>'y')::integer>=m.height then raise exception 'Alvo fora do mapa.'; end if;
 if e->>'origin'<>'self' and private.battle_target_range(t,target,m)>coalesce((e->>'range')::numeric,0)+0.00001 then raise exception 'Alvo fora do alcance.'; end if;
 ids=array(select distinct value::uuid from jsonb_array_elements_text(coalesce(p_payload->'target_ids','[]')));
 if cardinality(ids)>coalesce((e->>'maxTargets')::integer,1) then raise exception 'Quantidade de alvos acima do limite da magia.'; end if;
 if exists(select 1 from unnest(ids) v where not exists(select 1 from public.battle_map_tokens q where q.id=v and q.map_id=t.map_id and private.can_read_battle_token(q.id))) then raise exception 'Alvo não pertence ao mapa ou não está visível.' using errcode='42501'; end if;
 if e->>'shape'='single' and (e->>'kind' in('damage','healing','temporary') or kind in('item','feature','weapon')) and cardinality(ids)<>1 then raise exception 'Selecione uma criatura como alvo.'; end if;
 if exists(select 1 from public.battle_map_tokens q where q.id=any(ids) and not private.battle_in_effect(q,t,target,e,m.scale_per_cell*case when m.scale_unit='ft' then 0.3 else 1 end)) then raise exception 'Alvo fora da área indicada.'; end if;
 insert into public.battle_action_requests(campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,source_id,name,cost,resource_kind,resource_level,spell_level,target,target_ids,definition,round,turn_index,turn_started_at)
 values(t.campaign_id,s.id,t.map_id,t.id,auth.uid(),p_client_id,kind,source,cname,cost,rkind,rlevel,lvl,target,ids,e||jsonb_build_object('entry',entry,'actor_x',t.x,'actor_y',t.y),s.round,s.turn_index,s.turn_started_at) returning * into result;
 return result;
end $$;

create or replace function public.resolve_battle_action_v9(p_request_id uuid,p_success boolean,p_resolution jsonb default '{}') returns public.battle_action_requests
language plpgsql security definer set search_path='' as $$
declare r public.battle_action_requests; s public.battle_sessions; t public.battle_map_tokens; e jsonb; entry jsonb; sheet jsonb; outcomes jsonb='{}';
 spend boolean; attacks integer=1; opts jsonb=coalesce(p_resolution,'{}');f jsonb;units integer;itemdef jsonb;inv public.character_inventory;wopts jsonb;newdata jsonb;remaining integer;
begin
 select * into r from public.battle_action_requests where id=p_request_id;
 if r.id is null or not private.is_campaign_owner(r.campaign_id) then raise exception 'Apenas o mestre desta campanha pode decidir.' using errcode='42501'; end if;
 select * into s from public.battle_sessions where id=r.session_id for update;
 perform 1 from public.campaigns where id=r.campaign_id for update; -- serialize HP/resources across maps of one campaign
 select * into r from public.battle_action_requests where id=p_request_id for update;
 if r.status<>'pending' then return r; end if; -- idempotent, including two browsers clicking simultaneously
 select * into t from public.battle_map_tokens where id=r.token_id for update;
 if s.status<>'active' or s.round<>r.round or s.turn_index<>r.turn_index or s.turn_started_at is distinct from r.turn_started_at then
  update public.battle_action_requests set status='expired',resolved_at=now() where id=r.id returning * into r; return r;
 end if;
 if r.kind<>'opportunity' and s.active_token_id is distinct from t.id then raise exception 'A tentativa pertence a outro turno.'; end if;
 sheet=private.battle_sheet(t.id); e=r.definition; spend=p_success or s.failed_actions_consume;
 if p_success and opts ? 'geometry' then
  if coalesce(opts->'geometry'->>'shape','') not in('single','self','sphere','cone','line','cube') or coalesce(opts->'geometry'->>'origin','') not in('point','self') or coalesce((opts->'geometry'->>'size')::numeric,-1)<0 or (opts->'geometry'->>'size')::numeric>10000 or coalesce((opts->'geometry'->>'width')::numeric,0)<=0 or (opts->'geometry'->>'width')::numeric>10000 then raise exception 'Formato ou dimensão da área inválido.'; end if;
  e=e||jsonb_build_object('shape',opts->'geometry'->>'shape','origin',opts->'geometry'->>'origin','size',(opts->'geometry'->>'size')::numeric,'width',(opts->'geometry'->>'width')::numeric);
 end if;
 if r.kind='feature' and spend then
  f=private.dnd_feature_definition(sheet,e->>'id',(e->>'units')::integer,t.raging);
  if f->>'operation'='surge' and t.surge_used then raise exception 'Surto de Ação já utilizado neste turno.';end if;
  if coalesce(f->>'resource','')<>'' then
   update public.characters set system_data=jsonb_set(system_data,'{feature_uses}',coalesce(system_data->'feature_uses','{}')||jsonb_build_object(f->>'resource',coalesce((system_data->'feature_uses'->>(f->>'resource'))::integer,0)+(f->>'units')::integer)) where id=t.character_id;
  end if;
 elsif r.kind='item' and spend then
  select * into inv from public.character_inventory where id=r.source_id and character_id=t.character_id for update;
  if inv.id is null then raise exception 'O item foi removido.';end if;
  if nullif(inv.data->>'campaign_item_id','') is not null then
   if (inv.data->>'definition_version')::integer is distinct from (e->>'item_version')::integer then raise exception 'A versão deste item mudou. Cancele a tentativa.';end if;
   itemdef=private.campaign_item_use(inv.data,e->>'item_function_id');
   newdata=inv.data||jsonb_build_object('quantity',(inv.data->>'quantity')::integer-(itemdef->>'quantity_cost')::integer,'charges_used',coalesce((inv.data->>'charges_used')::integer,0)+(itemdef->>'charge_cost')::integer);
  else
  select data into itemdef from public.dnd_items where id=inv.data->>'catalog_id';
  if inv.id is null or itemdef->'use' is null or (inv.data->>'quantity')::integer<1 then raise exception 'O item foi removido ou está esgotado.';end if;
  newdata=inv.data;
  if itemdef ? 'charges' then
   remaining=coalesce((inv.data->>'charges_used')::integer,0)+1;
   if remaining>(itemdef->>'charges')::integer then raise exception 'Este item não possui mais usos.';end if;
   newdata=newdata||jsonb_build_object('charges_used',remaining);
   if remaining=(itemdef->>'charges')::integer and (inv.data->>'quantity')::integer>1 then newdata=newdata||jsonb_build_object('quantity',(inv.data->>'quantity')::integer-1,'charges_used',0);end if;
  elsif coalesce((itemdef->'use'->>'consumed')::boolean,false) then newdata=newdata||jsonb_build_object('quantity',(inv.data->>'quantity')::integer-1);end if;

  end if;
  update public.character_inventory set data=newdata where id=inv.id;
 elsif r.kind='weapon' and spend and t.character_id is not null then
  if r.source_id=t.id then entry=jsonb_build_object('id',t.id,'name','Ataque desarmado','catalog_id','unarmed','category','weapon','quantity',1,'damage','1 concussão','notes','');
  else select data||jsonb_build_object('id',id) into entry from public.character_inventory where id=r.source_id and character_id=t.character_id and data->>'category'='weapon' and (data->>'quantity')::integer>0 for update;end if;
  if entry is null then raise exception 'A arma foi removida ou está esgotada.';end if;
  wopts=coalesce(e->'entry'->'weapon_options','{}');
  perform private.dnd_check_weapon_options(t,entry,sheet,wopts,to_jsonb(r.target_ids));
  if p_success and r.resource_level>0 then
   if r.resource_kind='slot' then update public.characters set system_data=jsonb_set(system_data,'{slots_used}',coalesce(system_data->'slots_used','{}')||jsonb_build_object(r.resource_level::text,coalesce((system_data->'slots_used'->>r.resource_level::text)::integer,0)+1)) where id=t.character_id;
   elsif r.resource_kind='pact' then update public.characters set system_data=system_data||jsonb_build_object('pact_slots_used',coalesce((system_data->>'pact_slots_used')::integer,0)+1) where id=t.character_id;end if;
  end if;
  if nullif(entry->>'ammunition','') is not null then
   select * into inv from public.character_inventory where character_id=t.character_id and data->>'category'='ammunition' and data->>'ammunition'=entry->>'ammunition' and (data->>'quantity')::integer>0 order by id limit 1 for update;
   if inv.id is null then raise exception 'Munição compatível esgotada.';end if;
   update public.character_inventory set data=data||jsonb_build_object('quantity',(data->>'quantity')::integer-1) where id=inv.id;
  end if;
  update public.battle_map_tokens set weapon_attacked=weapon_attacked or (r.cost='action' and (private.dnd_weapon_traits(entry,sheet)->>'light')::boolean and not(private.dnd_weapon_traits(entry,sheet)->>'ranged')::boolean),
   sneak_used=sneak_used or (p_success and coalesce((wopts->>'sneak')::boolean,false)),hunter_used=hunter_used or (p_success and coalesce((wopts->>'hunter')::boolean,false)),
   rage_activity_at=case when raging and exists(select 1 from public.battle_map_tokens foe where foe.id=any(r.target_ids) and foe.faction in('enemy','ally') and foe.faction<>t.faction) then now() else rage_activity_at end where id=t.id;
 end if;
 if r.kind='spell' and spend then
  if t.character_id is not null then select data into entry from public.character_spells where id=r.source_id and character_id=t.character_id;
  else select data into entry from public.npc_spells where id=r.source_id and npc_id=t.npc_id; end if;
  if entry is null then raise exception 'A magia foi retirada da ficha. Cancele esta tentativa.'; end if;
  entry=entry||jsonb_build_object('level',r.spell_level); perform private.battle_check_resource(t,entry,r.resource_kind,r.resource_level);
  if t.character_id is not null then
   perform 1 from public.characters where id=t.character_id for update;
   perform private.battle_check_resource(t,entry,r.resource_kind,r.resource_level);
   if r.resource_kind='slot' then update public.characters set system_data=jsonb_set(system_data,'{slots_used}',coalesce(system_data->'slots_used','{}')||jsonb_build_object(r.resource_level::text,coalesce((system_data->'slots_used'->>r.resource_level::text)::integer,0)+1)) where id=t.character_id;
   elsif r.resource_kind='pact' then update public.characters set system_data=system_data||jsonb_build_object('pact_slots_used',coalesce((system_data->>'pact_slots_used')::integer,0)+1) where id=t.character_id;
   elsif r.resource_kind='arcanum' then update public.characters set system_data=jsonb_set(system_data,'{arcanum_used}',coalesce(system_data->'arcanum_used','{}')||jsonb_build_object(r.resource_level::text,1)) where id=t.character_id;
   end if;
  end if;
 end if;
 if spend then
  if r.cost='action' then
   if r.kind='weapon' then
    if t.action_used and t.attacks_remaining<=0 and t.extra_actions=0 then raise exception 'Não há ataques restantes.'; end if;
    if not t.action_used or t.attacks_remaining<=0 then
     attacks=case when e->'entry'->>'catalog_id'='net' then 1 else private.dnd_attack_count(sheet) end;
    else attacks=t.attacks_remaining; end if;
    update public.battle_map_tokens set action_used=true,attacks_remaining=attacks-1,extra_actions=extra_actions-case when t.action_used and t.attacks_remaining<=0 then 1 else 0 end where id=t.id;
   else
    if t.action_used and t.extra_actions=0 then raise exception 'A ação já foi utilizada.';end if;
    update public.battle_map_tokens set action_used=true,attacks_remaining=case when t.action_used then t.attacks_remaining else 0 end,extra_actions=extra_actions-case when t.action_used then 1 else 0 end,action_spell_level=case when r.kind='spell' then r.spell_level else action_spell_level end where id=t.id; end if;
  elsif r.cost='bonus' then
   if t.bonus_used then raise exception 'A ação bônus já foi utilizada.'; end if;
   update public.battle_map_tokens set bonus_used=true,bonus_spell_cast=bonus_spell_cast or r.kind='spell' where id=t.id;
  elsif r.cost='reaction' then
   if t.reaction_used then raise exception 'A reação já foi utilizada.'; end if;
   update public.battle_map_tokens set reaction_used=true where id=t.id;
  end if;
 end if;
 if p_success then
  if r.kind='feature' then
   case e->>'operation'
    when 'rage' then
     update public.battle_map_tokens set raging=true,rage_started_round=s.round,rage_activity_at=null,rage_checked_at=now() where id=t.id;
     update public.battle_spell_effects set active=false where token_id=t.id and concentration and active;
    when 'end-rage' then update public.battle_map_tokens set raging=false where id=t.id;
    when 'surge' then update public.battle_map_tokens set extra_actions=extra_actions+1,surge_used=true where id=t.id;
    when 'dash' then update public.battle_map_tokens set movement_remaining=movement_remaining+movement_speed,movement_bonus=movement_bonus+movement_speed where id=t.id;
    when 'disengage' then update public.battle_map_tokens set disengaged=true where id=t.id;
    when 'dodge' then update public.battle_map_tokens set dodging=true where id=t.id;
    else outcomes=private.battle_apply_hp(r,t,e,opts);
   end case;
  elsif r.kind='dash' then update public.battle_map_tokens set movement_remaining=movement_remaining+movement_speed,movement_bonus=movement_bonus+movement_speed where id=t.id;
  elsif r.kind='disengage' then update public.battle_map_tokens set disengaged=true where id=t.id;
  elsif r.kind='dodge' then update public.battle_map_tokens set dodging=true where id=t.id;
  else
   if r.kind='item' then perform private.dnd_item_special(r,e);end if;
   if opts ? 'kind' then
    if opts->>'kind' not in('damage','healing','temporary','utility') then raise exception 'Efeito inválido.'; end if;
    e=e||jsonb_build_object('kind',opts->>'kind');
   end if;
   if opts ? 'damageType' then e=e||jsonb_build_object('damageType',opts->>'damageType'); end if;
   if coalesce(e->>'timing','immediate')='immediate' or coalesce((opts->>'apply_now')::boolean,false) then outcomes=private.battle_apply_hp(r,t,e,opts); end if;
   if r.kind='spell' and (e ? 'pulseDice' or coalesce(e->>'timing','immediate')='trigger' or lower(coalesce(e->>'duration','')) not like 'instant%') then
    if coalesce((e->>'concentration')::boolean,false) then update public.battle_spell_effects set active=false where token_id=t.id and concentration and active; end if;
    insert into public.battle_spell_effects(request_id,campaign_id,map_id,token_id,name,definition,target,concentration,duration)
    values(r.id,r.campaign_id,r.map_id,t.id,r.name,case when e ? 'pulseDice' then e||jsonb_build_object('dice',e->>'pulseDice') else e end,r.target,coalesce((e->>'concentration')::boolean,false),coalesce(e->>'duration',''));
   end if;
  end if;
 end if;
 update public.battle_action_requests set status=case when p_success then 'success' else 'failure' end,resolution=outcomes||jsonb_build_object('resources_consumed',spend,'dice',coalesce(opts->>'dice',e->>'dice','')),
  resolved_by=auth.uid(),resolved_at=now() where id=r.id returning * into r;
 if r.movement_plan_id is not null then perform private.battle_finish_movement(r.movement_plan_id); end if;
 return r;
end $$;

create or replace function private.dnd_weapon_effect(item jsonb,s jsonb,opts jsonb default '{}',raging boolean default false) returns jsonb language plpgsql immutable set search_path='' as $$
declare e jsonb=private.dnd_weapon_base(item,s);t jsonb=private.dnd_weapon_traits(item,s);mod integer;dice text;parts jsonb;l integer;monk integer=private.dnd_class_level(s,'monk');sides integer;twohands boolean=coalesce((opts->>'two_handed')::boolean,false);crit integer=20;c jsonb;
begin
 if s->>'class_id'='npc' then return e;end if;
 dice=coalesce(regexp_replace(substring(item->>'damage' from '\d+d\d+(?:\s*[+-]\s*\d+)?'),'\s','','g'),'1');
 if twohands and nullif(item->>'versatile_damage','') is not null then dice=item->>'versatile_damage';end if;
 if coalesce((t->>'martial')::boolean,false) then
  sides=case when monk>=17 then 10 when monk>=11 then 8 when monk>=5 then 6 else 4 end;
  if (t->>'unarmed')::boolean or (dice~'^1d\d+$' and substring(dice from '^1d(\d+)$')::integer<sides) then dice='1d'||sides;end if;
 end if;
 mod=floor((coalesce((s->'abilities'->>(t->>'ability'))::numeric,10)-10)/2);
 if coalesce((opts->>'offhand')::boolean,false) and not private.dnd_has_style(s,'two-weapon') then mod=least(0,mod);end if;
 if raging and not(t->>'ranged')::boolean and t->>'ability'='str' then l=private.dnd_class_level(s,'barbarian');mod=mod+case when l>=16 then 4 when l>=9 then 3 else 2 end;end if;
 mod=mod+private.campaign_item_bonus(s,'damage')::integer;
 if private.dnd_has_style(s,'dueling') and not(t->>'ranged')::boolean and not(t->>'unarmed')::boolean and not(t->>'twoHanded')::boolean and not twohands and not exists(select 1 from jsonb_array_elements(coalesce(s->'inventory','[]')) i where i->>'id' is distinct from item->>'id' and i->>'category'='weapon' and coalesce((i->>'equipped')::boolean,false) and (i->>'quantity')::integer>0) then mod=mod+2;end if;
 parts=jsonb_build_array(jsonb_build_object('dice',dice||case when mod>=0 then '+' else '' end||mod,'damageType',e->>'damageType'));
 if coalesce((opts->>'sneak')::boolean,false) then parts=parts||jsonb_build_array(jsonb_build_object('dice',ceil(private.dnd_class_level(s,'rogue')::numeric/2)::integer||'d6','damageType',e->>'damageType'));end if;
 if coalesce((opts->>'hunter')::boolean,false) then parts=parts||jsonb_build_array(jsonb_build_object('dice','1d8','damageType',e->>'damageType'));end if;
 if not(t->>'ranged')::boolean and not(t->>'unarmed')::boolean and private.dnd_class_level(s,'paladin')>=11 then parts=parts||jsonb_build_array(jsonb_build_object('dice','1d8','damageType','radiante'));end if;
 if coalesce((opts->>'smite_level')::integer,0)>0 then parts=parts||jsonb_build_array(jsonb_build_object('dice',(least(5,(opts->>'smite_level')::integer+1)+case when coalesce((opts->>'smite_special')::boolean,false) then 1 else 0 end)||'d8','damageType','radiante'));end if;
 for c in select value from jsonb_array_elements(private.dnd_levels(s)) loop if c->>'class_id'='fighter' and c->>'subclass_id'='champion' then crit=case when (c->>'level')::integer>=15 then 18 when (c->>'level')::integer>=3 then 19 else 20 end;end if;end loop;
 return e||jsonb_build_object('dice',case when item->>'catalog_id'='net' then '' else (select string_agg(p->>'dice','+' order by n) from jsonb_array_elements(parts) with ordinality a(p,n)) end,'damageParts',case when item->>'catalog_id'='net' then '[]'::jsonb else parts end,'kind',case when item->>'catalog_id'='net' then 'utility' else e->>'kind' end,'review',case when item->>'catalog_id'='net' then true else coalesce((e->>'review')::boolean,false) end,'note',case when item->>'catalog_id'='net' then 'Rede não causa dano. O mestre aplica a condição contido e as restrições de tamanho e de ataque descritas no item.' else e->>'note' end,
  'attackBonus',floor((coalesce((s->'abilities'->>(t->>'ability'))::numeric,10)-10)/2)+case when private.dnd_weapon_proficient(item,s) then 2+((s->>'level')::integer-1)/4 else 0 end+coalesce((item->>'weapon_attack_bonus')::integer,0)+private.campaign_item_bonus(s,'attack')::integer+case when (t->>'ranged')::boolean and private.dnd_has_style(s,'archery') then 2 else 0 end,'criticalAt',crit,
  'rerollWeaponDice',case when private.dnd_has_style(s,'great-weapon') and not(t->>'ranged')::boolean and ((t->>'twoHanded')::boolean or twohands) then coalesce(substring(dice from '^(\d+)d')::integer,0) else 0 end);
end $$;

create or replace function private.battle_character_speed(p_character uuid) returns numeric
language plpgsql stable security definer set search_path='' as $$
declare s jsonb; speed numeric; armor boolean; shield boolean;
begin
 select system_data into s from public.characters where id=p_character;
 select coalesce((s->>'speed_override')::numeric,r.speed,9) into speed from (select 1) dummy left join public.dnd_races r on r.name=s->>'race';
 armor=exists(select 1 from public.character_inventory where character_id=p_character and data->>'category'='armor' and coalesce((data->>'equipped')::boolean,false) and data->>'armor_type'<>'shield');
 shield=exists(select 1 from public.character_inventory where character_id=p_character and data->>'armor_type'='shield' and coalesce((data->>'equipped')::boolean,false));
 if nullif(s->>'speed_override','') is null then
  if private.dnd_class_level(s,'barbarian')>=5 and not exists(select 1 from public.character_inventory where character_id=p_character and data->>'armor_type'='heavy' and coalesce((data->>'equipped')::boolean,false)) then speed=speed+3; end if;
  if private.dnd_class_level(s,'monk')>=2 and not armor and not shield then speed=speed+case when private.dnd_class_level(s,'monk')>=18 then 9 when private.dnd_class_level(s,'monk')>=14 then 7.5 when private.dnd_class_level(s,'monk')>=10 then 6 when private.dnd_class_level(s,'monk')>=6 then 4.5 else 3 end; end if;
 end if;
 select s||jsonb_build_object('inventory',coalesce(jsonb_agg(data),'[]')) into s from public.character_inventory where character_id=p_character;
 speed=speed+private.campaign_item_bonus(s,'speed');
 if s->'conditions' ?| array['Agarrado','Impedido','Paralisado','Petrificado','Atordoado','Inconsciente'] then speed=0; end if;
 return greatest(0,coalesce(speed,9));
end $$;
commit;

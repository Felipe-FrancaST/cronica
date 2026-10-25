-- Site catalog and personal master art; images remain in private Storage.
begin;
create table if not exists public.map_assets (
 id uuid primary key, scope text not null check(scope in('system','personal')),
 owner_id uuid references auth.users(id) on delete cascade,
 created_by uuid references auth.users(id) on delete set null,
 kind text not null check(kind in('symbol','token','background')),
 name text not null check(length(trim(name)) between 1 and 120),
 search_name text generated always as (lower(translate(name,'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç','AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'))) stored,
 tags text[] not null default '{}', image_path text not null unique, thumbnail_path text not null unique,
 ready boolean not null default false, active boolean not null default true,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 check((scope='system' and owner_id is null) or (scope='personal' and owner_id is not null)),
 check(cardinality(tags)<=12)
);
create index if not exists map_assets_catalog on public.map_assets(kind,scope,active,search_name,id) where ready;
create index if not exists map_assets_owner on public.map_assets(owner_id,kind,name);
alter table public.map_assets enable row level security;
revoke all on public.map_assets from anon,authenticated;
grant select on public.map_assets to authenticated;

create or replace function private.map_asset_readable(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.map_assets a where a.id=p_id and (
 a.scope='system' and private.site_is_admin(auth.uid()) or private.billing_can_access(auth.uid(),'master') and (
  a.scope='personal' and a.owner_id=auth.uid() or a.scope='system' and a.ready)));
$$;
revoke all on function private.map_asset_readable(uuid) from public,anon;
grant execute on function private.map_asset_readable(uuid) to authenticated;
drop policy if exists map_assets_read on public.map_assets;
create policy map_assets_read on public.map_assets for select to authenticated using(private.map_asset_readable(id));

create or replace function public.reserve_map_asset(p_id uuid,p_kind text,p_scope text,p_name text,p_tags text[] default '{}') returns public.map_assets
language plpgsql security definer set search_path='' as $$
declare a public.map_assets; prefix text;
begin
 if auth.uid() is null or not (private.site_is_admin(auth.uid()) or private.billing_can_access(auth.uid(),'master')) then raise exception 'Acesso de mestre necessário.' using errcode='42501';end if;
 if p_scope='personal' and not private.billing_can_access(auth.uid(),'master') then raise exception 'Acesso de mestre necessário.' using errcode='42501';end if;
 if p_scope='system' and not private.site_is_admin(auth.uid()) then raise exception 'Somente o administrador pode publicar recursos do sistema.' using errcode='42501';end if;
 if p_id is null or p_kind is null or p_kind not in('symbol','token','background') or p_scope is null or p_scope not in('system','personal')
 or p_name is null or length(trim(p_name)) not between 1 and 120 or p_tags is null or cardinality(p_tags)>12
 or exists(select 1 from unnest(p_tags)t where t is null or length(t)>40) then raise exception 'Dados do recurso inválidos.';end if;
 select * into a from public.map_assets where id=p_id for update;
 if found then
  if a.created_by is distinct from auth.uid() or a.kind<>p_kind or a.scope<>p_scope then raise exception 'Este envio pertence a outro recurso.' using errcode='42501';end if;
  return a;
 end if;
 prefix=case when p_scope='system' then 'system/' else 'personal/'||auth.uid()||'/' end||p_id||'/';
 insert into public.map_assets(id,scope,owner_id,created_by,kind,name,tags,image_path,thumbnail_path)
 values(p_id,p_scope,case when p_scope='personal' then auth.uid() else null end,auth.uid(),p_kind,trim(p_name),p_tags,prefix||'image.webp',prefix||'thumb.webp') returning * into a;
 return a;
end $$;

create or replace function public.confirm_map_asset(p_id uuid) returns public.map_assets language plpgsql security definer set search_path='' as $$
declare a public.map_assets;
begin
 select * into a from public.map_assets where id=p_id for update;
 if a.id is null or not coalesce((private.site_is_admin(auth.uid()) and a.scope='system' or a.owner_id=auth.uid() and private.billing_can_access(auth.uid(),'master')),false) then raise exception 'Recurso indisponível.' using errcode='42501';end if;
 if a.ready then return a;end if;
 if not exists(select 1 from storage.objects where bucket_id='map-assets' and name=a.image_path)
 or not exists(select 1 from storage.objects where bucket_id='map-assets' and name=a.thumbnail_path) then raise exception 'O envio da imagem ainda não foi concluído. Tente novamente.';end if;
 update public.map_assets set ready=true,updated_at=clock_timestamp() where id=p_id returning * into a;
 if a.scope='system' then insert into public.site_audit_log(actor_id,action,target_id,details) values(auth.uid(),'map_asset_published',a.id::text,jsonb_build_object('name',a.name,'kind',a.kind));end if;
 return a;
end $$;

create or replace function public.update_map_asset(p_id uuid,p_name text,p_tags text[],p_active boolean) returns public.map_assets language plpgsql security definer set search_path='' as $$
declare a public.map_assets;
begin
 select * into a from public.map_assets where id=p_id for update;
 if a.id is null or not a.ready or not coalesce((private.site_is_admin(auth.uid()) and a.scope='system' or a.owner_id=auth.uid() and private.billing_can_access(auth.uid(),'master')),false) then raise exception 'Somente o responsável pode alterar este recurso.' using errcode='42501';end if;
 if p_name is null or length(trim(p_name)) not between 1 and 120 or p_tags is null or cardinality(p_tags)>12 or p_active is null or exists(select 1 from unnest(p_tags)t where t is null or length(t)>40) then raise exception 'Dados do recurso inválidos.';end if;
 update public.map_assets set name=trim(p_name),tags=p_tags,active=p_active,updated_at=clock_timestamp() where id=p_id returning * into a;
 if a.scope='system' then insert into public.site_audit_log(actor_id,action,target_id,details) values(auth.uid(),'map_asset_updated',a.id::text,jsonb_build_object('name',a.name,'active',a.active));end if;
 return a;
end $$;
revoke all on function public.reserve_map_asset(uuid,text,text,text,text[]),public.confirm_map_asset(uuid),public.update_map_asset(uuid,text,text[],boolean) from public,anon;
grant execute on function public.reserve_map_asset(uuid,text,text,text,text[]),public.confirm_map_asset(uuid),public.update_map_asset(uuid,text,text[],boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('map-assets','map-assets',false,5242880,array['image/webp','image/png','image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function private.map_asset_file(p_name text,p_write boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.map_assets a where p_name in(a.image_path,a.thumbnail_path) and case when p_write then
  not a.ready and (a.scope='personal' and a.owner_id=auth.uid() and private.billing_can_access(auth.uid(),'master'))
 else private.map_asset_readable(a.id) end);
$$;
revoke all on function private.map_asset_file(text,boolean) from public,anon;
grant execute on function private.map_asset_file(text,boolean) to authenticated;
drop policy if exists map_asset_file_read on storage.objects;
drop policy if exists map_asset_file_insert on storage.objects;
drop policy if exists map_asset_file_discard on storage.objects;
create policy map_asset_file_read on storage.objects for select to authenticated using(bucket_id='map-assets' and private.map_asset_file(name,false));
create policy map_asset_file_insert on storage.objects for insert to authenticated with check(bucket_id='map-assets' and private.map_asset_file(name,true));
create policy map_asset_file_discard on storage.objects for delete to authenticated using(bucket_id='map-assets' and private.map_asset_file(name,true));

-- Keep the established document validator and extend only image references.
do $$begin
 if to_regprocedure('private.validate_atlas_document_v44(jsonb)') is null then alter function private.validate_atlas_document(jsonb) rename to validate_atlas_document_v44;end if;
end $$;
create or replace function private.validate_atlas_document(d jsonb) returns void language plpgsql stable security definer set search_path='' as $$
declare o jsonb; sanitized jsonb; a public.map_assets;
begin
 if jsonb_typeof(d->'objects')<>'array' then raise exception 'Coleção de mapa inválida.';end if;
 if (select count(distinct v->>'asset_id') from jsonb_array_elements(d->'objects')v where v?'asset_id')>96 then raise exception 'Use até 96 imagens diferentes por mapa.';end if;
 for o in select * from jsonb_array_elements(d->'objects') where value?'asset_id' loop
  if o->>'kind' not in('symbol','token') or jsonb_typeof(o->'asset_id')<>'string' or (o->>'asset_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Referência de imagem inválida.';end if;
  select * into a from public.map_assets where id=(o->>'asset_id')::uuid;
  if a.id is null or not a.ready or a.kind<>o->>'kind' or not private.map_asset_readable(a.id) then raise exception 'Uma imagem deste mapa não pertence à sua biblioteca ou ao catálogo do sistema.' using errcode='42501';end if;
 end loop;
 select jsonb_set(d,'{objects}',coalesce(jsonb_agg(value-'asset_id'),'[]')) into sanitized from jsonb_array_elements(d->'objects');
 perform private.validate_atlas_document_v44(sanitized);
end $$;
revoke all on function private.validate_atlas_document(jsonb),private.validate_atlas_document_v44(jsonb) from public,anon,authenticated;

-- Delete personal media with the account; keep the site's published catalog.
do $$begin
 if to_regprocedure('private.account_prepare_purge_v44(uuid,uuid)') is null then alter function public.account_prepare_purge(uuid,uuid) rename to account_prepare_purge_v44;alter function public.account_prepare_purge_v44(uuid,uuid) set schema private;end if;
end $$;
create or replace function public.account_prepare_purge(p_user_id uuid,p_token uuid) returns text language plpgsql security definer set search_path='' as $$
declare phase text;
begin
 phase=private.account_prepare_purge_v44(p_user_id,p_token);
 delete from private.account_deletion_files f using public.map_assets a where f.user_id=p_user_id and f.bucket_id='map-assets' and a.scope='system' and a.ready and f.name in(a.image_path,a.thumbnail_path);
 insert into private.account_deletion_files(user_id,bucket_id,name)
 select p_user_id,o.bucket_id,o.name from storage.objects o where o.bucket_id='map-assets' and left(o.name,length('personal/'||p_user_id||'/'))='personal/'||p_user_id||'/' on conflict(user_id,bucket_id,name) do update set removed=false;
 insert into private.account_deletion_files(user_id,bucket_id,name) select p_user_id,o.bucket_id,o.name from storage.objects o join public.map_assets a on o.name in(a.image_path,a.thumbnail_path) where o.bucket_id='map-assets' and a.scope='system' and not a.ready and a.created_by=p_user_id on conflict(user_id,bucket_id,name) do update set removed=false;
 delete from public.map_assets where scope='system' and not ready and created_by=p_user_id;
 if exists(select 1 from private.account_deletion_files where user_id=p_user_id and not removed) then
  update private.account_deletions set phase='purging' where user_id=p_user_id returning private.account_deletions.phase into phase;
 end if;
 return phase;
end $$;
revoke all on function public.account_prepare_purge(uuid,uuid),private.account_prepare_purge_v44(uuid,uuid) from public,anon,authenticated;
do $$begin
 if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.account_prepare_purge(uuid,uuid) to service_role;end if;
end $$;
notify pgrst,'reload schema';
commit;

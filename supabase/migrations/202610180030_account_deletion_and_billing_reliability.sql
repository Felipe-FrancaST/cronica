-- 030: resumable self-service deletion and payment reconciliation safeguards.
-- Storage bytes are removed through the Storage API, never by deleting SQL metadata.
begin;

create table if not exists private.account_deletions (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 phase text not null default 'preparing' check(phase in('preparing','purging','auth_ready')),
 media_prefixes text[] not null default '{}',
 session_fingerprint text not null, reauthenticated_until timestamptz not null,
 lease_token uuid, lease_until timestamptz, created_at timestamptz not null default clock_timestamp()
);
create table if not exists private.account_deletion_files (
 user_id uuid not null references private.account_deletions(user_id) on delete cascade,
 bucket_id text not null, name text not null, removed boolean not null default false,
 primary key(user_id,bucket_id,name)
);
create table if not exists private.account_purge_permits(transaction_id bigint primary key,user_id uuid not null);
revoke all on private.account_deletions,private.account_deletion_files,private.account_purge_permits from public,anon,authenticated;

create or replace function private.account_is_deleting(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.account_deletions where user_id=p_user);
$$;
create or replace function private.account_is_purge() returns boolean language sql stable security definer set search_path='' as $$
 select current_setting('cronica.account_purge',true)='on' and exists(
  select 1 from private.account_purge_permits p join private.account_deletions d on d.user_id=p.user_id
  where p.transaction_id=txid_current() and d.phase='purging');
$$;
create or replace function private.site_is_admin(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user is not null and not private.account_is_deleting(p_user)
 and exists(select 1 from public.site_administrators where user_id=p_user)
 and not coalesce((select blocked from public.site_user_controls where user_id=p_user),false);
$$;
create or replace function private.billing_account_allowed(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user is not null and exists(select 1 from public.profiles where id=p_user)
 and not private.account_is_deleting(p_user) and not private.site_is_admin(p_user)
 and not exists(select 1 from public.site_user_controls where user_id=p_user and blocked)
 and not (select maintenance from public.site_billing_settings where id=1);
$$;
create or replace function private.can_read_campaign(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.campaigns c where c.id=p_id and not private.account_is_deleting(c.owner_id)
 and case when c.owner_id=auth.uid() then private.billing_can_access(auth.uid(),'master')
 else private.billing_can_access(auth.uid(),'player') and exists(
  select 1 from public.campaign_members m where m.campaign_id=c.id and m.user_id=auth.uid()) end);
$$;

-- Immutable game logs and archived-session guards remain enforced for normal operations.
-- Only the private, transaction-scoped purge permit bypasses those triggers.
do $$ declare f record; body text; begin
 for f in select distinct p.oid,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 join pg_trigger t on t.tgfoid=p.oid join pg_class c on c.oid=t.tgrelid
 join pg_namespace cn on cn.oid=c.relnamespace
 where n.nspname='private' and cn.nspname='public' and p.prorettype='trigger'::regtype
 and p.prolang=(select oid from pg_language where lanname='plpgsql')
 loop
  if position('private.account_is_purge()' in f.prosrc)>0 then continue;end if;
  body=regexp_replace(f.prosrc,'\mbegin\M',
   'begin if private.account_is_purge() then if TG_OP=''DELETE'' then return OLD;else return NEW;end if;end if;', 'i');
  execute replace(pg_get_functiondef(f.oid),f.prosrc,body);
 end loop;
end $$;

create or replace function private.account_row_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb;uid uuid;cid uuid;character_id uuid;begin
 -- Auth's hard deletion cascades to profiles in a separate transaction.
 if TG_TABLE_NAME='profiles' then
  if TG_OP='DELETE' and exists(select 1 from private.account_deletions where user_id=old.id and phase='auth_ready')
   and not exists(select 1 from auth.users where id=old.id) then return old;end if;
 end if;
 if private.account_is_purge() then if TG_OP='DELETE' then return old;else return new;end if;end if;
 if not exists(select 1 from private.account_deletions) then if TG_OP='DELETE' then return old;else return new;end if;end if;
 r=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 uid=case when TG_TABLE_NAME='profiles' then (r->>'id')::uuid else coalesce(r->>'owner_id',r->>'user_id')::uuid end;
 cid=(r->>'campaign_id')::uuid;
 if cid is null and r->>'map_id' is not null then select campaign_id into cid from public.battle_maps where id=(r->>'map_id')::uuid;end if;
 if cid is null and r->>'session_id' is not null then select campaign_id into cid from public.battle_sessions where id=(r->>'session_id')::uuid;end if;
 character_id=(r->>'character_id')::uuid;
 if private.account_is_deleting(uid) or private.account_is_deleting(auth.uid())
 or exists(select 1 from public.campaigns c join private.account_deletions d on d.user_id=c.owner_id where c.id=cid)
 or exists(select 1 from public.characters c join private.account_deletions d on d.user_id=c.owner_id where c.id=character_id)
 or exists(select 1 from private.account_deletions d where d.user_id::text=any(array[
  r->>'controlled_by',r->>'requested_by',r->>'resolved_by',r->>'rolled_by',r->>'created_by']))
 then raise exception 'A exclusão desta conta está em andamento. Aguarde sua conclusão.' using errcode='42501';end if;
 if TG_OP='DELETE' then return old;end if;return new;
end $$;
do $$ declare t record;begin
 for t in select tablename from pg_tables where schemaname='public' and (tablename='profiles' or tablename ~ '^(campaigns$|characters$|npcs$|campaign_|character_|battle_|npc_|world_|scenery_)') loop
  execute format('drop trigger if exists a00_account_deletion_guard on public.%I',t.tablename);
  execute format('create trigger a00_account_deletion_guard before insert or update or delete on public.%I for each row execute function private.account_row_guard()',t.tablename);
 end loop;
end $$;

create or replace function private.account_media_available(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid()) and not private.account_is_deleting(auth.uid())
 and not exists(select 1 from private.account_deletions d where
  split_part(p_name,'/',1)='profiles' and split_part(p_name,'/',2)=d.user_id::text
  or split_part(p_name,'/',1) in('campaigns','campaign_mural') and exists(select 1 from public.campaigns where owner_id=d.user_id and id::text=split_part(p_name,'/',2))
  or split_part(p_name,'/',1)='characters' and exists(select 1 from public.characters c where c.id::text=split_part(p_name,'/',2) and (c.owner_id=d.user_id or exists(select 1 from public.campaigns where id=c.campaign_id and owner_id=d.user_id)))
  or exists(select 1 from unnest(d.media_prefixes) prefix where left(p_name,length(prefix))=prefix)
  or exists(select 1 from (
    select 'npcs' kind,n.id,n.campaign_id from public.npcs n union all
    select 'world_regions',id,campaign_id from public.world_regions union all
    select 'world_cities',id,campaign_id from public.world_cities union all
    select 'world_locations',id,campaign_id from public.world_locations union all
    select 'battle_maps',id,campaign_id from public.battle_maps union all
    select 'campaign_mural',id,campaign_id from public.campaign_mural_items
  )e join public.campaigns c on c.id=e.campaign_id where c.owner_id=d.user_id and e.kind=split_part(p_name,'/',1) and e.id::text=split_part(p_name,'/',2)));
$$;
drop policy if exists account_deletion_storage_gate on storage.objects;
create policy account_deletion_storage_gate on storage.objects as restrictive for all to authenticated
 using(private.account_media_available(name)) with check(private.account_media_available(name));

create or replace function public.account_deletion_preview() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid=auth.uid();can_delete boolean=true;begin
 if uid is null or not exists(select 1 from public.profiles where id=uid) then raise exception 'Entre na sua conta.' using errcode='42501';end if;
 if exists(select 1 from public.site_administrators where user_id=uid) and not exists(
  select 1 from public.site_administrators a where a.user_id<>uid and not private.account_is_deleting(a.user_id)
  and not coalesce((select blocked from public.site_user_controls where user_id=a.user_id),false)) then can_delete=false;end if;
 return jsonb_build_object('campaigns',(select count(*) from public.campaigns where owner_id=uid),
  'characters',(select count(*) from public.characters where owner_id=uid),
  'memberships',(select count(*) from public.campaign_members m join public.campaigns c on c.id=m.campaign_id where m.user_id=uid and c.owner_id<>uid),
  'has_renewal',exists(select 1 from public.billing_contracts where user_id=uid and status in('creating','uncertain','pending','authorized','paused')),
  'phase',(select phase from private.account_deletions where user_id=uid),'can_delete',can_delete,
  'reason',case when not can_delete then 'Você é o último administrador ativo. Cadastre outro administrador antes de excluir sua conta.' else null end);
end $$;
create or replace function public.account_deletion_state(p_user_id uuid,p_fingerprint text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('reauthenticated',exists(select 1 from private.account_deletions
 where user_id=p_user_id and session_fingerprint=p_fingerprint and reauthenticated_until>clock_timestamp()));
$$;
create or replace function public.account_begin_deletion(p_user_id uuid,p_token uuid,p_fingerprint text,p_verified boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.account_deletions;begin
 perform 1 from public.profiles where id=p_user_id for update;
 if not found then raise exception 'Conta não encontrada.' using errcode='42501';end if;
 perform 1 from public.site_billing_settings where id=1 for update;
 if exists(select 1 from public.site_administrators where user_id=p_user_id) and not exists(
  select 1 from public.site_administrators a where a.user_id<>p_user_id and not private.account_is_deleting(a.user_id)
  and not coalesce((select blocked from public.site_user_controls where user_id=a.user_id),false))
 then raise exception 'Você é o último administrador ativo. Cadastre outro administrador antes de excluir sua conta.' using errcode='42501';end if;
 select * into d from private.account_deletions where user_id=p_user_id for update;
 if d.lease_until>clock_timestamp() then raise exception 'A exclusão já está sendo processada. Aguarde alguns instantes.' using errcode='40001';end if;
 if p_token is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or not coalesce(p_verified or
  d.session_fingerprint=p_fingerprint and d.reauthenticated_until>clock_timestamp(),false)
 then raise exception 'Confirme sua senha novamente.' using errcode='42501';end if;
 if exists(select 1 from private.billing_sync_leases where user_id=p_user_id and lease_until>clock_timestamp())
 or exists(select 1 from public.billing_contracts where user_id=p_user_id and status='creating' and created_at>clock_timestamp()-interval '2 minutes')
 then raise exception 'Um pagamento está sendo conferido. Aguarde alguns instantes antes de excluir a conta.' using errcode='40001';end if;
 insert into private.account_deletions(user_id,session_fingerprint,reauthenticated_until,lease_token,lease_until)
 values(p_user_id,p_fingerprint,clock_timestamp()+interval '10 minutes',p_token,clock_timestamp()+interval '2 minutes')
 on conflict(user_id) do update set session_fingerprint=excluded.session_fingerprint,
  reauthenticated_until=case when p_verified then excluded.reauthenticated_until else private.account_deletions.reauthenticated_until end,
  lease_token=excluded.lease_token,lease_until=excluded.lease_until returning * into d;
 return jsonb_build_object('phase',d.phase);
end $$;
create or replace function private.account_assert_lease(p_user_id uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from private.account_deletions where user_id=p_user_id and lease_token=p_token and lease_until>clock_timestamp() for update;
 if not found then raise exception 'A exclusão precisa ser retomada. Tente novamente.' using errcode='40001';end if;
end $$;
create or replace function public.account_deletion_contracts(p_user_id uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.account_assert_lease(p_user_id,p_token);
 return coalesce((select jsonb_agg(to_jsonb(c)) from public.billing_contracts c where user_id=p_user_id and status in('creating','uncertain','pending','authorized','paused')),'[]');
end $$;

create or replace function public.account_prepare_purge(p_user_id uuid,p_token uuid) returns text language plpgsql security definer set search_path='' as $$
declare result text;begin
 perform private.account_assert_lease(p_user_id,p_token);
 if exists(select 1 from public.billing_contracts where user_id=p_user_id and status in('creating','uncertain','pending','authorized','paused'))
 then raise exception 'Confirme o cancelamento da renovação antes de excluir os dados.' using errcode='40001';end if;
 -- Persist folder IDs before deleting entities, so interrupted or in-flight uploads can be recovered.
 update private.account_deletions set media_prefixes=array(select distinct p from (
  select unnest(media_prefixes) p union all select 'profiles/'||p_user_id||'/' union all
  select 'campaigns/'||id||'/' from public.campaigns where owner_id=p_user_id union all
  select 'campaign_mural/'||id||'/' from public.campaigns where owner_id=p_user_id union all
  select 'characters/'||id||'/' from public.characters where owner_id=p_user_id or campaign_id in(select id from public.campaigns where owner_id=p_user_id) union all
  select e.kind||'/'||e.id||'/' from (
   select 'npcs' kind,id,campaign_id from public.npcs union all
   select 'world_regions',id,campaign_id from public.world_regions union all
   select 'world_cities',id,campaign_id from public.world_cities union all
   select 'world_locations',id,campaign_id from public.world_locations union all
   select 'battle_maps',id,campaign_id from public.battle_maps union all
   select 'campaign_mural',id,campaign_id from public.campaign_mural_items
  )e where e.campaign_id in(select id from public.campaigns where owner_id=p_user_id)
 )prefixes) where user_id=p_user_id;
 insert into private.account_deletion_files(user_id,bucket_id,name)
 select p_user_id,o.bucket_id,o.name from storage.objects o where
  coalesce(nullif(to_jsonb(o)->>'owner_id',''),to_jsonb(o)->>'owner')=p_user_id::text
  or o.bucket_id='campaign-media' and (
   exists(select 1 from private.account_deletions d,unnest(d.media_prefixes) prefix where d.user_id=p_user_id and left(o.name,length(prefix))=prefix)
   or o.name in(select avatar_path from public.profiles where id=p_user_id union all
    select cover_path from public.campaigns where owner_id=p_user_id union all
    select portrait_path from public.characters where owner_id=p_user_id or campaign_id in(select id from public.campaigns where owner_id=p_user_id) union all
    select image_path from public.npcs where campaign_id in(select id from public.campaigns where owner_id=p_user_id) union all
    select image_path from public.world_regions where campaign_id in(select id from public.campaigns where owner_id=p_user_id) union all
    select image_path from public.world_cities where campaign_id in(select id from public.campaigns where owner_id=p_user_id) union all
    select image_path from public.world_locations where campaign_id in(select id from public.campaigns where owner_id=p_user_id) union all
    select image_path from public.campaign_mural_items where campaign_id in(select id from public.campaigns where owner_id=p_user_id) union all
    select background_image from public.battle_maps where campaign_id in(select id from public.campaigns where owner_id=p_user_id) union all
    select image from public.battle_map_tokens where campaign_id in(select id from public.campaigns where owner_id=p_user_id)))
 on conflict(user_id,bucket_id,name) do update set removed=false;
 update private.account_deletions set phase=case when phase='auth_ready' and not exists(
  select 1 from private.account_deletion_files where user_id=p_user_id and not removed) then 'auth_ready' else 'purging' end
 where user_id=p_user_id returning phase into result;return result;
end $$;
create or replace function public.account_deletion_file_batch(p_user_id uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.account_assert_lease(p_user_id,p_token);
 return coalesce((select jsonb_agg(jsonb_build_object('bucket_id',bucket_id,'name',name)) from (
  select bucket_id,name from private.account_deletion_files where user_id=p_user_id and not removed order by bucket_id,name limit 100)f),'[]');
end $$;
create or replace function public.account_confirm_removed_files(p_user_id uuid,p_token uuid,p_files jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare removed_count integer;begin
 perform private.account_assert_lease(p_user_id,p_token);
 if jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)>100 then raise exception 'Lote inválido.';end if;
 update private.account_deletion_files f set removed=true where user_id=p_user_id and exists(
  select 1 from jsonb_array_elements(p_files)e where e->>'bucket_id'=f.bucket_id and e->>'name'=f.name)
 and not exists(select 1 from storage.objects o where o.bucket_id=f.bucket_id and o.name=f.name);
 get diagnostics removed_count=row_count;return removed_count;
end $$;
create or replace function private.account_contains_reference(p_text text,p_refs text[]) returns boolean language sql immutable set search_path='' as $$
 select exists(select 1 from unnest(p_refs) ref where ref<>'' and strpos(p_text,ref)>0);
$$;
create or replace function public.account_purge_data(p_user_id uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_campaign_ids uuid[];v_character_ids uuid[];v_character_names text[];v_token_ids uuid[];v_request_ids uuid[];v_paths text[];v_refs text[];col record;begin
 perform private.account_assert_lease(p_user_id,p_token);
 if (select phase from private.account_deletions where user_id=p_user_id)='auth_ready' then return;end if;
 if (select phase from private.account_deletions where user_id=p_user_id)<>'purging'
 or exists(select 1 from private.account_deletion_files where user_id=p_user_id and not removed)
 or exists(select 1 from public.billing_contracts where user_id=p_user_id and status in('creating','uncertain','pending','authorized','paused'))
 then raise exception 'A exclusão ainda possui etapas pendentes.' using errcode='40001';end if;
 insert into private.account_purge_permits values(txid_current(),p_user_id);
 perform set_config('cronica.account_purge','on',true);
 v_campaign_ids=array(select id from public.campaigns where owner_id=p_user_id);
 v_character_ids=array(select id from public.characters where owner_id=p_user_id or campaign_id=any(v_campaign_ids));
 v_character_names=array(select name from public.characters where id=any(v_character_ids));
 v_token_ids=array(select id from public.battle_map_tokens where character_id=any(v_character_ids) or campaign_id=any(v_campaign_ids));
 v_refs=array[p_user_id::text]||v_campaign_ids::text[]||v_character_ids::text[]||v_token_ids::text[];
 v_request_ids=array(select id from public.battle_action_requests r where requested_by=p_user_id or resolved_by=p_user_id
  or token_id=any(v_token_ids) or campaign_id=any(v_campaign_ids) or private.account_contains_reference(to_jsonb(r)::text,v_refs));
 v_paths=array(select name from private.account_deletion_files where user_id=p_user_id);
 v_refs=v_refs||v_request_ids::text[]||v_paths||array(select id::text from public.billing_contracts where user_id=p_user_id);
 delete from public.campaign_session_events e where campaign_id=any(v_campaign_ids) or image_path=any(v_paths)
  or private.account_contains_reference(e.data::text,v_refs)
  or e.kind ~ '^(battle_|character_|character\.)' and private.account_contains_reference(e.title,v_character_names);
 delete from private.campaign_session_life where entity_id=any(v_character_ids);
 delete from private.character_starter_item_grants where character_id=any(v_character_ids);
 delete from private.battle_portal_trips where requested_by=p_user_id or token_id=any(v_token_ids) or private.account_contains_reference(result::text,v_refs);
 delete from private.battle_scene_requests where requested_by=p_user_id or campaign_id=any(v_campaign_ids);
 delete from private.scenery_operation_permits where user_id=p_user_id or character_id=any(v_character_ids);
 delete from public.battle_dice_rolls where rolled_by=p_user_id or request_id=any(v_request_ids) or campaign_id=any(v_campaign_ids);
 delete from public.battle_spell_effects where private.account_contains_reference(definition::text||target::text,v_refs);
 delete from public.battle_action_requests where id=any(v_request_ids);
 delete from public.battle_movements where character_id=any(v_character_ids) or token_id=any(v_token_ids) or campaign_id=any(v_campaign_ids);
 update public.battle_map_tokens set controlled_by=null,version=version+1,updated_at=clock_timestamp() where controlled_by=p_user_id and not id=any(v_token_ids);
 delete from public.character_hit_point_rolls where owner_id=p_user_id or character_id=any(v_character_ids) or campaign_id=any(v_campaign_ids);
 delete from public.campaign_sessions where created_by=p_user_id and not campaign_id=any(v_campaign_ids);
 update public.scenery_interaction_settings set claim_character_id=null,claim_request_id=null,updated_at=clock_timestamp()
 where claim_character_id=any(v_character_ids);
 update public.campaign_mural_states set revision=revision+1,updated_at=clock_timestamp() where campaign_id in(
  select campaign_id from public.campaign_mural_items where image_path=any(v_paths));
 -- Image cards require a non-null image. Remove those cards instead of leaving broken references.
 delete from public.campaign_mural_items where kind='image' and image_path=any(v_paths);
 for col in select * from (values('profiles','avatar_path'),('campaigns','cover_path'),('characters','portrait_path'),
  ('npcs','image_path'),('world_regions','image_path'),('world_cities','image_path'),('world_locations','image_path'),
  ('battle_maps','background_image'),('battle_map_tokens','image'),('campaign_mural_items','image_path'))v(tbl,field) loop
  execute format('update public.%I set %I=null,updated_at=clock_timestamp() where %I=any($1)',col.tbl,col.field,col.field) using v_paths;
 end loop;
 delete from public.characters where id=any(v_character_ids);
 delete from public.campaigns where id=any(v_campaign_ids);
 delete from public.campaign_members where user_id=p_user_id;
 delete from private.billing_webhooks where resource_id in(
  select provider_id from public.billing_contracts where user_id=p_user_id union all
  select provider_payment_id from public.billing_payments where user_id=p_user_id union all
  select invoice_id from public.billing_payments where user_id=p_user_id);
 delete from public.site_audit_log where actor_id=p_user_id or private.account_contains_reference(coalesce(target_id,'')||details::text,v_refs);
 delete from public.billing_payments where user_id=p_user_id;
 delete from public.billing_contracts where user_id=p_user_id;
 delete from public.billing_access_grants where user_id=p_user_id;
 update public.billing_access_grants set granted_by=null where granted_by=p_user_id;
 delete from private.billing_sync_leases where user_id=p_user_id;
 delete from public.site_user_controls where user_id=p_user_id;
 delete from public.site_administrators where user_id=p_user_id;
 delete from private.account_purge_permits where transaction_id=txid_current();
 perform set_config('cronica.account_purge','off',true);
 update private.account_deletions set phase='auth_ready' where user_id=p_user_id;
end $$;
create or replace function public.account_release_deletion(p_user_id uuid,p_token uuid,p_abandon boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_abandon then delete from private.account_deletions where user_id=p_user_id and lease_token=p_token and phase='preparing';end if;
 update private.account_deletions set lease_token=null,lease_until=null where user_id=p_user_id and lease_token=p_token;
end $$;

create or replace function public.billing_note_error(p_id uuid,p_code text) returns void language sql security definer set search_path='' as $$
 update public.billing_contracts set error_code=left(p_code,200),updated_at=clock_timestamp() where id=p_id;
$$;
create or replace function public.billing_claim_sync(p_user_id uuid,p_force boolean default false) returns boolean language plpgsql security definer set search_path='' as $$
declare l private.billing_sync_leases;begin
 perform 1 from public.profiles where id=p_user_id for update;
 if not found or private.account_is_deleting(p_user_id) then return false;end if;
 select * into l from private.billing_sync_leases where user_id=p_user_id for update;
 if l.lease_until>now() or not p_force and l.last_started_at>now()-interval '15 seconds' then return false;end if;
 insert into private.billing_sync_leases(user_id,lease_until,last_started_at) values(p_user_id,clock_timestamp()+interval '90 seconds',clock_timestamp())
 on conflict(user_id) do update set lease_until=excluded.lease_until,last_started_at=excluded.last_started_at;return true;
end $$;
-- Lock the same profile as deletion before storing late webhooks; never restore deleted access.
do $$ declare f record;body text;begin
 select oid,prosrc into f from pg_proc where oid='public.billing_store_payment(uuid,jsonb)'::regprocedure;
 if position('private.account_is_deleting' in f.prosrc)=0 then
  body=regexp_replace(f.prosrc,'\mbegin\M','begin
   perform 1 from public.profiles where id=(select user_id from public.billing_contracts where id=p_contract_id) for update;
   if not found or private.account_is_deleting((select user_id from public.billing_contracts where id=p_contract_id)) then return false;end if;', 'i');
  execute replace(pg_get_functiondef(f.oid),f.prosrc,body);
 end if;
end $$;

do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in('public','private') and (p.proname like 'account\_%' escape '\' or p.proname='billing_note_error') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if exists(select 1 from pg_roles where rolname='service_role') then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
grant execute on function public.account_deletion_preview() to authenticated;
grant execute on function private.account_is_purge(),private.account_media_available(text) to authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then grant usage on schema private to service_role;end if;
end $$;
commit;

-- 047: checked writes, paginated workspace summaries and durable media maintenance.
begin;

create or replace function private.touch_version47() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');return new;end $$;
do $$declare t text;begin
 foreach t in array array['campaigns','world_regions','world_cities','world_locations'] loop
  execute format('drop trigger if exists zz_version47 on public.%I',t);
  execute format('create trigger zz_version47 before update on public.%I for each row execute function private.touch_version47()',t);
 end loop;
end $$;
revoke all on function private.touch_version47() from public,anon,authenticated;

create or replace function public.save_campaign_checked(p_payload jsonb,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.campaigns;eid uuid=(p_payload->>'id')::uuid;
begin
 if auth.uid() is null or (p_payload->>'owner_id')::uuid is distinct from auth.uid() then raise exception 'Apenas o mestre pode salvar esta campanha.' using errcode='42501';end if;
 select * into c from public.campaigns where campaigns.id=eid for update;
 if c.id is not null and c.updated_at is distinct from p_expected_updated_at and not exists(
  select 1 from unnest(array['id','owner_id','rpg_system_id','name','description','theme','cover_path','status']) k where p_payload ? k and p_payload->k is distinct from to_jsonb(c)->k
 ) then return to_jsonb(c);end if;
 if (c.id is null and p_expected_updated_at is not null) or (c.id is not null and c.updated_at is distinct from p_expected_updated_at) then
  raise exception 'Esta campanha mudou ou foi removida. Recarregue antes de salvar. Seu rascunho foi preservado.' using errcode='40001';
 end if;
 if c.id is null then
  insert into public.campaigns(id,owner_id,rpg_system_id,name,description,theme,cover_path,status)
  values(eid,auth.uid(),(p_payload->>'rpg_system_id')::uuid,trim(p_payload->>'name'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'theme',''),p_payload->>'cover_path',coalesce(p_payload->>'status','active')) returning * into c;
 else
  if c.rpg_system_id is distinct from (p_payload->>'rpg_system_id')::uuid then raise exception 'O sistema da campanha não pode ser alterado.' using errcode='42501';end if;
  update public.campaigns set name=trim(p_payload->>'name'),description=coalesce(p_payload->>'description',''),theme=coalesce(p_payload->>'theme',''),cover_path=p_payload->>'cover_path',status=coalesce(p_payload->>'status','active') where campaigns.id=c.id returning * into c;
 end if;
 return to_jsonb(c);
end $$;

create or replace function public.save_world_entry_checked(p_payload jsonb,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare tab text;current_row jsonb;cid uuid=(p_payload->>'campaign_id')::uuid;eid uuid=(p_payload->>'id')::uuid;
begin
 if auth.uid() is null or not private.is_campaign_owner(cid) then raise exception 'Apenas o mestre pode salvar este lugar.' using errcode='42501';end if;
 tab=case p_payload->>'kind' when 'region' then 'world_regions' when 'city' then 'world_cities' when 'location' then 'world_locations' end;
 if tab is null or eid is null then raise exception 'Tipo de lugar inválido.';end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) into current_row using eid;
 if current_row is not null then
  declare secrets jsonb;begin
   execute format('select to_jsonb(r) from public.%I r where entry_id=$1',tab||'_private') into secrets using eid;
   current_row=current_row||(coalesce(secrets,'{}')-array['entry_id','created_at','updated_at']);
  end;
  if (current_row->>'updated_at')::timestamptz is distinct from p_expected_updated_at and not exists(
   select 1 from unnest(array['id','campaign_id','name','description','image_path','type','location','notes','visible_to_players','region_id','population','government','secrets','private_notes']) k where p_payload ? k and p_payload->k is distinct from current_row->k
  ) then return jsonb_build_object('created_at',current_row->'created_at','updated_at',current_row->'updated_at');end if;
 end if;
 if (current_row is null and p_expected_updated_at is not null) or (current_row is not null and (current_row->>'updated_at')::timestamptz is distinct from p_expected_updated_at) then
  raise exception 'Este lugar mudou ou foi removido. Recarregue antes de salvar. Seu rascunho foi preservado.' using errcode='40001';
 end if;
 perform public.save_world_entry(p_payload);
 execute format('select to_jsonb(t) from public.%I t where id=$1',tab) into current_row using eid;
 return jsonb_build_object('created_at',current_row->'created_at','updated_at',current_row->'updated_at');
end $$;
revoke all on function public.save_campaign_checked(jsonb,timestamptz),public.save_world_entry_checked(jsonb,timestamptz) from public,anon;
grant execute on function public.save_campaign_checked(jsonb,timestamptz),public.save_world_entry_checked(jsonb,timestamptz) to authenticated;

-- SECURITY INVOKER is deliberate: counts obey the same RLS as the detail lists.
create or replace function public.get_workspace_summaries() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(c.id::text,jsonb_build_object(
  'characters',(select count(*) from public.characters x where x.campaign_id=c.id),
  'npcs',(select count(*) from public.npcs x where x.campaign_id=c.id),
  'world',(select count(*) from (select campaign_id from public.world_regions union all select campaign_id from public.world_cities union all select campaign_id from public.world_locations)x where x.campaign_id=c.id)
 )),'{}'::jsonb) from public.campaigns c;
$$;
revoke all on function public.get_workspace_summaries() from public,anon;
grant execute on function public.get_workspace_summaries() to authenticated;


create table if not exists private.media_cleanup_jobs (
 id uuid primary key default gen_random_uuid(),bucket_id text not null check(bucket_id in('campaign-media','map-assets')),
 name text not null,not_before timestamptz not null default clock_timestamp()+interval '24 hours',
 lease_until timestamptz,attempts integer not null default 0,last_error text,
 created_at timestamptz not null default clock_timestamp(),unique(bucket_id,name)
);
create index if not exists media_cleanup_due47 on private.media_cleanup_jobs(not_before,lease_until);
revoke all on private.media_cleanup_jobs from public,anon,authenticated;

create or replace function private.queue_media_cleanup47(p_bucket text,p_name text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_name is null or p_name !~ '^[a-z_]+/[0-9a-fA-F-]{36}/[A-Za-z0-9_.-]+$' and p_bucket<>'map-assets' then return;end if;
 insert into private.media_cleanup_jobs(bucket_id,name) values(p_bucket,p_name) on conflict(bucket_id,name) do nothing;
end $$;

-- A durable job is created by the same transaction that replaces or removes a reference.
create or replace function private.media_reference47() returns trigger language plpgsql security definer set search_path='' as $$
declare old_path text;new_path text;col text;job private.media_cleanup_jobs;
begin
 foreach col in array tg_argv loop
  old_path=case when tg_op<>'INSERT' then to_jsonb(old)->>col end;
  new_path=case when tg_op<>'DELETE' then to_jsonb(new)->>col end;
  if new_path is distinct from old_path and new_path is not null then
   select * into job from private.media_cleanup_jobs where bucket_id='campaign-media' and name=new_path for update;
   if found and job.lease_until>clock_timestamp() then raise exception 'A imagem está sendo atualizada. Escolha a imagem novamente.' using errcode='40001';end if;
   if found then delete from private.media_cleanup_jobs where id=job.id;end if;
  end if;
  if old_path is distinct from new_path then perform private.queue_media_cleanup47('campaign-media',old_path);end if;
 end loop;
 return case when tg_op='DELETE' then old else new end;
end $$;
do $$declare t text;col text;begin
 for t,col in select * from (values('profiles','avatar_path'),('campaigns','cover_path'),('characters','portrait_path'),('npcs','image_path'),('world_regions','image_path'),('world_cities','image_path'),('world_locations','image_path'),('battle_maps','background_image'),('battle_map_tokens','image'),('campaign_mural_items','image_path'),('campaign_session_events','image_path'))v(t,c) loop
  execute format('drop trigger if exists zz_media_reference47 on public.%I',t);
  execute format('create trigger zz_media_reference47 before insert or update or delete on public.%I for each row execute function private.media_reference47(%L)',t,col);
 end loop;
end $$;

create or replace function private.media_is_referenced47(p_bucket text,p_name text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare t text;col text;used boolean;
begin
 if p_bucket='map-assets' then
  return exists(select 1 from public.map_assets a where p_name in(a.image_path,a.thumbnail_path) and (a.ready or a.created_at>now()-interval '24 hours'));
 end if;
 -- Retain images in tokens and the archived session history, even after source deletion.
 for t,col in select * from (values('profiles','avatar_path'),('campaigns','cover_path'),('characters','portrait_path'),('npcs','image_path'),('world_regions','image_path'),('world_cities','image_path'),('world_locations','image_path'),('battle_maps','background_image'),('battle_map_tokens','image'),('campaign_mural_items','image_path'),('campaign_session_events','image_path'))v(t,c) loop
  execute format('select exists(select 1 from public.%I where %I=$1)',t,col) into used using p_name;
  if used then return true;end if;
 end loop;
 if exists(select 1 from public.battle_action_requests r where strpos(to_jsonb(r)::text,p_name)>0) then return true;end if;
 return false;
end $$;

create or replace function public.lease_media_cleanup(p_limit integer default 20) returns setof private.media_cleanup_jobs language plpgsql security definer set search_path='' as $$
declare j private.media_cleanup_jobs;
begin
 -- Storage is queried as read-only metadata; the worker removes bytes through the API.
 insert into private.media_cleanup_jobs(bucket_id,name)
 select o.bucket_id,o.name from storage.objects o
 where o.bucket_id in('campaign-media','map-assets')
 and nullif(to_jsonb(o)->>'created_at','')::timestamptz<now()-interval '48 hours'
 and (o.bucket_id='campaign-media' and o.name ~ '^[a-z_]+/[0-9a-fA-F-]{36}/[A-Za-z0-9_.-]+$' or o.bucket_id='map-assets')
 and not private.media_is_referenced47(o.bucket_id,o.name)
 order by o.bucket_id,o.name limit 100
 on conflict(bucket_id,name) do nothing;
 insert into private.media_cleanup_jobs(bucket_id,name,not_before)
 select 'map-assets',p.name,clock_timestamp() from public.map_assets a cross join lateral (values(a.image_path),(a.thumbnail_path))p(name)
 where not a.ready and a.created_at<now()-interval '48 hours' limit 100
 on conflict(bucket_id,name) do nothing;
 for j in select * from private.media_cleanup_jobs where not_before<=clock_timestamp() and coalesce(lease_until,'-infinity')<clock_timestamp() and attempts<12 order by not_before,id for update skip locked limit least(greatest(p_limit,1),100) loop
  if private.media_is_referenced47(j.bucket_id,j.name) then delete from private.media_cleanup_jobs where id=j.id;continue;end if;
  if not exists(select 1 from storage.objects where bucket_id=j.bucket_id and name=j.name) then
   delete from private.media_cleanup_jobs where id=j.id;
   delete from public.map_assets a where not a.ready and a.created_at<now()-interval '48 hours' and j.name in(a.image_path,a.thumbnail_path)
    and not exists(select 1 from storage.objects o where o.bucket_id='map-assets' and o.name in(a.image_path,a.thumbnail_path));
   continue;
  end if;
  update private.media_cleanup_jobs set attempts=attempts+1,lease_until=clock_timestamp()+interval '90 seconds' where id=j.id returning * into j;
  return next j;
 end loop;
end $$;
create or replace function public.finish_media_cleanup(p_id uuid,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
declare j private.media_cleanup_jobs;
begin
 select * into j from private.media_cleanup_jobs where id=p_id for update;
 if not found then return;end if;
 if p_error is null and not exists(select 1 from storage.objects where bucket_id=j.bucket_id and name=j.name) then
  delete from private.media_cleanup_jobs where id=j.id;
  delete from public.map_assets a where not a.ready and a.created_at<now()-interval '24 hours' and j.name in(a.image_path,a.thumbnail_path)
   and not exists(select 1 from storage.objects o where o.bucket_id='map-assets' and o.name in(a.image_path,a.thumbnail_path));
 else
  update private.media_cleanup_jobs set lease_until=null,last_error=left(coalesce(p_error,'storage_not_confirmed'),160),not_before=clock_timestamp()+least(21600,60*power(2,least(attempts,8)))*interval '1 second' where id=p_id;
 end if;
end $$;

-- Personal catalog reservations are bounded, including interrupted uploads.
do $$begin
 if to_regprocedure('private.reserve_map_asset_v46(uuid,text,text,text,text[])') is null then
  alter function public.reserve_map_asset(uuid,text,text,text,text[]) rename to reserve_map_asset_v46;
  alter function public.reserve_map_asset_v46(uuid,text,text,text,text[]) set schema private;
 end if;
end $$;
create or replace function public.reserve_map_asset(p_id uuid,p_kind text,p_scope text,p_name text,p_tags text[] default '{}') returns public.map_assets language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then
  perform 1 from public.profiles where id=auth.uid() for update;
  if not exists(select 1 from public.map_assets where id=p_id) and p_scope='personal' and (select count(*) from public.map_assets where owner_id=auth.uid())>=1000 then raise exception 'Limite de 1.000 imagens na biblioteca pessoal. Consulte o suporte para ampliar.';end if;
 end if;
 return private.reserve_map_asset_v46(p_id,p_kind,p_scope,p_name,p_tags);
end $$;
revoke all on function private.reserve_map_asset_v46(uuid,text,text,text,text[]) from public,anon,authenticated;
revoke all on function public.reserve_map_asset(uuid,text,text,text,text[]) from public,anon;
grant execute on function public.reserve_map_asset(uuid,text,text,text,text[]) to authenticated;

create table if not exists private.maintenance_status47(id integer primary key check(id=1),last_run_at timestamptz,last_result jsonb);
revoke all on private.maintenance_status47 from public,anon,authenticated;
create or replace function public.record_maintenance_run(p_result jsonb) returns void language sql security definer set search_path='' as $$
 insert into private.maintenance_status47(id,last_run_at,last_result) values(1,clock_timestamp(),p_result) on conflict(id) do update set last_run_at=excluded.last_run_at,last_result=excluded.last_result;
$$;
create or replace function public.site_maintenance_health() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.site_is_admin(auth.uid()) then raise exception 'Acesso exclusivo da administração.' using errcode='42501';end if;
 return jsonb_build_object('database_version',47,'media_pending',(select count(*) from private.media_cleanup_jobs where attempts<12),'media_failed',(select count(*) from private.media_cleanup_jobs where attempts>=12),'webhooks_overdue',(select count(*) from private.billing_webhooks where status='pending' and created_at<now()-interval '15 minutes'),'last_run_at',(select last_run_at from private.maintenance_status47 where id=1),'last_result',(select last_result from private.maintenance_status47 where id=1));
end $$;
revoke all on function public.site_maintenance_health() from public,anon;
grant execute on function public.site_maintenance_health() to authenticated;
revoke all on function private.queue_media_cleanup47(text,text),private.media_reference47(),private.media_is_referenced47(text,text) from public,anon,authenticated;
revoke all on function public.lease_media_cleanup(integer),public.finish_media_cleanup(uuid,text),public.record_maintenance_run(jsonb) from public,anon,authenticated;
do $$begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant usage on schema private to service_role;
  grant execute on function public.lease_media_cleanup(integer),public.finish_media_cleanup(uuid,text),public.record_maintenance_run(jsonb) to service_role;
 end if;
end $$;

-- Preventive per-account upload quota; deletion policies remain available over quota.
create or replace function private.media_upload_quota() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and count(*)<10000 and coalesce(sum(case when (to_jsonb(o)->'metadata'->>'size') ~ '^[0-9]+$' then (to_jsonb(o)->'metadata'->>'size')::numeric else 0 end),0)<536870912
 from storage.objects o where o.bucket_id in('campaign-media','map-assets') and coalesce(nullif(to_jsonb(o)->>'owner_id',''),to_jsonb(o)->>'owner')=auth.uid()::text;
$$;
revoke all on function private.media_upload_quota() from public,anon;
grant execute on function private.media_upload_quota() to authenticated;
drop policy if exists cronica_upload_quota47 on storage.objects;
create policy cronica_upload_quota47 on storage.objects as restrictive for insert to authenticated with check(bucket_id not in('campaign-media','map-assets') or private.media_upload_quota());

create or replace function public.site_retry_media_cleanup(p_reason text) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not private.site_is_admin(auth.uid()) then raise exception 'Acesso exclusivo da administração.' using errcode='42501';end if;
 if p_reason is null or length(trim(p_reason)) not between 5 and 500 then raise exception 'Informe o motivo do reprocessamento.';end if;
 update private.media_cleanup_jobs set attempts=0,last_error=null,lease_until=null,not_before=clock_timestamp() where attempts>=12 and coalesce(lease_until,'-infinity')<clock_timestamp();
 get diagnostics n=row_count;
 insert into public.site_audit_log(actor_id,action,target_id,details) values(auth.uid(),'retry_media_cleanup','media',jsonb_build_object('reason',p_reason,'count',n));
 return n;
end $$;
revoke all on function public.site_retry_media_cleanup(text) from public,anon;
grant execute on function public.site_retry_media_cleanup(text) to authenticated;

-- Confirming an old reservation must serialize with cleanup of its files.
create or replace function private.asset_publication47() returns trigger language plpgsql security definer set search_path='' as $$
declare p text;j private.media_cleanup_jobs;
begin
 if new.ready and not old.ready then
  foreach p in array array[new.image_path,new.thumbnail_path] loop
   select * into j from private.media_cleanup_jobs where bucket_id='map-assets' and name=p for update;
   if found and j.lease_until>clock_timestamp() then raise exception 'Este envio antigo está sendo limpo. Aguarde e envie a imagem novamente.' using errcode='40001';end if;
   if found then delete from private.media_cleanup_jobs where id=j.id;end if;
   if not exists(select 1 from storage.objects where bucket_id='map-assets' and name=p) then raise exception 'O envio da imagem ainda não foi concluído.';end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function private.asset_publication47() from public,anon,authenticated;
drop trigger if exists zz_asset_publication47 on public.map_assets;
create trigger zz_asset_publication47 before update on public.map_assets for each row execute function private.asset_publication47();

notify pgrst,'reload schema';
commit;

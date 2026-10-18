-- 031: recover account deletion on databases with older attribution columns.
-- Applying this migration changes the routine only; deletion still requires the
-- authenticated account flow, confirmed cancellation, file removal and a lease.
-- Migrations 001–030 are unchanged. Pending deletions can resume afterward.
begin;
do $$ begin
 if to_regprocedure('public.account_purge_data(uuid,uuid)') is null
 or to_regclass('private.account_deletions') is null then
  raise exception 'Aplique a migração 030 antes da correção 031.';
 end if;
end $$;

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
 -- Historic tables can retain older attribution column names. Match linked UUIDs
 -- in the stored record instead of requiring requested_by/resolved_by columns.
 v_refs=v_refs||array(select id::text from public.battle_maps where campaign_id=any(v_campaign_ids));
 v_request_ids=array(select r.id from public.battle_action_requests r
  where private.account_contains_reference(to_jsonb(r)::text,v_refs));
 v_paths=array(select name from private.account_deletion_files where user_id=p_user_id);
 v_refs=v_refs||v_request_ids::text[]||v_paths||array(select id::text from public.billing_contracts where user_id=p_user_id);
 delete from public.campaign_session_events e where campaign_id=any(v_campaign_ids) or image_path=any(v_paths)
  or private.account_contains_reference(e.data::text,v_refs)
  or e.kind ~ '^(battle_|character_|character\.)' and private.account_contains_reference(e.title,v_character_names);
 delete from private.campaign_session_life where entity_id=any(v_character_ids);
 delete from private.character_starter_item_grants where character_id=any(v_character_ids);
 delete from private.battle_portal_trips t where private.account_contains_reference(to_jsonb(t)::text,v_refs);
 delete from private.battle_scene_requests r where private.account_contains_reference(to_jsonb(r)::text,v_refs);
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

revoke all on function public.account_purge_data(uuid,uuid) from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.account_purge_data(uuid,uuid) to service_role;
 end if;
end $$;
commit;

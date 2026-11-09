-- Application conflicts must not masquerade as retryable PostgreSQL serialization failures.
-- PostgREST 14 may retry explicit 40001 exceptions indefinitely. PT409 returns HTTP 409.
-- Only the listed Crônica functions are changed; actual database serialization errors remain intact.
begin;
set local lock_timeout = '5s';
do $fix53$
declare signature text; target regprocedure; original text; patched text;
begin
  foreach signature in array array[
    'private.account_assert_lease(uuid,uuid)',
    'private.account_prepare_purge_v44(uuid,uuid)',
    'private.arkanis49_progression()',
    'private.asset_publication47()',
    'private.battle42_move_effect(uuid,jsonb,timestamp with time zone)',
    'private.battle_validate_movement(uuid,integer,integer,jsonb,bigint,boolean)',
    'private.item_media_reference48()',
    'private.media_reference47()',
    'private.save_npc_v38(jsonb)',
    'public.account_begin_deletion(uuid,uuid,text,boolean)',
    'public.account_purge_data(uuid,uuid)',
    'public.add_mural_annotation(uuid,uuid,text,jsonb)',
    'public.billing_begin_checkout(uuid,uuid,text,uuid,integer,text,boolean)',
    'public.billing_begin_pix(uuid,uuid,text,uuid,integer,text,boolean)',
    'public.delete_campaign_atlas(uuid,integer)',
    'public.delete_campaign_mural_item(uuid,timestamp with time zone)',
    'public.delete_campaign_session(uuid,timestamp with time zone)',
    'public.give_campaign_item(uuid,uuid,integer,uuid,integer)',
    'public.interact_scenery(uuid,uuid,text,uuid,timestamp with time zone,uuid)',
    'public.move_battle_token_path_v7(uuid,integer,integer,jsonb,bigint,boolean)',
    'public.prepare_atlas_scene(uuid,integer,uuid,integer,integer,numeric)',
    'public.recharge_campaign_item(uuid,timestamp with time zone)',
    'public.reorder_campaign_mural(uuid,uuid[])',
    'public.save_arkanis_character(jsonb,timestamp with time zone)',
    'public.save_campaign_atlas(uuid,uuid,jsonb,integer,text)',
    'public.save_campaign_checked(jsonb,timestamp with time zone)',
    'public.save_campaign_item(jsonb,integer)',
    'public.save_campaign_mural_item(jsonb,timestamp with time zone)',
    'public.save_campaign_rules(uuid,jsonb,timestamp with time zone)',
    'public.save_campaign_session(uuid,text,integer,uuid,timestamp with time zone)',
    'public.save_scenery_element(jsonb,jsonb,timestamp with time zone)',
    'public.save_world_entry_checked(jsonb,timestamp with time zone)',
    'public.set_battle_scenery_state(uuid,text,timestamp with time zone)',
    'public.site_admin_mutate(text,jsonb,text)'
  ] loop
    target = to_regprocedure(signature);
    if target is null then raise exception 'Função necessária ausente: %. Aplique as migrações até 050 primeiro.', signature; end if;
    original = pg_get_functiondef(target);
    patched = regexp_replace(original, 'errcode[[:space:]]*=[[:space:]]*''40001''', 'errcode = ''PT409''', 'gi');
    if patched is distinct from original then execute patched; end if;
  end loop;
end
$fix53$;
notify pgrst, 'reload schema';
commit;

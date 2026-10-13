import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';

test('repair migrations preserve existing function defaults, identities and dependencies', async (t) => {
  for (const levelsDefault of [false, true]) {
    await t.test(
      levelsDefault
        ? 'multiple defaults with nested JSON and auth.uid()'
        : 'existing nullable owner default',
      async () => {
        const db = new PGlite();
        try {
          await db.exec(`
          create role authenticated nologin nosuperuser nobypassrls;
          create role anon nologin nosuperuser nobypassrls;
          create schema auth;
          create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}');
          create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
          grant usage on schema auth to authenticated,anon;
          grant execute on function auth.uid() to authenticated,anon;
          create schema storage;
          create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
          create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
          alter table storage.objects enable row level security;
          grant usage on schema storage to authenticated;
          grant select,insert,delete on storage.objects to authenticated;
        `);
          const files = migrationNames();
          for (const file of files.filter((f) => f < '202610070019'))
            await db.exec(readMigration(file));
          await db.exec(`
          create function public.roll_character_hit_points(
            p_campaign_id uuid,p_character_id uuid,
            p_levels jsonb ${levelsDefault ? `default '[{"class_id":"fighter","level":1}]'::jsonb` : ''},
            p_owner_id uuid default ${levelsDefault ? 'auth.uid()' : 'null'}
          ) returns jsonb language sql as $$select '{}'::jsonb$$;
          create function public.save_campaign_rules_v19(
            p_campaign_id uuid,p_rules jsonb default '{"nested":[1,2]}'::jsonb,
            p_expected_updated_at timestamptz default null
          ) returns public.campaign_rules language sql as $$select null::public.campaign_rules$$;
          create function public.create_battle_scene(
            p_campaign_id uuid,p_payload jsonb,p_objects jsonb,
            p_request_id uuid default gen_random_uuid()
          ) returns public.battle_maps language sql as $$select null::public.battle_maps$$;
          create function public.set_battle_map_lighting(p_map_id uuid,p_lighting text default 'night')
            returns public.battle_maps language sql as $$select null::public.battle_maps$$;
          create function public.delete_campaign_session(
            p_session_id uuid,p_expected_updated_at timestamptz default now()
          ) returns uuid language sql as $$select null::uuid$$;
          create view public.hp_defaults_dependency as
            select public.roll_character_hit_points(null::uuid,null::uuid,'[]'::jsonb,null::uuid) result;
        `);
          const signatures = [
            'public.roll_character_hit_points(uuid,uuid,jsonb,uuid)',
            'public.save_campaign_rules_v19(uuid,jsonb,timestamptz)',
            'public.save_character(jsonb,timestamptz)',
            'public.create_battle_scene(uuid,jsonb,jsonb,uuid)',
            'public.set_battle_map_lighting(uuid,text)',
            'public.delete_campaign_session(uuid,timestamptz)',
          ];
          const metadata = async (signature: string) =>
            (
              await db.query<{
                oid: number;
                args: string;
              }>(
                'select p.oid,pg_get_function_arguments(p.oid) args from pg_proc p where p.oid=to_regprocedure($1)',
                [signature],
              )
            ).rows[0];
          const before = new Map<string, Awaited<ReturnType<typeof metadata>>>();
          for (const signature of signatures) before.set(signature, await metadata(signature));

          // Reproduce the reported 42P13 before testing the compatible migration.
          await assert.rejects(
            db.exec(`
          create or replace function public.roll_character_hit_points(
            p_campaign_id uuid,p_character_id uuid,p_levels jsonb,p_owner_id uuid
          ) returns jsonb language sql as $$select '{}'::jsonb$$;
        `),
            { code: '42P13' },
          );
          for (const file of files.filter((f) => f >= '202610070019'))
            await db.exec(readMigration(file));
          for (const signature of signatures)
            assert.deepEqual(await metadata(signature), before.get(signature));
          assert.ok(
            (
              await db.query<{ view_id: string | null }>(
                "select to_regclass('public.hp_defaults_dependency') view_id",
              )
            ).rows[0].view_id,
          );

          const gm = randomUUID(),
            player = randomUUID(),
            campaign = randomUUID(),
            hero = randomUUID();
          await db.query(
            "insert into auth.users(id,email) values($1,'gm@defaults.test'),($2,'player@defaults.test')",
            [gm, player],
          );
          await db.query(
            "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,'00000000-0000-4000-8000-000000000001','Defaults')",
            [campaign, gm],
          );
          await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
            campaign,
            player,
          ]);
          await db.exec('set role authenticated');
          await db.query("select set_config('request.jwt.claim.sub',$1,false)", [player]);
          const roll = await db.query<{ result: { fighter: number[] } }>(
            levelsDefault
              ? 'select public.roll_character_hit_points($1,$2) result'
              : 'select public.roll_character_hit_points($1,$2,\'[{"class_id":"fighter","level":1}]\'::jsonb) result',
            [campaign, hero],
          );
          assert.deepEqual(roll.rows[0].result, { fighter: [10] });
          await db.exec('reset role');
          for (const file of files.filter((f) => f >= '202610070019'))
            await db.exec(readMigration(file));
          for (const signature of signatures)
            assert.deepEqual(await metadata(signature), before.get(signature));
          assert.equal(
            (
              await db.query<{ result: number }>(
                'select result from public.character_hit_point_rolls where character_id=$1',
                [hero],
              )
            ).rows[0].result,
            10,
          );
          assert.equal(
            (
              await db.query<{ allowed: boolean }>(
                "select has_function_privilege('anon','public.roll_character_hit_points(uuid,uuid,jsonb,uuid)','EXECUTE') allowed",
              )
            ).rows[0].allowed,
            false,
          );
        } finally {
          await db.close();
        }
      },
    );
  }
});

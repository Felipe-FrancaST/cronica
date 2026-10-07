import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';
import { defaultSheet } from '../src/systems/dnd5e';
import type { CampaignSession } from '../src/features/sessions/types';
import type { BattleMap } from '../src/features/vtt/types';

test('migration 021 persists lighting and safely removes only the selected chapter under GM permissions', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated nologin nosuperuser nobypassrls; create role anon nologin nosuperuser nobypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
      alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;`);
    const files = migrationNames();
    for (const file of files.filter((f) => f < '202610060016')) await db.exec(readMigration(file));
    const gm = randomUUID(),
      player = randomUUID(),
      outsider = randomUUID(),
      cid = randomUUID(),
      hero = randomUUID(),
      npc = randomUUID(),
      location = randomUUID(),
      system = '00000000-0000-4000-8000-000000000001';
    await db.query(
      "insert into auth.users(id,email) values($1,'gm@lighting.test'),($2,'player@lighting.test'),($3,'other@lighting.test')",
      [gm, player, outsider],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Noites de Valedouro')",
      [cid, gm, system],
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      cid,
      player,
    ]);
    const as = async <T>(user: string, operation: () => Promise<T>) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      try {
        return await operation();
      } finally {
        await db.exec('reset role');
      }
    };
    const call = async <T>(name: string, args: unknown[], user = gm) => {
      const result = await as(user, () =>
        db.query<{ value: T }>(
          `select to_jsonb(public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})) value`,
          args,
        ),
      );
      return result.rows[0].value;
    };
    await call(
      'save_character',
      [
        JSON.stringify({
          id: hero,
          campaign_id: cid,
          owner_id: player,
          rpg_system_id: system,
          name: 'Guardião',
          portrait_path: null,
          appearance: '',
          biography: '',
          sheet: defaultSheet(),
        }),
      ],
      player,
    );
    await db.query(
      "insert into public.npcs(id,campaign_id,rpg_system_id,name) values($1,$2,$3,'Ferreiro')",
      [npc, cid, system],
    );
    await db.query(
      "insert into public.world_locations(id,campaign_id,name) values($1,$2,'Taverna')",
      [location, cid],
    );
    for (const file of files.filter((f) => f >= '202610060016')) await db.exec(readMigration(file));
    const source = await call<CampaignSession>('save_campaign_session', [
      cid,
      'Noite na cidade',
      1,
    ]);
    const target = await call<CampaignSession>('save_campaign_session', [
      cid,
      'Próximo capítulo',
      2,
    ]);
    const map = await call<BattleMap>('create_battle_map', [
      cid,
      JSON.stringify({ name: 'Praça', width: 16, height: 12, adventure_session_id: source.id }),
    ]);
    let copy: BattleMap;
    await t.test(
      'old and new maps default to daylight and only the GM can change their period',
      async () => {
        assert.equal(map.lighting, 'day');
        for (const user of [player, outsider])
          await assert.rejects(call('set_battle_map_lighting', [map.id, 'night'], user), /mestre/);
        for (const value of ['dawn', '', null])
          await assert.rejects(call('set_battle_map_lighting', [map.id, value]), /dia ou noite/);
        const night = await call<BattleMap>('set_battle_map_lighting', [map.id, 'night']);
        assert.equal(night.lighting, 'night');
        const read = await as(player, () =>
          db.query<{ lighting: string }>('select lighting from public.battle_maps where id=$1', [
            map.id,
          ]),
        );
        assert.equal(read.rows.length, 0, 'a prepared chapter must remain private');
        for (const name of [
          'set_battle_map_lighting(uuid,text)',
          'delete_campaign_session(uuid,timestamp with time zone)',
        ]) {
          const access = await db.query<{ allowed: boolean }>(
            "select has_function_privilege($1,$2,'EXECUTE') allowed",
            ['anon', 'public.' + name],
          );
          assert.equal(access.rows[0].allowed, false);
        }
      },
    );
    await t.test('light metadata is numeric, bounded and survives saving and copying', async () => {
      const insert = (metadata: object) =>
        as(gm, () =>
          db.query(
            'insert into public.battle_map_objects(map_id,object_type,geometry,metadata) values($1,\'torch\',\'{"x":2,"y":3,"width":1,"height":1}\',$2::jsonb)',
            [map.id, JSON.stringify(metadata)],
          ),
        );
      for (const metadata of [
        { light_enabled: 'true' },
        { light_enabled: null },
        ...[0, 61, '12', null].map((light_radius) => ({ light_radius })),
        { light_color: 'red' },
      ])
        await assert.rejects(insert(metadata), /luz|alcance|cor/i);
      await insert({
        variant: 'lantern',
        light_enabled: true,
        light_radius: 12,
        light_color: '#ffcc88',
      });
      await insert({ light_enabled: false });
      await as(gm, () =>
        db.query(
          "insert into public.battle_map_cells(map_id,x,y,terrain_type) values($1,1,1,'road')",
          [map.id],
        ),
      );
      await call('set_battle_fog', [map.id, 8, 8, 1, 1, true]);
      copy = await call<BattleMap>('copy_battle_map_to_session', [
        map.id,
        target.id,
        'Praça copiada',
      ]);
      assert.equal(copy.lighting, 'night');
      assert.equal(
        (
          await db.query<{ n: number }>(
            'select count(*)::integer n from public.battle_map_objects where map_id=$1',
            [copy.id],
          )
        ).rows[0].n,
        2,
      );
    });
    await t.test(
      'a stale delete request or another participant cannot remove a chapter',
      async () => {
        for (const user of [player, outsider])
          await assert.rejects(
            call('delete_campaign_session', [source.id, source.updated_at], user),
            /mestre/,
          );
        await assert.rejects(
          call('delete_campaign_session', [source.id, '2000-01-01T00:00:00Z']),
          /mudou/,
        );
        await assert.rejects(
          as(player, () =>
            db.query('delete from public.campaign_sessions where id=$1', [source.id]),
          ),
          /permission denied/,
        );
      },
    );
    await t.test(
      'lighting can change during combat, but the active adventure cannot be deleted',
      async () => {
        await call('start_campaign_session', [source.id]);
        await as(gm, () =>
          db.query("update public.battle_sessions set status='active' where id=$1", [
            map.battle_session_id,
          ]),
        );
        assert.equal(
          (await call<BattleMap>('set_battle_map_lighting', [map.id, 'day'])).lighting,
          'day',
        );
        await call('set_battle_map_lighting', [map.id, 'night']);
        await assert.rejects(call('delete_campaign_session', [source.id]), /Encerre a sessão/);
        await assert.rejects(
          as(gm, () =>
            db.query(
              'update public.battle_map_objects set geometry=\'{"x":3,"y":3,"width":1,"height":1}\' where map_id=$1',
              [map.id],
            ),
          ),
          /Encerre o combate/,
        );
        assert.equal(
          (
            await as(player, () =>
              db.query<{ lighting: string }>(
                'select lighting from public.battle_maps where id=$1',
                [map.id],
              ),
            )
          ).rows[0].lighting,
          'night',
        );
      },
    );
    await t.test(
      'archives remain read only and keep their night lighting when copied',
      async () => {
        await call('end_campaign_session', [source.id, 'Uma noite tranquila.']);
        await assert.rejects(
          call('set_battle_map_lighting', [map.id, 'day']),
          /encerrada|consulta/,
        );
        await assert.rejects(
          as(gm, () =>
            db.query("update public.battle_maps set lighting='day' where id=$1", [map.id]),
          ),
          /encerrada|consulta/,
        );
        const reused = await call<BattleMap>('copy_battle_map_to_session', [
          map.id,
          target.id,
          'Arquivo reaproveitado',
        ]);
        assert.equal(reused.lighting, 'night');
      },
    );
    await t.test(
      'deleting an archived chapter cascades its history while preserving sheets and copied maps',
      async () => {
        await db.query(
          "insert into public.campaign_mural_items(campaign_id,adventure_session_id,kind,title,source_npc_id) values($1,$2,'npc','O ferreiro',$3)",
          [cid, target.id, npc],
        );
        // Prepared content on the source was created before archiving; create a
        // second archived chapter to also exercise mural/cell/object cascades.
        const prepared = await call<CampaignSession>('save_campaign_session', [
          cid,
          'Preparação descartada',
          3,
        ]);
        const preparedMap = await call<BattleMap>('create_battle_map', [
          cid,
          JSON.stringify({ name: 'Rascunho', adventure_session_id: prepared.id }),
        ]);
        await call('save_campaign_mural_item', [
          JSON.stringify({
            campaign_id: cid,
            adventure_session_id: prepared.id,
            kind: 'npc',
            title: 'Ferreiro',
            source_npc_id: npc,
          }),
          null,
        ]);
        await call('delete_campaign_session', [prepared.id, prepared.updated_at]);
        assert.equal(
          (await db.query('select id from public.battle_maps where id=$1', [preparedMap.id])).rows
            .length,
          0,
        );
        const archived = (
          await db.query<{ updated_at: string }>(
            'select updated_at::text from public.campaign_sessions where id=$1',
            [source.id],
          )
        ).rows[0];
        await call('delete_campaign_session', [source.id, archived.updated_at]);
        for (const table of [
          'campaign_session_events',
          'battle_maps',
          'battle_sessions',
          'campaign_mural_items',
        ])
          assert.equal(
            (
              await db.query(`select 1 from public.${table} where adventure_session_id=$1`, [
                source.id,
              ])
            ).rows.length,
            0,
            table,
          );
        for (const table of ['battle_map_cells', 'battle_map_fog', 'battle_map_objects'])
          assert.equal(
            (await db.query(`select 1 from public.${table} where map_id=$1`, [map.id])).rows.length,
            0,
            table,
          );
        assert.equal(
          (
            await db.query('select 1 from private.campaign_session_life where session_id=$1', [
              source.id,
            ])
          ).rows.length,
          0,
        );
        for (const [table, id] of [
          ['characters', hero],
          ['npcs', npc],
          ['world_locations', location],
          ['campaigns', cid],
          ['battle_maps', copy!.id],
        ])
          assert.equal(
            (await db.query(`select 1 from public.${table} where id=$1`, [id])).rows.length,
            1,
            table,
          );
      },
    );
    await t.test(
      'the additive migration can be reapplied without losing remaining scenery or lighting',
      async () => {
        await db.exec(readMigration(files.find((f) => f.includes('0021'))!));
        assert.equal(
          (
            await db.query<{ lighting: string }>(
              'select lighting from public.battle_maps where id=$1',
              [copy!.id],
            )
          ).rows[0].lighting,
          'night',
        );
        assert.equal(
          (await db.query('select 1 from public.campaign_sessions where id=$1', [target.id])).rows
            .length,
          1,
        );
      },
    );
  } finally {
    await db.close();
  }
});

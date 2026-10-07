import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';
import { medievalCityObjects, MEDIEVAL_CITY } from '../src/features/vtt/medieval-city';

test('migration 020 persists large scenery and creates the medieval city atomically under master permissions', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated nologin nosuperuser nobypassrls;create role anon nologin nosuperuser nobypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
      alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
    for (const file of migrationNames()) await db.exec(readMigration(file));
    const gm = randomUUID(),
      player = randomUUID(),
      outsider = randomUUID(),
      campaign = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'gm@city.test'),($2,'player@city.test'),($3,'outsider@city.test')",
      [gm, player, outsider],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,'00000000-0000-4000-8000-000000000001','Valedouro')",
      [campaign, gm],
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      campaign,
      player,
    ]);
    const as = async <T>(user: string, action: () => Promise<T>) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      try {
        return await action();
      } finally {
        await db.exec('reset role');
      }
    };
    const payload = { ...MEDIEVAL_CITY, name: 'Valedouro', session_name: 'Cidade medieval' };
    const objects = medievalCityObjects(),
      request = randomUUID();
    const create = (user: string, list = objects, requestId = request) =>
      as(user, () =>
        db.query<{ id: string; battle_session_id: string }>(
          'select m.id,m.battle_session_id from public.create_battle_scene($1,$2::jsonb,$3::jsonb,$4) m',
          [campaign, JSON.stringify(payload), JSON.stringify(list), requestId],
        ),
      );
    let mapId = '',
      sessionId = '';
    await t.test(
      'players and outsiders cannot create cities or read creation requests',
      async () => {
        for (const user of [player, outsider]) await assert.rejects(create(user), /mestre/);
        await assert.rejects(
          as(player, () => db.query('select * from private.battle_scene_requests')),
          /permission denied/,
        );
      },
    );
    await t.test(
      'master receives one fully populated map and retries preserve the same map',
      async () => {
        const created = (await create(gm)).rows[0];
        mapId = created.id;
        sessionId = created.battle_session_id;
        assert.equal(
          (
            await db.query<{ n: number }>(
              'select count(*)::integer n from public.battle_map_objects where map_id=$1',
              [mapId],
            )
          ).rows[0].n,
          objects.length,
        );
        assert.equal((await create(gm)).rows[0].id, mapId);
        assert.equal(
          (
            await db.query<{ n: number }>(
              'select count(*)::integer n from public.battle_maps where campaign_id=$1',
              [campaign],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await as(player, () =>
              db.query<{ n: number }>(
                'select count(*)::integer n from public.battle_map_objects where map_id=$1',
                [mapId],
              ),
            )
          ).rows[0].n,
          0,
        );
        const adventure = (
          await db.query<{ adventure_session_id: string }>(
            'select adventure_session_id from public.battle_maps where id=$1',
            [mapId],
          )
        ).rows[0].adventure_session_id;
        await as(gm, () => db.query('select public.start_campaign_session($1)', [adventure]));
        assert.equal(
          (
            await as(player, () =>
              db.query<{ n: number }>(
                'select count(*)::integer n from public.battle_map_objects where map_id=$1',
                [mapId],
              ),
            )
          ).rows[0].n,
          objects.length,
        );
      },
    );
    await t.test('an invalid element rolls back the map, encounter and request', async () => {
      const invalid = [
        ...objects,
        { ...objects[0], geometry: { x: 120, y: 105, width: 128, height: 128, rotation: 0 } },
      ];
      await assert.rejects(create(gm, invalid, randomUUID()), /dimensões|fora do mapa/i);
      for (const table of ['battle_maps', 'battle_sessions'])
        assert.equal(
          (
            await db.query<{ n: number }>(
              `select count(*)::integer n from public.${table} where campaign_id=$1`,
              [campaign],
            )
          ).rows[0].n,
          1,
        );
      assert.equal(
        (
          await db.query<{ n: number }>(
            'select count(*)::integer n from private.battle_scene_requests where campaign_id=$1',
            [campaign],
          )
        ).rows[0].n,
        1,
      );
    });
    await t.test(
      '128-cell scenery persists while 129-cell elements, fractional sizes and invalid heights are refused',
      async () => {
        await as(gm, () =>
          db.query('update public.battle_maps set width=160,height=160 where id=$1', [mapId]),
        );
        const insert = (geometry: object, height: unknown = 95) =>
          as(gm, () =>
            db.query(
              "insert into public.battle_map_objects(map_id,object_type,geometry,metadata,blocks_movement) values($1,'mountain',$2::jsonb,$3::jsonb,false) returning id",
              [
                mapId,
                JSON.stringify(geometry),
                JSON.stringify({ variant: 'snowy', style: 'winter', height_metres: height }),
              ],
            ),
          );
        const geometry = { x: 0, y: 0, width: 128, height: 128, rotation: 15 };
        assert.ok((await insert(geometry)).rows.length);
        await assert.rejects(insert({ ...geometry, width: 129 }), /128/);
        await assert.rejects(insert({ ...geometry, width: 1.5 }), /células/);
        for (const height of [0, 301, '95', null])
          await assert.rejects(insert(geometry, height), /Altura visual/);
      },
    );
    await t.test('existing combat and player editing locks still protect scenery', async () => {
      const id = (
        await db.query<{ id: string }>(
          'select id from public.battle_map_objects where map_id=$1 limit 1',
          [mapId],
        )
      ).rows[0].id;
      await assert.rejects(
        as(player, () =>
          db.query(
            'insert into public.battle_map_objects(map_id,object_type,geometry,metadata) values($1,\'rock\',\'{"x":0,"y":0,"width":1,"height":1}\',\'{}\')',
            [mapId],
          ),
        ),
      );
      await db.query("update public.battle_sessions set status='active' where id=$1", [sessionId]);
      await assert.rejects(
        as(gm, () =>
          db.query('update public.battle_map_objects set visible=false where id=$1', [id]),
        ),
        /combate/i,
      );
      await assert.rejects(
        as(gm, () => db.query('delete from public.battle_map_objects where id=$1', [id])),
        /combate/i,
      );
      await db.query("update public.battle_sessions set status='preparing' where id=$1", [
        sessionId,
      ]);
      await db.exec(readMigration('202610070020_large_scenery_and_medieval_city.sql'));
      assert.equal((await create(gm)).rows[0].id, mapId);
    });
  } finally {
    await db.close();
  }
});

import { applyGameMigration } from './helpers/billing-database';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';
import {
  SCENERY,
  SCENERY_VARIANTS,
  SCENERY_GROUPS,
  makeScenery,
  scenerySize,
  sceneryDefaults,
} from '../src/features/vtt/scenery';
import type { BattleMapObject, BattleMap } from '../src/features/vtt/types';

test('dungeon migration supports live master interactions, collision checks and existing privacy/locks', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated nologin nosuperuser nobypassrls;create role anon nologin nosuperuser nobypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
      alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
    for (const name of migrationNames()) await applyGameMigration(db, name);
    // The upgrade must also be safe to rerun.
    await db.exec(readMigration('202610130024_dungeon_scenery_and_interactions.sql'));
    await db.exec(readMigration('202610130026_scenery_lights_locks_and_loot.sql'));
    await db.exec(readMigration('202610140027_scenery_container_timestamp_fix.sql'));
    const gm = randomUUID(),
      player = randomUUID(),
      outsider = randomUUID(),
      campaign = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'gm@dungeon.test'),($2,'player@dungeon.test'),($3,'other@dungeon.test')",
      [gm, player, outsider],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,'00000000-0000-4000-8000-000000000001','Cripta')",
      [campaign, gm],
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      campaign,
      player,
    ]);
    const as = async <T>(user: string, run: () => Promise<T>) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      try {
        return await run();
      } finally {
        await db.exec('reset role');
      }
    };
    const kinds = SCENERY_GROUPS.find((g) => g.id === 'dungeon')!.kinds;
    const pieces = kinds.map((kind, i) =>
      makeScenery(
        '',
        { x: i * 4, y: 4 },
        { kind, ...scenerySize(kind), rotation: 0, ...sceneryDefaults(kind) },
      ),
    );
    const map = (
      await as(gm, () =>
        db.query<{ value: BattleMap }>(
          'select to_jsonb(public.create_battle_scene($1,$2::jsonb,$3::jsonb,$4)) value',
          [
            campaign,
            JSON.stringify({ name: 'Masmorra', width: 64, height: 24 }),
            JSON.stringify(pieces),
            randomUUID(),
          ],
        ),
      )
    ).rows[0].value;
    const readDoor = async () =>
      (
        await db.query<{ value: BattleMapObject }>(
          "select to_jsonb(o) value from public.battle_map_objects o where map_id=$1 and object_type='door'",
          [map.id],
        )
      ).rows[0].value;
    const interact = async (user: string, object: BattleMapObject, variant: string) =>
      (
        await as(user, () =>
          db.query<{ value: BattleMapObject }>(
            'select to_jsonb(public.set_battle_scenery_state($1,$2,$3::timestamptz)) value',
            [object.id, variant, object.updated_at],
          ),
        )
      ).rows[0].value;
    await t.test('SQL recognizes every editor kind and variant', async () => {
      assert.equal(
        (
          await db.query<{ n: number }>(
            'select count(*)::integer n from public.battle_map_objects where map_id=$1',
            [map.id],
          )
        ).rows[0].n,
        16,
      );
      for (const s of SCENERY)
        for (const variant of ['default', ...(SCENERY_VARIANTS[s.id] ?? []).map((v) => v.id)]) {
          const row = (
            await db.query<{ kind: boolean; variant: boolean }>(
              'select private.battle_is_scenery_kind($1) kind,private.battle_valid_scenery_variant($1,$2) variant',
              [s.id, variant],
            )
          ).rows[0];
          assert.equal(row.kind && row.variant, true, `${s.id}/${variant}`);
        }
    });
    await t.test('only the master can interact, and stale requests fail', async () => {
      const door = await readDoor();
      for (const user of [player, outsider])
        await assert.rejects(interact(user, door, 'open'), /mestre/);
      const opened = await interact(gm, door, 'open');
      assert.equal(opened.blocks_movement, false);
      assert.equal(opened.blocks_vision, false);
      await assert.rejects(interact(gm, door, 'open'), /mudou/);
      await assert.rejects(interact(gm, opened, 'iron'), /interação/);
    });
    await as(gm, () =>
      db.query('select public.start_campaign_session($1)', [map.adventure_session_id]),
    );
    await db.query("update public.battle_sessions set status='active' where id=$1", [
      map.battle_session_id,
    ]);
    await t.test('opening and closing work in combat, general edits remain locked', async () => {
      let door = await readDoor();
      door = await interact(gm, door, 'default');
      assert.equal(door.blocks_movement, true);
      assert.equal(door.blocks_vision, true);
      door = await interact(gm, door, 'open');
      await assert.rejects(
        as(gm, () =>
          db.query(
            "update public.battle_map_objects set geometry=jsonb_set(geometry,'{x}','10') where id=$1",
            [door.id],
          ),
        ),
        /combate/,
      );
      await assert.rejects(
        as(gm, () =>
          db.query(
            "update public.battle_map_objects set metadata=jsonb_set(jsonb_set(metadata,'{variant}','\"default\"'),'{movement_cost}','3'),blocks_movement=true,blocks_vision=true where id=$1",
            [door.id],
          ),
        ),
        /combate/,
      );
      await assert.rejects(
        as(gm, () => db.query('delete from public.battle_map_objects where id=$1', [door.id])),
        /combate/,
      );
    });
    await t.test('a passage cannot close over a creature', async () => {
      const door = await readDoor(),
        token = randomUUID();
      await db.query(
        "insert into public.battle_map_tokens(id,campaign_id,map_id,name,x,y,size,controlled_by) values($1,$2,$3,'Visitante',0,4,1,$4)",
        [token, campaign, map.id, player],
      );
      await assert.rejects(interact(gm, door, 'default'), /bloqueia um personagem/);
      assert.equal((await readDoor()).metadata.variant, 'open');
      await db.query('delete from public.battle_map_tokens where id=$1', [token]);
    });
    await t.test('ended chapters remain immutable', async () => {
      await db.query(
        "update public.campaign_sessions set status='ended',ended_at=clock_timestamp() where id=$1",
        [map.adventure_session_id],
      );
      await assert.rejects(interact(gm, await readDoor(), 'default'), /encerrada/);
    });
  } finally {
    await db.close();
  }
});

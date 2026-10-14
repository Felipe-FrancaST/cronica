import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';
import { ITEM_STARTERS } from '../src/features/items/model';
import { defaultSheet } from '../src/systems/dnd5e';
import { makeScenery, sceneryDefaults } from '../src/features/vtt/scenery';
import type { BattleMapObject } from '../src/features/vtt/types';
import type { CampaignItem } from '../src/features/items/types';

test('scenery locks conceal rewards, recognize actual keys and grant treasure exactly once', async (t) => {
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
    await db.exec(readMigration('202610130026_scenery_lights_locks_and_loot.sql'));
    await db.exec(readMigration('202610140027_scenery_container_timestamp_fix.sql'));

    const gm = randomUUID(),
      player = randomUUID(),
      outsider = randomUUID(),
      cid = randomUUID(),
      hero = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'gm@locks.test'),($2,'player@locks.test'),($3,'other@locks.test')",
      [gm, player, outsider],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,'00000000-0000-4000-8000-000000000001','Tesouro')",
      [cid, gm],
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      cid,
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
    await as(gm, () =>
      db.query('select public.save_character($1::jsonb,null)', [
        JSON.stringify({
          id: hero,
          campaign_id: cid,
          owner_id: player,
          rpg_system_id: '00000000-0000-4000-8000-000000000001',
          name: 'Portador',
          sheet: defaultSheet(),
        }),
      ]),
    );
    const map = (
      await as(gm, () =>
        db.query<{ m: { id: string; adventure_session_id: string; battle_session_id: string } }>(
          'select to_jsonb(public.create_battle_map($1,$2::jsonb)) m',
          [cid, JSON.stringify({ name: 'Cripta', width: 16, height: 16 })],
        ),
      )
    ).rows[0].m;
    await as(gm, () =>
      db.query('select public.start_campaign_session($1)', [map.adventure_session_id]),
    );
    const token = (
      await as(gm, () =>
        db.query<{ t: { id: string } }>(
          'select to_jsonb(public.add_character_to_battle_map($1,$2,2,2)) t',
          [map.id, hero],
        ),
      )
    ).rows[0].t;
    const reward = (
      await as(gm, () =>
        db.query<{ v: CampaignItem }>(
          'select to_jsonb(public.save_campaign_item($1::jsonb,null)) v',
          [
            JSON.stringify({
              id: randomUUID(),
              campaign_id: cid,
              data: ITEM_STARTERS.find((s) => s.id === 'healing')!.create(),
              private_notes: 'Segredo que não acompanha o tesouro',
            }),
          ],
        ),
      )
    ).rows[0].v;
    const setup = async (kind: string, x: number, y: number, requires = true) => {
      const object = {
        ...makeScenery(
          map.id,
          { x, y },
          {
            kind: kind as 'chest',
            width: 1,
            height: 1,
            rotation: 0,
            ...sceneryDefaults(kind),
          },
        ),
        id: randomUUID(),
        created_at: '',
        updated_at: '',
      };
      return (
        await as(gm, () =>
          db.query<{ v: { object: BattleMapObject; key_item_id: string } }>(
            'select public.save_scenery_element($1::jsonb,$2::jsonb) v',
            [
              JSON.stringify(object),
              JSON.stringify({
                requires_key: requires,
                key_name: 'Chave da cripta',
                locked: requires,
                loot_item_id: ['chest', 'supplycrate', 'sarcophagus'].includes(kind)
                  ? reward.id
                  : null,
                quantity: 2,
              }),
            ],
          ),
        )
      ).rows[0].v;
    };
    let chest = await setup('chest', 3, 2);
    const read = async (id = chest.object.id) =>
      (
        await db.query<{ v: BattleMapObject }>(
          'select to_jsonb(o) v from public.battle_map_objects o where id=$1',
          [id],
        )
      ).rows[0].v;
    const interact = async (
      user: string,
      intent = 'open',
      key: string | null = null,
      request = randomUUID(),
      o = chest.object,
    ) =>
      (
        await as(user, () =>
          db.query<{
            v: {
              object: BattleMapObject;
              message: string;
              loot: null | { name: string; data: Record<string, unknown> };
              taken: boolean;
            };
          }>('select public.interact_scenery($1,$2,$3,$4,$5::timestamptz,$6) v', [
            o.id,
            token.id,
            intent,
            key,
            o.updated_at,
            request,
          ]),
        )
      ).rows[0].v;
    const giveKey = async (id: string) => {
      const key = (
        await db.query<{ v: CampaignItem }>(
          'select to_jsonb(i) v from public.campaign_items i where id=$1',
          [id],
        )
      ).rows[0].v;
      return (
        await as(gm, () =>
          db.query<{ v: { inventory_id: string } }>(
            'select to_jsonb(public.give_campaign_item($1,$2,1,$3,$4)) v',
            [key.id, hero, randomUUID(), key.version],
          ),
        )
      ).rows[0].v.inventory_id;
    };
    await t.test(
      'blank form timestamps allow every container to save its reward and be edited',
      async () => {
        for (const [i, kind] of ['chest', 'supplycrate', 'sarcophagus'].entries()) {
          const saved = await setup(kind, 5 + i, 4, false);
          assert.ok(Number.isFinite(Date.parse(saved.object.created_at)), kind);
          assert.ok(Number.isFinite(Date.parse(saved.object.updated_at)), kind);
          const settings = { requires_key: false, loot_item_id: reward.id, quantity: 3 };
          const edited = (
            await as(gm, () =>
              db.query<{ v: { object: BattleMapObject } }>(
                'select public.save_scenery_element($1::jsonb,$2::jsonb,$3::timestamptz) v',
                [
                  JSON.stringify({ ...saved.object, created_at: '', updated_at: '' }),
                  JSON.stringify(settings),
                  saved.object.updated_at,
                ],
              ),
            )
          ).rows[0].v.object;
          assert.equal(edited.created_at, saved.object.created_at);
          assert.notEqual(edited.updated_at, saved.object.updated_at);
          const rewardSettings = (
            await as(gm, () =>
              db.query<{ loot_item_id: string; quantity: number }>(
                'select loot_item_id,quantity from public.scenery_interaction_settings where object_id=$1',
                [edited.id],
              ),
            )
          ).rows[0];
          assert.equal(rewardSettings.loot_item_id, reward.id);
          assert.equal(rewardSettings.quantity, 3);
          await assert.rejects(
            as(gm, () =>
              db.query('select public.save_scenery_element($1::jsonb,$2::jsonb,$3::timestamptz)', [
                JSON.stringify({ ...edited, updated_at: '2099-01-01T00:00:00Z' }),
                JSON.stringify(settings),
                saved.object.updated_at,
              ]),
            ),
            /mudou/,
          );
        }
        const before = await read();
        await db.exec(readMigration('202610140027_scenery_container_timestamp_fix.sql'));
        assert.deepEqual(await read(), before);
      },
    );
    await t.test(
      'moving a configured chest preserves its key, reward and collection state, and stale moves do nothing',
      async () => {
        const saved = await setup('chest', 5, 6);
        const contents = async () =>
          (
            await db.query<{ v: Record<string, unknown> }>(
              'select to_jsonb(s) v from public.scenery_interaction_settings s where object_id=$1',
              [saved.object.id],
            )
          ).rows[0].v;
        const before = await contents();
        const moved = (
          await as(gm, () =>
            db.query<{ v: BattleMapObject }>(
              'update public.battle_map_objects set geometry=$2::jsonb where id=$1 and updated_at=$3::timestamptz returning to_jsonb(battle_map_objects) v',
              [
                saved.object.id,
                JSON.stringify({ ...saved.object.geometry, x: 7, y: 6 }),
                saved.object.updated_at,
              ],
            ),
          )
        ).rows[0].v;
        assert.equal(moved.id, saved.object.id);
        assert.equal(moved.geometry.x, 7);
        assert.deepEqual(moved.metadata, saved.object.metadata);
        assert.deepEqual(await contents(), before);
        const stale = await as(gm, () =>
          db.query(
            'update public.battle_map_objects set geometry=$2::jsonb where id=$1 and updated_at=$3::timestamptz returning id',
            [saved.object.id, JSON.stringify(saved.object.geometry), saved.object.updated_at],
          ),
        );
        assert.equal(stale.rows.length, 0);
        assert.equal((await read(saved.object.id)).geometry.x, 7);
        assert.deepEqual(await contents(), before);
      },
    );
    await t.test(
      'closed treasure and lock configuration stay private and a key is created in Items',
      async () => {
        assert.equal(
          (await as(player, () => db.query('select * from public.scenery_interaction_settings')))
            .rows.length,
          0,
        );
        const result = (
          await as(player, () =>
            db.query<{ v: { loot: unknown } }>('select public.get_scenery_contents($1) v', [
              chest.object.id,
            ]),
          )
        ).rows[0].v;
        assert.equal(result.loot, null);
        await assert.rejects(interact(player), /Baú trancado/);
        await assert.rejects(interact(outsider), /disponível/);
        assert.equal(
          (
            await db.query<{ name: string }>('select name from public.campaign_items where id=$1', [
              chest.key_item_id,
            ])
          ).rows[0].name,
          'Chave da cripta',
        );
        await assert.rejects(
          as(player, () =>
            db.exec(
              "insert into private.scenery_operation_permits(transaction_id,object_id,user_id,payload) values(txid_current(),gen_random_uuid(),auth.uid(),'{}')",
            ),
          ),
          /permission denied/,
        );
      },
    );
    await t.test(
      'a same-named unrelated item cannot unlock it; the matching key opens and reveals only public item data',
      async () => {
        const original = (
          await db.query<{ v: CampaignItem }>(
            'select to_jsonb(i) v from public.campaign_items i where id=$1',
            [chest.key_item_id],
          )
        ).rows[0].v;
        const other = (
          await as(gm, () =>
            db.query<{ v: CampaignItem }>(
              'select to_jsonb(public.save_campaign_item($1::jsonb,null)) v',
              [JSON.stringify({ ...original, id: randomUUID(), version: 0 })],
            ),
          )
        ).rows[0].v;
        await assert.rejects(interact(player, 'open', await giveKey(other.id)), /chave correta/);
        const key = await giveKey(original.id);
        const opened = await interact(player, 'open', key);
        chest.object = opened.object;
        assert.equal(opened.loot!.name, reward.name);
        assert.equal(opened.loot!.data.private_notes, undefined);
        assert.equal(opened.object.metadata.interaction_locked, false);
        assert.equal(
          (
            await db.query<{ q: number }>(
              "select (data->>'quantity')::integer q from public.character_inventory where id=$1",
              [key],
            )
          ).rows[0].q,
          1,
        );
      },
    );
    await t.test(
      'collection retries deliver once and later attempts cannot duplicate treasure',
      async () => {
        const request = randomUUID(),
          before = chest.object;
        const taken = await interact(player, 'take', null, request);
        chest.object = taken.object;
        assert.equal(taken.taken, true);
        assert.equal(taken.loot, null);
        await interact(player, 'take', null, request, before);
        await assert.rejects(interact(player, 'take'), /disponível/);
        assert.equal(
          (
            await db.query<{ n: number }>(
              'select count(*)::integer n from public.campaign_item_deliveries where id=$1',
              [request],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::integer n from public.character_inventory where character_id=$1 and data->>'campaign_item_id'=$2",
              [hero, reward.id],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      'an unlocked chest opens without a key, while distance and stale versions are checked',
      async () => {
        const unlocked = await setup('chest', 2, 3, false);
        const result = await interact(player, 'open', null, randomUUID(), unlocked.object);
        assert.ok(result.loot);
        await assert.rejects(
          interact(player, 'open', null, randomUUID(), unlocked.object),
          /mudou/,
        );
        const distant = await setup('chest', 10, 10, false);
        await assert.rejects(
          interact(player, 'open', null, randomUUID(), distant.object),
          /Aproxime/,
        );
      },
    );
    await t.test(
      'doors share lock rules, light controls work during combat and ended chapters stay immutable',
      async () => {
        const copyId = randomUUID();
        await as(gm, () =>
          db.query(
            'insert into public.battle_map_objects(id,map_id,object_type,geometry,z,visible,blocks_movement,blocks_vision,metadata) select $1,map_id,object_type,\'{"x":10,"y":12,"width":1,"height":1}\',z,visible,blocks_movement,blocks_vision,metadata from public.battle_map_objects where id=$2',
            [copyId, chest.object.id],
          ),
        );
        const copied = (
          await db.query<{ key_item_id: string; taken: boolean }>(
            'select key_item_id,taken from public.scenery_interaction_settings where object_id=$1',
            [copyId],
          )
        ).rows[0];
        assert.equal(copied.key_item_id, chest.key_item_id);
        assert.equal(copied.taken, true);
        const door = await setup('door', 1, 2, true);
        await assert.rejects(
          interact(player, 'open', null, randomUUID(), door.object),
          /trancad[oa]/,
        );
        const opened = await interact(
          player,
          'open',
          await giveKey(door.key_item_id),
          randomUUID(),
          door.object,
        );
        assert.equal(opened.object.blocks_movement, false);
        assert.equal(opened.object.blocks_vision, false);
        const occupant = randomUUID();
        await db.query(
          "insert into public.battle_map_tokens(id,campaign_id,map_id,name,x,y,size,controlled_by) values($1,$2,$3,'Visitante',1,2,1,$4)",
          [occupant, cid, map.id, gm],
        );
        await assert.rejects(
          as(gm, () =>
            db.query("select public.set_battle_scenery_state($1,'lock',$2::timestamptz)", [
              door.object.id,
              opened.object.updated_at,
            ]),
          ),
          /bloqueia um personagem/,
        );
        assert.equal(
          (
            await db.query<{ locked: boolean }>(
              'select locked from public.scenery_interaction_settings where object_id=$1',
              [door.object.id],
            )
          ).rows[0].locked,
          false,
        );
        await db.query('delete from public.battle_map_tokens where id=$1', [occupant]);
        const torch = (
          await as(gm, () =>
            db.query<{ v: BattleMapObject }>(
              'insert into public.battle_map_objects(map_id,object_type,geometry,metadata) values($1,\'torch\',\'{"x":6,"y":6,"width":1,"height":1}\',\'{"variant":"default","light_intensity":1.4,"light_color":"#ffaa66"}\') returning to_jsonb(battle_map_objects) v',
              [map.id],
            ),
          )
        ).rows[0].v;
        await db.query(
          "update public.battle_sessions set status='active',active_token_id=$2 where id=$1",
          [map.battle_session_id, token.id],
        );
        const off = (
          await as(gm, () =>
            db.query<{ v: BattleMapObject }>(
              "select to_jsonb(public.set_battle_scenery_state($1,'light-off',$2::timestamptz)) v",
              [torch.id, torch.updated_at],
            ),
          )
        ).rows[0].v;
        assert.equal(off.metadata.light_enabled, false);
        await assert.rejects(
          as(player, () =>
            db.query("select public.set_battle_scenery_state($1,'light-on',$2::timestamptz)", [
              off.id,
              off.updated_at,
            ]),
          ),
          /mestre/,
        );
        await db.query(
          "update public.campaign_sessions set status='ended',ended_at=now() where id=$1",
          [map.adventure_session_id],
        );
        await assert.rejects(
          interact(player, 'close', null, randomUUID(), await read()),
          /encerrada/,
        );
      },
    );
  } finally {
    await db.close();
  }
});

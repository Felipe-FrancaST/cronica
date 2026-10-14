import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';
import { defaultSheet } from '../src/systems/dnd5e';
import { emptyCurrency, type Currency } from '../src/systems/dnd5e/currency';
import { ITEM_STARTERS } from '../src/features/items/model';
import { makeScenery, sceneryDefaults } from '../src/features/vtt/scenery';
import {
  CONTAINER_KINDS,
  REWARD_KINDS,
  type SceneryIntent,
} from '../src/features/vtt/scenery-capabilities';
import type { SceneryContents, ScenerySetup } from '../src/features/vtt/scenery-gameplay';
import type { BattleMapObject } from '../src/features/vtt/types';
import type { CampaignItem } from '../src/features/items/types';

const migration = '202610140028_scenery_rewards_and_mechanisms.sql';
test('scenery rewards preserve D&D coins, authorize discovery and atomically operate linked elements', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated nologin nosuperuser nobypassrls;create role anon nologin nosuperuser nobypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
      alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
    for (const file of migrationNames().filter((file) => file < migration))
      await db.exec(readMigration(file));
    const gm = randomUUID(),
      player = randomUUID(),
      other = randomUUID(),
      outsider = randomUUID(),
      campaign = randomUUID(),
      hero = randomUUID(),
      secondHero = randomUUID();
    for (const [i, id] of [gm, player, other, outsider].entries())
      await db.query('insert into auth.users(id,email) values($1,$2)', [
        id,
        `rewards${i}@test.local`,
      ]);
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,'00000000-0000-4000-8000-000000000001','Recompensas')",
      [campaign, gm],
    );
    await db.query(
      'insert into public.campaign_members(campaign_id,user_id) values($1,$2),($1,$3)',
      [campaign, player, other],
    );
    const as = async <T>(user: string, run: () => Promise<T>) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      try {
        return await run();
      } finally {
        await db.exec('reset role');
      }
    };
    const value = async <T>(sql: string, args: unknown[] = []) =>
      (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
    for (const [id, owner] of [
      [hero, player],
      [secondHero, other],
    ])
      await as(gm, () =>
        db.query('select public.save_character($1::jsonb,null)', [
          JSON.stringify({
            id,
            campaign_id: campaign,
            owner_id: owner,
            rpg_system_id: '00000000-0000-4000-8000-000000000001',
            name: 'Aventureiro',
            sheet: defaultSheet(),
          }),
        ]),
      );
    const map = await as(gm, () =>
      value<{ id: string; adventure_session_id: string; battle_session_id: string }>(
        'select to_jsonb(public.create_battle_map($1,$2::jsonb)) v',
        [campaign, JSON.stringify({ name: 'Salão', width: 20, height: 20 })],
      ),
    );
    await as(gm, () =>
      db.query('select public.start_campaign_session($1)', [map.adventure_session_id]),
    );
    const token = await as(gm, () =>
      value<{ id: string }>('select to_jsonb(public.add_character_to_battle_map($1,$2,2,2)) v', [
        map.id,
        hero,
      ]),
    );
    const token2 = await as(gm, () =>
      value<{ id: string }>('select to_jsonb(public.add_character_to_battle_map($1,$2,2,3)) v', [
        map.id,
        secondHero,
      ]),
    );
    const item = await as(gm, () =>
      value<CampaignItem>('select to_jsonb(public.save_campaign_item($1::jsonb,null)) v', [
        JSON.stringify({
          id: randomUUID(),
          campaign_id: campaign,
          data: ITEM_STARTERS.find((s) => s.id === 'healing')!.create(),
          private_notes: 'Segredo do mestre',
        }),
      ]),
    );
    const defaults = (): ScenerySetup => ({
      requires_key: false,
      locked: false,
      key_name: 'Chave da galeria',
      loot_item_id: null,
      quantity: 1,
      refill: false,
      coins: emptyCurrency(),
      discovery_text: '',
      player_enabled: true,
      linked_object_id: null,
    });
    const object = (kind: string, x = 3, y = 2): BattleMapObject => ({
      ...makeScenery(
        map.id,
        { x, y },
        { kind: kind as 'chest', width: 1, height: 1, rotation: 0, ...sceneryDefaults(kind) },
      ),
      id: randomUUID(),
      created_at: '',
      updated_at: '',
    });
    const save = async (o: BattleMapObject, s: Partial<ScenerySetup> = {}, user = gm) =>
      as(user, () =>
        value<{ object: BattleMapObject; key_item_id: string }>(
          'select public.save_scenery_element($1::jsonb,$2::jsonb,$3::timestamptz) v',
          [JSON.stringify(o), JSON.stringify({ ...defaults(), ...s }), o.updated_at || null],
        ),
      );
    const read = (id: string) =>
      value<BattleMapObject>('select to_jsonb(o) v from public.battle_map_objects o where id=$1', [
        id,
      ]);
    const contents = (id: string, user = player) =>
      as(user, () => value<SceneryContents>('select public.get_scenery_contents($1) v', [id]));
    const interact = (
      o: BattleMapObject,
      intent: SceneryIntent,
      user = player,
      request = randomUUID(),
      key: string | null = null,
      actor = token.id,
    ) =>
      as(user, () =>
        value<SceneryContents>('select public.interact_scenery($1,$2,$3,$4,$5::timestamptz,$6) v', [
          o.id,
          actor,
          intent,
          key,
          o.updated_at,
          request,
        ]),
      );
    const wallet = () =>
      value<Currency>("select system_data->'currency' v from public.characters where id=$1", [
        hero,
      ]);
    const count = (table: string, where: string, args: unknown[]) =>
      value<number>(`select count(*)::integer v from public.${table} where ${where}`, args);
    const legacy = await save(object('chest'), { loot_item_id: item.id });
    const legacyOpen = await interact(legacy.object, 'open');
    const legacyRequest = randomUUID();
    const legacyTaken = await interact(legacyOpen.object, 'take', player, legacyRequest);
    await db.exec(readMigration(migration));

    await t.test(
      'upgrade and reapplication preserve existing keys, collected items and retry receipts',
      async () => {
        const before = await read(legacy.object.id);
        await db.exec(readMigration(migration));
        assert.deepEqual(await read(legacy.object.id), before);
        assert.equal(
          (await interact(legacyOpen.object, 'take', player, legacyRequest)).taken,
          true,
        );
        assert.equal(
          await count('character_inventory', "character_id=$1 and data->>'campaign_item_id'=$2", [
            hero,
            item.id,
          ]),
          1,
        );
        assert.equal(legacyTaken.taken, true);
      },
    );
    await t.test(
      'a pile adds all five denominations to the sheet once and preserves other resources',
      async () => {
        const prior = { cp: 3, sp: 4, ep: 5, gp: 6, pp: 7 };
        await db.query(
          "update public.characters set system_data=jsonb_set(system_data,'{currency}',$2::jsonb) where id=$1",
          [hero, JSON.stringify(prior)],
        );
        const sheetBefore = await value<Record<string, unknown>>(
          'select system_data v from public.characters where id=$1',
          [hero],
        );
        const coins = { cp: 9, sp: 12, ep: 2, gp: 37, pp: 1 };
        const pile = await save(object('treasure'), { coins });
        assert.equal((await contents(pile.object.id)).coins, null);
        await assert.rejects(interact(pile.object, 'take'), /disponível/);
        const discovered = await interact(pile.object, 'inspect');
        assert.deepEqual(discovered.coins, coins);
        const request = randomUUID();
        const taken = await interact(discovered.object, 'take', player, request);
        assert.equal(taken.taken, true);
        assert.equal(taken.coins, null);
        assert.deepEqual(await wallet(), { cp: 12, sp: 16, ep: 7, gp: 43, pp: 8 });
        const sheetAfter = await value<Record<string, unknown>>(
          'select system_data v from public.characters where id=$1',
          [hero],
        );
        const { currency: _, ...restBefore } = sheetBefore;
        const { currency: __, ...restAfter } = sheetAfter;
        assert.deepEqual(restAfter, restBefore);
        await interact(discovered.object, 'take', player, request);
        assert.deepEqual(await wallet(), { cp: 12, sp: 16, ep: 7, gp: 43, pp: 8 });
        await assert.rejects(
          interact(taken.object, 'take', other, randomUUID(), null, token2.id),
          /disponível/,
        );
        assert.equal(await count('scenery_reward_claims', 'request_id=$1', [request]), 1);
        assert.equal(
          (await as(other, () => db.query('select * from public.scenery_reward_claims'))).rows
            .length,
          0,
        );
        assert.equal(
          (await as(outsider, () => db.query('select * from public.scenery_reward_claims'))).rows
            .length,
          0,
        );
      },
    );
    await t.test(
      'locked chests conceal coins and grant item plus coins together with the matching inventory key',
      async () => {
        const chest = await save(object('chest'), {
          requires_key: true,
          locked: true,
          loot_item_id: item.id,
          quantity: 2,
          coins: { ...emptyCurrency(), gp: 25 },
          discovery_text: 'Sob o forro há um mapa.',
        });
        const hidden = await contents(chest.object.id);
        assert.equal(hidden.loot, null);
        assert.equal(hidden.coins, null);
        assert.equal(hidden.description, null);
        assert.ok(!JSON.stringify(hidden.object).includes('Sob o forro'));
        await assert.rejects(interact(chest.object, 'open'), /Baú trancado/);
        await assert.rejects(interact(chest.object, 'inspect'), /Abra/);
        const key = await value<CampaignItem>(
          'select to_jsonb(i) v from public.campaign_items i where id=$1',
          [chest.key_item_id],
        );
        const delivery = await as(gm, () =>
          value<{ inventory_id: string }>(
            'select to_jsonb(public.give_campaign_item($1,$2,1,$3,$4)) v',
            [key.id, hero, randomUUID(), key.version],
          ),
        );
        const opened = await interact(
          chest.object,
          'open',
          player,
          randomUUID(),
          delivery.inventory_id,
        );
        assert.equal(opened.loot?.quantity, 2);
        assert.equal(opened.coins?.gp, 25);
        assert.equal(opened.description, 'Sob o forro há um mapa.');
        assert.ok(!JSON.stringify(opened).includes('Segredo do mestre'));
        const before = await wallet();
        const taken = await interact(opened.object, 'take');
        assert.equal(taken.loot, null);
        assert.equal(taken.coins, null);
        assert.equal((await wallet()).gp, before.gp + 25);
        assert.equal(
          await value<number>(
            "select (data->>'quantity')::integer v from public.character_inventory where id=$1",
            [delivery.inventory_id],
          ),
          1,
        );
      },
    );
    await t.test(
      'coin-only containers and harvesting or searching other pieces use the same reward system',
      async () => {
        for (const kind of REWARD_KINDS) {
          const configured = await save(object(kind), {
            coins: { ...emptyCurrency(), cp: 1 },
            loot_item_id: ['flowers', 'weaponrack'].includes(kind) ? item.id : null,
          });
          const revealed = await interact(
            configured.object,
            CONTAINER_KINDS.includes(kind) ? 'open' : 'inspect',
          );
          assert.equal(revealed.coins?.cp, 1, kind);
          const result = await interact(revealed.object, 'take');
          assert.equal(result.taken, true, kind);
        }
      },
    );
    await t.test(
      'editing collected rewards requires an explicit refill; old request IDs cannot claim a refill',
      async () => {
        const settings = { ...defaults(), coins: { ...emptyCurrency(), gp: 5 } };
        const pile = await save(object('treasure'), settings);
        const revealed = await interact(pile.object, 'inspect');
        const request = randomUUID();
        const taken = await interact(revealed.object, 'take', player, request);
        const edited = await save(taken.object, {
          ...settings,
          coins: { ...emptyCurrency(), gp: 12 },
        });
        assert.equal((await contents(edited.object.id)).taken, true);
        const refilled = await save(edited.object, { ...settings, refill: true });
        const before = await wallet();
        await interact(refilled.object, 'take', player, request);
        assert.deepEqual(await wallet(), before);
        assert.equal((await contents(refilled.object.id)).taken, false);
        await interact(refilled.object, 'take');
        assert.equal((await wallet()).gp, before.gp + 5);
        const another = await save(object('treasure'), settings);
        await assert.rejects(interact(another.object, 'take', player, request), /já foi utilizado/);
      },
    );
    await t.test(
      'invalid denominations, fractions, negative amounts and unauthorized configurations roll back',
      async () => {
        for (const coins of [
          { ...emptyCurrency(), gp: -1 },
          { ...emptyCurrency(), gp: 1.5 },
          { ...emptyCurrency(), gp: 1000001 },
          { ...emptyCurrency(), gp: '12' },
          { gp: 12 },
          { ...emptyCurrency(), bitcoin: 1 },
          null,
          [],
        ]) {
          const o = object('treasure');
          await assert.rejects(save(o, { coins: coins as Currency }), /Moedas/);
          assert.equal(await count('battle_map_objects', 'id=$1', [o.id]), 0);
        }
        await assert.rejects(save(object('treasure'), {}, player), /mestre/);
        await assert.rejects(
          save(object('lever'), { coins: { ...emptyCurrency(), gp: 1 } }),
          /não aceita/,
        );
        await assert.rejects(save(object('flowers'), { requires_key: true }), /fechadura/);
        await assert.rejects(
          save(object('signpost'), { discovery_text: 'x'.repeat(4001) }),
          /4.000/,
        );
        assert.equal(
          (await as(player, () => db.query('select * from public.scenery_interaction_settings')))
            .rows.length,
          0,
        );
      },
    );
    await t.test(
      'overflow or failed delivery does not consume the reward or partly modify the sheet',
      async () => {
        const before = await wallet();
        await db.query(
          "update public.characters set system_data=jsonb_set(system_data,'{currency,gp}','9007199254740991') where id=$1",
          [hero],
        );
        const pile = await save(object('treasure'), {
          coins: { ...emptyCurrency(), gp: 1 },
          loot_item_id: item.id,
        });
        const revealed = await interact(pile.object, 'inspect');
        const inventoryBefore = await count('character_inventory', 'character_id=$1', [hero]);
        const request = randomUUID();
        await assert.rejects(interact(revealed.object, 'take', player, request), /limite numérico/);
        assert.equal((await contents(pile.object.id)).taken, false);
        assert.equal(await count('scenery_reward_claims', 'request_id=$1', [request]), 0);
        assert.equal(
          await count('character_inventory', 'character_id=$1', [hero]),
          inventoryBefore,
        );
        await db.query(
          "update public.characters set system_data=jsonb_set(system_data,'{currency}',$2::jsonb) where id=$1",
          [hero, JSON.stringify(before)],
        );
      },
    );
    await t.test(
      'inscriptions stay private before examination; distance, controlled tokens and master restrictions apply',
      async () => {
        const sign = await save(object('signpost'), {
          discovery_text: 'A senha é luar.\nSiga para o norte.',
        });
        assert.equal((await contents(sign.object.id)).description, null);
        const examined = await interact(sign.object, 'inspect');
        assert.equal(examined.description, 'A senha é luar.\nSiga para o norte.');
        const distant = await save(object('signpost', 15, 15), { discovery_text: 'Distante' });
        await assert.rejects(interact(distant.object, 'inspect'), /Aproxime/);
        await assert.rejects(interact(sign.object, 'inspect', other), /controla/);
        await assert.rejects(contents(sign.object.id, outsider), /disponível/);
        const blocked = await save(object('altar'), {
          player_enabled: false,
          discovery_text: 'Segredo',
        });
        await assert.rejects(interact(blocked.object, 'inspect'), /mestre/);
        await interact(blocked.object, 'inspect', gm);
      },
    );
    await t.test(
      'players can toggle nearby lights without changing their radius or other settings',
      async () => {
        const light = await save(object('torch'), { discovery_text: 'Uma chama azul.' });
        const off = await interact(light.object, 'light-off');
        assert.equal(off.object.metadata.light_enabled, false);
        assert.equal(off.description, 'Uma chama azul.');
        const on = await interact(off.object, 'light-on');
        assert.equal(on.object.metadata.light_enabled, true);
        assert.deepEqual(on.object.geometry, light.object.geometry);
        await assert.rejects(interact(on.object, 'open'), /não está disponível/);
      },
    );
    await t.test(
      'mechanisms operate a distant locked door and roll back both states if closing blocks an occupant',
      async () => {
        const door = await save(object('door', 8, 8), { requires_key: true, locked: true });
        const lever = await save(object('lever'), {
          linked_object_id: door.object.id,
          discovery_text: 'As correntes se movem.',
        });
        assert.deepEqual((await contents(lever.object.id)).changed_objects, []);
        const activated = await interact(lever.object, 'activate');
        assert.equal(activated.object.metadata.variant, 'activated');
        assert.equal(activated.changed_objects?.[0].blocks_movement, false);
        assert.equal((await read(door.object.id)).metadata.interaction_locked, false);
        assert.equal(activated.description, 'As correntes se movem.');
        const occupant = randomUUID();
        await db.query(
          "insert into public.battle_map_tokens(id,campaign_id,map_id,name,x,y,size,controlled_by) values($1,$2,$3,'Ocupante',8,8,1,$4)",
          [occupant, campaign, map.id, gm],
        );
        await assert.rejects(interact(activated.object, 'deactivate'), /bloqueia um personagem/);
        assert.equal((await read(lever.object.id)).metadata.variant, 'activated');
        assert.equal((await read(door.object.id)).blocks_movement, false);
        await db.query('delete from public.battle_map_tokens where id=$1', [occupant]);
        const reset = await interact(activated.object, 'deactivate');
        assert.equal(reset.changed_objects?.[0].blocks_movement, true);
        await assert.rejects(
          as(player, () =>
            db.query("select public.set_scenery_mechanism_state($1,'activated',$2)", [
              reset.object.id,
              reset.object.updated_at,
            ]),
          ),
          /mestre/,
        );
        const masterResult = await as(gm, () =>
          value<SceneryContents>("select public.set_scenery_mechanism_state($1,'activated',$2) v", [
            reset.object.id,
            reset.object.updated_at,
          ]),
        );
        assert.equal(masterResult.changed_objects?.[0].blocks_movement, false);
      },
    );
    await t.test(
      'pressure plates and gongs control lights; invalid or cross-map targets cannot be configured',
      async () => {
        const light = await save(object('beacon', 12, 12));
        for (const kind of ['pressureplate', 'gong']) {
          const source = await save(object(kind), { linked_object_id: light.object.id });
          const active = await interact(source.object, 'activate');
          assert.equal(active.changed_objects?.[0].metadata.light_enabled, true);
          const reset = await interact(active.object, 'deactivate');
          assert.equal(reset.changed_objects?.[0].metadata.light_enabled, false);
        }
        const unsupported = await save(object('flowers'));
        await assert.rejects(
          save(object('lever'), { linked_object_id: unsupported.object.id }),
          /Vincule/,
        );
        const map2 = await as(gm, () =>
          value<{ id: string }>('select to_jsonb(public.create_battle_map($1,$2::jsonb)) v', [
            campaign,
            JSON.stringify({ name: 'Outro salão', width: 20, height: 20 }),
          ]),
        );
        const cross = { ...object('torch', 5, 5), map_id: map2.id };
        const target = await save(cross);
        await assert.rejects(
          save(object('lever'), { linked_object_id: target.object.id }),
          /Vincule/,
        );
      },
    );
    await t.test('hidden targets do not leak through the interaction response', async () => {
      const light = await save({ ...object('beacon', 14, 14), visible: false });
      const lever = await save(object('lever'), { linked_object_id: light.object.id });
      const result = await interact(lever.object, 'activate');
      assert.deepEqual(result.changed_objects, []);
      assert.equal((await read(light.object.id)).metadata.light_enabled, true);
      await as(gm, () =>
        db.query('delete from public.battle_map_objects where id=$1', [light.object.id]),
      );
      await assert.rejects(
        interact(result.object, 'deactivate'),
        /alvo deste mecanismo foi removido/,
      );
      assert.equal((await read(lever.object.id)).metadata.variant, 'activated');
      const reconfigured = await save(result.object, { linked_object_id: null });
      assert.equal(
        (await interact(reconfigured.object, 'deactivate')).object.metadata.variant,
        'default',
      );
    });
    await t.test('copies preserve denominations, clues and the spent state', async () => {
      const settings = { coins: { ...emptyCurrency(), gp: 9 }, discovery_text: 'Ervas de prata.' };
      const source = await save(object('flowers'), settings);
      const revealed = await interact(source.object, 'inspect');
      const taken = await interact(revealed.object, 'take');
      const copy = {
        ...taken.object,
        id: randomUUID(),
        geometry: { ...taken.object.geometry, x: 5, y: 7 },
      };
      await as(gm, () =>
        db.query(
          'insert into public.battle_map_objects(id,map_id,object_type,geometry,z,visible,blocks_movement,blocks_vision,metadata) values($1,$2,$3,$4,0,true,$5,$6,$7)',
          [
            copy.id,
            copy.map_id,
            copy.object_type,
            JSON.stringify(copy.geometry),
            copy.blocks_movement,
            copy.blocks_vision,
            JSON.stringify(copy.metadata),
          ],
        ),
      );
      const copied = await value<ScenerySetup>(
        'select to_jsonb(s) v from public.scenery_interaction_settings s where object_id=$1',
        [copy.id],
      );
      assert.deepEqual(copied.coins, settings.coins);
      assert.equal(copied.discovery_text, settings.discovery_text);
      assert.equal(copied.taken, true);
    });
    await t.test(
      'combat turns, stale revisions and ended adventures still protect new interactions',
      async () => {
        const pile = await save(object('treasure'), { coins: { ...emptyCurrency(), gp: 2 } });
        const revealed = await interact(pile.object, 'inspect');
        await assert.rejects(interact(pile.object, 'take'), /mudou/);
        await db.query(
          "update public.battle_sessions set status='active',active_token_id=$2 where id=$1",
          [map.battle_session_id, token2.id],
        );
        await assert.rejects(interact(revealed.object, 'take'), /turno/);
        await db.query(
          "update public.battle_sessions set status='preparing',active_token_id=null where id=$1",
          [map.battle_session_id],
        );
        await db.query(
          "update public.campaign_sessions set status='ended',ended_at=now() where id=$1",
          [map.adventure_session_id],
        );
        await assert.rejects(interact(revealed.object, 'take'), /encerrada/);
        await assert.rejects(save(revealed.object, { coins: emptyCurrency() }), /encerrada/);
      },
    );
  } finally {
    await db.close();
  }
});

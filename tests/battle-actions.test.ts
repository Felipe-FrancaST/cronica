import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { defaultSheet } from '../src/systems/dnd5e';
import { SPELL_CATALOG, spellFromCatalog } from '../src/systems/dnd5e/spell-catalog';
import {
  previewEffect,
  spellEffect,
  pointInEffect,
  EMPTY_EFFECT,
} from '../src/features/vtt/effects';
import type { BattleActionRequest, BattleMap, BattleToken } from '../src/features/vtt/types';

const gm = 'a1000000-0000-4000-8000-000000000001',
  player = 'a1000000-0000-4000-8000-000000000002',
  outsider = 'a1000000-0000-4000-8000-000000000003';
const campaign = 'a2000000-0000-4000-8000-000000000001',
  hero = 'a3000000-0000-4000-8000-000000000001',
  fighter = 'a3000000-0000-4000-8000-000000000002';
const npc = 'a4000000-0000-4000-8000-000000000001',
  hidden = 'a4000000-0000-4000-8000-000000000002';
const fireballId = 'a5000000-0000-4000-8000-000000000001',
  healId = 'a5000000-0000-4000-8000-000000000002',
  spiritId = 'a5000000-0000-4000-8000-000000000003';
const weaponId = 'a5000000-0000-4000-8000-000000000004',
  system = '00000000-0000-4000-8000-000000000001';

test('battle approval transactions, resources, HP, reactions, privacy and geometry in PostgreSQL', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated nologin nosuperuser nobypassrls;create role anon nologin nosuperuser nobypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
   alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
    for (const file of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    await db.query(
      `insert into auth.users(id,email) values($1,'gm@local.test'),($2,'player@local.test'),($3,'outsider@local.test')`,
      [gm, player, outsider],
    );
    await db.query(
      `insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Battle tests')`,
      [campaign, gm, system],
    );
    await db.query(`insert into public.campaign_members(campaign_id,user_id) values($1,$2)`, [
      campaign,
      player,
    ]);
    const as = async <T>(id: string, fn: () => Promise<T>) => {
      await db.exec('set role authenticated');
      await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id]);
      try {
        return await fn();
      } finally {
        await db.exec('reset role');
      }
    };
    const spell = (id: string, key: string) => ({
      ...spellFromCatalog(
        SPELL_CATALOG.find((s) => s.id === key)!,
        id,
        'wizard',
      ),
      prepared: true,
      casting_mode: 'bonus' as const,
    });
    const sheet = {
      ...defaultSheet(),
      class_id: 'wizard',
      level: 5,
      hp_current: 60,
      hp_max_override: 60,
      abilities: { str: 10, dex: 12, con: 14, int: 16, wis: 10, cha: 10 },
      spells: [
        spell(fireballId, 'bola-de-fogo'),
        spell(healId, 'curar-ferimentos'),
        spell(spiritId, 'guardioes-espirituais'),
      ],
      inventory: [
        {
          id: weaponId,
          name: 'Adaga',
          category: 'weapon',
          quantity: 1,
          weight: 1,
          equipped: true,
          damage: '1d4 perfurante',
          notes: 'Acuidade',
        },
      ],
    };
    const save = (id: string, owner: string, s: unknown) =>
      as(owner, () =>
        db.query(`select public.save_character($1::jsonb)`, [
          JSON.stringify({
            id,
            campaign_id: campaign,
            rpg_system_id: system,
            owner_id: owner,
            name: id === hero ? 'Mage' : 'Fighter',
            appearance: '',
            biography: '',
            sheet: s,
          }),
        ]),
      );
    await save(hero, player, sheet);
    await save(fighter, gm, {
      ...defaultSheet(),
      class_id: 'fighter',
      level: 11,
      hp_current: 60,
      hp_max_override: 60,
      inventory: [
        { ...sheet.inventory[0], id: randomUUID(), name: 'Espada longa', damage: '1d8 cortante' },
      ],
    });
    await db.query(
      `insert into public.npcs(id,campaign_id,rpg_system_id,name,relationship,visible_to_players) values($1,$2,$3,'Inimigo','Hostil',true),($4,$2,$3,'Segredo','Hostil',false)`,
      [npc, campaign, system, hidden],
    );
    await db.query(
      `insert into public.npc_stats(npc_id,hp_current,hp_max,abilities) values($1,50,50,'{"str":16,"dex":10,"con":10,"int":10,"wis":10,"cha":10}'),($2,50,50,'{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}')`,
      [npc, hidden],
    );
    await db.query(
      `insert into public.npc_attacks(npc_id,data) values($1,'{"name":"Espada","damage":"1d6+3","range":"1,5 m"}')`,
      [npc],
    );
    const map = (
      await as(gm, () =>
        db.query<{ m: BattleMap }>(
          `select to_jsonb(public.create_battle_map($1,'{"name":"Arena","width":20,"height":20,"scale_per_cell":1.5}')) m`,
          [campaign],
        ),
      )
    ).rows[0].m;
    let actor = (
      await as(gm, () =>
        db.query<{ t: BattleToken }>(
          `select to_jsonb(public.add_character_to_battle_map($1,$2,2,2)) t`,
          [map.id, hero],
        ),
      )
    ).rows[0].t;
    const fighterToken = (
      await as(gm, () =>
        db.query<{ t: BattleToken }>(
          `select to_jsonb(public.add_character_to_battle_map($1,$2,2,8)) t`,
          [map.id, fighter],
        ),
      )
    ).rows[0].t;
    const enemy = (
      await as(gm, () =>
        db.query<{ t: BattleToken }>(
          `select to_jsonb(public.add_npc_to_battle_map($1,$2,9,'m',3,2)) t`,
          [map.id, npc],
        ),
      )
    ).rows[0].t;
    const secret = (
      await as(gm, () =>
        db.query<{ t: BattleToken }>(
          `select to_jsonb(public.add_npc_to_battle_map($1,$2,9,'m',6,3)) t`,
          [map.id, hidden],
        ),
      )
    ).rows[0].t;
    const start = (id = actor.id) =>
      as(gm, () =>
        db.query(`select public.start_battle_combat($1,$2)`, [
          map.battle_session_id,
          JSON.stringify([{ token_id: id, initiative: 20 }]),
        ]),
      );
    const token = async (id = actor.id) =>
      (await db.query<BattleToken>(`select * from public.battle_map_tokens where id=$1`, [id]))
        .rows[0];
    const request = (
      payload: Record<string, unknown>,
      id = actor.id,
      user = player,
      clientId: string = randomUUID(),
    ) =>
      as(
        user,
        async () =>
          (
            await db.query<{ r: BattleActionRequest }>(
              `select to_jsonb(public.request_battle_action($1,$2,$3)) r`,
              [id, JSON.stringify(payload), clientId],
            )
          ).rows[0].r,
      );
    const resolve = (id: string, success = true, opts: Record<string, unknown> = {}) =>
      as(
        gm,
        async () =>
          (
            await db.query<{ r: BattleActionRequest }>(
              `select to_jsonb(public.resolve_battle_action($1,$2,$3)) r`,
              [id, success, JSON.stringify(opts)],
            )
          ).rows[0].r,
      );
    const fire = () =>
      request({
        kind: 'spell',
        source_id: fireballId,
        resource_kind: 'slot',
        resource_level: 3,
        target: { x: 6, y: 2 },
        target_ids: [],
      });
    const stats = async () =>
      (
        await db.query<{ hp_current: number; hp_temp: number }>(
          `select hp_current,hp_temp from public.npc_stats where npc_id=$1`,
          [npc],
        )
      ).rows[0];
    const resources = async () =>
      (
        await db.query<{ s: Record<string, unknown> }>(
          `select system_data s from public.characters where id=$1`,
          [hero],
        )
      ).rows[0].s;
    await start();
    await t.test(
      'catalog profiles match all 361 spells and distinguish HP pools from damage',
      async () => {
        assert.equal(
          (await db.query(`select id from public.dnd_spells where combat='{}'`)).rows.length,
          0,
        );
        for (const row of (
          await db.query<{ id: string; combat: object }>(`select id,combat from public.dnd_spells`)
        ).rows)
          assert.deepEqual(row.combat, spellEffect({ catalog_id: row.id }), row.id);
        assert.equal(spellEffect({ catalog_id: 'sono' }).kind, 'utility');
        assert.equal(spellEffect({ catalog_id: 'guardioes-espirituais' }).timing, 'trigger');
        assert.equal(spellEffect({ catalog_id: 'curar-ferimentos' }).kind, 'healing');
      },
    );
    await t.test(
      'unowned actors, unknown weapons, wrong turns, hidden and out-of-range targets are rejected',
      async () => {
        await assert.rejects(() => request({ kind: 'dash' }, actor.id, outsider));
        await assert.rejects(() => request({ kind: 'dash' }, fighterToken.id));
        await assert.rejects(() =>
          request({
            kind: 'weapon',
            source_id: randomUUID(),
            target: { x: 3, y: 2 },
            target_ids: [enemy.id],
          }),
        );
        await assert.rejects(() =>
          request({
            kind: 'weapon',
            source_id: weaponId,
            target: { x: 6, y: 3 },
            target_ids: [secret.id],
          }),
        );
        await assert.rejects(() =>
          request({
            kind: 'spell',
            source_id: fireballId,
            resource_kind: 'slot',
            resource_level: 1,
            target: { x: 6, y: 2 },
          }),
        );
        await assert.rejects(() => request({ kind: 'dash', target: { z: 0 } }));
        await assert.rejects(() =>
          as(player, () =>
            db.query(`insert into public.battle_action_requests(campaign_id) values($1)`, [
              campaign,
            ]),
          ),
        );
        await assert.rejects(() => as(player, () => db.query(`select private.battle_roll('1d6')`)));
      },
    );
    await t.test(
      'pending requests do not mutate HP or slots, are idempotent and block ending/moving',
      async () => {
        const client = randomUUID(),
          payload = {
            kind: 'spell',
            source_id: fireballId,
            resource_kind: 'slot',
            resource_level: 3,
            target: { x: 6, y: 2 },
            target_ids: [],
          };
        const r = await request(payload, actor.id, player, client);
        assert.equal((await stats()).hp_current, 50);
        assert.equal((await request(payload, actor.id, player, client)).id, r.id);
        assert.equal(
          (await resources()).slots_used &&
            (((await resources()).slots_used as Record<string, number>)['3'] ?? 0),
          0,
        );
        await assert.rejects(() => request({ kind: 'dash' }));
        await assert.rejects(() =>
          as(player, () =>
            db.query(`select public.advance_battle_turn($1)`, [map.battle_session_id]),
          ),
        );
        actor = await token();
        await assert.rejects(() =>
          as(player, () =>
            db.query(`select public.move_battle_token($1,2,3,'[{"x":2,"y":3}]',$2,false)`, [
              actor.id,
              actor.version,
            ]),
          ),
        );
        await assert.rejects(() =>
          as(player, () => db.query(`select public.resolve_battle_action($1,true,'{}')`, [r.id])),
        );
        const out = await resolve(r.id, true, {
          dice: '12',
          targets: { [enemy.id]: { saved: true, multiplier: 0.5 } },
        });
        assert.equal(out.status, 'success');
        assert.equal((await stats()).hp_current, 47); // save half, resistance half
        assert.equal(
          (
            await db.query<{ hp_current: number }>(
              `select hp_current from public.npc_stats where npc_id=$1`,
              [hidden],
            )
          ).rows[0].hp_current,
          38,
        );
        assert.ok(!out.resolution.affected?.some((x) => x.name === 'Segredo'));
        assert.equal(((await resources()).slots_used as Record<string, number>)['3'], 1);
        assert.equal((await token()).action_used, true);
        await resolve(r.id, true, { dice: '100' });
        assert.equal((await stats()).hp_current, 47);
        await as(player, async () => {
          assert.equal(
            (
              await db.query(`select * from public.battle_action_effects where token_id=$1`, [
                secret.id,
              ])
            ).rows.length,
            0,
          );
        });
      },
    );
    await t.test(
      'failure leaves HP unchanged and consumes resources by default; GM can change that policy',
      async () => {
        await start();
        let r = await fire();
        await resolve(r.id, false);
        assert.equal((await stats()).hp_current, 47);
        assert.equal(((await resources()).slots_used as Record<string, number>)['3'], 2);
        assert.equal((await token()).action_used, true);
        await start();
        await assert.rejects(fire);
        await db.query(
          `update public.characters set system_data=jsonb_set(system_data,'{slots_used}','{}') where id=$1`,
          [hero],
        );
        await as(gm, () =>
          db.query(`update public.battle_sessions set failed_actions_consume=false where id=$1`, [
            map.battle_session_id,
          ]),
        );
        r = await fire();
        await resolve(r.id, false);
        assert.equal((await token()).action_used, false);
        assert.equal(((await resources()).slots_used as Record<string, number>)['3'] ?? 0, 0);
        await as(gm, () =>
          db.query(`update public.battle_sessions set failed_actions_consume=true where id=$1`, [
            map.battle_session_id,
          ]),
        );
      },
    );
    await t.test(
      'cancel is free, another user cannot cancel, and turn changes expire requests',
      async () => {
        const r = await fire();
        await assert.rejects(() =>
          as(outsider, () => db.query(`select public.cancel_battle_action($1)`, [r.id])),
        );
        await as(player, () => db.query(`select public.cancel_battle_action($1)`, [r.id]));
        assert.equal((await token()).action_used, false);
        const expired = await fire();
        await as(gm, () =>
          db.query(`select public.advance_battle_turn($1)`, [map.battle_session_id]),
        );
        assert.equal((await resolve(expired.id)).status, 'expired');
      },
    );
    await t.test('healing caps at maximum and damage consumes temporary HP first', async () => {
      await start();
      await db.query(`update public.npc_stats set hp_current=49,hp_temp=5 where npc_id=$1`, [npc]);
      const healing = await request({
        kind: 'spell',
        source_id: healId,
        resource_kind: 'slot',
        resource_level: 1,
        target: { x: 3, y: 2 },
        target_ids: [enemy.id],
      });
      await resolve(healing.id, true, { dice: '20' });
      assert.equal((await stats()).hp_current, 50);
      assert.equal((await stats()).hp_temp, 5);
      await start();
      const attack = await request({
        kind: 'weapon',
        source_id: weaponId,
        target: { x: 3, y: 2 },
        target_ids: [enemy.id],
      });
      await resolve(attack.id, true, { dice: '8' });
      assert.deepEqual(await stats(), { hp_current: 47, hp_temp: 0 });
    });
    await t.test(
      'movement is independent; leaving enemy reach queues a reaction; Disengage suppresses it',
      async () => {
        await start();
        actor = await token();
        const moved = (
          await as(player, () =>
            db.query<{ t: BattleToken }>(
              `select to_jsonb(public.move_battle_token($1,2,3,'[{"x":2,"y":3}]',$2,false)) t`,
              [actor.id, actor.version],
            ),
          )
        ).rows[0].t;
        assert.equal(moved.action_used, false);
        assert.equal(moved.movement_remaining, 7.5);
        actor = await token();
        await as(player, () =>
          db.query(`select public.move_battle_token($1,2,4,'[{"x":2,"y":4}]',$2,false)`, [
            actor.id,
            actor.version,
          ]),
        );
        const reactions = (
          await as(gm, () =>
            db.query<BattleActionRequest>(
              `select * from public.battle_action_requests where kind='opportunity' and status='pending'`,
            ),
          )
        ).rows;
        assert.equal(reactions.length, 1);
        assert.equal(reactions[0].definition.dice, '1d6+3+0');
        await as(player, async () =>
          assert.equal(
            (await db.query(`select * from public.battle_action_requests where kind='opportunity'`))
              .rows.length,
            0,
          ),
        );
        await resolve(reactions[0].id, false);
        assert.equal((await token(enemy.id)).reaction_used, true);
        await as(gm, () =>
          db.query(`update public.battle_map_tokens set x=2,y=2 where id=$1`, [actor.id]),
        );
        await start();
        await db.query(`update public.battle_map_tokens set reaction_used=false where id=$1`, [
          enemy.id,
        ]);
        const disengage = await request({ kind: 'disengage' });
        await resolve(disengage.id);
        assert.equal((await token()).disengaged, true);
        assert.equal((await token()).action_used, true);
        actor = await token();
        await as(player, () =>
          db.query(
            `select public.move_battle_token($1,2,4,'[{"x":2,"y":3},{"x":2,"y":4}]',$2,false)`,
            [actor.id, actor.version],
          ),
        );
        assert.equal(
          (
            await db.query(
              `select * from public.battle_action_requests where kind='opportunity' and status='pending'`,
            )
          ).rows.length,
          0,
        );
        await as(gm, () =>
          db.query(`select public.advance_battle_turn($1)`, [map.battle_session_id]),
        );
        assert.equal((await token()).disengaged, false);
      },
    );
    await t.test(
      'Dash increases movement and Extra Attack allows attacks with movement between',
      async () => {
        await start();
        const dash = await request({ kind: 'dash' });
        await resolve(dash.id);
        assert.equal(Number((await token()).movement_remaining), 18);
        assert.equal(Number((await token()).movement_bonus), 9);
        await start(fighterToken.id);
        await db.query(`update public.battle_map_tokens set x=3,y=8 where id=$1`, [enemy.id]);
        const wid = (
          await db.query<{ id: string }>(
            `select id from public.character_inventory where character_id=$1`,
            [fighter],
          )
        ).rows[0].id;
        for (let i = 0; i < 3; i++) {
          const r = await request(
            { kind: 'weapon', source_id: wid, target: { x: 3, y: 8 }, target_ids: [enemy.id] },
            fighterToken.id,
            gm,
          );
          await resolve(r.id, false);
          assert.equal((await token(fighterToken.id)).attacks_remaining, 2 - i);
        }
        await assert.rejects(() =>
          request(
            { kind: 'weapon', source_id: wid, target: { x: 3, y: 8 }, target_ids: [enemy.id] },
            fighterToken.id,
            gm,
          ),
        );
      },
    );
    await t.test(
      'persistent damage waits for a GM-triggered pulse and does not spend another slot',
      async () => {
        await start();
        await db.query(`update public.battle_map_tokens set x=3,y=4 where id=$1`, [enemy.id]);
        const before = (await stats()).hp_current,
          r = await request({
            kind: 'spell',
            source_id: spiritId,
            resource_kind: 'slot',
            resource_level: 3,
            target: { x: 2, y: 5 },
            target_ids: [],
          });
        await resolve(r.id);
        assert.equal((await stats()).hp_current, before);
        const e = (
          await db.query<{ id: string }>(
            `select id from public.battle_spell_effects where request_id=$1`,
            [r.id],
          )
        ).rows[0];
        await as(gm, () =>
          db.query(`select public.pulse_battle_spell($1,$2,0)`, [
            e.id,
            JSON.stringify({ dice: '4', target_ids: [enemy.id] }),
          ]),
        );
        assert.equal((await stats()).hp_current, Math.max(0, before - 4));
        assert.equal(((await resources()).slots_used as Record<string, number>)['3'], 1);
        await assert.rejects(() =>
          as(gm, () => db.query(`select public.pulse_battle_spell($1,'{}',0)`, [e.id])),
        );
      },
    );
    await t.test(
      'NPC allegiance follows relationship changes and large footprints intersect areas once',
      async () => {
        assert.equal((await token(enemy.id)).faction, 'enemy');
        await db.query(`update public.npcs set relationship='Aliada' where id=$1`, [npc]);
        assert.equal((await token(enemy.id)).faction, 'ally');
        const a = await token();
        const e = {
          ...EMPTY_EFFECT,
          shape: 'sphere' as const,
          size: 1.5,
          origin: 'point' as const,
        };
        const large = { ...(await token(enemy.id)), x: 5, y: 4, size: 2 };
        const p = previewEffect(map, a, { x: 4, y: 4 }, e, [large]);
        assert.deepEqual(p.affected, [large.id]);
      },
    );
    await t.test(
      'SQL and browser share the same sphere, cone, line and cube geometry on meters and feet maps',
      async () => {
        actor = await token();
        for (const unit of ['m', 'ft'] as const)
          for (const shape of ['sphere', 'cone', 'line', 'cube'] as const) {
            const scale = 1.5,
              e = {
                ...EMPTY_EFFECT,
                shape,
                size: 6,
                width: 1.5,
                origin: shape === 'sphere' ? ('point' as const) : ('self' as const),
              },
              target = { x: actor.x + 3, y: actor.y + 1 };
            for (let y = 0; y < 10; y++)
              for (let x = 0; x < 10; x++) {
                const actual = (
                  await db.query<{ b: boolean }>(
                    `select private.battle_point_in_effect($1,$2,t,$4,$5,$6) b from public.battle_map_tokens t where id=$3`,
                    [x, y, actor.id, JSON.stringify(target), JSON.stringify(e), scale],
                  )
                ).rows[0].b;
                assert.equal(
                  actual,
                  pointInEffect({ x, y }, actor, target, e, unit === 'ft' ? 5 * 0.3 : 1.5),
                  `${unit} ${shape} ${x},${y}`,
                );
              }
          }
      },
    );
    await t.test(
      'missing/fractional path coordinates cannot teleport a token; 30 feet consumes exactly 9 meters',
      async () => {
        await start();
        actor = await token();
        for (const path of [[{}], [{ x: 2.5, y: 4 }], [{ x: 2, y: null }]])
          await assert.rejects(() =>
            as(player, () =>
              db.query(`select public.move_battle_token($1,19,19,$2,$3,false)`, [
                actor.id,
                JSON.stringify(path),
                actor.version,
              ]),
            ),
          );
        await db.query(`update public.battle_map_tokens set x=2,y=14,size=1 where id=$1`, [
          actor.id,
        ]);
        await db.query(
          `update public.battle_maps set scale_unit='ft',scale_per_cell=5 where id=$1`,
          [map.id],
        );
        actor = await token();
        await as(player, () =>
          db.query(`select public.move_battle_token($1,8,14,$2,$3,false)`, [
            actor.id,
            JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ x: 3 + i, y: 14 }))),
            actor.version,
          ]),
        );
        assert.equal(Number((await token()).movement_remaining), 0);
        await db.query(
          `update public.battle_maps set scale_unit='m',scale_per_cell=1.5 where id=$1`,
          [map.id],
        );
      },
    );
    await t.test('a large token respects its whole footprint, terrain and map edges', async () => {
      await db.query(`update public.battle_map_tokens set x=2,y=14,size=2 where id=$1`, [actor.id]);
      await start();
      actor = await token();
      await db.query(
        `insert into public.battle_map_cells(map_id,x,y,terrain_type,movement_cost,blocked) values($1,4,15,'wall',1,true)`,
        [map.id],
      );
      await assert.rejects(() =>
        as(player, () =>
          db.query(`select public.move_battle_token($1,3,14,'[{"x":3,"y":14}]',$2,false)`, [
            actor.id,
            actor.version,
          ]),
        ),
      );
      await assert.rejects(() =>
        as(player, () =>
          db.query(`select public.move_battle_token($1,19,14,'[{"x":19,"y":14}]',$2,false)`, [
            actor.id,
            actor.version,
          ]),
        ),
      );
      await db.query(`delete from public.battle_map_cells where map_id=$1`, [map.id]);
      await db.query(`update public.battle_map_tokens set size=1 where id=$1`, [actor.id]);
    });
    await t.test(
      'bonus-action spell restrictions, Pact Magic and Mystic Arcanum are enforced by the server',
      async () => {
        const wordId = randomUUID(),
          word = spell(wordId, 'palavra-de-cura');
        await db.query(
          `insert into public.character_spells(id,character_id,data) values($1,$2,$3)`,
          [wordId, hero, JSON.stringify(word)],
        );
        await db.query(
          `update public.characters set system_data=system_data||'{"class_id":"wizard","level":5,"slots_used":{},"hp_current":60}' where id=$1`,
          [hero],
        );
        await start();
        actor = await token();
        const bonus = await request({
          kind: 'spell',
          source_id: wordId,
          resource_kind: 'slot',
          resource_level: 1,
          target: { x: actor.x, y: actor.y },
          target_ids: [actor.id],
        });
        assert.equal(bonus.cost, 'bonus');
        await resolve(bonus.id, false);
        assert.equal((await token()).bonus_used, true);
        assert.equal((await token()).action_used, false);
        await assert.rejects(fire);
        await db.query(
          `update public.characters set system_data=system_data||'{"class_id":"warlock","level":5,"slots_used":{},"pact_slots_used":0}' where id=$1`,
          [hero],
        );
        await start();
        await assert.rejects(fire);
        for (let i = 0; i < 2; i++) {
          await start();
          const r = await request({
            kind: 'spell',
            source_id: fireballId,
            resource_kind: 'pact',
            resource_level: 3,
            target: { x: 6, y: 2 },
          });
          await resolve(r.id, false);
        }
        await start();
        await assert.rejects(() =>
          request({
            kind: 'spell',
            source_id: fireballId,
            resource_kind: 'pact',
            resource_level: 3,
            target: { x: 6, y: 2 },
          }),
        );
        assert.equal((await resources()).pact_slots_used, 2);
        await db.query(
          `update public.characters set system_data=system_data||'{"level":11,"arcanum_used":{}}' where id=$1`,
          [hero],
        );
        const arcId = randomUUID(),
          arc = {
            ...spellFromCatalog(
              SPELL_CATALOG.find((s) => s.id === 'circulo-da-morte')!,
              arcId,
              'warlock',
              true,
            ),
          };
        await db.query(
          `insert into public.character_spells(id,character_id,data) values($1,$2,$3)`,
          [arcId, hero, JSON.stringify(arc)],
        );
        await start();
        const ar = await request({
          kind: 'spell',
          source_id: arcId,
          resource_kind: 'arcanum',
          resource_level: 6,
          target: { x: 6, y: 2 },
        });
        await resolve(ar.id, false);
        assert.equal(((await resources()).arcanum_used as Record<string, number>)['6'], 1);
        await start();
        await assert.rejects(() =>
          request({
            kind: 'spell',
            source_id: arcId,
            resource_kind: 'arcanum',
            resource_level: 6,
            target: { x: 6, y: 2 },
          }),
        );
      },
    );
    await t.test(
      'an opportunity reaction happens before leaving and 0 HP cancels the move without spending the action',
      async () => {
        await db.query(
          `update public.characters set system_data=system_data||'{"class_id":"wizard","level":5,"hp_current":1,"hp_temp":0,"conditions":[],"slots_used":{},"pact_slots_used":0,"arcanum_used":{}}' where id=$1`,
          [hero],
        );
        await db.query(`update public.npcs set relationship='Hostil' where id=$1`, [npc]);
        await db.query(`update public.battle_map_tokens set x=2,y=2 where id=$1`, [actor.id]);
        await db.query(
          `update public.battle_map_tokens set x=3,y=2,reaction_used=false where id=$1`,
          [enemy.id],
        );
        await start();
        actor = await token();
        await as(player, () =>
          db.query(
            `select public.move_battle_token($1,2,4,'[{"x":2,"y":3},{"x":2,"y":4}]',$2,false)`,
            [actor.id, actor.version],
          ),
        );
        assert.equal((await token()).y, 2);
        assert.equal(Number((await token()).movement_remaining), 9);
        const r = (
          await db.query<BattleActionRequest>(
            `select * from public.battle_action_requests where kind='opportunity' and status='pending'`,
          )
        ).rows[0];
        await resolve(r.id, true, { dice: '6' });
        assert.equal((await resources()).hp_current, 0);
        assert.equal((await token()).y, 2);
        assert.equal((await token()).action_used, false);
        assert.equal(
          (
            await db.query<{ status: string }>(
              `select status from public.battle_movement_plans order by created_at desc limit 1`,
            )
          ).rows[0].status,
          'cancelled',
        );
      },
    );
    await t.test(
      'distributed/full healing, delayed acid and repeat attacks preserve spell resources and action costs',
      async () => {
        const ids = Object.fromEntries(
          [
            'cura-em-massa',
            'palavra-de-poder-curar',
            'flecha-acida-de-melf',
            'toque-vampirico',
            'nevoa',
          ].map((key) => [key, randomUUID()]),
        );
        for (const [key, id] of Object.entries(ids))
          await db.query(
            `insert into public.character_spells(id,character_id,data) values($1,$2,$3)`,
            [id, hero, JSON.stringify(spell(id, key))],
          );
        await db.query(
          `update public.characters set system_data=system_data||'{"class_id":"wizard","level":17,"hp_current":10,"hp_temp":0,"slots_used":{},"pact_slots_used":0,"arcanum_used":{}}' where id=$1`,
          [hero],
        );
        await db.query(
          `update public.npc_stats set hp_current=1,hp_max=1000,hp_temp=0 where npc_id=$1`,
          [npc],
        );
        await start();
        actor = await token();
        const payload = (key: string, level: number) => ({
          kind: 'spell',
          source_id: ids[key],
          resource_kind: 'slot',
          resource_level: level,
          target: { x: 3, y: 2 },
          target_ids: [enemy.id],
        });
        const pool = await request({
          ...payload('cura-em-massa', 9),
          target_ids: [actor.id, enemy.id],
        });
        await assert.rejects(() =>
          resolve(pool.id, true, {
            targets: { [actor.id]: { amount: 400 }, [enemy.id]: { amount: 400 } },
          }),
        );
        assert.equal((await stats()).hp_current, 1);
        assert.equal(((await resources()).slots_used as Record<string, number>)['9'] ?? 0, 0);
        const pooled = await resolve(pool.id, true, {
          targets: { [actor.id]: { amount: 20 }, [enemy.id]: { amount: 30 } },
        });
        assert.equal((await stats()).hp_current, 31);
        assert.equal((await resources()).hp_current, 30);
        assert.equal(pooled.resolution.affected?.find((v) => v.token_id === enemy.id)?.amount, 30);
        await db.query(
          `update public.characters set system_data=system_data||'{"slots_used":{}}' where id=$1`,
          [hero],
        );
        await start();
        await resolve((await request(payload('palavra-de-poder-curar', 9))).id);
        assert.equal((await stats()).hp_current, 1000);
        await start();
        const acid = await request(payload('flecha-acida-de-melf', 3));
        await resolve(acid.id, true, { dice: '4' });
        const acidEffect = (
          await db.query<{ id: string; definition: { dice: string } }>(
            `select id,definition from public.battle_spell_effects where request_id=$1`,
            [acid.id],
          )
        ).rows[0];
        assert.equal(acidEffect.definition.dice, '2d4+1d4');
        await as(gm, () =>
          db.query(`select public.pulse_battle_spell($1,$2,0)`, [
            acidEffect.id,
            JSON.stringify({ dice: '2', target_ids: [enemy.id] }),
          ]),
        );
        assert.equal(
          (
            await db.query<{ active: boolean }>(
              `select active from public.battle_spell_effects where id=$1`,
              [acidEffect.id],
            )
          ).rows[0].active,
          false,
        );
        assert.equal((await stats()).hp_current, 994);
        await start();
        const touch = await request(payload('toque-vampirico', 3));
        await resolve(touch.id, true, { dice: '10' });
        assert.equal((await resources()).hp_current, 35);
        const touchEffect = (
          await db.query<{ id: string }>(
            `select id from public.battle_spell_effects where request_id=$1`,
            [touch.id],
          )
        ).rows[0];
        const pulse = () =>
          as(gm, () =>
            db.query(`select public.pulse_battle_spell($1,$2,0)`, [
              touchEffect.id,
              JSON.stringify({ dice: '6', target_ids: [enemy.id] }),
            ]),
          );
        await assert.rejects(pulse);
        await start();
        await pulse();
        assert.equal((await token()).action_used, true);
        assert.equal((await resources()).hp_current, 38);
        assert.equal(((await resources()).slots_used as Record<string, number>)['3'], 2);
        await start();
        const fog = await request({
          ...payload('nevoa', 2),
          target: { x: 10, y: 10 },
          target_ids: [],
        });
        assert.equal(fog.definition.size, 12);
        await resolve(fog.id);
        await as(gm, () =>
          db.query(`select public.end_battle_combat($1)`, [map.battle_session_id]),
        );
        assert.equal(
          (
            await db.query<{ active: boolean }>(
              `select active from public.battle_spell_effects where request_id=$1`,
              [fog.id],
            )
          ).rows[0].active,
          true,
        );
      },
    );
    await t.test(
      'removed members cannot use an idempotency key to retrieve an old private request',
      async () => {
        const r = (
          await db.query<BattleActionRequest>(
            `select * from public.battle_action_requests where requested_by=$1 order by created_at limit 1`,
            [player],
          )
        ).rows[0];
        await db.query(`delete from public.campaign_members where campaign_id=$1 and user_id=$2`, [
          campaign,
          player,
        ]);
        await assert.rejects(() => request({ kind: 'dash' }, actor.id, player, r.client_id));
        await assert.rejects(() =>
          as(player, () => db.query(`select public.cancel_battle_action($1)`, [r.id])),
        );
      },
    );
  } finally {
    await db.close();
  }
});

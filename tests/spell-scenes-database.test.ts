import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';
import { defaultSheet } from '../src/systems/dnd5e';
import { withClassLevels } from '../src/systems/dnd5e/progression';
import { SPELL_CATALOG, spellFromCatalog } from '../src/systems/dnd5e/spell-catalog';
import type { DndSheet, ClassLevel, Spell } from '../src/systems/dnd5e/types';
import type { BattleDecision, BattleMap, BattleToken } from '../src/features/vtt/types';

test('042: scenes, triggers and movement are authorized and atomic', async (t) => {
  const db = await billingDatabase();
  try {
    await db.exec('update public.site_billing_settings set billing_enabled=false');
    const gm = randomUUID(),
      player = randomUUID(),
      defender = randomUUID(),
      stranger = randomUUID(),
      campaign = randomUUID(),
      hero = randomUUID(),
      other = randomUUID(),
      npc = randomUUID();
    const system = '00000000-0000-4000-8000-000000000001';
    await db.query(
      "insert into auth.users(id,email) values($1,'guide-gm@test.local'),($2,'guide-player@test.local'),($3,'guide-defender@test.local'),($4,'guide-stranger@test.local')",
      [gm, player, defender, stranger],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Guided combat')",
      [campaign, gm, system],
    );
    await db.query(
      'insert into public.campaign_members(campaign_id,user_id) values($1,$2),($1,$3)',
      [campaign, player, defender],
    );
    async function as<T>(id: string, fn: () => Promise<T>) {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      try {
        return await fn();
      } finally {
        await db.exec('reset role');
      }
    }
    const make = (levels: ClassLevel[]) =>
      withClassLevels(
        {
          ...defaultSheet(),
          hp_current: 500,
          hp_max_override: 500,
          abilities: { str: 16, dex: 14, con: 14, int: 16, wis: 16, cha: 16 },
        },
        levels,
      );
    const spell = (name: string, origin = 'wizard'): Spell => ({
      ...spellFromCatalog(
        SPELL_CATALOG.find((sp) => sp.english_name === name)!,
        randomUUID(),
        origin,
      ),
      prepared: true,
    });
    async function save(sheet: DndSheet, id = hero, owner = player) {
      await as(owner, () =>
        db.query('select public.save_character($1::jsonb)', [
          JSON.stringify({
            id,
            campaign_id: campaign,
            rpg_system_id: system,
            owner_id: owner,
            name: id === hero ? 'Mira' : 'Dara',
            sheet,
          }),
        ]),
      );
    }
    await save(make([{ class_id: 'wizard', level: 5 }]));
    await save(make([{ class_id: 'rogue', level: 7 }]), other, defender);
    await db.query(
      "insert into public.npcs(id,campaign_id,rpg_system_id,name,relationship,visible_to_players) values($1,$2,$3,'Ogro','Hostil',true)",
      [npc, campaign, system],
    );
    await db.query(
      'insert into public.npc_stats(npc_id,hp_current,hp_max,ac) values($1,500,500,15)',
      [npc],
    );
    await as(gm, () =>
      db.query(
        "select public.start_campaign_session((public.save_campaign_session($1,'Sessão',1)).id)",
        [campaign],
      ),
    );
    const map = (
      await as(gm, () =>
        db.query<{ m: BattleMap }>('select to_jsonb(public.create_battle_map($1,$2)) m', [
          campaign,
          JSON.stringify({ name: 'Arena', width: 30, height: 30, scale_per_cell: 1.5 }),
        ]),
      )
    ).rows[0].m;
    const actor = (
      await as(gm, () =>
        db.query<{ t: BattleToken }>(
          'select to_jsonb(public.add_character_to_battle_map($1,$2,2,2)) t',
          [map.id, hero],
        ),
      )
    ).rows[0].t;
    const ally = (
      await as(gm, () =>
        db.query<{ t: BattleToken }>(
          'select to_jsonb(public.add_character_to_battle_map($1,$2,4,2)) t',
          [map.id, other],
        ),
      )
    ).rows[0].t;
    const enemy = (
      await as(gm, () =>
        db.query<{ t: BattleToken }>(
          "select to_jsonb(public.add_npc_to_battle_map($1,$2,12,'m',6,2)) t",
          [map.id, npc],
        ),
      )
    ).rows[0].t;

    assert.ok(ally.id);
    await as(gm, () =>
      db.query('select public.start_battle_combat($1,$2)', [
        map.battle_session_id,
        JSON.stringify([
          { token_id: actor.id, initiative: 20 },
          { token_id: enemy.id, initiative: 10 },
        ]),
      ]),
    );
    async function effect(id: string, target = { x: 6, y: 2 }) {
      const definition = (
          await db.query<any>('select combat from public.dnd_spells where id=$1', [id])
        ).rows[0].combat,
        request = randomUUID();
      await db.query(
        `insert into public.battle_action_requests(id,campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,name,cost,target,definition,round,turn_index,status) values($1,$2,$3,$4,$5,$6,$7,'spell',$8,'action',$9,$10,(select round from public.battle_sessions where id=$3),0,'success')`,
        [
          request,
          campaign,
          map.battle_session_id,
          map.id,
          actor.id,
          player,
          randomUUID(),
          id,
          JSON.stringify(target),
          JSON.stringify({ ...definition, entry: { catalog_id: id, class_id: 'wizard' } }),
        ],
      );
      return (
        await db.query<any>(
          `insert into public.battle_spell_effects(request_id,campaign_id,map_id,token_id,name,definition,target,concentration,duration) values($1,$2,$3,$4,$5,$6,$7,true,'1 minuto') returning *`,
          [
            request,
            campaign,
            map.id,
            actor.id,
            id,
            JSON.stringify({ ...definition, entry: { catalog_id: id, class_id: 'wizard' } }),
            JSON.stringify(target),
          ],
        )
      ).rows[0];
    }
    const pending = async (id: string) =>
      (
        await db.query<BattleDecision>(
          "select * from public.battle_decisions where request_id=$1 and status='pending' order by created_at,kind",
          [id],
        )
      ).rows;
    const answer = async (id: string, user = gm, client = randomUUID()) =>
      (
        await as(user, () =>
          db.query<any>('select to_jsonb(public.answer_battle_decision($1,$2,$3)) d', [
            id,
            client,
            '{}',
          ]),
        )
      ).rows[0].d;
    const hp = async () =>
      Number(
        (await db.query<any>('select hp_current from public.npc_stats where npc_id=$1', [npc]))
          .rows[0].hp_current,
      );
    const end = async (id: string) =>
      as(gm, () => db.query('select public.end_battle_spell($1)', [id]));
    await t.test(
      'cloud entrance prompts once, respects participant ownership and replay cannot apply damage twice',
      async () => {
        await db.query('update public.battle_map_tokens set x=5 where id=$1', [enemy.id]);
        const e = await effect('nuvem-de-adagas');
        assert.equal((await pending(e.request_id)).length, 0);
        await db.query('update public.battle_map_tokens set x=6 where id=$1', [enemy.id]);
        const ds = await pending(e.request_id);
        assert.equal(ds.length, 1);
        assert.equal(ds[0].kind, 'damage');
        await assert.rejects(answer(ds[0].id, player), /outro participante/);
        const key = randomUUID(),
          before = await hp(),
          d = await answer(ds[0].id, gm, key);
        assert.equal(await hp(), before - d.result.roll.total);
        await answer(ds[0].id, gm, key);
        assert.equal(await hp(), before - d.result.roll.total);
        await db.query('update public.battle_map_tokens set x=5 where id=$1', [enemy.id]);
        await db.query('update public.battle_map_tokens set x=6 where id=$1', [enemy.id]);
        assert.equal((await pending(e.request_id)).length, 0);
        await end(e.id);
      },
    );
    await t.test(
      'moonbeam asks for the caster DC and applies saved half damage; rounds end the effect',
      async () => {
        const e = await effect('raio-lunar');
        await db.query(
          'update public.battle_sessions set active_token_id=$2,turn_index=1,turn_started_at=clock_timestamp() where id=$1',
          [map.battle_session_id, enemy.id],
        );
        const ds = await pending(e.request_id);
        assert.equal(ds.length, 1);
        assert.equal(ds[0].kind, 'save');
        assert.equal(ds[0].dc, 14);
        const save = await answer(ds[0].id),
          damage = (await pending(e.request_id))[0],
          before = await hp(),
          d = await answer(damage.id);
        assert.equal(
          await hp(),
          before - Math.floor(d.result.roll.total * (save.result.passed ? 0.5 : 1)),
        );
        await db.query(
          'update public.battle_sessions set round=$2,active_token_id=$3,turn_started_at=clock_timestamp() where id=$1',
          [map.battle_session_id, e.expires_round, actor.id],
        );
        assert.equal(
          (
            await db.query<any>('select active from public.battle_spell_effects where id=$1', [
              e.id,
            ])
          ).rows[0].active,
          false,
        );
      },
    );
    await t.test(
      'real casts distinguish a harmless light from an attack and consume one slot for an empty persistent cloud',
      async () => {
        const flame = spell('Produce Flame', 'druid'),
          cloud = spell('Cloud of Daggers');
        await save({
          ...make([
            { class_id: 'wizard', level: 5 },
            { class_id: 'druid', level: 3 },
          ]),
          spells: [flame, cloud],
        });
        await db.exec(
          "update public.battle_decisions set status='cancelled' where status='pending';update public.battle_action_requests set status='cancelled' where status in('pending','approved')",
        );
        await db.query(
          'update public.battle_sessions set active_token_id=$2,turn_index=0,turn_started_at=clock_timestamp() where id=$1',
          [map.battle_session_id, actor.id],
        );
        await db.query(
          'update public.battle_map_tokens set action_used=false,bonus_used=false,attacks_remaining=0 where id=$1',
          [actor.id],
        );
        const cast = async (payload: object) =>
          (
            await as(player, () =>
              db.query<any>('select to_jsonb(public.request_battle_action($1,$2,$3)) q', [
                actor.id,
                JSON.stringify(payload),
                randomUUID(),
              ]),
            )
          ).rows[0].q;
        const q = await cast({
          kind: 'spell',
          source_id: flame.id,
          spell_mode: 'light',
          resource_kind: 'cantrip',
          resource_level: 0,
          target: { x: actor.x, y: actor.y },
          target_ids: [actor.id],
        });
        assert.equal(q.status, 'success');
        assert.equal(q.definition.kind, 'utility');
        assert.equal(q.definition.attackRoll, false);
        assert.equal((await pending(q.id)).length, 0);
        await db.query(
          'update public.battle_map_tokens set action_used=false,bonus_used=false,attacks_remaining=0,action_spell_level=-1 where id=$1',
          [actor.id],
        );
        const cloudCast = await cast({
          kind: 'spell',
          source_id: cloud.id,
          resource_kind: 'slot',
          resource_level: 2,
          target: { x: 10, y: 10 },
          target_ids: [],
        });
        assert.equal(cloudCast.status, 'success');
        assert.equal((await pending(cloudCast.id)).length, 0);
        assert.equal(
          (await db.query<any>('select system_data from public.characters where id=$1', [hero]))
            .rows[0].system_data.slots_used['2'],
          1,
        );
      },
    );
    await t.test(
      'manual phases validate damage types and allow a save to avoid all damage',
      async () => {
        const e = await effect('fome-de-hadar'),
          before = await hp(),
          opts = {
            dice: '1',
            target_ids: [enemy.id],
            damageType: 'ácido',
            halfOnSave: false,
            targets: { [enemy.id]: { saved: true } },
          };
        await as(gm, () =>
          db.query('select public.pulse_battle_spell($1,$2,0)', [e.id, JSON.stringify(opts)]),
        );
        assert.equal(await hp(), before);
        await as(gm, () =>
          assert.rejects(
            db.query('select public.pulse_battle_spell($1,$2,1)', [
              e.id,
              JSON.stringify({ ...opts, damageType: 'inválido' }),
            ]),
            /Tipo de dano inválido/,
          ),
        );
        await as(player, () =>
          assert.rejects(
            db.query('select public.pulse_battle_spell($1,$2,1)', [e.id, JSON.stringify(opts)]),
            /mestre/,
          ),
        );
        await end(e.id);
      },
    );
    await t.test(
      'spell movement pays the right action, rejects other controllers and stale retries, and preserves RLS',
      async () => {
        const e = await effect('raio-lunar');
        await db.exec(
          "update public.battle_decisions set status='cancelled' where status='pending';update public.battle_action_requests set status='cancelled' where status in('pending','approved')",
        );
        await db.query(
          'update public.battle_map_tokens set action_used=false,bonus_used=false,extra_actions=0 where id=$1',
          [actor.id],
        );
        const move = (user: string) =>
          as(user, () =>
            db.query<any>('select public.move_battle_spell($1,$2,$3) data', [
              e.id,
              JSON.stringify({ x: 7, y: 2 }),
              e.updated_at,
            ]),
          );
        await assert.rejects(move(gm), /não controla/);
        const response = await move(player);
        assert.ok(
          response.rows[0].data.tokens.every(
            (t: any) => t.visible || [actor.id, ally.id].includes(t.id),
          ),
        );
        const a = (
          await db.query<any>(
            'select action_used,bonus_used from public.battle_map_tokens where id=$1',
            [actor.id],
          )
        ).rows[0];
        assert.equal(a.action_used, true);
        assert.equal(a.bonus_used, false);
        await assert.rejects(move(player), /efeito mudou/);
        await end(e.id);
        const sphere = await effect('esfera-flamejante', { x: 10, y: 2 });
        await db.query(
          'update public.battle_map_tokens set action_used=false,bonus_used=false where id=$1',
          [actor.id],
        );
        await as(player, () =>
          db.query('select public.move_battle_spell($1,$2,$3)', [
            sphere.id,
            JSON.stringify({ x: 9, y: 2 }),
            sphere.updated_at,
          ]),
        );
        const b = (
          await db.query<any>(
            'select action_used,bonus_used from public.battle_map_tokens where id=$1',
            [actor.id],
          )
        ).rows[0];
        assert.equal(b.action_used, false);
        assert.equal(b.bonus_used, true);
        await end(sphere.id);
      },
    );
    await t.test('poison and incendiary clouds drift three metres on the caster turn', async () => {
      const e = await effect('nevoa-mortal', { x: 14, y: 14 });
      await db.query(
        'update public.battle_sessions set active_token_id=$2,turn_started_at=clock_timestamp() where id=$1',
        [map.battle_session_id, actor.id],
      );
      const at = (
        await db.query<any>('select target from public.battle_spell_effects where id=$1', [e.id])
      ).rows[0].target;
      assert.ok(Math.abs(Math.hypot(at.x - 14, at.y - 14) * 1.5 - 3) < 0.0001);
      await end(e.id);
      const fire = await effect('nuvem-incendiaria', { x: 14, y: 14 });
      await db.query(
        'update public.battle_sessions set turn_started_at=clock_timestamp() where id=$1',
        [map.battle_session_id],
      );
      assert.deepEqual(
        (
          await db.query<any>('select target from public.battle_spell_effects where id=$1', [
            fire.id,
          ])
        ).rows[0].target,
        { x: 16, y: 14 },
      );
      await end(fire.id);
    });
    await t.test(
      'Darkness dispels low-level light and Daylight dispels qualifying Darkness',
      async () => {
        const dark = await effect('escuridao', { x: 12, y: 12 });
        const light = await effect('luz', { x: 12, y: 12 });
        assert.equal(
          (
            await db.query<any>('select active from public.battle_spell_effects where id=$1', [
              light.id,
            ])
          ).rows[0].active,
          false,
        );
        const daylight = await effect('luz-do-dia', { x: 12, y: 12 });
        assert.ok(daylight.id);
        assert.equal(
          (
            await db.query<any>('select active from public.battle_spell_effects where id=$1', [
              dark.id,
            ])
          ).rows[0].active,
          false,
        );
        await end(daylight.id);
      },
    );
    await t.test(
      'temporary terrain and wall geometry are canonical and the migration is repeatable',
      async () => {
        const e = await effect('teia');
        assert.equal(
          Number(
            (await db.query<any>('select private.battle42_terrain($1,6,2,1) c', [map.id])).rows[0]
              .c,
          ),
          2,
        );
        await end(e.id);
        assert.equal(
          Number(
            (await db.query<any>('select private.battle42_terrain($1,6,2,1) c', [map.id])).rows[0]
              .c,
          ),
          1,
        );
        const wall = { shape: 'wall', origin: 'point', size: 18, width: 0.3, rotation: 90 };
        assert.equal(
          (
            await db.query<any>(
              'select private.battle_point_in_effect(6,4,t,\'{"x":6,"y":2}\',$2,1.5) inside from public.battle_map_tokens t where id=$1',
              [actor.id, JSON.stringify(wall)],
            )
          ).rows[0].inside,
          true,
        );
        await db.exec(readMigration('202610240042_spell_scenes.sql'));
        await as(player, () =>
          assert.rejects(db.exec('select * from private.battle42_events'), /permission/),
        );
      },
    );
  } finally {
    await db.close();
  }
});

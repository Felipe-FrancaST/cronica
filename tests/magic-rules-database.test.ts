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

test('039: spell DCs, physical dice, conditions and campaign controls are canonical', async (t) => {
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
    async function start() {
      await db.exec(
        "update public.battle_decisions set status='cancelled' where status='pending';update public.battle_action_requests set status='cancelled' where status in('pending','approved')",
      );
      await as(gm, () =>
        db.query('select public.start_battle_combat($1,$2)', [
          map.battle_session_id,
          JSON.stringify(
            [actor.id, ally.id, enemy.id].map((token_id, i) => ({ token_id, initiative: 20 - i })),
          ),
        ]),
      );
    }

    async function rules(patch: Record<string, unknown>) {
      const previous = (
        await db.query<any>(
          'select *,updated_at::text expected from public.campaign_rules where campaign_id=$1',
          [campaign],
        )
      ).rows[0];
      return as(gm, () =>
        db.query('select public.save_campaign_rules_v19($1,$2,$3)', [
          campaign,
          JSON.stringify({ ...previous, ...patch }),
          previous?.expected ?? null,
        ]),
      );
    }
    async function reset() {
      await db.exec(
        'update private.battle_condition_effects set active=false;update public.battle_spell_effects set active=false;',
      );
      await rules({
        combat_dice_mode: 'program',
        npc_dice_mode: 'inherit',
        concentration_checks: true,
      });
      await start();
      await db.query('update public.npc_stats set hp_current=500 where npc_id=$1', [npc]);
    }
    const pending = async (id: string) =>
      (
        await db.query<BattleDecision>(
          "select * from public.battle_decisions where request_id=$1 and status='pending' order by sequence,created_at,id",
          [id],
        )
      ).rows;
    async function requestSpell(entry: Spell, extra: Record<string, unknown> = {}) {
      const payload = {
        kind: 'spell',
        source_id: entry.id,
        resource_kind: entry.level === 0 ? 'cantrip' : 'slot',
        resource_level: entry.level,
        target: { x: 6, y: 2 },
        target_ids: [enemy.id],
        ...extra,
      };
      return (
        await as(player, () =>
          db.query<{ r: any }>('select public.perform_battle_action($1,$2,$3) r', [
            actor.id,
            JSON.stringify(payload),
            randomUUID(),
          ]),
        )
      ).rows[0].r;
    }
    async function answer(
      d: BattleDecision,
      user: string,
      rolls?: number[][],
      client = randomUUID(),
    ) {
      return (
        await as(user, () =>
          db.query<{ r: any }>('select public.answer_battle_decision_fast($1,$2,$3) r', [
            d.id,
            client,
            JSON.stringify(rolls ? { rolls } : {}),
          ]),
        )
      ).rows[0].r;
    }
    await t.test('spell-origin DC and NPC stat-block DC, never a client value', async () => {
      await reset();
      await save({
        ...make([
          { class_id: 'wizard', level: 2 },
          { class_id: 'warlock', level: 3 },
        ]),
        abilities: { str: 16, dex: 16, con: 16, int: 14, wis: 16, cha: 18 },
      });
      const dc = (
        await db.query<{ wizard: number; warlock: number }>(
          `select private.battle39_dc($1,'{"class_id":"wizard"}') wizard,private.battle39_dc($1,'{"class_id":"warlock"}') warlock`,
          [actor.id],
        )
      ).rows[0];
      assert.equal(dc.wizard, 13);
      assert.equal(dc.warlock, 15);
      await db.query(
        'update public.npc_stats set spell_save_dc=19,spell_attack_bonus=11 where npc_id=$1',
        [npc],
      );
      const fixed = (
        await db.query<{ dc: number; attack: number }>(
          "select private.battle39_dc($1,'{}') dc,private.battle39_attack($1,'{}') attack",
          [enemy.id],
        )
      ).rows[0];
      assert.equal(fixed.dc, 19);
      assert.equal(fixed.attack, 11);
      const hold = spell('Hold Person');
      await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [hold] });
      const update = await requestSpell(hold, { save_dc: 40, dc: 40 });
      const d = (await pending(update.action.id))[0];
      assert.equal(d.dc, 14);
      assert.equal(d.ability, 'wis');
      await assert.rejects(
        as(player, () =>
          db.query('select public.save_campaign_rules_v19($1,$2)', [
            campaign,
            JSON.stringify({ combat_dice_mode: 'physical' }),
          ]),
        ),
        /mestre/,
      );
    });
    await t.test(
      'physical d20s validate faces, apply bonuses and preserve one authoritative critical',
      async () => {
        await reset();
        await rules({ combat_dice_mode: 'physical' });
        const bolt = spell('Fire Bolt');
        await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [bolt] });
        const update = await requestSpell(bolt),
          d = update.decisions[0];
        assert.equal(d.options.dice_mode, 'physical');
        assert.equal(d.modifier, 6);
        await assert.rejects(answer(d, player, [[21]]), /inteiro entre/);
        await assert.rejects(answer(d, player, [[20, 19]]), /adicionais/);
        await assert.rejects(answer(d, player, [[]]), /todas as faces/);
        assert.equal(
          (
            await db.query<{ action_used: boolean }>(
              'select action_used from public.battle_map_tokens where id=$1',
              [actor.id],
            )
          ).rows[0].action_used,
          false,
        );
        const client = randomUUID(),
          hit = await answer(d, player, [[20]], client);
        assert.equal(hit.decision.result.critical, true);
        assert.equal(hit.decision.result.roll.source, 'physical');
        assert.equal(hit.decision.result.roll.total, 26);
        assert.deepEqual(
          (await answer(d, player, [[1]], client)).decision.result,
          hit.decision.result,
        );
        const damage = hit.decisions.find((x: any) => x.kind === 'damage');
        assert.equal(damage.options.roll_plan[0].expression, '4d10');
        const done = await answer(damage, player, [[2, 4, 6, 8]]);
        assert.equal(done.actions.find((q: any) => q.id === update.action.id).status, 'success');
        assert.equal(
          (
            await db.query<{ hp_current: number }>(
              'select hp_current from public.npc_stats where npc_id=$1',
              [npc],
            )
          ).rows[0].hp_current,
          480,
        );
        await assert.rejects(
          as(player, () => db.query('select private.battle39_face(20)')),
          /permission denied/,
        );
      },
    );
    await t.test(
      'physical saves use the caster DC; only failed targets receive conditions and repetition uses the same source',
      async () => {
        await reset();
        await rules({ combat_dice_mode: 'physical' });
        const hold = spell('Hold Person');
        await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [hold] });
        const update = await requestSpell(hold);
        const d = (await pending(update.action.id))[0];
        assert.equal(d.token_id, enemy.id);
        assert.equal(d.dc, 14);
        await assert.rejects(answer(d, player, [[1]]), /outro participante/);
        const result = await answer(d, gm, [[1]]);
        assert.equal(result.decision.result.passed, false);
        let sheet = (await db.query<{ s: any }>('select private.battle_sheet($1) s', [enemy.id]))
          .rows[0].s;
        assert.ok(sheet.conditions.includes('Paralisado'));
        const publicState = (
          await as(player, () =>
            db.query<{ r: any }>('select public.battle_combat_update($1) r', [map.id]),
          )
        ).rows[0].r;
        assert.equal(publicState.conditionEffects[0].condition, 'Paralisado');
        await as(player, () =>
          db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
        );
        await as(defender, () =>
          db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
        );
        await as(gm, () =>
          db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
        );
        const repeat = (await pending(update.action.id)).find((x) => x.kind === 'condition')!;
        assert.ok(repeat);
        assert.equal(repeat.dc, 14);
        await answer(repeat, gm, [[20]]);
        sheet = (await db.query<{ s: any }>('select private.battle_sheet($1) s', [enemy.id]))
          .rows[0].s;
        assert.equal(sheet.conditions.includes('Paralisado'), false);
      },
    );
    await t.test(
      'passing the save prevents a condition; virtual mode rejects supplied rolls; NPC mode can differ',
      async () => {
        await reset();
        await rules({ combat_dice_mode: 'physical', npc_dice_mode: 'program' });
        const hold = spell('Hold Person');
        await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [hold] });
        const update = await requestSpell(hold),
          d = (await pending(update.action.id))[0];
        assert.equal(d.options.dice_mode, 'program');
        await assert.rejects(answer(d, gm, [[20]]), /programa/);
        await as(gm, () =>
          db.query('select public.configure_battle_decision($1,$2,$3)', [d.id, 'normal', 50]),
        );
        await answer(d, gm);
        assert.equal(
          (
            await db.query<{ n: number }>(
              'select count(*)::int n from private.battle_condition_effects where active',
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      'post-hit saving throws never reduce the spell damage they do not govern',
      async () => {
        await reset();
        await rules({ combat_dice_mode: 'physical' });
        const ray = spell('Ray of Sickness');
        await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [ray] });
        const update = await requestSpell(ray);
        const hit = await answer(update.decisions[0], player, [[15]]);
        const damage = hit.decisions.find((x: any) => x.kind === 'damage');
        await answer(damage, player, [[4, 6]]);
        const post = (await pending(update.action.id)).find((d) => d.kind === 'condition')!;
        assert.ok(post);
        assert.equal(post.ability, 'con');
        assert.equal(post.dc, 14);
        await answer(post, gm, [[20]]);
        assert.equal(
          (
            await db.query<{ hp_current: number }>(
              'select hp_current from public.npc_stats where npc_id=$1',
              [npc],
            )
          ).rows[0].hp_current,
          490,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              'select count(*)::int n from private.battle_condition_effects where active',
            )
          ).rows[0].n,
          0,
        );
      },
    );

    await t.test(
      'physical multi-ray damage preserves critical dice per hit and spends one spell slot',
      async () => {
        await reset();
        await rules({ combat_dice_mode: 'physical' });
        const ray = spell('Scorching Ray');
        await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [ray] });
        const update = await requestSpell(ray);
        let last: any;
        const attacks = await pending(update.action.id);
        assert.equal(attacks.length, 3);
        for (const [i, d] of attacks.entries())
          last = await answer(d, player, [[i === 0 ? 20 : 15]]);
        const damage = last.decisions.find((d: any) => d.kind === 'damage');
        assert.deepEqual(
          damage.options.roll_plan.map((p: any) => p.expression),
          ['4d6', '2d6', '2d6'],
        );
        await answer(damage, player, [
          [1, 2, 3, 4],
          [5, 6],
          [3, 4],
        ]);
        assert.equal(
          (
            await db.query<{ hp_current: number }>(
              'select hp_current from public.npc_stats where npc_id=$1',
              [npc],
            )
          ).rows[0].hp_current,
          472,
        );
        const used = (
          await db.query<{ n: number }>(
            "select (system_data->'slots_used'->>'2')::int n from public.characters where id=$1",
            [hero],
          )
        ).rows[0].n;
        assert.equal(used, 1);
      },
    );
    await t.test(
      'Melf acid arrow deals half initial damage on a miss without claiming the delayed damage',
      async () => {
        await reset();
        await rules({ combat_dice_mode: 'physical' });
        const arrow = spell('Melf’s Acid Arrow');
        await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [arrow] });
        const update = await requestSpell(arrow);
        const hit = await answer(update.decisions[0], player, [[1]]);
        assert.equal(hit.decision.result.hit, false);
        const damage = hit.decisions.find((d: any) => d.kind === 'damage');
        assert.ok(damage);
        await answer(damage, player, [[4, 4, 4, 4]]);
        assert.equal(
          (
            await db.query<{ hp_current: number }>(
              'select hp_current from public.npc_stats where npc_id=$1',
              [npc],
            )
          ).rows[0].hp_current,
          492,
        );
      },
    );
    await t.test('Chill Touch blocks healing while its condition is active', async () => {
      await reset();
      await rules({ combat_dice_mode: 'physical' });
      const chill = spell('Chill Touch');
      await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [chill] });
      const first = await requestSpell(chill),
        hit = await answer(first.decisions[0], player, [[15]]);
      await answer(
        hit.decisions.find((d: any) => d.kind === 'damage'),
        player,
        [[4, 4]],
      );
      assert.ok(
        (
          await db.query<{ s: any }>('select private.battle_sheet($1) s', [enemy.id])
        ).rows[0].s.conditions.includes('Cura bloqueada'),
      );
      await db.query(
        'select private.battle_apply_hp_v11((select q from public.battle_action_requests q where id=$1),(select t from public.battle_map_tokens t where id=$2),$3::jsonb,$4::jsonb)',
        [
          first.action.id,
          enemy.id,
          JSON.stringify({ kind: 'healing', shape: 'single' }),
          JSON.stringify({ dice: '10', target_ids: [enemy.id] }),
        ],
      );
      assert.equal(
        (
          await db.query<{ hp_current: number }>(
            'select hp_current from public.npc_stats where npc_id=$1',
            [npc],
          )
        ).rows[0].hp_current,
        492,
      );
    });

    await t.test(
      'Vicious Mockery gives disadvantage to the next attack and is consumed exactly once',
      async () => {
        await reset();
        await rules({ combat_dice_mode: 'physical' });
        const mockery = spell('Vicious Mockery', 'bard');
        await save({ ...make([{ class_id: 'bard', level: 5 }]), spells: [mockery] });
        const update = await requestSpell(mockery);
        const saveDecision = (await pending(update.action.id))[0];
        await answer(saveDecision, gm, [[1]]);
        await answer(
          (await pending(update.action.id)).find((d) => d.kind === 'damage')!,
          player,
          [[2, 2]],
        );
        const source = randomUUID();
        await db.query('insert into public.npc_attacks(id,npc_id,data) values($1,$2,$3)', [
          source,
          npc,
          JSON.stringify({ name: 'Clava', bonus: 5, damage: '1d6+3', range: '9 m' }),
        ]);
        await as(player, () =>
          db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
        );
        await as(defender, () =>
          db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
        );
        const attack = (
          await as(gm, () =>
            db.query<{ r: any }>('select public.perform_battle_action($1,$2,$3) r', [
              enemy.id,
              JSON.stringify({
                kind: 'weapon',
                source_id: source,
                target: { x: 2, y: 2 },
                target_ids: [actor.id],
              }),
              randomUUID(),
            ]),
          )
        ).rows[0].r;
        const d = attack.decisions.find((d: any) => d.kind === 'attack');
        assert.equal(d.mode, 'disadvantage');
        const result = await answer(d, gm, [[20, 1]]);
        assert.equal(result.decision.result.natural, 1);
        assert.equal(result.decision.result.hit, false);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from private.battle_condition_effects where token_id=$1 and active and condition='Desvantagem no próximo ataque'",
              [enemy.id],
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      'Shocking Grasp suppresses an opportunity reaction without stopping ordinary movement',
      async () => {
        await reset();
        await rules({ combat_dice_mode: 'physical' });
        const shock = spell('Shocking Grasp');
        await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [shock] });
        await db.query('update public.battle_map_tokens set x=3,y=2 where id=$1', [enemy.id]);
        await db.query('update public.npc_attacks set data=$2 where npc_id=$1', [
          npc,
          JSON.stringify({ name: 'Clava', bonus: 5, damage: '1d6+3', range: '1.5 m' }),
        ]);
        const update = await requestSpell(shock, { target: { x: 3, y: 2 } });
        const hit = await answer(update.decisions[0], player, [[15]]);
        await answer(
          hit.decisions.find((d: any) => d.kind === 'damage'),
          player,
          [[4, 4]],
        );
        assert.ok(
          (
            await db.query<{ s: any }>('select private.battle_sheet($1) s', [enemy.id])
          ).rows[0].s.conditions.includes('Reações bloqueadas'),
        );
        const current = (
          await db.query<{ version: string }>(
            'select version::text from public.battle_map_tokens where id=$1',
            [actor.id],
          )
        ).rows[0];
        await as(player, () =>
          db.query('select public.move_battle_token($1,1,2,$2,$3,false)', [
            actor.id,
            JSON.stringify([{ x: 1, y: 2 }]),
            current.version,
          ]),
        );
        assert.equal(
          (
            await db.query<{ x: number }>('select x from public.battle_map_tokens where id=$1', [
              actor.id,
            ])
          ).rows[0].x,
          1,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from public.battle_action_requests where kind='opportunity' and status='pending'",
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test('Entangle escape uses an action and the original spell DC', async () => {
      await reset();
      await db.query('update public.battle_map_tokens set x=2,y=2 where id=$1', [actor.id]);
      await db.query('update public.battle_map_tokens set x=6,y=2 where id=$1', [enemy.id]);
      await rules({ combat_dice_mode: 'physical' });
      const entangle = spell('Entangle', 'druid');
      await save({ ...make([{ class_id: 'druid', level: 5 }]), spells: [entangle] });
      const update = await requestSpell(entangle);
      for (const check of await pending(update.action.id)) {
        await answer(check, check.token_id === enemy.id ? gm : defender, [[1]]);
      }
      const condition = (
        await db.query<any>(
          "select * from private.battle_condition_effects where token_id=$1 and active and condition='Impedido'",
          [enemy.id],
        )
      ).rows[0];
      assert.ok(condition);
      await as(player, () =>
        db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
      );
      await as(defender, () =>
        db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
      );
      const client = randomUUID();
      const escape = (
        await as(gm, () =>
          db.query<any>('select to_jsonb(public.escape_battle_condition($1,$2)) d', [
            condition.id,
            client,
          ]),
        )
      ).rows[0].d;
      assert.equal(escape.dc, condition.dc);
      assert.equal(escape.options.ability_check, true);
      const result = await answer(escape, gm, [[20]]);
      assert.equal(result.decision.result.passed, true);
      assert.equal(
        (
          await db.query<any>('select active from private.battle_condition_effects where id=$1', [
            condition.id,
          ])
        ).rows[0].active,
        false,
      );
      assert.equal(
        (
          await db.query<any>('select action_used from public.battle_map_tokens where id=$1', [
            enemy.id,
          ])
        ).rows[0].action_used,
        true,
      );
      const duplicate = (
        await as(gm, () =>
          db.query<any>('select to_jsonb(public.escape_battle_condition($1,$2)) d', [
            condition.id,
            client,
          ]),
        )
      ).rows[0].d;
      assert.equal(duplicate.id, escape.id);
    });
    await db.exec(readMigration('202610230039_magic_and_dice_rules.sql'));
  } finally {
    await db.close();
  }
});

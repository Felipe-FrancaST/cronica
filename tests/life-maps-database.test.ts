import test from 'node:test';
import { generateAtlas } from '../src/features/atlas/generator';
import { SYMBOLS, TOKEN_ICONS } from '../src/features/atlas/types';
import { featureBase } from '../src/features/atlas/model';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';
import { defaultSheet } from '../src/systems/dnd5e';
import { withClassLevels } from '../src/systems/dnd5e/progression';
import type { DndSheet, ClassLevel } from '../src/systems/dnd5e/types';
import type { BattleDecision, BattleMap, BattleToken } from '../src/features/vtt/types';

test('040: death saves, damage at zero, recovery and map library', async (t) => {
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

    await db.query(
      "insert into public.campaign_rules(campaign_id,combat_dice_mode) values($1,'physical') on conflict(campaign_id) do update set combat_dice_mode='physical'",
      [campaign],
    );
    async function sheet() {
      return (
        await db.query<any>('select system_data s from public.characters where id=$1', [hero])
      ).rows[0].s;
    }
    async function setSheet(patch: any) {
      await db.query('update public.characters set system_data=system_data||$2 where id=$1', [
        hero,
        JSON.stringify(patch),
      ]);
    }
    async function pending() {
      return (
        await db.query<BattleDecision>(
          "select * from public.battle_decisions where token_id=$1 and kind='death' and status='pending'",
          [actor.id],
        )
      ).rows[0];
    }
    async function death(face: number, client = randomUUID(), user = player) {
      const d = await pending();
      return (
        await as(user, () =>
          db.query<any>('select public.answer_battle_decision_fast($1,$2,$3) r', [
            d.id,
            client,
            JSON.stringify({ rolls: [[face]] }),
          ]),
        )
      ).rows[0].r;
    }
    async function nextRound() {
      await as(player, () =>
        db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
      );
      await as(defender, () =>
        db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
      );
      await as(gm, () =>
        db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
      );
    }
    async function damage(amount: number, events?: any[]) {
      const q = (
        await db.query<any>(
          `insert into public.battle_action_requests(campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,name,cost,target,target_ids,definition,round,turn_index,status) values($1,$2,$3,$4,$5,$6,'spell','Teste dano','free','{}',$7,'{}',1,0,'success') returning *`,
          [campaign, map.battle_session_id, map.id, enemy.id, gm, randomUUID(), [actor.id]],
        )
      ).rows[0];
      await db.query(
        `select private.battle_apply_hp_v11(q,a,$3,$4) from public.battle_action_requests q,public.battle_map_tokens a where q.id=$1 and a.id=$2`,
        [
          q.id,
          enemy.id,
          JSON.stringify({ kind: 'damage', shape: 'single', dice: String(amount) }),
          JSON.stringify({
            target_ids: [actor.id],
            targets: { [actor.id]: { amount, ...(events ? { death_events: events } : {}) } },
          }),
        ],
      );
    }
    await t.test(
      'zero HP adds unconscious/prone and one private physical d20; prevents skipping and forgery',
      async () => {
        await setSheet({
          hp_current: 4,
          hp_temp: 0,
          hp_max_override: 10,
          death_successes: 0,
          death_failures: 0,
          conditions: [],
        });
        await damage(5);
        assert.equal((await sheet()).hp_current, 0);
        assert.ok((await sheet()).conditions.includes('Caído'));
        assert.ok((await sheet()).conditions.includes('Inconsciente'));
        await start();
        const d = await pending();
        assert.ok(d);
        assert.equal(d.options.dice_mode, 'physical');
        assert.equal(d.modifier, 0);
        assert.equal(d.dc, 10);
        await assert.rejects(death(10, randomUUID(), gm), /outro participante/);
        await assert.rejects(
          as(player, () =>
            db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
          ),
          /pendentes/,
        );
        await assert.rejects(death(21), /1 e 20/);
        const client = randomUUID();
        const r = await death(10, client);
        assert.equal(r.decision.result.death_successes, 1);
        const dup = (
          await as(player, () =>
            db.query<any>('select public.answer_battle_decision_fast($1,$2,$3) r', [
              d.id,
              client,
              JSON.stringify({ rolls: [[1]] }),
            ]),
          )
        ).rows[0].r;
        assert.equal(dup.decision.result.death_successes, 1);
        assert.equal((await sheet()).death_successes, 1);
      },
    );
    await t.test(
      'natural one is two failures; twenty recovers 1 HP and standing uses half movement',
      async () => {
        await nextRound();
        await death(1);
        assert.equal((await sheet()).death_failures, 2);
        await nextRound();
        const r = await death(20);
        assert.equal(r.decision.result.life_state, 'revived');
        const s = await sheet();
        assert.equal(s.hp_current, 1);
        assert.equal(s.death_failures, 0);
        assert.equal(s.death_successes, 0);
        assert.ok(!s.conditions.includes('Inconsciente'));
        assert.ok(s.conditions.includes('Caído'));
        const before = (
          await db.query<any>(
            'select movement_remaining from public.battle_map_tokens where id=$1',
            [actor.id],
          )
        ).rows[0].movement_remaining;
        await as(player, () =>
          db.query('select public.stand_battle_token($1,$2)', [actor.id, randomUUID()]),
        );
        assert.ok(!(await sheet()).conditions.includes('Caído'));
        assert.equal(
          Number(
            (
              await db.query<any>(
                'select movement_remaining from public.battle_map_tokens where id=$1',
                [actor.id],
              )
            ).rows[0].movement_remaining,
          ),
          Number(before) - 4.5,
        );
      },
    );
    await t.test(
      'three successes stabilize; damage restarts failures and a critical at zero kills',
      async () => {
        await setSheet({ hp_current: 0, death_successes: 2, death_failures: 1, conditions: [] });
        await nextRound();
        await death(15);
        const s = await sheet();
        assert.ok(s.conditions.includes('Estável'));
        assert.equal(s.death_successes, 0);
        assert.equal(s.death_failures, 0);
        await nextRound();
        assert.equal(await pending(), undefined);
        await damage(1);
        assert.ok(!(await sheet()).conditions.includes('Estável'));
        assert.equal((await sheet()).death_failures, 1);
        await damage(1, [{ amount: 1, critical: true }]);
        assert.equal((await sheet()).death_failures, 3);
        assert.ok((await sheet()).conditions.includes('Morto'));
      },
    );
    await t.test('massive damage and sequential attacks account for temporary HP', async () => {
      await setSheet({
        hp_current: 4,
        hp_temp: 2,
        hp_max_override: 10,
        death_successes: 0,
        death_failures: 0,
        conditions: [],
      });
      await damage(16);
      assert.equal((await sheet()).death_failures, 3);
      await setSheet({
        hp_current: 4,
        hp_temp: 0,
        death_successes: 0,
        death_failures: 0,
        conditions: [],
      });
      await damage(6, [
        { amount: 4, critical: false },
        { amount: 1, critical: true },
        { amount: 1, critical: false },
      ]);
      assert.equal((await sheet()).death_failures, 3);
    });
    await t.test(
      'all new symbols and tokens pass the strict SQL validator; life summaries respect privacy',
      async () => {
        const doc = generateAtlas('blank', 640, 480, 'catalog', 'Biblioteca');
        doc.objects = [
          ...SYMBOLS.map(([symbol, name]) => ({
            ...featureBase({ x: 100, y: 100 }, name),
            kind: 'symbol' as const,
            symbol,
            size: 48,
            color: '#66543c',
          })),
          ...TOKEN_ICONS.map((icon) => ({
            ...featureBase({ x: 200, y: 200 }, icon),
            kind: 'token' as const,
            icon,
            size: 48,
            color: '#638895',
            faction: 'ally' as const,
            number: 1,
          })),
        ];
        await db.query('select private.validate_atlas_document($1)', [JSON.stringify(doc)]);
        await assert.rejects(
          db.query('select private.validate_atlas_document($1)', [
            JSON.stringify({
              ...doc,
              objects: [{ ...doc.objects[0], symbol: 'untrusted-script' }],
            }),
          ]),
          /Símbolo/,
        );
        const visible = (
          await as(defender, () =>
            db.query<any>('select public.list_battle_life($1) s', [campaign]),
          )
        ).rows[0].s;
        assert.equal(visible.find((s: any) => s.id === actor.id).hp_current, undefined);
      },
    );
    await t.test('healing cancels a pending test; migration reapplies safely', async () => {
      await setSheet({ hp_current: 4, conditions: [], death_failures: 0 });
      await setSheet({ hp_current: 0 });
      await nextRound();
      assert.ok(await pending());
      await setSheet({ hp_current: 3 });
      assert.equal(await pending(), undefined);
      assert.equal((await sheet()).death_successes, 0);
      await db.exec(readMigration('202610240040_life_and_map_library.sql'));
    });
  } finally {
    await db.close();
  }
});

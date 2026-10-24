import profileUpdates from '../src/features/vtt/spell-profile-updates.json';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';
import { defaultSheet, calculate } from '../src/systems/dnd5e';
import { withClassLevels } from '../src/systems/dnd5e/progression';
import { SPELL_CATALOG, spellFromCatalog } from '../src/systems/dnd5e/spell-catalog';
import { spellEffect } from '../src/features/vtt/effects';
import { newItemDefinition, newItemFunction } from '../src/features/items/model';
import type { CampaignItem, ItemDelivery } from '../src/features/items/types';
import { ITEM_CATALOG } from '../src/systems/dnd5e/items';
import type { DndSheet, ClassLevel, Spell } from '../src/systems/dnd5e/types';
import type {
  BattleActionRequest,
  BattleDecision,
  BattleMap,
  BattleToken,
} from '../src/features/vtt/types';

test('037: guided combat is authorized, canonical, atomic and idempotent in PostgreSQL', async (t) => {
  const db = await billingDatabase();
  try {
    await db.exec('update public.site_billing_settings set billing_enabled=false');
    await db.exec(readMigration('202610230037_sheet_rules_and_guided_combat.sql'));
    // The historical engine replay must not downgrade the current reviewed catalogue.
    for (const [id, profile] of Object.entries(profileUpdates))
      await db.query('update public.dnd_spells set combat=$2 where id=$1', [
        id,
        JSON.stringify(profile),
      ]);
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
    const getSheet = async (id = hero) =>
      (
        await db.query<{ s: DndSheet }>('select system_data s from public.characters where id=$1', [
          id,
        ])
      ).rows[0].s;
    const getToken = async (id = actor.id) =>
      (await db.query<BattleToken>('select * from public.battle_map_tokens where id=$1', [id]))
        .rows[0];
    const getRequest = async (id: string) =>
      (
        await db.query<BattleActionRequest>(
          'select * from public.battle_action_requests where id=$1',
          [id],
        )
      ).rows[0];
    async function request(payload: Record<string, unknown>) {
      return (
        await as(player, () =>
          db.query<{ r: BattleActionRequest }>(
            'select to_jsonb(public.request_battle_action($1,$2,$3)) r',
            [actor.id, JSON.stringify(payload), randomUUID()],
          ),
        )
      ).rows[0].r;
    }
    async function guide(id: string, options = {}) {
      return (
        await as(gm, () =>
          db.query<{ r: BattleActionRequest }>(
            'select to_jsonb(public.guide_battle_action($1,$2)) r',
            [id, JSON.stringify(options)],
          ),
        )
      ).rows[0].r;
    }
    const pending = async (id: string) =>
      (
        await db.query<BattleDecision>(
          "select * from public.battle_decisions where request_id=$1 and status='pending' order by created_at,sequence",
          [id],
        )
      ).rows;
    async function answer(
      d: BattleDecision,
      user = player,
      natural = 10,
      choice?: string,
      client = randomUUID(),
    ) {
      await db.query("select set_config('test.guided_natural',$1,false)", [String(natural)]);
      return (
        await as(user, () =>
          db.query<{ d: BattleDecision }>(
            'select to_jsonb(public.answer_battle_decision($1,$2,$3)) d',
            [d.id, client, JSON.stringify(choice ? { choice } : {})],
          ),
        )
      ).rows[0].d;
    }
    // Deterministic d20s only in this fixture. The production damage roller remains intact.
    await db.exec(`alter function private.battle_roll_detail(text,text) rename to guided_test_original_roll;
   create function private.battle_roll_detail(p_expression text,p_mode text default 'normal') returns jsonb language plpgsql volatile set search_path='' as $$
   declare d jsonb=private.guided_test_original_roll(p_expression,p_mode);term jsonb;terms jsonb='[]';n integer=coalesce(nullif(current_setting('test.guided_natural',true),'')::integer,10);delta integer=0;
   begin for term in select value from jsonb_array_elements(d->'terms') loop
    if (term->>'sides')::integer=20 then delta=delta+n-(term->>'subtotal')::integer;term=term||jsonb_build_object('values',case when p_mode='normal' then jsonb_build_array(n) else jsonb_build_array(n,n) end,'subtotal',n);end if;terms=terms||jsonb_build_array(term);end loop;
    return d||jsonb_build_object('terms',terms,'total',(d->>'total')::integer+delta);end $$;`);
    await t.test(
      'all 361 current profiles are synchronized with the complete migration chain',
      async () => {
        const rows = (
          await db.query<{ id: string; combat: object }>('select id,combat from public.dnd_spells')
        ).rows;
        assert.equal(rows.length, 361);
        for (const row of rows)
          assert.deepEqual(row.combat, spellEffect({ catalog_id: row.id }), row.id);
      },
    );
    await t.test(
      'players choose training through class/background rules; GM exceptions survive later player saves',
      async () => {
        const s = make([{ class_id: 'wizard', level: 5 }]);
        await assert.rejects(save({ ...s, skills: { arcana: 2 } }), /Exceções manuais/);
        await as(gm, () =>
          db.query('select public.save_character($1::jsonb)', [
            JSON.stringify({
              id: hero,
              campaign_id: campaign,
              rpg_system_id: system,
              owner_id: player,
              name: 'Mira',
              sheet: { ...s, skills: { arcana: 2 } },
            }),
          ]),
        );
        await save({ ...s, skills: { arcana: 2 } });
        await assert.rejects(
          save({ ...s, skills: { arcana: 2, perception: 1 } }),
          /Exceções manuais/,
        );
        await as(gm, () =>
          db.query('select public.save_character($1::jsonb)', [
            JSON.stringify({
              id: hero,
              campaign_id: campaign,
              rpg_system_id: system,
              owner_id: player,
              name: 'Mira',
              sheet: s,
            }),
          ]),
        );
      },
    );
    await t.test(
      'preparation caps cannot be bypassed by generic bonus/always-prepared flags',
      async () => {
        const entries = SPELL_CATALOG.filter(
          (sp) => sp.classes.includes('wizard') && sp.level === 1,
        )
          .slice(0, 9)
          .map((sp) => ({
            ...spellFromCatalog(sp, randomUUID(), 'wizard'),
            prepared: true,
            always_prepared: true,
            casting_mode: 'bonus' as const,
          }));
        await assert.rejects(
          save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: entries }),
          /Prepare até 8/,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              'select count(*) n from public.character_spells where character_id=$1',
              [hero],
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      'expertise requires a proficiency; multiclass proficiencies remain available',
      async () => {
        await assert.rejects(
          save(make([{ class_id: 'rogue', level: 1, choices: { 'expertise-1': ['arcana'] } }])),
          /Especialização exige/,
        );
        const s = make([
          { class_id: 'wizard', level: 3 },
          { class_id: 'rogue', level: 1, choices: { 'expertise-1': ['arcana'] } },
        ]);
        s.creation = { method: 'manual', base: s.abilities, bonuses: {}, class_skills: ['arcana'] };
        await save(s);
      },
    );
    await t.test('third casters enforce the school allowance and Mage Hand', async () => {
      const s = make([{ class_id: 'fighter', level: 3, subclass_id: 'eldritch-knight' }]);
      await assert.rejects(
        save({
          ...s,
          spells: [spell('Charm Person', 'fighter'), spell('Disguise Self', 'fighter')],
        }),
        /outras escolas/,
      );
      const rogue = make([{ class_id: 'rogue', level: 3, subclass_id: 'arcane-trickster' }]);
      await assert.rejects(
        save({
          ...rogue,
          spells: [
            spell('Fire Bolt', 'rogue'),
            spell('Ray of Frost', 'rogue'),
            spell('Minor Illusion', 'rogue'),
          ],
        }),
        /Mãos Mágicas/,
      );
    });
    await t.test(
      'server armor and save math match the sheet for classes, armor and magic items',
      async () => {
        for (const levels of [
          [{ class_id: 'barbarian', level: 5 }],
          [{ class_id: 'monk', level: 14 }],
          [{ class_id: 'paladin', level: 6 }],
          [{ class_id: 'sorcerer', level: 6, subclass_id: 'draconic' }],
        ] as ClassLevel[][]) {
          const s = make(levels);
          await save(s);
          const armor = (
            await db.query<{ ac: number }>('select private.dnd37_armor($1) ac', [actor.id])
          ).rows[0].ac;
          assert.equal(armor, calculate(s).armorClass);
          const wis = (
            await db.query<{ bonus: number }>("select private.dnd37_save_bonus($1,'wis') bonus", [
              actor.id,
            ])
          ).rows[0].bonus;
          assert.equal(wis, calculate(s).saves.wis);
        }
      },
    );
    await t.test(
      'weapon hit and critical use canonical bonuses; retries never repeat HP or resources',
      async () => {
        const sword = {
          ...ITEM_CATALOG.find((i) => i.catalog_id === 'longsword')!,
          id: randomUUID(),
          equipped: true,
        };
        const s = { ...make([{ class_id: 'fighter', level: 5 }]), inventory: [sword] };
        await save(s);
        await start();
        await db.query('update public.battle_map_tokens set x=3 where id=$1', [enemy.id]);
        const q = await request({
          kind: 'weapon',
          source_id: sword.id,
          target: { x: 3, y: 2 },
          target_ids: [enemy.id],
        });
        await assert.rejects(
          as(player, () => db.query('select public.guide_battle_action($1)', [q.id])),
          /Somente o mestre/,
        );
        await guide(q.id);
        const attack = (await pending(q.id))[0];
        assert.equal(attack.modifier, 6);
        await assert.rejects(answer(attack, defender), /outro participante/);
        assert.equal(
          (await as(stranger, () => db.query('select * from public.battle_decisions'))).rows.length,
          0,
        );
        await assert.rejects(
          as(player, () =>
            db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
          ),
          /pendentes/,
        );
        const hit = await answer(attack, player, 20);
        await assert.rejects(
          as(player, () => db.query('select public.cancel_battle_action($1)', [q.id])),
          /rolagens já começaram/,
        );
        assert.equal(hit.result.critical, true);
        const damage = (await pending(q.id))[0],
          client = randomUUID();
        const first = await answer(damage, player, 10, undefined, client),
          hp = (
            await db.query<{ hp_current: number }>(
              'select hp_current from public.npc_stats where npc_id=$1',
              [npc],
            )
          ).rows[0].hp_current;
        assert.match(first.result.roll!.expression, /2d8\+3/);
        assert.deepEqual(await answer(damage, player, 10, undefined, client), first);
        assert.equal(
          (
            await db.query<{ hp_current: number }>(
              'select hp_current from public.npc_stats where npc_id=$1',
              [npc],
            )
          ).rows[0].hp_current,
          hp,
        );
        assert.equal((await getToken()).attacks_remaining, 1);
        assert.equal((await getToken()).action_used, true);
        assert.equal((await getRequest(q.id)).status, 'success');
      },
    );
    await t.test(
      'a miss spends the attack even if the campaign allows free manual failures',
      async () => {
        await start();
        await db.query(
          'update public.battle_sessions set failed_actions_consume=false where id=$1',
          [map.battle_session_id],
        );
        const inv = (
          await db.query<{ id: string }>(
            'select id from public.character_inventory where character_id=$1',
            [hero],
          )
        ).rows[0];
        const q = await request({
          kind: 'weapon',
          source_id: inv.id,
          target: { x: 3, y: 2 },
          target_ids: [enemy.id],
        });
        await guide(q.id);
        await answer((await pending(q.id))[0], player, 1);
        assert.equal((await getRequest(q.id)).status, 'failure');
        assert.equal((await getToken()).attacks_remaining, 1);
        assert.equal((await pending(q.id)).length, 0);
      },
    );
    await t.test(
      'area saves go to target owners; one damage roll respects Evasion and spends one slot',
      async () => {
        const fire = spell('Fireball');
        await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [fire] });
        await start();
        await db.query('update public.battle_map_tokens set x=6 where id=$1', [enemy.id]);
        const q = await request({
          kind: 'spell',
          source_id: fire.id,
          resource_kind: 'slot',
          resource_level: 3,
          target: { x: 6, y: 2 },
          target_ids: [],
        });
        await guide(q.id);
        const saves = await pending(q.id);
        assert.equal(saves.length, 3);
        const own = (
          await as(defender, () =>
            db.query<BattleDecision>('select * from public.battle_decisions where request_id=$1', [
              q.id,
            ]),
          )
        ).rows;
        assert.equal(own.length, 1);
        assert.equal(own[0].token_id, ally.id);
        assert.equal(own[0].dc, 14);
        assert.equal(
          (
            await as(defender, () =>
              db.query('select * from public.battle_action_requests where id=$1', [q.id]),
            )
          ).rows.length,
          0,
        );
        for (const d of saves)
          await answer(
            d,
            d.token_id === ally.id ? defender : d.token_id === actor.id ? player : gm,
            d.token_id === ally.id ? 9 : 1,
          );
        const damage = (await pending(q.id))[0];
        assert.equal(damage.kind, 'damage');
        assert.equal((await getSheet()).slots_used['3'] ?? 0, 0);
        await answer(damage);
        const result = await getRequest(q.id);
        assert.equal(
          result.resolution.affected!.find((effect) => effect.token_id === ally.id)!.amount,
          0,
        );
        assert.equal(
          result.resolution.affected!.find((effect) => effect.token_id === enemy.id)!.amount,
          result.resolution.dice_roll!.total,
        );
        assert.equal((await getSheet()).slots_used['3'], 1);
        assert.equal(result.resolution.dice_rolls!.length, 1);
      },
    );
    await t.test(
      'Scorching Ray has separate attacks, per-ray critical damage and one slot',
      async () => {
        const ray = spell('Scorching Ray');
        await save({ ...make([{ class_id: 'wizard', level: 7 }]), spells: [ray] });
        await start();
        const q = await request({
          kind: 'spell',
          source_id: ray.id,
          resource_kind: 'slot',
          resource_level: 3,
          target: { x: 6, y: 2 },
          target_ids: [enemy.id, ally.id],
          attack_targets: [enemy.id, enemy.id, ally.id, ally.id],
        });
        assert.equal(q.definition.attackCount, 4);
        assert.equal(q.definition.dice, '2d6');
        await guide(q.id);
        const attacks = await pending(q.id);
        assert.equal(attacks.length, 4);
        await answer(attacks[0], player, 20);
        await answer(attacks[1], player, 10);
        await answer(attacks[2], player, 1);
        await answer(attacks[3], player, 1);
        await answer((await pending(q.id))[0]);
        const result = await getRequest(q.id);
        assert.deepEqual(
          result.resolution.dice_rolls!.map((r) => r.expression),
          ['4d6', '2d6'],
        );
        assert.equal(
          result.resolution.affected!.find((effect) => effect.token_id === ally.id)!.amount,
          0,
        );
        assert.equal((await getSheet()).slots_used['3'], 1);
      },
    );
    await t.test(
      'concentration is offered as a choice, can be cancelled without a slot and fails correctly',
      async () => {
        const detect = spell('Detect Magic');
        await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [detect] });
        await start();
        const seed = (
          await db.query<{ id: string }>('select id from public.battle_action_requests limit 1')
        ).rows[0].id;
        const effect = randomUUID();
        await db.query(
          "insert into public.battle_spell_effects(id,request_id,campaign_id,map_id,token_id,name,definition,target,concentration,duration) values($1,$2,$3,$4,$5,'Concentração anterior','{}','{\"x\":2,\"y\":2}',true,'1 minuto')",
          [effect, seed, campaign, map.id, actor.id],
        );
        const q = await request({
          kind: 'spell',
          source_id: detect.id,
          resource_kind: 'slot',
          resource_level: 1,
          target: { x: 2, y: 2 },
          target_ids: [actor.id],
        });
        await guide(q.id);
        const choice = (await pending(q.id))[0];
        assert.equal(choice.kind, 'choice');
        await answer(choice, player, 10, 'cancel');
        assert.equal((await getRequest(q.id)).status, 'cancelled');
        assert.equal((await getSheet()).slots_used['1'] ?? 0, 0);
        assert.equal(
          (
            await db.query<{ active: boolean }>(
              'select active from public.battle_spell_effects where id=$1',
              [effect],
            )
          ).rows[0].active,
          true,
        );
        await start();
        const ray = spell('Scorching Ray');
        await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [ray] });
        await db.query('update public.battle_spell_effects set token_id=$1 where id=$2', [
          enemy.id,
          effect,
        ]);
        const attack = await request({
          kind: 'spell',
          source_id: ray.id,
          resource_kind: 'slot',
          resource_level: 2,
          target: { x: 6, y: 2 },
          target_ids: [enemy.id],
          attack_targets: [enemy.id, enemy.id, enemy.id],
        });
        await guide(attack.id);
        for (const d of await pending(attack.id)) await answer(d, player, 10);
        await answer((await pending(attack.id))[0]);
        const checks = await pending(attack.id);
        assert.equal(checks.length, 3);
        assert.ok(checks.every((d) => d.kind === 'concentration' && d.dc === 10));
        await answer(checks[0], gm, 1);
        assert.equal(
          (
            await db.query<{ active: boolean }>(
              'select active from public.battle_spell_effects where id=$1',
              [effect],
            )
          ).rows[0].active,
          false,
        );
        for (const d of checks.slice(1)) await answer(d, gm, 20);
      },
    );
    await t.test(
      'campaign items keep their fixed DC, ask the target to save and spend charges exactly once',
      async () => {
        await start();
        const fn = {
          ...newItemFunction(),
          name: 'Raio da vara',
          kind: 'damage' as const,
          dice: '2d6',
          range: 30,
          save: 'CON',
          save_dc: 30,
          halfOnSave: true,
          charge_cost: 1,
        };
        const definition = {
          ...newItemDefinition(),
          name: 'Vara de prova',
          charges: 2,
          functions: [
            fn,
            {
              ...newItemFunction(),
              id: 'fixed-attack',
              name: 'Ataque da vara',
              kind: 'damage',
              dice: '2d6',
              range: 30,
              attackRoll: true,
              attack_bonus: 7,
              charge_cost: 1,
            },
          ],
        };
        const item = (
          await as(gm, () =>
            db.query<{ item: CampaignItem }>(
              'select to_jsonb(public.save_campaign_item($1)) item',
              [
                JSON.stringify({
                  id: randomUUID(),
                  campaign_id: campaign,
                  data: definition,
                  visible_to_players: true,
                  archived: false,
                }),
              ],
            ),
          )
        ).rows[0].item;
        const delivery = (
          await as(gm, () =>
            db.query<{ delivery: ItemDelivery }>(
              'select to_jsonb(public.give_campaign_item($1,$2,1,$3,$4)) delivery',
              [item.id, hero, randomUUID(), item.version],
            ),
          )
        ).rows[0].delivery;
        const q = await request({
          kind: 'item',
          source_id: delivery.inventory_id,
          item_function_id: fn.id,
          target: { x: 6, y: 2 },
          target_ids: [enemy.id],
        });
        assert.equal(q.definition.save_dc, 30);
        await guide(q.id);
        const saveTask = (await pending(q.id))[0];
        assert.equal(saveTask.dc, 30);
        await as(gm, () =>
          db.query("select public.configure_battle_decision($1,'normal',5)", [saveTask.id]),
        );
        assert.equal((await pending(q.id))[0].modifier, 5);
        const saved = await answer(saveTask, gm, 20);
        assert.equal(
          saved.result.passed,
          false,
          'A natural 20 does not automatically succeed on a saving throw',
        );
        const damage = (await pending(q.id))[0],
          client = randomUUID();
        await answer(damage, player, 10, undefined, client);
        await answer(damage, player, 10, undefined, client);
        const data = (
          await db.query<{ data: { charges_used: number } }>(
            'select data from public.character_inventory where id=$1',
            [delivery.inventory_id],
          )
        ).rows[0].data;
        assert.equal(data.charges_used, 1);
        await start();
        const attackRequest = await request({
          kind: 'item',
          source_id: delivery.inventory_id,
          item_function_id: 'fixed-attack',
          target: { x: 6, y: 2 },
          target_ids: [enemy.id],
        });
        assert.equal(attackRequest.definition.attackBonus, 7);
        await guide(attackRequest.id);
        const attack = (await pending(attackRequest.id))[0];
        assert.equal(attack.modifier, 7);
        await answer(attack, player, 10);
        await answer((await pending(attackRequest.id))[0]);
        const used = (
          await db.query<{ data: { charges_used: number } }>(
            'select data from public.character_inventory where id=$1',
            [delivery.inventory_id],
          )
        ).rows[0].data;
        assert.equal(used.charges_used, 2);
      },
    );
    await t.test(
      'the GM can close a request whose source changed after rolling, with a manual resource review',
      async () => {
        await start();
        const ray = spell('Scorching Ray');
        await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [ray] });
        const q = await request({
          kind: 'spell',
          source_id: ray.id,
          resource_kind: 'slot',
          resource_level: 2,
          target: { x: 6, y: 2 },
          target_ids: [enemy.id],
        });
        await guide(q.id);
        await answer((await pending(q.id))[0], player, 10);
        await db.query('delete from public.character_spells where id=$1', [ray.id]);
        await as(gm, () => db.query('select public.cancel_battle_action($1)', [q.id]));
        const cancelled = await getRequest(q.id);
        assert.equal(cancelled.status, 'cancelled');
        assert.equal(
          (cancelled.resolution as { manual_resource_review?: boolean }).manual_resource_review,
          true,
        );
        assert.equal((await pending(q.id)).length, 0);
        await save({ ...make([{ class_id: 'wizard', level: 5 }]), spells: [ray] });
      },
    );
    await t.test('cancelling a guided action cancels its outstanding prompts', async () => {
      await start();
      const ray = (
        await db.query<{ id: string }>(
          'select id from public.character_spells where character_id=$1',
          [hero],
        )
      ).rows[0];
      const q = await request({
        kind: 'spell',
        source_id: ray.id,
        resource_kind: 'slot',
        resource_level: 2,
        target: { x: 6, y: 2 },
        target_ids: [enemy.id],
      });
      await guide(q.id);
      await as(player, () => db.query('select public.cancel_battle_action($1)', [q.id]));
      assert.equal((await pending(q.id)).length, 0);
      assert.equal((await getToken()).action_used, false);
    });
  } finally {
    await db.close();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';
import { defaultSheet } from '../src/systems/dnd5e';
import { withClassLevels } from '../src/systems/dnd5e/progression';
test('041: inspiration ownership, atomic rests and replay protection', async (t) => {
  const db = await billingDatabase();
  try {
    await db.exec('update public.site_billing_settings set billing_enabled=false');
    const gm = randomUUID(),
      player = randomUUID(),
      outsider = randomUUID(),
      campaign = randomUUID(),
      hero = randomUUID(),
      system = '00000000-0000-4000-8000-000000000001';
    await db.query(
      "insert into auth.users(id,email) values($1,'action-gm@test.local'),($2,'action-player@test.local'),($3,'action-outsider@test.local')",
      [gm, player, outsider],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Ações')",
      [campaign, gm, system],
    );
    await db.query(
      'insert into public.campaign_members(campaign_id,user_id) values($1,$2),($1,$3)',
      [campaign, player, outsider],
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
    let s = withClassLevels(
      {
        ...defaultSheet(),
        hp_current: 25,
        hp_max_override: 100,
        abilities: { str: 16, dex: 16, con: 16, int: 16, wis: 16, cha: 16 },
      },
      [
        { class_id: 'wizard', level: 5 },
        { class_id: 'warlock', level: 3 },
        { class_id: 'fighter', level: 2 },
      ],
    );
    async function save(sheet = s) {
      await as(player, () =>
        db.query('select public.save_character($1)', [
          JSON.stringify({
            id: hero,
            campaign_id: campaign,
            owner_id: player,
            rpg_system_id: system,
            name: 'Ari',
            sheet,
          }),
        ]),
      );
    }
    await save();
    async function row() {
      return (
        await db.query<any>('select system_data s from public.characters where id=$1', [hero])
      ).rows[0].s;
    }
    async function inspire(user: string, delta: number, client = randomUUID()) {
      return (
        await as(user, () =>
          db.query<any>('select public.change_character_inspiration($1,$2,$3) r', [
            hero,
            delta,
            client,
          ]),
        )
      ).rows[0].r;
    }
    async function rest(user: string, kind = 'short', dice = {}, client = randomUUID()) {
      return (
        await as(user, () =>
          db.query<any>('select public.rest_character($1,$2,$3,$4) r', [
            hero,
            kind,
            JSON.stringify(dice),
            client,
          ]),
        )
      ).rows[0].r;
    }
    await t.test(
      'only GM grants; replay is stable and generic sheet saves cannot forge the counter',
      async () => {
        await assert.rejects(inspire(player, 1), /Somente o mestre/);
        await assert.rejects(inspire(outsider, -1), /acesso/);
        const key = randomUUID();
        await inspire(gm, 1, key);
        await inspire(gm, 1, key);
        assert.equal((await row()).inspiration_count, 1);
        assert.equal((await row()).details.inspiration, true);
        await save({ ...s, inspiration_count: 99, details: { inspiration: true } });
        assert.equal((await row()).inspiration_count, 1);
        const consume = randomUUID();
        await inspire(player, -1, consume);
        await inspire(player, -1, consume);
        assert.equal((await row()).inspiration_count, 0);
        await assert.rejects(inspire(player, -1), /Não há inspiração/);
        await assert.rejects(inspire(gm, -1, key), /identificador/);
      },
    );
    await t.test('rest permission and participant ownership are enforced server-side', async () => {
      await db.query(
        'insert into public.campaign_rules(campaign_id,players_can_rest) values($1,false) on conflict(campaign_id) do update set players_can_rest=false',
        [campaign],
      );
      await assert.rejects(rest(player), /Somente o mestre/);
      await assert.rejects(rest(outsider), /acesso/);
      await rest(gm);
      await db.query(
        'update public.campaign_rules set players_can_rest=true where campaign_id=$1',
        [campaign],
      );
    });
    await t.test(
      'short rests recover pact and appropriate class features, preserving ordinary slots and inspiration',
      async () => {
        await inspire(gm, 1);
        await db.query('update public.characters set system_data=system_data||$2 where id=$1', [
          hero,
          JSON.stringify({
            slots_used: { '1': 2 },
            pact_slots_used: 2,
            feature_uses: {
              'fighter:action-surge': 1,
              'fighter:second-wind': 1,
              'wizard:arcane-recovery': 1,
            },
            hit_dice_by_class: { wizard: 3, warlock: 2, fighter: 1 },
            hit_dice_used: 6,
          }),
        ]);
        await rest(player);
        const r = await row();
        assert.equal(r.pact_slots_used, 0);
        assert.equal(r.slots_used['1'], 2);
        assert.equal(r.feature_uses['fighter:action-surge'], 0);
        assert.equal(r.feature_uses['wizard:arcane-recovery'], 1);
        assert.equal(r.inspiration_count, 1);
        assert.equal(r.hp_current, 25);
      },
    );
    await t.test(
      'hit-die rolls are authoritative and invalid/repeated requests never spend twice',
      async () => {
        const key = randomUUID(),
          r = await rest(player, 'short', { fighter: 1 }, key);
        assert.equal(r.hit_dice_spent, 1);
        assert.ok(r.healing_rolls[0].face >= 1 && r.healing_rolls[0].face <= 10);
        assert.equal(r.healing_rolls[0].modifier, 3);
        assert.equal((await row()).hp_current, r.hp_after);
        const again = await rest(player, 'short', { fighter: 1 }, key);
        assert.deepEqual(again, r);
        await assert.rejects(rest(player, 'short', { fighter: 1 }), /indisponíveis/);
        await assert.rejects(rest(player, 'short', { wizard: 1.5 }), /inválida/);
        await assert.rejects(rest(player, 'long', {}, key), /identificador/);
      },
    );
    await t.test(
      'long rest heals and restores only half the hit dice, and preserves the inspiration counter',
      async () => {
        const r = await rest(player, 'long');
        assert.equal(r.hp_after, 100);
        assert.equal(r.hit_dice_recovered, 5);
        const n = await row();
        assert.equal(n.hit_dice_used, 2);
        assert.deepEqual(n.slots_used, {});
        assert.deepEqual(n.arcanum_used, {});
        assert.equal(n.feature_uses['wizard:arcane-recovery'], 0);
        assert.equal(n.inspiration_count, 1);
      },
    );
    await t.test(
      'unconscious characters cannot rest and private authorization records cannot be read',
      async () => {
        await db.query(
          "update public.characters set system_data=jsonb_set(system_data,'{hp_current}','0') where id=$1",
          [hero],
        );
        await assert.rejects(rest(player), /consciente/);
        await assert.rejects(
          as(player, () => db.query('select * from private.character_action_receipts')),
          /permission denied/,
        );
        await db.exec(readMigration('202610240041_character_actions.sql'));
      },
    );
  } finally {
    await db.close();
  }
});

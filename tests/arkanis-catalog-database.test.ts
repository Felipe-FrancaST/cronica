import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';
import { defaultArkanisSheet, ARKANIS_SYSTEM_ID, syncArkanis } from '../src/systems/arkanis/rules';
import { arkanisGiftDefinition } from '../src/systems/arkanis/catalog-gifts';
import { INGREDIENTS } from '../src/systems/arkanis/ingredients';
import { POTIONS } from '../src/systems/arkanis/potions';
import { itemDefinitionErrors } from '../src/features/items/model';

test('050: all 255 built-in gifts are valid definitions with their canonical icons', () => {
  for (const i of [...INGREDIENTS, ...POTIONS]) {
    const d = arkanisGiftDefinition(i.id);
    assert.equal(d.name, i.name);
    assert.equal(d.image_path, i.icon);
    assert.deepEqual(itemDefinitionErrors(d), []);
  }
  assert.throws(() => arkanisGiftDefinition('missing'));
});
test('050: master grants the built-in catalogue transactionally, preserving permissions and retries', async (t) => {
  const db = await billingDatabase();
  const gm = randomUUID(),
    player = randomUUID(),
    outsider = randomUUID(),
    cid = randomUUID(),
    char = randomUUID();
  const as = async <T>(id: string, fn: () => Promise<T>) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    try {
      return await fn();
    } finally {
      await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
    }
  };
  const give = (id: string, qty = 2, request = randomUUID(), actor = gm) =>
    as(actor, () =>
      db.query<{ v: { id: string; inventory_id: string; item_id: string } }>(
        'select to_jsonb(public.give_arkanis_catalog_item($1,$2,$3,$4)) v',
        [char, id, qty, request],
      ),
    );
  try {
    await db.exec('update public.site_billing_settings set billing_enabled=false');
    for (const id of [gm, player, outsider])
      await db.query('insert into auth.users(id,email) values($1,$2)', [id, id + '@test.local']);
    await as(gm, () =>
      db.query(
        "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Arkanis 050')",
        [cid, gm, ARKANIS_SYSTEM_ID],
      ),
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      cid,
      player,
    ]);
    const sheet = syncArkanis(
      {
        ...defaultArkanisSheet(),
        arkano: { body: 8, mind: 8, spirit: 8, bonus: 0, modifier_override: null },
      },
      'maximum',
    );
    await as(player, () =>
      db.query('select public.save_arkanis_character($1,null)', [
        JSON.stringify({
          id: char,
          campaign_id: cid,
          owner_id: player,
          rpg_system_id: ARKANIS_SYSTEM_ID,
          name: 'Ayla',
          portrait_path: null,
          appearance: '',
          biography: '',
          sheet,
        }),
      ]),
    );
    await t.test(
      'no manual registration: ingredients from different habitats and potions at every tier',
      async () => {
        for (const id of ['arkanis-001', 'arkanis-180', 'potion-001', 'potion-031', 'potion-075']) {
          const r = (await give(id)).rows[0].v;
          const inv = (
            await db.query<{ data: Record<string, unknown> }>(
              'select data from public.character_inventory where id=$1',
              [r.inventory_id],
            )
          ).rows[0].data;
          assert.equal(inv.name, arkanisGiftDefinition(id).name);
          assert.equal(inv.quantity, 2);
          assert.equal(inv.image_path, arkanisGiftDefinition(id).image_path);
          assert.deepEqual(inv.tags, arkanisGiftDefinition(id).tags);
        }
      },
    );
    await t.test('retry does not duplicate the delivery or its catalogue model', async () => {
      const request = randomUUID();
      const a = (await give('potion-031', 3, request)).rows[0].v;
      const b = (await give('potion-031', 3, request)).rows[0].v;
      assert.equal(a.id, b.id);
      assert.equal(a.inventory_id, b.inventory_id);
      const n = await db.query<{ n: number }>(
        'select count(*)::integer n from public.campaign_items where campaign_id=$1 and name=$2',
        [cid, POTIONS[30].name],
      );
      assert.equal(n.rows[0].n, 1);
      await assert.rejects(give('potion-031', 4, request), /inválida/);
    });
    await t.test('players, outsiders, invalid IDs and quantities cannot grant gifts', async () => {
      await assert.rejects(give('arkanis-001', 1, randomUUID(), player), /mestre/);
      await assert.rejects(give('arkanis-001', 1, randomUUID(), outsider), /mestre/);
      await assert.rejects(give('not-found'), /catálogo/);
      await assert.rejects(give('arkanis-001', 0), /9.999/);
    });
    await t.test('migration can be applied twice and grants still work', async () => {
      await db.exec(readMigration('202611070050_arkanis_catalog_deliveries.sql'));
      await give('potion-075');
    });
  } finally {
    await db.close();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';
import { defaultArkanisSheet, syncArkanis, ARKANIS_SYSTEM_ID } from '../src/systems/arkanis/rules';

test('054: Arkanis starts with maximum PV, repairs legacy defaults and preserves rolled and D&D', async () => {
  const db = await billingDatabase();
  const owner = randomUUID();
  const create = async (system = ARKANIS_SYSTEM_ID) => {
    const id = randomUUID();
    await db.query(
      'insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,$4)',
      [id, owner, system, 'Padrão PV'],
    );
    return id;
  };
  const method = async (id: string) =>
    (
      await db.query<{ hit_point_method: string }>(
        'select hit_point_method from public.campaign_rules where campaign_id=$1',
        [id],
      )
    ).rows[0]?.hit_point_method;
  try {
    await db.exec('update public.site_billing_settings set billing_enabled=false');
    await db.query('insert into auth.users(id,email) values($1,$2)', [
      owner,
      'default@arkanis.test',
    ]);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const fresh = await create();
    assert.equal(await method(fresh), 'maximum');
    const sheet = syncArkanis(defaultArkanisSheet(), 'maximum');
    sheet.arkano = { body: 2, mind: 2, spirit: 4, bonus: 0, modifier_override: null };
    await db.query('select public.save_arkanis_character($1::jsonb,null)', [
      JSON.stringify({
        id: randomUUID(),
        campaign_id: fresh,
        owner_id: owner,
        rpg_system_id: ARKANIS_SYSTEM_ID,
        name: 'Primeira ficha',
        sheet,
      }),
    ]);
    await db.exec('reset role');
    await db.exec(
      'alter table public.campaigns disable trigger arkanis54_default_rules;alter table public.campaign_rules disable trigger arkanis54_pv_default',
    );
    const missing = await create(),
      legacy = await create(),
      rolled = await create(),
      dnd = await create('00000000-0000-4000-8000-000000000001');
    await db.query(
      "insert into public.campaign_rules(campaign_id,hit_point_method) values($1,'average'),($2,'rolled'),($3,'average')",
      [legacy, rolled, dnd],
    );
    await db.exec(
      'alter table public.campaigns enable trigger arkanis54_default_rules;alter table public.campaign_rules enable trigger arkanis54_pv_default',
    );
    const retained = (
      await db.query(
        'select * from public.campaign_rules where campaign_id in ($1,$2) order by campaign_id',
        [rolled, dnd],
      )
    ).rows;
    await db.exec(readMigration('202611090054_arkanis_default_pv.sql'));
    assert.equal(await method(missing), 'maximum');
    assert.equal(await method(legacy), 'maximum');
    assert.deepEqual(
      (
        await db.query(
          'select * from public.campaign_rules where campaign_id in ($1,$2) order by campaign_id',
          [rolled, dnd],
        )
      ).rows,
      retained,
    );
    // Legacy/default inserts and updates are normalized even when callers omit the method.
    await db.query(
      "update public.campaign_rules set hit_point_method='average' where campaign_id=$1",
      [fresh],
    );
    assert.equal(await method(fresh), 'maximum');
    await db.query(
      "update public.campaign_rules set hit_point_method='rolled' where campaign_id=$1",
      [fresh],
    );
    await db.exec(readMigration('202611090054_arkanis_default_pv.sql'));
    assert.equal(await method(fresh), 'rolled');
    assert.equal(await method(dnd), 'average');
  } finally {
    await db.close();
  }
});

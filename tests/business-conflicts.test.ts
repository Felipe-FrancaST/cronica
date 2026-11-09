import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';
import { defaultArkanisSheet, syncArkanis, ARKANIS_SYSTEM_ID } from '../src/systems/arkanis/rules';

test('053: PV mismatch and stale versions return PT409, preserving permissions and data', async () => {
  const db = await billingDatabase();
  const owner = randomUUID(),
    campaign = randomUUID(),
    id = randomUUID();
  try {
    await db.exec('update public.site_billing_settings set billing_enabled=false');
    await db.query('insert into auth.users(id,email) values($1,$2)', [owner, 'owner@arkanis.test']);
    await db.query(
      'insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,$4)',
      [campaign, owner, ARKANIS_SYSTEM_ID, 'Regressão PV'],
    );
    await db.query(
      "insert into public.campaign_rules(campaign_id,hit_point_method) values($1,'rolled') on conflict(campaign_id) do update set hit_point_method='rolled'",
      [campaign],
    );
    const s = defaultArkanisSheet();
    s.arkano = { body: 2, mind: 2, spirit: 4, bonus: 0, modifier_override: null };
    s.level = 4;
    const payload = {
      id,
      campaign_id: campaign,
      owner_id: owner,
      rpg_system_id: ARKANIS_SYSTEM_ID,
      name: 'Teste',
      portrait_path: null,
      appearance: '',
      biography: '',
      sheet: syncArkanis(s, 'maximum'),
    };
    const save = async (expected: string | null = null) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
      try {
        return (
          await db.query<{ v: { updated_at: string } }>(
            'select public.save_arkanis_character($1::jsonb,$2::timestamptz) v',
            [JSON.stringify(payload), expected],
          )
        ).rows[0].v;
      } finally {
        await db.exec('reset role');
      }
    };
    await assert.rejects(
      save(),
      (e: any) => e.code === 'PT409' && /regra de PV mudou/.test(e.message),
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          'select count(*)::integer n from public.characters where id=$1',
          [id],
        )
      ).rows[0].n,
      0,
    );
    await db.query(
      "update public.campaign_rules set hit_point_method='maximum' where campaign_id=$1",
      [campaign],
    );
    const first = await save();
    await save(first.updated_at);
    await assert.rejects(save(first.updated_at), (e: any) => e.code === 'PT409');
    const before = await db.query(
      "select oid,proacl,prosecdef,proowner from pg_proc where oid in ('public.save_arkanis_character(jsonb,timestamptz)'::regprocedure,'private.arkanis49_progression()'::regprocedure) order by oid",
    );
    await db.exec(readMigration('202611080053_business_conflicts_no_retry.sql'));
    assert.deepEqual(
      (
        await db.query(
          "select oid,proacl,prosecdef,proowner from pg_proc where oid in ('public.save_arkanis_character(jsonb,timestamptz)'::regprocedure,'private.arkanis49_progression()'::regprocedure) order by oid",
        )
      ).rows,
      before.rows,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::integer n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname in ('public','private') and p.prosrc ~* 'errcode[[:space:]]*=[[:space:]]*''40001''' ",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

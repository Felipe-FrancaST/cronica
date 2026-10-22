import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';
import type { Campaign } from '../src/types';

const system = '00000000-0000-4000-8000-000000000001';
const repair = '202610220035_campaign_creation_rls_fix.sql';
function campaign(owner: string, name = 'A nova aventura'): Campaign {
  const stamp = new Date().toISOString();
  return {
    id: randomUUID(),
    owner_id: owner,
    rpg_system_id: system,
    name,
    description: 'Florestas e mistérios.',
    theme: 'Fantasia medieval',
    cover_path: null,
    status: 'active',
    created_at: stamp,
    updated_at: stamp,
  };
}
// PostgREST uses INSERT ... ON CONFLICT DO UPDATE for the application's upsert.
// RETURNING additionally verifies that the inserted row is immediately readable.
const upsertSql = `insert into public.campaigns(id,owner_id,rpg_system_id,name,description,theme,cover_path,status,created_at,updated_at)
 select id,owner_id,rpg_system_id,name,description,theme,cover_path,status,created_at,updated_at from jsonb_populate_record(null::public.campaigns,$1::jsonb)
 on conflict(id) do update set owner_id=excluded.owner_id,rpg_system_id=excluded.rpg_system_id,name=excluded.name,description=excluded.description,
 theme=excluded.theme,cover_path=excluded.cover_path,status=excluded.status,created_at=excluded.created_at,updated_at=excluded.updated_at
 returning *`;

test('campaign upserts work for authorized masters without bypassing tenant, billing or plan policies', async (t) => {
  const db = await billingDatabase(),
    paid = randomUUID(),
    member = randomUUID(),
    outsider = randomUUID(),
    courtesy = randomUUID(),
    admin = randomUUID(),
    limited = randomUUID();
  const plan = 'b1000000-0000-4000-8000-000000000001';
  const as = async <T>(id: string, run: () => Promise<T>) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    try {
      return await run();
    } finally {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub','',false)");
    }
  };
  const save = (row: Campaign) => db.query<Campaign>(upsertSql, [JSON.stringify(row)]);
  const read = (id: string) =>
    db.query<Campaign>('select * from public.campaigns where id=$1', [id]);
  const access = async (id: string) =>
    (
      await as(id, () =>
        db.query<{ v: { allowed: boolean; reason: string } }>(
          "select public.get_billing_context()->'access'->'master' v",
        ),
      )
    ).rows[0].v;
  const paidAt = new Date(Date.now() - 60000).toISOString();
  const pay = async (user: string, planId = plan) => {
    const contract = randomUUID(),
      payment = {
        provider_payment_id: `local-${contract}`,
        invoice_id: `invoice-${contract}`,
        status: 'approved',
        amount_cents: 2000,
        refunded_cents: 0,
        fee_cents: 90,
        net_cents: 1910,
        approved_at: paidAt,
        provider_updated_at: paidAt,
      };
    await db.query(
      "select public.billing_begin_checkout($1,$2,'master',$3,1,'payer@example.test',true)",
      [user, planId, contract],
    );
    await db.query("select public.billing_update_contract($1,$2,'authorized',null,now(),null)", [
      contract,
      `local-${contract}`,
    ]);
    await db.query('select public.billing_store_payment($1,$2::jsonb)', [
      contract,
      JSON.stringify(payment),
    ]);
    return { contract, payment };
  };
  const own = campaign(paid),
    other = campaign(courtesy, 'Outra campanha');
  try {
    for (const [i, id] of [paid, member, outsider, courtesy, admin, limited].entries())
      await db.query('insert into auth.users(id,email) values($1,$2)', [
        id,
        `campaign-${i}@example.test`,
      ]);
    await db.query('insert into public.site_administrators(user_id) values($1)', [admin]);
    await db.query(
      "insert into public.billing_access_grants(user_id,scopes,valid_until) values($1,array['master'],now()+interval '1 day')",
      [courtesy],
    );
    const approved = await pay(paid);
    await t.test(
      'reproduces the old denial with valid paid access and repairs the exact upsert operation',
      async () => {
        const paidAccess = await access(paid);
        assert.equal(paidAccess.allowed, true);
        assert.equal(paidAccess.reason, 'paid');
        await db.exec(
          'alter policy campaigns_read on public.campaigns using(private.can_read_campaign(id))',
        );
        await assert.rejects(
          as(paid, () => save(own)),
          /new row violates row-level security policy for table "campaigns"/,
        );
        assert.equal(
          (await db.query('select id from public.campaigns where id=$1', [own.id])).rows.length,
          0,
        );
        await db.exec(readMigration(repair));
        const saved = (await as(paid, () => save(own))).rows[0];
        assert.equal(saved.id, own.id);
        assert.equal(saved.owner_id, paid);
        assert.equal(saved.name, own.name);
        assert.equal((await as(paid, () => read(own.id))).rows.length, 1);
        assert.equal(
          (await db.query('select id from public.campaigns where id=$1', [own.id])).rows.length,
          1,
        );
      },
    );
    await t.test(
      'retries and cover updates edit the same campaign without duplicate creation',
      async () => {
        await as(paid, () => save(own));
        const edited = {
          ...own,
          name: 'Aventura renomeada',
          cover_path: `campaigns/${own.id}/cover.webp`,
        };
        await as(paid, () => save(edited));
        const rows = (await as(paid, () => read(own.id))).rows;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].name, edited.name);
        assert.equal(rows[0].cover_path, edited.cover_path);
      },
    );
    await t.test(
      'courtesy masters can save their own campaigns and cannot create or edit for another master',
      async () => {
        assert.equal((await access(courtesy)).reason, 'courtesy');
        await as(courtesy, () => save(other));
        await assert.rejects(
          as(courtesy, () => save(campaign(paid, 'Proprietário forjado'))),
          /row-level security/,
        );
        await assert.rejects(
          as(courtesy, () => save({ ...own, name: 'Edição indevida' })),
          /row-level security/,
        );
        await assert.rejects(
          as(courtesy, () =>
            save({ ...own, owner_id: courtesy, name: 'Tentativa de tomar a campanha' }),
          ),
          /row-level security|vínculo/,
        );
        assert.equal((await as(courtesy, () => read(own.id))).rows.length, 0);
        await assert.rejects(
          as(paid, () => save({ ...own, owner_id: courtesy })),
          /imutável|row-level security/,
        );
      },
    );
    await t.test(
      'members can read their assigned campaign but cannot upsert it or create without master access',
      async () => {
        await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
          own.id,
          member,
        ]);
        assert.equal((await as(member, () => read(own.id))).rows.length, 1);
        assert.equal((await as(outsider, () => read(own.id))).rows.length, 0);
        await assert.rejects(
          as(member, () => save({ ...own, name: 'Edição por jogador' })),
          /row-level security|assinatura/,
        );
        await assert.rejects(
          as(member, () => save(campaign(member))),
          /assinatura/,
        );
        await db.exec('update public.site_billing_settings set require_player=true');
        assert.equal((await as(member, () => read(own.id))).rows.length, 0);
        assert.equal((await as(paid, () => read(own.id))).rows.length, 1);
        await db.exec('update public.site_billing_settings set require_player=false');
      },
    );
    await t.test(
      'administrator, blocked accounts and maintenance cannot use the owner fast path',
      async () => {
        assert.equal((await as(admin, () => read(own.id))).rows.length, 0);
        await assert.rejects(
          as(admin, () => save(campaign(admin))),
          /conta não tem acesso/,
        );
        await db.query('insert into public.site_user_controls(user_id,blocked) values($1,true)', [
          paid,
        ]);
        assert.equal((await as(paid, () => read(own.id))).rows.length, 0);
        await assert.rejects(
          as(paid, () => save(own)),
          /conta não tem acesso/,
        );
        await db.query('delete from public.site_user_controls where user_id=$1', [paid]);
        await db.exec('update public.site_billing_settings set maintenance=true');
        assert.equal((await as(paid, () => read(own.id))).rows.length, 0);
        await assert.rejects(
          as(paid, () => save(own)),
          /conta não tem acesso/,
        );
        await db.exec('update public.site_billing_settings set maintenance=false');
      },
    );
    await t.test(
      'active campaign limits still apply to insert, update and reactivation',
      async () => {
        const limitedPlan = (
          await db.query<{ id: string }>(
            "insert into public.billing_plans(name,amount_cents,max_campaigns) values('Uma campanha',2000,1) returning id",
          )
        ).rows[0].id;
        await pay(limited, limitedPlan);
        const first = campaign(limited, 'Primeira'),
          second = campaign(limited, 'Segunda');
        await as(limited, () => save(first));
        await as(limited, () => save({ ...first, name: 'Primeira editada' }));
        await assert.rejects(
          as(limited, () => save(second)),
          /limite de campanhas/,
        );
        await as(limited, () => save({ ...first, status: 'archived' }));
        await as(limited, () => save(second));
        await assert.rejects(
          as(limited, () => save(first)),
          /limite de campanhas/,
        );
      },
    );
    await t.test(
      'a refunded master loses owner visibility and cannot write through upsert',
      async () => {
        await db.query('select public.billing_store_payment($1,$2::jsonb)', [
          approved.contract,
          JSON.stringify({
            ...approved.payment,
            status: 'refunded',
            refunded_cents: 2000,
            provider_updated_at: new Date().toISOString(),
          }),
        ]);
        assert.equal((await access(paid)).allowed, false);
        assert.equal((await as(paid, () => read(own.id))).rows.length, 0);
        await assert.rejects(
          as(paid, () => save(own)),
          /assinatura/,
        );
        assert.equal((await as(member, () => read(own.id))).rows.length, 1);
      },
    );
    await t.test(
      'free site settings work and the migration can be reapplied without altering data',
      async () => {
        await db.exec('update public.site_billing_settings set billing_enabled=false');
        const free = campaign(outsider);
        await as(outsider, () => save(free));
        const before = (
          await db.query('select id,owner_id,name,cover_path from public.campaigns order by id')
        ).rows;
        await db.exec(readMigration(repair));
        await db.exec(readMigration(repair));
        assert.deepEqual(
          (await db.query('select id,owner_id,name,cover_path from public.campaigns order by id'))
            .rows,
          before,
        );
        assert.equal((await as(outsider, () => read(free.id))).rows.length, 1);
      },
    );
  } finally {
    await db.close();
  }
});

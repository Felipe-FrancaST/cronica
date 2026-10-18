import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';

test('billing migration enforces paid masters, private administration and verified paid periods', async (t) => {
  const db = await billingDatabase();
  try {
    const master = randomUUID(),
      player = randomUUID(),
      admin = randomUUID(),
      other = randomUUID();
    for (const [i, id] of [master, player, admin, other].entries())
      await db.query('insert into auth.users(id,email) values($1,$2)', [
        id,
        `billing${i}@test.local`,
      ]);
    await db.query('insert into public.site_administrators(user_id) values($1)', [admin]);
    const as = async <T>(id: string, run: () => Promise<T>) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      try {
        return await run();
      } finally {
        await db.exec('reset role');
        await db.exec("select set_config('request.jwt.claim.sub','',false)");
      }
    };
    const value = async <T>(sql: string, args: unknown[] = []) =>
      (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
    await t.test('default monthly plan costs twenty reais; players enter free', async () => {
      const c = await as(master, () =>
        value<{
          plans: { amount_cents: number }[];
          access: { master: { allowed: boolean }; player: { allowed: boolean } };
        }>('select public.get_billing_context() v'),
      );
      assert.equal(c.plans[0].amount_cents, 2000);
      assert.equal(c.access.master.allowed, false);
      assert.equal(c.access.player.allowed, true);
      await assert.rejects(
        as(master, () =>
          db.query(
            "insert into public.campaigns(owner_id,rpg_system_id,name) values($1,'00000000-0000-4000-8000-000000000001','Bloqueada')",
            [master],
          ),
        ),
        /assinatura|row-level/i,
      );
    });
    await t.test(
      'ordinary users cannot grant themselves subscriptions or administration',
      async () => {
        await assert.rejects(
          as(master, () =>
            db.query('insert into public.site_administrators(user_id) values($1)', [master]),
          ),
          /permission denied/i,
        );
        await assert.rejects(
          as(master, () => db.query("select public.site_admin_mutate('settings','{}','fraude')")),
          /exclusivo/i,
        );
        await assert.rejects(
          as(master, () =>
            db.query("select public.billing_update_contract($1,null,'authorized',null,null,null)", [
              randomUUID(),
            ]),
          ),
          /permission denied/i,
        );
        await assert.rejects(
          as(master, () =>
            db.query('update public.site_billing_settings set billing_enabled=false'),
          ),
          /permission denied/i,
        );
      },
    );
    const plan = 'b1000000-0000-4000-8000-000000000001',
      contract = randomUUID();
    const begin = () =>
      value<{ create: boolean }>('select public.billing_begin_checkout($1,$2,$3,$4,1,$5,true) v', [
        master,
        plan,
        'master',
        contract,
        'payer@test.local',
      ]);
    await t.test('checkout is idempotent and authorization alone never grants access', async () => {
      assert.equal((await begin()).create, true);
      assert.equal((await begin()).create, false);
      await db.query(
        "select public.billing_update_contract($1,'remote1','authorized','https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=remote1',now(),null)",
        [contract],
      );
      assert.equal(
        (
          await as(master, () =>
            value<{ allowed: boolean }>(
              "select public.get_billing_context()->'access'->'master' v",
            ),
          )
        ).allowed,
        false,
      );
    });
    const approved = new Date(Date.now() - 86400000).toISOString();
    const payment = {
      provider_payment_id: 'payment1',
      invoice_id: 'invoice1',
      status: 'approved',
      amount_cents: 2000,
      refunded_cents: 0,
      fee_cents: 90,
      net_cents: 1910,
      approved_at: approved,
      provider_updated_at: approved,
    };
    await t.test(
      'approved payment grants access once, with immutable user and invoice binding',
      async () => {
        await db.query('select public.billing_store_payment($1,$2::jsonb)', [
          contract,
          JSON.stringify(payment),
        ]);
        const before = await value<string>(
          "select period_end::text v from public.billing_payments where provider_payment_id='payment1'",
        );
        await db.query('select public.billing_store_payment($1,$2::jsonb)', [
          contract,
          JSON.stringify(payment),
        ]);
        assert.equal(
          await value(
            "select period_end::text v from public.billing_payments where provider_payment_id='payment1'",
          ),
          before,
        );
        assert.equal(
          (
            await as(master, () =>
              value<{ allowed: boolean }>(
                "select public.get_billing_context()->'access'->'master' v",
              ),
            )
          ).allowed,
          true,
        );
        await assert.rejects(
          db.query('select public.billing_store_payment($1,$2::jsonb)', [
            contract,
            JSON.stringify({ ...payment, invoice_id: 'different' }),
          ]),
          /vínculo/i,
        );
        await assert.rejects(
          db.query('select public.billing_store_payment($1,$2::jsonb)', [
            contract,
            JSON.stringify({ ...payment, amount_cents: 100 }),
          ]),
          /valor/i,
        );
      },
    );
    const campaign = randomUUID();
    await as(master, () =>
      db.query(
        "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,'00000000-0000-4000-8000-000000000001','Campanha privada')",
        [campaign, master],
      ),
    );
    await db.query(
      'insert into public.campaign_members(campaign_id,user_id) values($1,$2),($1,$3)',
      [campaign, player, master],
    );
    await t.test(
      'admin manages the site but cannot read campaigns; member role cannot bypass owner billing',
      async () => {
        assert.equal(
          (await as(admin, () => db.query('select id from public.campaigns'))).rows.length,
          0,
        );
        assert.equal(
          (await as(player, () => db.query('select id from public.campaigns'))).rows.length,
          1,
        );
        await db.query('select public.billing_store_payment($1,$2::jsonb)', [
          contract,
          JSON.stringify({
            ...payment,
            status: 'refunded',
            refunded_cents: 2000,
            provider_updated_at: new Date().toISOString(),
          }),
        ]);
        assert.equal(
          (await as(master, () => db.query('select id from public.campaigns'))).rows.length,
          0,
        );
        assert.equal(
          (await as(player, () => db.query('select id from public.campaigns'))).rows.length,
          1,
        );
      },
    );
    await t.test(
      'out of order notifications cannot undo refunds or reactivate cancelled renewals',
      async () => {
        await db.query('select public.billing_store_payment($1,$2::jsonb)', [
          contract,
          JSON.stringify(payment),
        ]);
        assert.equal(
          await value(
            "select status v from public.billing_payments where provider_payment_id='payment1'",
          ),
          'refunded',
        );
        await db.query(
          "select public.billing_update_contract($1,'remote1','cancelled',null,now(),null)",
          [contract],
        );
        await db.query(
          "select public.billing_update_contract($1,'remote1','authorized',null,now()+interval '1 day',null)",
          [contract],
        );
        assert.equal(
          await value('select status v from public.billing_contracts where id=$1', [contract]),
          'cancelled',
        );
      },
    );
    await t.test(
      'new prices preserve existing contracts; stale consents and limits are enforced',
      async () => {
        const limited = randomUUID();
        await as(admin, () =>
          db.query("select public.site_admin_mutate('plan',$1::jsonb,'Plano com limites')", [
            JSON.stringify({
              id: undefined,
              name: 'Limitado',
              description: '',
              amount_cents: 2500,
              interval_months: 1,
              scopes: ['master'],
              max_campaigns: 1,
              max_players_per_campaign: 1,
              active: true,
              sort_order: 0,
            }),
          ]),
        );
        const limitedPlan = await value<{ id: string }>(
          "select to_jsonb(p) v from public.billing_plans p where name='Limitado'",
        );
        await db.query('select public.billing_begin_checkout($1,$2,$3,$4,1,$5,true)', [
          other,
          limitedPlan.id,
          'master',
          limited,
          'other@test.local',
        ]);
        await db.query(
          "select public.billing_update_contract($1,'limited_remote','authorized',null,now(),null)",
          [limited],
        );
        await db.query('select public.billing_store_payment($1,$2::jsonb)', [
          limited,
          JSON.stringify({
            ...payment,
            provider_payment_id: 'limited_payment',
            invoice_id: 'limited_invoice',
            amount_cents: 2500,
          }),
        ]);
        const first = randomUUID();
        await as(other, () =>
          db.query(
            "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,'00000000-0000-4000-8000-000000000001','Primeira')",
            [first, other],
          ),
        );
        await assert.rejects(
          as(other, () =>
            db.query(
              "insert into public.campaigns(owner_id,rpg_system_id,name) values($1,'00000000-0000-4000-8000-000000000001','Segunda')",
              [other],
            ),
          ),
          /limite de campanhas/i,
        );
        await as(other, () =>
          db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
            first,
            player,
          ]),
        );
        await assert.rejects(
          as(other, () =>
            db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
              first,
              master,
            ]),
          ),
          /limite de jogadores/i,
        );
        await db.exec(
          "update public.billing_plans set amount_cents=3000,version=2 where id='b1000000-0000-4000-8000-000000000001'",
        );
        assert.equal(
          await value(
            "select (plan_snapshot->>'amount_cents')::integer v from public.billing_contracts where id=$1",
            [contract],
          ),
          2000,
        );
        await assert.rejects(
          db.query('select public.billing_begin_checkout($1,$2,$3,$4,1,$5,true)', [
            player,
            plan,
            'master',
            randomUUID(),
            'player@test.local',
          ]),
          /plano mudou/i,
        );
        await db.query("update public.billing_contracts set status='cancelled' where id=$1", [
          limited,
        ]);
        await db.query(
          "update public.billing_payments set status='refunded',refunded_cents=2500 where contract_id=$1",
          [limited],
        );
      },
    );
    await t.test(
      'courtesy, charging players, blocking and maintenance are enforced in PostgreSQL',
      async () => {
        await as(admin, () =>
          db.query("select public.site_admin_mutate('grant',$1::jsonb,'Teste de cortesia')", [
            JSON.stringify({ user_id: master, scopes: ['master'], days: 2 }),
          ]),
        );
        assert.equal(
          (await as(master, () => db.query('select id from public.campaigns'))).rows.length,
          1,
        );
        await db.exec('update public.site_billing_settings set require_player=true');
        assert.equal(
          (await as(player, () => db.query('select id from public.campaigns'))).rows.length,
          0,
        );
        await as(admin, () =>
          db.query("select public.site_admin_mutate('block',$1::jsonb,'Conta em análise')", [
            JSON.stringify({ user_id: master, blocked: true }),
          ]),
        );
        assert.equal(
          (await as(master, () => db.query('select id from public.campaigns'))).rows.length,
          0,
        );
        await as(master, () =>
          db.query("update public.campaigns set name='Alterada' where id=$1", [campaign]),
        );
        assert.equal(
          await value('select name v from public.campaigns where id=$1', [campaign]),
          'Campanha privada',
        );
        await db.exec('update public.site_billing_settings set maintenance=true');
        assert.equal(
          await as(admin, () => value<boolean>('select public.site_is_admin() v')),
          true,
        );
        await assert.rejects(
          as(other, () => db.query("select public.site_admin_read('overview')")),
          /exclusivo/i,
        );
      },
    );
    await t.test(
      'financial data and audit are restricted to admins and retain real refunds',
      async () => {
        const finance = await as(admin, () =>
          value<{ gross_cents: number; refund_cents: number }>(
            "select public.site_admin_read('finance') v",
          ),
        );
        assert.equal(Number(finance.gross_cents), 4500);
        assert.equal(Number(finance.refund_cents), 4500);
        assert.ok(Number(await value('select count(*) v from public.site_audit_log')) >= 2);
        assert.equal(
          (await as(player, () => db.query('select * from public.billing_payments'))).rows.length,
          0,
        );
      },
    );
    await t.test('durable webhook queue deduplicates deliveries and leases them once', async () => {
      const fingerprint = 'a'.repeat(64);
      const id = await value('select public.billing_enqueue_webhook($1,$2,$3) v', [
        fingerprint,
        'payment',
        '123',
      ]);
      assert.ok(id);
      assert.equal(
        await value('select public.billing_enqueue_webhook($1,$2,$3) v', [
          fingerprint,
          'payment',
          '123',
        ]),
        null,
      );
      assert.equal(
        (await db.query('select * from public.billing_lease_webhooks(10)')).rows.length,
        1,
      );
      assert.equal(
        (await db.query('select * from public.billing_lease_webhooks(10)')).rows.length,
        0,
      );
      await db.query('select public.billing_finish_webhook($1,null)', [id]);
      assert.equal(
        await value('select status v from private.billing_webhooks where id=$1', [id]),
        'processed',
      );
    });
  } finally {
    await db.close();
  }
});

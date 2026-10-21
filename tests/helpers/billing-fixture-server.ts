// Local-only PostgreSQL + Mercado Pago double. No real credentials or charges.
import { createServer } from 'node:http';
import { billingDatabase } from './billing-database';
import { createDemoWorkspace, DEMO_USER_ID } from '../../src/lib/demo-data';
import { PIX_CODE, PIX_PNG } from './pix-fixture';
async function main() {
  const seed = createDemoWorkspace(),
    admin = seed.profiles[2].id;
  const db = await billingDatabase();
  await db.exec('alter table storage.objects add column owner_id text');
  for (const profile of seed.profiles)
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [
      profile.id,
      profile.email,
      JSON.stringify({ name: profile.name }),
    ]);
  const subscriptions = new Map<string, Record<string, unknown>>(),
    payments = new Map<string, Record<string, unknown>>(),
    invoices = new Map<string, Record<string, unknown>>();
  let storageFailures = 0;
  let providerFailure: { path: string; status: number; remaining: number } | null = null;
  let sequence = 0,
    chain = Promise.resolve();
  const calls: Record<string, unknown>[] = [];
  function actor(header: string | undefined) {
    try {
      return String(
        JSON.parse(Buffer.from(header?.split('.')[1] ?? '', 'base64url').toString()).sub,
      );
    } catch {
      return null;
    }
  }
  async function reset() {
    await db.exec(
      'truncate private.account_deletions cascade;delete from public.campaigns;delete from storage.objects',
    );
    for (const p of seed.profiles)
      await db.query(
        'insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3) on conflict(id) do nothing',
        [p.id, p.email, JSON.stringify({ name: p.name })],
      );
    for (const p of seed.profiles)
      await db.query(
        "update public.profiles set name=$2,preferences='{}'::jsonb,avatar_path=null where id=$1",
        [p.id, p.name],
      );
    storageFailures = 0;
    providerFailure = null;
    await db.exec(`truncate public.billing_payments,public.billing_contracts,public.billing_access_grants,public.site_audit_log,public.site_user_controls,public.site_administrators,private.billing_webhooks,private.billing_sync_leases;
 delete from public.billing_plans where id<>'b1000000-0000-4000-8000-000000000001';
 update public.billing_plans set name='Mestre mensal',amount_cents=2000,interval_months=1,active=true,version=1,scopes=array['master','player'],max_campaigns=null,max_players_per_campaign=null;
 update public.site_billing_settings set billing_enabled=true,require_master=true,require_player=false,maintenance=false,grace_days=0,version=1,site_name='Crônica';`);
    await db.query('insert into public.site_administrators(user_id) values($1)', [admin]);
    subscriptions.clear();
    payments.clear();
    invoices.clear();
    calls.length = 0;
  }
  await reset();
  const server = createServer((req, res) => {
    const work = async () => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Content-Type', 'application/json');
      const send = (value: unknown, status = 200) => {
        res.statusCode = status;
        res.end(JSON.stringify(value));
      };
      if (req.method === 'OPTIONS') {
        send({});
        return;
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1:54329');
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      if (url.pathname === '/health') {
        send({ ready: true });
        return;
      }
      if (url.pathname === '/__fixture/reset') {
        await reset();
        send({ ok: true });
        return;
      }
      if (url.pathname === '/__fixture/state') {
        send({
          calls,
          accounts: (await db.query('select id from auth.users')).rows,
          deletions: (await db.query('select user_id,phase from private.account_deletions')).rows,
          files: (await db.query('select name from storage.objects')).rows,
          subscriptions: [...subscriptions.values()],
          payments: [...payments.values()],
          ledger: (await db.query('select * from public.billing_payments')).rows,
        });
        return;
      }
      if (url.pathname === '/__fixture/account') {
        await db.exec('update public.site_billing_settings set billing_enabled=false');
        const campaign = 'b1000000-0000-4000-8000-000000000011';
        await db.query(
          "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,'00000000-0000-4000-8000-000000000001','Minha campanha')",
          [campaign, DEMO_USER_ID],
        );
        await db.query(
          "insert into storage.objects(bucket_id,name,owner_id) values('campaign-media',$1,$3),('campaign-media',$2,$3),('campaign-media',$4,$5)",
          [
            `profiles/${DEMO_USER_ID}/current.webp`,
            `profiles/${DEMO_USER_ID}/old.webp`,
            DEMO_USER_ID,
            `campaigns/${campaign}/cover.webp`,
            seed.profiles[1].id,
          ],
        );
        if (body.renewal) {
          const contract = 'b1000000-0000-4000-8000-000000000012';
          await db.query(
            "insert into public.billing_contracts(id,user_id,plan_id,plan_snapshot,scope,status,provider_id,payer_email,settings_version) select $1,$2,id,to_jsonb(p),'master','authorized','deletion-sub',$3,1 from public.billing_plans p limit 1",
            [contract, DEMO_USER_ID, seed.profiles[0].email],
          );
          subscriptions.set('deletion-sub', {
            id: 'deletion-sub',
            external_reference: contract,
            collector_id: 123,
            status: 'authorized',
            payer_email: seed.profiles[0].email,
            auto_recurring: {
              frequency: 1,
              frequency_type: 'months',
              transaction_amount: 20,
              currency_id: 'BRL',
            },
            last_modified: new Date().toISOString(),
          });
        }
        send({ ok: true });
        return;
      }
      if (url.pathname === '/__fixture/fail-storage') {
        storageFailures = Number(body.times ?? 1);
        send({ ok: true });
        return;
      }
      if (url.pathname === '/__fixture/change-plan') {
        await db.exec('update public.billing_plans set amount_cents=2500,version=version+1');
        send({ ok: true });
        return;
      }
      if (url.pathname === '/__fixture/fail-provider') {
        providerFailure = {
          path: String(body.path),
          status: Number(body.status ?? 400),
          remaining: Number(body.times ?? 1),
        };
        send({ ok: true });
        return;
      }
      if (url.pathname === '/__fixture/approve') {
        const sub =
          [...subscriptions.values()].find((s) => s.external_reference === body.contractId) ??
          [...subscriptions.values()][0];
        if (!sub) {
          send({ error: 'No contract' }, 404);
          return;
        }
        sub.status = 'authorized';
        sub.last_modified = new Date().toISOString();
        const recurring = sub.auto_recurring as Record<string, unknown>,
          id = String(++sequence),
          date = new Date().toISOString();
        const payment = {
          id: Number(id),
          collector_id: 123,
          currency_id: 'BRL',
          transaction_amount: recurring.transaction_amount,
          transaction_amount_refunded: 0,
          live_mode: false,
          status: 'approved',
          date_approved: date,
          date_last_updated: date,
          fee_details: [{ amount: 0.99 }],
          transaction_details: { net_received_amount: Number(recurring.transaction_amount) - 0.99 },
        };
        const invoice = {
          id: 'invoice' + id,
          preapproval_id: sub.id,
          external_reference: sub.external_reference,
          currency_id: 'BRL',
          transaction_amount: recurring.transaction_amount,
          payment: { id: Number(id), status: 'approved' },
        };
        payments.set(id, payment);
        for (let pending = 0; pending < 24; pending++)
          invoices.set(`scheduled-${pending}`, {
            ...invoice,
            id: `scheduled-${pending}`,
            status: 'scheduled',
            payment: { id: null, status: 'pending' },
          });
        invoices.set(String(invoice.id), invoice);
        send({ paymentId: id, contractId: sub.external_reference });
        return;
      }
      if (url.pathname === '/__fixture/authorize') {
        const sub = [...subscriptions.values()][0];
        if (sub) {
          sub.status = 'authorized';
          sub.last_modified = new Date().toISOString();
        }
        send({ ok: true });
        return;
      }
      if (url.pathname === '/__fixture/refund') {
        for (const p of payments.values()) {
          p.status = 'refunded';
          p.transaction_amount_refunded = p.transaction_amount;
          p.date_last_updated = new Date().toISOString();
        }
        send({ ok: true });
        return;
      }
      if (url.pathname === '/__fixture/approve-pix') {
        const payment = [...payments.values()].find((p) => p.payment_method_id === 'pix');
        if (!payment) {
          send({ error: 'No Pix' }, 404);
          return;
        }
        payment.status = 'approved';
        payment.date_approved = new Date(Date.now() - 1000).toISOString();
        payment.date_last_updated = new Date().toISOString();
        payment.fee_details = [{ amount: 0.2 }];
        payment.transaction_details = {
          net_received_amount: Number(payment.transaction_amount) - 0.2,
        };
        send({ paymentId: String(payment.id), contractId: payment.external_reference });
        return;
      }
      const service = req.headers.authorization === 'Bearer billing-test-service';
      const id = actor(req.headers.authorization);
      if (/^\/(?:preapproval|authorized_payments|v1\/payments)(?:\/|$)/.test(url.pathname)) {
        if (req.headers.authorization !== 'Bearer TEST-local-provider') {
          send({ error: 'Unauthorized' }, 401);
          return;
        }
        const path = url.pathname;
        calls.push({
          provider: path,
          method: req.method,
          body,
          query: Object.fromEntries(url.searchParams),
          idempotency: req.headers['x-idempotency-key'] ?? null,
        });
        if (providerFailure?.path === path && providerFailure.remaining-- > 0) {
          send(
            { message: 'Invalid preapproval_id local-private-provider-detail' },
            providerFailure.status,
          );
          return;
        }
        if (path === '/v1/payments' && req.method === 'POST') {
          const existing = [...payments.values()].find(
            (p) => p.external_reference === req.headers['x-idempotency-key'],
          );
          if (existing) {
            send(existing, 201);
            return;
          }
          if (
            req.headers['x-idempotency-key'] !== body.external_reference ||
            body.payment_method_id !== 'pix'
          ) {
            send({ message: 'Invalid Pix request' }, 400);
            return;
          }
          const payment = {
            ...body,
            id: 90000 + ++sequence,
            collector_id: 123,
            currency_id: 'BRL',
            live_mode: false,
            status: 'pending',
            date_created: new Date().toISOString(),
            date_last_updated: new Date().toISOString(),
            date_approved: null,
            transaction_amount_refunded: 0,
            point_of_interaction: {
              type: 'PIX',
              transaction_data: { qr_code: PIX_CODE, qr_code_base64: PIX_PNG },
            },
          };
          payments.set(String(payment.id), payment);
          send(payment, 201);
          return;
        }
        if (path === '/v1/payments/search') {
          const rows = [...payments.values()].filter(
            (p) => p.external_reference === url.searchParams.get('external_reference'),
          );
          send({ paging: { total: rows.length }, results: rows });
          return;
        }
        if (path === '/preapproval' && req.method === 'POST') {
          const remote = {
            ...body,
            id: 'preapproval' + ++sequence,
            collector_id: 123,
            date_created: new Date().toISOString(),
            last_modified: new Date().toISOString(),
            init_point:
              'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=local',
          };
          subscriptions.set(remote.id, remote);
          send(remote, 201);
          return;
        }
        if (path === '/preapproval/search') {
          const rows = [...subscriptions.values()].filter(
            (s) => s.payer_email === url.searchParams.get('payer_email'),
          );
          send({ paging: { total: rows.length }, results: rows });
          return;
        }
        if (path.startsWith('/preapproval/')) {
          const sub = subscriptions.get(path.split('/').pop()!);
          if (!sub) {
            send({}, 404);
            return;
          }
          if (req.method === 'PUT') {
            sub.status = body.status;
            sub.last_modified = new Date().toISOString();
          }
          send(sub);
          return;
        }
        if (path === '/authorized_payments/search') {
          const limit = Number(url.searchParams.get('limit') ?? 20),
            offset = Number(url.searchParams.get('offset') ?? 0);
          if (limit > 20) {
            send({ message: 'Invalid limit parameter' }, 400);
            return;
          }
          const rows = [...invoices.values()].filter((i) =>
            url.searchParams.has('payment_id')
              ? String((i.payment as Record<string, unknown>).id) ===
                url.searchParams.get('payment_id')
              : i.preapproval_id === url.searchParams.get('preapproval_id'),
          );
          send({
            paging: { offset, limit, total: rows.length },
            results: rows.slice(offset, offset + limit),
          });
          return;
        }
        if (path.startsWith('/authorized_payments/')) {
          send(invoices.get(path.split('/').pop()!) ?? {});
          return;
        }
        if (path.startsWith('/v1/payments/')) {
          const payment = payments.get(path.split('/').pop()!);
          if (payment && req.method === 'PUT') {
            payment.status = body.status;
            payment.date_last_updated = new Date().toISOString();
          }
          send(payment ?? {});
          return;
        }
        send({ error: 'Unknown provider path' }, 404);
        return;
      }
      if (url.pathname.startsWith('/storage/v1/object/') && req.method === 'DELETE' && service) {
        calls.push({ storage: 'remove', names: body.prefixes });
        if (storageFailures-- > 0) {
          send({ message: 'Storage unavailable', error: 'unavailable' }, 503);
          return;
        }
        const bucket = decodeURIComponent(url.pathname.slice('/storage/v1/object/'.length));
        const rows = await db.query(
          'delete from storage.objects where bucket_id=$1 and name=any($2::text[]) returning name',
          [bucket, body.prefixes],
        );
        send(rows.rows);
        return;
      }
      if (url.pathname.startsWith('/auth/v1/admin/users/') && req.method === 'DELETE' && service) {
        const target = url.pathname.split('/').pop()!;
        if (body.should_soft_delete === true) throw new Error('Must hard delete');
        const files = await db.query('select 1 from storage.objects where owner_id=$1', [target]);
        if (files.rows.length) throw new Error('Owned storage objects still exist');
        await db.query('delete from auth.users where id=$1', [target]);
        calls.push({ identity: 'delete', id: target });
        send({});
        return;
      }
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        const profile = seed.profiles.find((p) => p.email === body.email);
        const exists =
          profile &&
          (await db.query('select 1 from auth.users where id=$1', [profile.id])).rows.length > 0;
        calls.push({
          auth: 'password',
          success: Boolean(exists && body.password === 'SenhaForte123!'),
        });
        if (!profile || !exists || body.password !== 'SenhaForte123!') {
          send({ message: 'Invalid login credentials', error_code: 'invalid_credentials' }, 400);
          return;
        }
        const token =
          Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') +
          '.' +
          Buffer.from(
            JSON.stringify({
              sub: profile.id,
              exp: Math.floor(Date.now() / 1000) + 3600,
              role: 'authenticated',
            }),
          ).toString('base64url') +
          '.proof-signature';
        send({
          access_token: token,
          refresh_token: 'isolated-proof-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: profile.id,
            email: profile.email,
            aud: 'authenticated',
            role: 'authenticated',
            created_at: profile.created_at,
            app_metadata: { provider: 'email', providers: ['email'] },
            user_metadata: {},
          },
        });
        return;
      }
      if (url.pathname === '/auth/v1/user') {
        const p = seed.profiles.find((p) => p.id === id);
        if (!p || !(await db.query('select 1 from auth.users where id=$1', [p.id])).rows.length) {
          send({ message: 'Invalid session' }, 401);
          return;
        }
        send({
          id: p.id,
          email: p.email,
          aud: 'authenticated',
          role: 'authenticated',
          created_at: p.created_at,
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: { name: p.name },
        });
        return;
      }
      if (url.pathname === '/auth/v1/logout') {
        send({});
        return;
      }
      if (!service && !seed.profiles.some((p) => p.id === id)) {
        send({ message: 'Unauthorized' }, 401);
        return;
      }
      await db.exec(service ? 'set role service_role' : 'set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [service ? '' : id]);
      try {
        if (url.pathname.startsWith('/rest/v1/rpc/')) {
          const name = url.pathname.split('/').pop()!;
          if (
            !/^(?:account_\w+|billing_\w+|site_admin_\w+|site_is_admin|get_billing_context|update_profile_preferences)$/.test(
              name,
            )
          ) {
            send([], 200);
            return;
          }
          const keys = Object.keys(body);
          if (keys.some((key) => !/^p_\w+$/.test(key))) throw new Error('Invalid argument');
          const args = keys.map((key, i) => `${key}=>$${i + 1}`).join(',');
          const result = await db.query<{ value: unknown }>(
            `select to_jsonb(public.${name}(${args})) value`,
            keys.map((key) =>
              typeof body[key] === 'object' && body[key] !== null
                ? JSON.stringify(body[key])
                : body[key],
            ),
          );
          const setof = ['billing_lease_webhooks', 'billing_due_users'].includes(name);
          send(setof ? result.rows.map((row) => row.value) : (result.rows[0]?.value ?? null));
          return;
        }
        const table = url.pathname.split('/').pop()!;
        if (['billing_contracts', 'billing_payments'].includes(table)) {
          const clauses: string[] = [],
            args: unknown[] = [];
          for (const key of ['id', 'user_id', 'provider_id', 'contract_id']) {
            const filter = url.searchParams.get(key);
            if (filter?.startsWith('eq.')) {
              args.push(filter.slice(3));
              clauses.push(`${key}=$${args.length}`);
            }
          }
          const result = await db.query(
            `select * from public.${table}${clauses.length ? ' where ' + clauses.join(' and ') : ''} order by created_at desc limit 1000`,
            args,
          );
          send(
            req.headers.accept?.includes('application/vnd.pgrst.object+json')
              ? (result.rows[0] ?? null)
              : result.rows,
          );
          return;
        }
        if (table === 'profiles') {
          if (req.method === 'PATCH') {
            const target = url.searchParams.get('id')?.replace(/^eq\./, '');
            const result = await db.query(
              'update public.profiles set name=$2,avatar_path=$3 where id=$1 returning id',
              [target, body.name, body.avatar_path],
            );
            send(
              req.headers.accept?.includes('application/vnd.pgrst.object+json')
                ? result.rows[0]
                : result.rows,
            );
            return;
          }
          const result = await db.query('select * from public.profiles');
          send(result.rows);
          return;
        }
        if (table === 'rpg_systems') {
          send(seed.systems);
          return;
        }
        send([]);
      } finally {
        await db.exec('reset role');
        await db.exec("select set_config('request.jwt.claim.sub','',false)");
      }
    };
    chain = chain.then(work).catch((error) => {
      if (!res.headersSent) res.statusCode = 400;
      if (!res.writableEnded)
        res.end(JSON.stringify({ message: error.message, code: error.code ?? 'fixture_error' }));
    });
  });
  server.listen(54329, '127.0.0.1');
  process.on('SIGTERM', () => server.close(() => void db.close()));
  console.log(`Local billing fixture ready; master ${DEMO_USER_ID}; administrator ${admin}`);
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

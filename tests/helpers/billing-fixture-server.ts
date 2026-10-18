// Local-only PostgreSQL + Mercado Pago double. No real credentials or charges.
import { createServer } from 'node:http';
import { billingDatabase } from './billing-database';
import { createDemoWorkspace, DEMO_USER_ID } from '../../src/lib/demo-data';
async function main() {
  const seed = createDemoWorkspace(),
    admin = seed.profiles[2].id;
  const db = await billingDatabase();
  for (const profile of seed.profiles)
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [
      profile.id,
      profile.email,
      JSON.stringify({ name: profile.name }),
    ]);
  const subscriptions = new Map<string, Record<string, unknown>>(),
    payments = new Map<string, Record<string, unknown>>(),
    invoices = new Map<string, Record<string, unknown>>();
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
          subscriptions: [...subscriptions.values()],
          payments: [...payments.values()],
          ledger: (await db.query('select * from public.billing_payments')).rows,
        });
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
      const service = req.headers.authorization === 'Bearer billing-test-service';
      const id = actor(req.headers.authorization);
      if (/^\/(?:preapproval|authorized_payments|v1\/payments)(?:\/|$)/.test(url.pathname)) {
        if (req.headers.authorization !== 'Bearer TEST-local-provider') {
          send({ error: 'Unauthorized' }, 401);
          return;
        }
        const path = url.pathname;
        calls.push({ provider: path, method: req.method, body });
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
          const rows = [...invoices.values()].filter((i) =>
            url.searchParams.has('payment_id')
              ? String((i.payment as Record<string, unknown>).id) ===
                url.searchParams.get('payment_id')
              : i.preapproval_id === url.searchParams.get('preapproval_id'),
          );
          send({ paging: { total: rows.length }, results: rows });
          return;
        }
        if (path.startsWith('/authorized_payments/')) {
          send(invoices.get(path.split('/').pop()!) ?? {});
          return;
        }
        if (path.startsWith('/v1/payments/')) {
          send(payments.get(path.split('/').pop()!) ?? {});
          return;
        }
        send({ error: 'Unknown provider path' }, 404);
        return;
      }
      if (url.pathname === '/auth/v1/user') {
        const p = seed.profiles.find((p) => p.id === id);
        if (!p) {
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
          if (!/^(?:billing_\w+|site_admin_\w+|site_is_admin|get_billing_context)$/.test(name)) {
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

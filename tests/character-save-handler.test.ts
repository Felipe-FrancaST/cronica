import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { characterSaveHandler } from '../src/features/characters/save-handler';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const body = {
  character: {
    id,
    campaign_id: id,
    rpg_system_id: id,
    owner_id: id,
    name: 'Teste',
    sheet: { system: 'arkanis' },
  },
  expected: null,
};
const request = (data: unknown = body, origin = 'https://cronica.test') =>
  new Request('https://cronica.test/api/characters/save', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
function client(options: { user?: boolean; code?: string; pending?: boolean } = {}) {
  const calls: unknown[] = [];
  const mock = {
    auth: {
      getUser: async () => ({
        data: { user: options.user === false ? null : { id } },
        error: null,
      }),
    },
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      return {
        abortSignal: (_signal: AbortSignal) =>
          options.pending
            ? new Promise(() => {})
            : Promise.resolve({
                data: { id, updated_at: '2026-11-08T12:00:00Z' },
                error: options.code ? { code: options.code, message: 'Recusado' } : null,
              }),
      };
    },
  } as unknown as SupabaseClient;
  return { mock, calls };
}
test('same-origin authenticated save forwards the expected version once and returns confirmation', async () => {
  const c = client();
  const res = await characterSaveHandler(async () => c.mock)(request());
  assert.equal(res.status, 200);
  assert.equal((await res.json()).updated_at, '2026-11-08T12:00:00Z');
  assert.deepEqual(c.calls, [
    {
      name: 'save_arkanis_character',
      args: { p_payload: body.character, p_expected_updated_at: null },
    },
  ]);
  assert.match(res.headers.get('cache-control')!, /no-store/);
});
test('unauthenticated, cross-origin and invalid requests never save', async () => {
  const c = client({ user: false });
  const handle = characterSaveHandler(async () => c.mock);
  assert.equal((await handle(request())).status, 401);
  assert.equal((await handle(request(body, 'https://other.test'))).status, 403);
  assert.equal((await handle(request({}))).status, 400);
  assert.equal(c.calls.length, 0);
});
test('permission failures and stale versions are preserved without retries', async () => {
  for (const [code, status] of [
    ['42501', 403],
    ['40001', 409],
    ['PT409', 409],
  ] as const) {
    const c = client({ code });
    const res = await characterSaveHandler(async () => c.mock)(request());
    assert.equal(res.status, status);
    assert.equal((await res.json()).code, code);
    assert.equal(c.calls.length, 1);
  }
});
test('a stalled database returns a diagnostic before the browser deadline and aborts transport', async () => {
  const c = client({ pending: true });
  let signal!: AbortSignal;
  const res = await characterSaveHandler(async (s) => {
    signal = s;
    return c.mock;
  }, 15)(request());
  assert.equal(res.status, 504);
  const result = await res.json();
  assert.equal(result.code, 'sem_resposta_banco');
  assert.equal(result.stage, 'banco');
  assert.ok(result.reference);
  assert.equal(signal.aborted, true);
  assert.equal(c.calls.length, 1);
});
test('session stalls are distinguished from database stalls and never invoke a save', async () => {
  const c = client();
  c.mock.auth.getUser = () => new Promise(() => {});
  const res = await characterSaveHandler(async () => c.mock, 15)(request());
  assert.equal(res.status, 504);
  assert.equal((await res.json()).code, 'sem_resposta_sessao');
  assert.equal(c.calls.length, 0);
});

test('the configured public origin is used behind a reverse proxy', async () => {
  const c = client();
  const req = new Request('http://internal:3000/api/characters/save', {
    method: 'POST',
    headers: { Origin: 'https://cronica.test', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(
    (await characterSaveHandler(async () => c.mock, 25_000, 'https://cronica.test')(req)).status,
    200,
  );
  assert.equal(c.calls.length, 1);
});

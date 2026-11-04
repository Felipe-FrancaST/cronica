import test from 'node:test';
import assert from 'node:assert/strict';
import { readAllRows, readRelatedRows } from '../src/lib/paginated-query';
import { workspaceScope } from '../src/lib/workspace-scope';
import { createWorkspaceLoader } from '../src/lib/workspace-loader';
import { createDemoWorkspace } from '../src/lib/demo-data';
import { BodyLimitError, readBoundedBody } from '../src/lib/bounded-body';
import { cleanUnusedMedia } from '../src/features/media/maintenance';
import { BillingEngine, type BillingDatabase } from '../src/features/billing/engine';
import { MercadoPagoGateway } from '../src/features/billing/gateway';
import type { WorkspaceLoadOptions } from '../src/types';

test('pagination reads beyond 1000 rows even when the server returns smaller pages than requested', async () => {
  const source = Array.from({ length: 1503 }, (_, id) => ({ id }));
  for (const counted of [true, false]) {
    const result = await readAllRows<{ id: number }>(async (from) => ({
      data: source.slice(from, from + 71),
      error: null,
      count: counted ? source.length : null,
    }));
    assert.deepEqual(result, source);
  }
  await assert.rejects(
    readAllRows(async () => ({ data: null, error: { message: 'Connection failed' } })),
    /Connection failed/,
  );
});
test('related inventories are paginated independently and ID filters stay bounded', async () => {
  const ids = Array.from({ length: 185 }, (_, id) => String(id));
  const seen: string[][] = [];
  const result = await readRelatedRows<string>(ids, async (chunk, from) => {
    assert.ok(chunk.length <= 80);
    seen.push(chunk);
    return { data: chunk.slice(from, from + 11), error: null, count: chunk.length };
  });
  assert.deepEqual(result, ids);
  assert.ok(seen.length > 3);
});
test('workspace routes load only relevant details while the table keeps its characters, world and NPCs', () => {
  const id = '10000000-0000-4000-8000-000000000001';
  assert.deepEqual(workspaceScope('/campanhas').sections, []);
  assert.deepEqual(workspaceScope('/npcs').sections, ['npcs']);
  assert.deepEqual(workspaceScope(`/campanhas/${id}/mundo`), {
    campaignId: id,
    sections: ['world'],
  });
  assert.deepEqual(workspaceScope(`/campanhas/${id}/mesa/mural`).sections, [
    'characters',
    'npcs',
    'world',
  ]);
  assert.deepEqual(workspaceScope(`/campanhas/${id}/itens`).sections, ['characters']);
});
test('scoped updates reuse previous data and collapse concurrent changes without losing a resource', async () => {
  const calls: WorkspaceLoadOptions[] = [],
    published: unknown[] = [];
  const initial = createDemoWorkspace();
  const loader = createWorkspaceLoader(
    {
      async load(options = {}) {
        calls.push(options);
        await Promise.resolve();
        return { ...initial, ...options.previous };
      },
    },
    { sections: ['world'] },
    {
      onData(value) {
        published.push(value);
      },
      onError(e) {
        throw e;
      },
      onSettled() {},
    },
  );
  await loader.refresh();
  await Promise.all([loader.refresh(['world']), loader.refresh(['profiles'])]);
  assert.ok(calls[1].resources?.includes('world'));
  assert.ok(calls[1].resources?.includes('profiles'));
  assert.ok(calls[1].previous);
  assert.equal(published.length, 2);
  loader.cancel();
  await loader.refresh(['world']);
  assert.equal(calls.at(-1)?.previous, undefined);
});
test('body limits reject oversized streamed requests and count UTF-8 bytes rather than characters', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(8));
      c.enqueue(new Uint8Array(8));
    },
    cancel() {
      cancelled = true;
    },
  });
  const req = new Request('https://test.local', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit);
  await assert.rejects(readBoundedBody(req, 12), BodyLimitError);
  assert.equal(cancelled, true);
  await assert.rejects(
    readBoundedBody(new Request('https://test.local', { method: 'POST', body: 'ááá' }), 5),
    BodyLimitError,
  );
  assert.equal(
    new TextDecoder().decode(
      await readBoundedBody(new Request('https://test.local', { method: 'POST', body: '{}' }), 2),
    ),
    '{}',
  );
});
test('media cleanup continues after failures, confirms successes and leaves retryable jobs', async () => {
  let leased = false;
  const finished: [string, string | undefined][] = [];
  const result = await cleanUnusedMedia(
    {
      async lease() {
        if (leased) return [];
        leased = true;
        return [
          { id: 'a', bucket_id: 'test', name: 'ok' },
          { id: 'b', bucket_id: 'test', name: 'fail' },
        ];
      },
      async remove(_bucket, name) {
        if (name === 'fail') throw new Error('network');
      },
      async finish(id, error) {
        finished.push([id, error]);
      },
    },
    Date.now() + 10_000,
  );
  assert.equal(result.removed, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(finished.sort(), [
    ['a', undefined],
    ['b', 'storage_cleanup_failed'],
  ]);
});
test('frequent billing worker drains more than five events and respects an exhausted budget', async () => {
  const db = {
    async rpc() {
      return [];
    },
  } as unknown as BillingDatabase;
  const engine = new BillingEngine(
    db,
    new MercadoPagoGateway({ accessToken: 'test', collectorId: '1', environment: 'test' }),
    'https://test.local',
  );
  let events = 12;
  engine.processQueue = async () =>
    events-- > 0 ? { processed: 1, failed: 0 } : { processed: 0, failed: 0 };
  const result = await engine.drain(Date.now() + 10_000);
  assert.equal(result.processed, 12);
  const before = events;
  assert.equal((await engine.drain(Date.now() - 1)).budget_exhausted, true);
  assert.equal(events, before);
});

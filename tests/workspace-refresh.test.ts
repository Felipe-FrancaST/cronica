import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { createRefreshQueue } from '../src/lib/refresh-queue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const requests: ReturnType<typeof deferred<number>>[] = [];
  const published: number[] = [],
    errors: unknown[] = [];
  let settled = 0,
    concurrent = 0,
    maximum = 0;
  const queue = createRefreshQueue(
    async () => {
      concurrent++;
      maximum = Math.max(maximum, concurrent);
      const request = deferred<number>();
      requests.push(request);
      try {
        return await request.promise;
      } finally {
        concurrent--;
      }
    },
    {
      onData: (value) => published.push(value),
      onError: (error) => errors.push(error),
      onSettled: () => {
        settled++;
      },
    },
  );
  return { queue, requests, published, errors, settled: () => settled, maximum: () => maximum };
}

test('200 events during a workspace read require only one follow-up and never publish the obsolete snapshot', async () => {
  const f = fixture();
  const first = f.queue.refresh();
  await tick();
  const pending = Array.from({ length: 200 }, () => f.queue.refresh());
  f.requests[0].resolve(1);
  await tick();
  assert.deepEqual(f.published, []);
  assert.equal(f.requests.length, 2);
  f.requests[1].resolve(2);
  await Promise.all([first, ...pending]);
  assert.deepEqual(f.published, [2]);
  assert.equal(f.maximum(), 1);
  assert.equal(f.settled(), 1);
});

test('logout and a new session fence the old response even when it finishes last', async () => {
  const f = fixture();
  const old = f.queue.refresh();
  await tick();
  f.queue.cancel();
  const fresh = f.queue.refresh();
  await tick();
  f.requests[1].resolve(20);
  await fresh;
  f.requests[0].resolve(10);
  await old;
  assert.deepEqual(f.published, [20]);
  assert.equal(f.settled(), 1);
});

test('a superseded failure does not replace the result of a later refresh with an error', async () => {
  const f = fixture();
  const old = f.queue.refresh();
  await tick();
  const next = f.queue.refresh();
  f.requests[0].reject(new Error('old network failure'));
  await tick();
  f.requests[1].resolve(2);
  await Promise.all([old, next]);
  assert.deepEqual(f.errors, []);
  assert.deepEqual(f.published, [2]);
});

test('a failed refresh rejects callers, settles loading, and permits a successful retry', async () => {
  const f = fixture();
  const first = f.queue.refresh();
  const rejected = assert.rejects(first, /offline/);
  await tick();
  f.requests[0].reject(new Error('offline'));
  await rejected;
  assert.equal(f.errors.length, 1);
  assert.equal(f.settled(), 1);
  const retry = f.queue.refresh();
  await tick();
  f.requests[1].resolve(3);
  await retry;
  assert.deepEqual(f.published, [3]);
  assert.equal(f.settled(), 2);
});

test('cancelled failures cannot show an error in the next user session', async () => {
  const f = fixture();
  const pending = f.queue.refresh();
  await tick();
  f.queue.cancel();
  f.requests[0].reject(new Error('previous session'));
  await pending;
  assert.deepEqual(f.errors, []);
  assert.equal(f.settled(), 0);
});

test('cancelling before a read starts avoids the request during effect cleanup', async () => {
  const f = fixture();
  const pending = f.queue.refresh();
  f.queue.cancel();
  await pending;
  assert.equal(f.requests.length, 0);
  assert.equal(f.settled(), 0);
});

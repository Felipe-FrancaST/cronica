import test from 'node:test';
import assert from 'node:assert/strict';
import { withRequestDeadline, waitForRefresh } from '../src/lib/async-operation';

test('a stalled save unlocks with an error and aborts the request', async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(
    withRequestDeadline(
      (s) => {
        signal = s;
        return new Promise(() => {});
      },
      'Sem resposta',
      10,
    ),
    /Sem resposta/,
  );
  assert.equal(signal?.aborted, true);
});
test('successful saves return their confirmed version and errors are not masked', async () => {
  assert.equal(await withRequestDeadline(async () => 'version-2', 'timeout'), 'version-2');
  await assert.rejects(
    withRequestDeadline(async () => {
      throw new Error('Conflito');
    }, 'timeout'),
    /Conflito/,
  );
});
test('a stalled workspace refresh does not hold a confirmed save open', async () => {
  await waitForRefresh(new Promise(() => {}), 10);
});
test('late refresh failures remain handled after the editor is released', async () => {
  let reject!: (e: Error) => void;
  const pending = new Promise<void>((_, fail) => {
    reject = fail;
  });
  await waitForRefresh(pending, 10);
  reject(new Error('offline'));
  await new Promise((resolve) => setImmediate(resolve));
});

/** Serializes refreshes and collapses event bursts into one fresh follow-up read.
 * A result superseded during its request is never published. cancel() also fences
 * responses from a previous user/session and allows a new run immediately.
 */
export function createRefreshQueue<T>(
  load: () => Promise<T>,
  callbacks: { onData(value: T): void; onError(error: unknown): void; onSettled(): void },
) {
  type Run = { dirty: boolean; promise: Promise<void> };
  let current: Run | null = null;
  return {
    refresh(): Promise<void> {
      if (current) {
        current.dirty = true;
        return current.promise;
      }
      const run: Run = { dirty: false, promise: Promise.resolve() };
      current = run;
      run.promise = Promise.resolve().then(async () => {
        try {
          do {
            if (current !== run) return;
            run.dirty = false;
            try {
              const value = await load();
              if (current !== run) return;
              if (!run.dirty) callbacks.onData(value);
            } catch (error) {
              if (current !== run) return;
              if (!run.dirty) {
                callbacks.onError(error);
                throw error;
              }
            }
          } while (current === run && run.dirty);
        } finally {
          if (current === run) {
            current = null;
            callbacks.onSettled();
          }
        }
      });
      return run.promise;
    },
    cancel() {
      current = null;
    },
  };
}

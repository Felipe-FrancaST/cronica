/** Bound a request, including time waiting for authentication before fetch starts. */
export async function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  message: string,
  milliseconds = 30_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(message));
    }, milliseconds);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      timeout,
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

/** A confirmed mutation must not remain locked behind an unrelated background read. */
export async function waitForRefresh(refresh: Promise<void>, milliseconds = 1500): Promise<void> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([
      refresh.catch(() => {}),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

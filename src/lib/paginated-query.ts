interface QueryPage {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}
/** Advance by the rows actually returned, including APIs configured below our page size. */
export async function readAllRows<T>(
  query: (from: number, to: number) => PromiseLike<QueryPage>,
  pageSize = 250,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error, count } = await query(rows.length, rows.length + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (!page.length || (count != null && rows.length >= count)) return rows;
  }
}

export async function readRelatedRows<T>(
  ids: string[],
  query: (ids: string[], from: number, to: number) => PromiseLike<QueryPage>,
): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 80) chunks.push(ids.slice(i, i + 80));
  const rows: T[] = [];
  // Bound concurrency and URL length on accounts with many characters.
  for (let i = 0; i < chunks.length; i += 3) {
    const pages = await Promise.all(
      chunks.slice(i, i + 3).map((chunk) => readAllRows<T>((from, to) => query(chunk, from, to))),
    );
    rows.push(...pages.flat());
  }
  return rows;
}

/** Equality for JSON data from the API. Object key order is not significant. */
export function equalJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => equalJson(v, b[i]))
    );
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && equalJson(left[key], right[key]))
  );
}

/** Only reuse rows present in the NEW result; deletions and RLS changes win. */
export function shareRows<T extends { id: string }>(
  old: T[] | undefined,
  next: T[] | undefined,
): T[] | undefined {
  if (old === next || !old || !next) return next;
  const byId = new Map(old.map((row) => [row.id, row]));
  const result = next.map((row) => {
    const previous = byId.get(row.id);
    return previous && equalJson(previous, row) ? previous : row;
  });
  return result.length === old.length && result.every((row, i) => row === old[i]) ? old : result;
}

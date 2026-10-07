import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export function migrationNames() {
  const dir = resolve(root, 'supabase/migrations');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}
export function readMigration(name) {
  return readSqlSource('supabase/migrations/' + name);
}
export function readSqlSource(relativePath) {
  const path = resolve(root, relativePath);
  if (!path.startsWith(resolve(root, 'supabase') + '/'))
    throw new Error('Invalid SQL source path.');
  if (existsSync(path)) return readFileSync(path, 'utf8');
  throw new Error('SQL source missing: ' + relativePath);
}

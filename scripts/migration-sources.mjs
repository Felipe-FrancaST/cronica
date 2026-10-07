import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// Update ZIPs contain only the SQL to execute. Previous SQL sources are kept as
// development data so regression tests and generators remain reproducible.
function archive() {
  const path = resolve(root, 'supabase/development-sources.json');
  return existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : { migrations: {}, templates: {} };
}
export function migrationNames() {
  const dir = resolve(root, 'supabase/migrations');
  return [
    ...new Set([
      ...Object.keys(archive().migrations),
      ...(existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.sql')) : []),
    ]),
  ].sort();
}
export function readMigration(name) {
  return readSqlSource('supabase/migrations/' + name);
}
export function readSqlSource(relativePath) {
  const path = resolve(root, relativePath);
  if (!path.startsWith(resolve(root, 'supabase') + '/'))
    throw new Error('Invalid SQL source path.');
  if (existsSync(path)) return readFileSync(path, 'utf8');
  const name = relativePath.split('/').at(-1);
  const collection = relativePath.includes('/templates/') ? 'templates' : 'migrations';
  const source = archive()[collection][name];
  if (typeof source !== 'string') throw new Error('SQL source missing: ' + relativePath);
  return source;
}

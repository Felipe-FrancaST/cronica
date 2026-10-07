import { writeFile } from 'node:fs/promises';
import { migrationNames, readMigration } from './migration-sources.mjs';
const sql = migrationNames()
  .map((name) => `-- ${name}\n${readMigration(name)}`)
  .join('\n\n');
await writeFile(
  new URL('../supabase/schema.sql', import.meta.url),
  `-- Development export for a NEW database only. Never execute on an existing project.\n${sql}\n`,
);
console.log('supabase/schema.sql gerado apenas para instalação nova.');

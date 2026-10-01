import {readdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const dir = new URL('../supabase/migrations/',import.meta.url);
const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')).sort();
const sql=(await Promise.all(names.map(async n=>`-- ${n}\n${await readFile(new URL(n,dir),'utf8')}`))).join('\n\n');
await writeFile(new URL('../supabase/schema.sql',import.meta.url),`-- Generated from versioned migrations. Execute once on a new Supabase project.\n${sql}\n`);
console.log('supabase/schema.sql gerado.');

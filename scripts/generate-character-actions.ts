import { writeFileSync, readFileSync } from 'node:fs';
import { defaultSheet } from '../src/systems/dnd5e';
import { CLASSES } from '../src/systems/dnd5e/catalog';
import { pathsFor } from '../src/systems/dnd5e/progression-catalog';
import { featureResources, withClassLevels } from '../src/systems/dnd5e/progression';
const groups: { class_id: string; subclass_id: string; levels: number[]; short: string[] }[] = [];
for (const id of Object.keys(CLASSES))
  for (const sub of ['', ...pathsFor(id).map((p) => p.id)])
    for (let level = 1; level <= 20; level++) {
      const s = withClassLevels(defaultSheet(), [{ class_id: id, level, subclass_id: sub }]);
      const short = featureResources(s)
        .filter((r) => r.rest === 'short')
        .map((r) => r.id)
        .sort();
      const group = groups.find(
        (g) =>
          g.class_id === id &&
          g.subclass_id === sub &&
          JSON.stringify(g.short) === JSON.stringify(short),
      );
      if (group) group.levels.push(level);
      else groups.push({ class_id: id, subclass_id: sub, levels: [level], short });
    }
const catalog = JSON.stringify(groups);
const helper = `create or replace function private.sheet41_short_resources(s jsonb) returns jsonb language sql immutable set search_path='' as $$ select coalesce(jsonb_agg(distinct id),'[]') from jsonb_array_elements($rest41$${catalog}$rest41$::jsonb) r cross join jsonb_array_elements(private.dnd_levels(s)) c cross join jsonb_array_elements_text(r->'short') x(id) where r->>'class_id'=c->>'class_id' and r->>'subclass_id'=coalesce(c->>'subclass_id','') and r->'levels' @> jsonb_build_array((c->>'level')::integer) $$;\nrevoke all on function private.sheet41_short_resources(jsonb) from public,anon,authenticated;`;
const source = readFileSync('supabase/patches/character-actions.sql', 'utf8');
const sql = `-- 041: character actions, protected inspiration and rest permissions. Apply after 040.\nbegin;\n${helper}\n${source}\ncommit;\n`;
if (Buffer.byteLength(sql) > 240000) throw new Error('Migration exceeds SQL Editor size budget');
writeFileSync('supabase/migrations/202610240041_character_actions.sql', sql);
console.log('041 bytes', Buffer.byteLength(sql));

/** Rebuild the SQL migration from the exact catalogs and rules shipped to the client. */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { castingProfile } from '../src/systems/dnd5e/spellcasting';
import { defaultSheet } from '../src/systems/dnd5e';
import { CLASSES } from '../src/systems/dnd5e/catalog';
if (existsSync('supabase/migrations/202610040008_dnd_catalog.sql'))
  throw new Error(
    'A migração 008 já está versionada. Registre alterações em uma NOVA migração. Para atualizar apenas schema.sql, use node scripts/export-migrations.mjs.',
  );
const get = (name: string) =>
  JSON.parse(readFileSync(`src/systems/dnd5e/data/${name}.json`, 'utf8'));
const quote = (rows: unknown, tag: string) => {
  const json = JSON.stringify(rows);
  if (json.includes(`$${tag}$`)) throw new Error('Unsafe SQL seed delimiter');
  return `$${tag}$${json}$${tag}$::jsonb`;
};
const system = "(select id from public.rpg_systems where slug='dnd5e')";
let sql = readFileSync('supabase/templates/dnd-catalog-schema.sql', 'utf8');
sql += `\ninsert into public.dnd_classes(id,rpg_system_id,name,edition,hit_die,caster,spell_ability,learning,source,data)\nselect j->>'id',${system},j->>'name',j->>'edition',(j->>'hitDie')::smallint,j->>'caster',j->>'spellAbility',j->>'spellLearning',j->>'source',j from jsonb_array_elements(${quote(get('classes'), 'class_seed')}) j;\n`;
sql += `\ninsert into public.dnd_races(id,rpg_system_id,name,edition,speed,source,optional,data)\nselect j->>'id',${system},j->>'name',j->>'edition',(j->>'speed')::numeric,j->>'source',(j->>'optional')::boolean,j from jsonb_array_elements(${quote(get('races'), 'race_seed')}) j;\n`;
sql += `\ninsert into public.dnd_spells(id,rpg_system_id,name,english_name,level,school,ritual,concentration,edition,source,source_page,data)\nselect j->>'id',${system},j->>'name',j->>'english_name',(j->>'level')::smallint,j->>'school',(j->>'ritual')::boolean,(j->>'concentration')::boolean,j->>'edition',j->>'source',(j->>'source_page')::smallint,j from jsonb_array_elements(${quote(get('spells'), 'spell_seed')}) j;\n`;
sql += `\ninsert into public.dnd_spell_classes(spell_id,class_id,source)\nselect s.id,c.class_id,coalesce(s.data->'class_sources'->>c.class_id,'PDF fornecido, índice de classes') from public.dnd_spells s cross join lateral jsonb_array_elements_text(s.data->'classes') c(class_id);\n`;
const progression = [];
for (const class_id of Object.keys(CLASSES))
  for (const subclass_id of [
    '',
    ...(class_id === 'fighter'
      ? ['eldritch-knight']
      : class_id === 'rogue'
        ? ['arcane-trickster']
        : []),
  ])
    for (let level = 1; level <= 20; level++) {
      const p = castingProfile({ ...defaultSheet(), class_id, subclass_id, level });
      progression.push({
        class_id,
        subclass_id,
        level,
        slots: p.slots,
        pact_slots: p.pact ? (p.slots.at(-1) ?? 0) : 0,
        pact_level: p.pact ? p.spellLimit : 0,
        arcanum_levels: p.arcanumLevels,
        cantrips: p.cantrips,
        spells_known: p.known,
        prepared_formula:
          p.learning === 'prepared'
            ? ['paladin', 'artificer'].includes(class_id)
              ? 'half_level_plus_ability'
              : 'level_plus_ability'
            : 'none',
      });
    }
sql += `\ninsert into public.dnd_spell_progression(class_id,subclass_id,level,slots,pact_slots,pact_level,arcanum_levels,cantrips,spells_known,prepared_formula)\nselect j->>'class_id',j->>'subclass_id',(j->>'level')::smallint,j->'slots',(j->>'pact_slots')::smallint,(j->>'pact_level')::smallint,array(select jsonb_array_elements_text(j->'arcanum_levels')::smallint),(j->>'cantrips')::smallint,(j->>'spells_known')::smallint,j->>'prepared_formula' from jsonb_array_elements(${quote(progression, 'progression_seed')}) j;\n`;
sql += '\n' + readFileSync('supabase/templates/dnd-catalog-validation.sql', 'utf8');
writeFileSync('supabase/migrations/202610040008_dnd_catalog.sql', sql);
const migrations = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort();
writeFileSync(
  'supabase/schema.sql',
  migrations
    .map((f) => `-- ${f}\n${readFileSync(join('supabase/migrations', f), 'utf8')}`)
    .join('\n\n'),
);
console.log(
  `Seeded ${get('classes').length} classes, ${get('races').length} races, ${get('spells').length} spells, ${progression.length} progression rows. Full schema rebuilt.`,
);

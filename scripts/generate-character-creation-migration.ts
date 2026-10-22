import { writeFileSync } from 'node:fs';
import { readSqlSource } from './migration-sources.mjs';
import {
  CLASS_FEATURES,
  CLASS_PATHS,
  CLASS_TRAINING,
  MULTICLASS_REQUIREMENTS,
  SUBCLASS_LEVELS,
  featureChoices,
} from '../src/systems/dnd5e/progression-catalog';
import { BACKGROUNDS } from '../src/systems/dnd5e/backgrounds';
import { bookEquipmentLimits } from '../src/systems/dnd5e/starting-equipment';
import { pathSpells, expandedSpells, PATH_SPELL_TERRAINS } from '../src/systems/dnd5e/path-spells';
import type { DndSheet } from '../src/systems/dnd5e/types';

// Only writes migration 036. Published migrations must never be regenerated.
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
const json = (value: unknown) => `$creation$${JSON.stringify(value)}$creation$::jsonb`;
// Repeated level/terrain values are transmitted once. PostgreSQL reconstructs
// the exact public catalog, keeping the browser SQL Editor request compact.
function grouped(values: Record<string, unknown>) {
  const groups = new Map<string, { keys: Record<string, string[]>; value: unknown }>();
  for (const [key, value] of Object.entries(values)) {
    const encoded = JSON.stringify(value);
    const existing = groups.get(encoded) ?? { keys: {}, value };
    const separator = key.indexOf(':'),
      prefix = key.slice(0, separator),
      suffix = key.slice(separator + 1);
    (existing.keys[prefix] ??= []).push(suffix);
    groups.set(encoded, existing);
  }
  return [...groups.values()];
}
const parts = [
  '-- PHB 2014 character options and book equipment. Additive, atomic and repeatable.',
  '-- Existing characters, grants, RLS and RPC identities are preserved.',
  '-- Compact SQL Editor edition: repeated catalog values are expanded in PostgreSQL.',
  'begin;',
];
const catalogs: unknown[] = [];
for (const [id, features] of Object.entries(CLASS_FEATURES)) {
  const paths = CLASS_PATHS.filter((p) => p.class_id === id);
  const choices: Record<string, unknown> = {},
    spells: Record<string, string[]> = {},
    expanded: Record<string, string[]> = {};
  for (const sub of ['', ...paths.map((p) => p.id)])
    for (let level = 1; level <= 20; level++) {
      for (const initial of [true, false])
        choices[`${sub}:${level}:${initial ? 'initial' : 'multi'}`] = Object.fromEntries(
          featureChoices(id, level, sub, initial).map((c) => [
            c.id,
            {
              count: c.count,
              skills: c.skills,
              expertise: c.expertise,
              ...(c.required?.length ? { required: c.required } : {}),
              options: c.options.map((o) => ({
                id: o.id,
                ...(o.level ? { level: o.level } : {}),
                ...(o.pact ? { pact: o.pact } : {}),
              })),
            },
          ]),
        );
      for (const terrain of ['', ...PATH_SPELL_TERRAINS]) {
        const sheet = {
          class_levels: [{ class_id: id, level, subclass_id: sub, choices: { land: [terrain] } }],
        } as DndSheet;
        const names = pathSpells(sheet, id);
        if (names.length) spells[`${sub}:${level}:${terrain}`] = names;
        const extra = expandedSpells(sheet, id);
        if (extra.length) expanded[`${sub}:${level}`] = extra;
      }
    }
  const data = {
    paths,
    training: CLASS_TRAINING[id],
    requirements: MULTICLASS_REQUIREMENTS[id],
    subclass_level: SUBCLASS_LEVELS[id],
    asi_levels: features.filter((f) => f.name === 'Melhoria de atributos').map((f) => f.level),
  };
  catalogs.push({
    class_id: id,
    data,
    grouped: {
      choices: grouped(choices),
      path_spells: grouped(spells),
      expanded_spells: grouped(expanded),
    },
  });
}
parts.push(`do $build_catalog$
declare seed jsonb=${json(catalogs)};entry jsonb;data jsonb;property text;expanded jsonb;features jsonb;
begin
 for entry in select value from jsonb_array_elements(seed) loop
  -- Base class features are unchanged since 017; retain the installed copy.
  select r.data->'features' into features from public.dnd_character_build_rules r where r.class_id=entry->>'class_id';
  if jsonb_typeof(features) is distinct from 'array' then raise exception 'Instale as migrações anteriores até a 035 antes da 036.';end if;
  data=(entry->'data')||jsonb_build_object('features',features);
  foreach property in array array['choices','path_spells','expanded_spells'] loop
   select coalesce(jsonb_object_agg(k.key||':'||s.key,g.value->'value'),'{}'::jsonb) into expanded
   from jsonb_array_elements(entry->'grouped'->property) g(value)
   cross join lateral jsonb_each(g.value->'keys') k
   cross join lateral jsonb_array_elements_text(k.value) s(key);
   data=data||jsonb_build_object(property,expanded);
  end loop;
  insert into public.dnd_character_build_rules(class_id,data) values(entry->>'class_id',data)
  on conflict(class_id) do update set data=excluded.data;
 end loop;
end $build_catalog$;`);
for (const bg of BACKGROUNDS)
  parts.push(
    `insert into public.dnd_backgrounds(id,name,data) values(${q(bg.id)},${q(bg.name)},${json(bg)}) on conflict(id) do update set name=excluded.name,data=excluded.data;`,
  );
// Starting grants are the sum of independent class and background supplies.
// Send each component once rather than repeating every class/background pair.
const classGrants = Object.fromEntries(
  Object.keys(CLASS_FEATURES).map((id) => [
    id,
    Object.fromEntries(bookEquipmentLimits(id, 'custom')),
  ]),
);
const wizardOnly = bookEquipmentLimits('wizard', 'custom');
const backgroundGrants = Object.fromEntries(
  BACKGROUNDS.map((bg) => [
    bg.id,
    Object.fromEntries(
      [...bookEquipmentLimits('wizard', bg.id)]
        .map(([name, count]) => [name, count - (wizardOnly.get(name) ?? 0)] as const)
        .filter(([, count]) => count > 0),
    ),
  ]),
);
// Fail generation if future equipment rules stop being additive.
for (const id of Object.keys(CLASS_FEATURES))
  for (const bg of BACKGROUNDS) {
    const expected = bookEquipmentLimits(id, bg.id),
      names = new Set([...Object.keys(classGrants[id]), ...Object.keys(backgroundGrants[bg.id])]);
    if (
      expected.size !== names.size ||
      [...expected].some(
        ([name, count]) =>
          count !== (classGrants[id][name] ?? 0) + (backgroundGrants[bg.id][name] ?? 0),
      )
    )
      throw new Error(`Non-additive starter grant: ${id}/${bg.id}`);
  }
parts.push(`with seed as(select ${json({ classes: classGrants, backgrounds: backgroundGrants })} data),
classes as(select c.key id,c.value items from seed cross join lateral jsonb_each(seed.data->'classes') c),
backgrounds as(select b.key id,b.value items from seed cross join lateral jsonb_each(seed.data->'backgrounds') b),
grants as(
 select c.id class_id,b.id background_id,i.key name,i.value::integer quantity from classes c cross join backgrounds b cross join lateral jsonb_each(c.items) i
 union all
 select c.id class_id,b.id background_id,i.key name,i.value::integer quantity from classes c cross join backgrounds b cross join lateral jsonb_each(b.items) i
)
insert into private.dnd_starter_item_limits(class_id,background_id,name,quantity)
select class_id,background_id,name,sum(quantity)::integer from grants group by class_id,background_id,name
on conflict(class_id,background_id,name) do update set quantity=greatest(private.dnd_starter_item_limits.quantity,excluded.quantity);`);
function definition(file: string, name: string) {
  const source = readSqlSource(file),
    start = source.search(
      new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\(`, 'i'),
    );
  if (start < 0) throw new Error(`Missing SQL function: ${name}`);
  const end = source.indexOf('end $$;', start);
  if (end < 0) throw new Error(`Unterminated SQL function: ${name}`);
  return source.slice(start, end + 7).replace(/^create function/i, 'create or replace function');
}
function patch(source: string, before: string, after: string) {
  if (!source.includes(before)) throw new Error(`SQL patch target missing: ${before}`);
  return source.replace(before, () => after);
}
const template = 'supabase/templates/dnd-multiclass.sql';
let validate = definition(template, 'private.dnd_validate_build');
validate = patch(
  validate,
  "  for entry in select * from jsonb_each(coalesce(c->'choices','{}')) loop",
  `  for key,choice in select * from jsonb_each(coalesce(rules->'choices'->(sub||':'||l||':'||case when cardinality(seen)=1 then 'initial' else 'multi' end),'{}')) loop
   if not coalesce(c->'choices'->key,'[]') @> coalesce(choice->'required','[]') then raise exception 'Mantenha as escolhas obrigatórias da especialização neste nível.';end if;
  end loop;
  for entry in select * from jsonb_each(coalesce(c->'choices','{}')) loop`,
);
validate = validate.replace('Caminho de classe inválido', 'Especialização de classe inválida');
parts.push(validate);
let caps = definition(template, 'private.dnd_feature_caps');
caps = patch(
  caps,
  'cleric integer;paladin integer;',
  "cleric integer;paladin integer;wis integer=greatest(1,floor((coalesce((abilities->>'wis')::numeric,10)-10)/2));",
);
caps = patch(
  caps,
  ' end loop;\n cleric=',
  `  if id='fighter' and c->>'subclass_id'='battle-master' and l>=3 then result=result||jsonb_build_object('fighter:superiority',case when l>=15 then 6 when l>=7 then 5 else 4 end);end if;
  if id='wizard' and c->>'subclass_id'='divination' and l>=2 then result=result||jsonb_build_object('wizard:portent',case when l>=14 then 3 else 2 end);end if;
  if id='wizard' and c->>'subclass_id'='illusion' and l>=10 then result=result||'{"wizard:illusory-self":1}';end if;
  if id='cleric' and c->>'subclass_id' in('light','tempest','war') then result=result||jsonb_build_object('cleric:'||(c->>'subclass_id'),wis);end if;
  if id='sorcerer' and c->>'subclass_id'='wild-magic' then result=result||'{"sorcerer:tides":1}';end if;
  if id='warlock' and c->>'subclass_id'='archfey' then
   result=result||'{"warlock:fey-presence":1}';
   if l>=6 then result=result||'{"warlock:misty-escape":1}';end if;
   if l>=14 then result=result||'{"warlock:dark-delirium":1}';end if;
  end if;
  if id='warlock' and c->>'subclass_id'='great-old-one' and l>=6 then result=result||'{"warlock:entropic-ward":1}';end if;
  if id='paladin' and c->>'subclass_id'='ancients' and l>=15 then result=result||'{"paladin:undying":1}';end if;
  if id='paladin' and c->>'subclass_id' in('ancients','vengeance') and l>=20 then result=result||jsonb_build_object('paladin:'||(c->>'subclass_id'),1);end if;
 end loop;
 cleric=`,
);
parts.push(caps);
let attacks = definition(template, 'private.dnd_attack_count');
attacks = patch(
  attacks,
  "or (c->>'class_id'='warlock'",
  "or (c->>'class_id'='bard' and c->>'subclass_id'='valor' and (c->>'level')::integer>=6) or (c->>'class_id'='artificer' and c->>'subclass_id' in('armorer','battle-smith') and (c->>'level')::integer>=5) or (c->>'class_id'='warlock'",
);
parts.push(attacks);
let proficiency = definition(
  'supabase/migrations/202610070018_spell_access_combat_and_items.sql',
  'private.dnd_weapon_proficient',
);
proficiency = patch(
  proficiency,
  " primary_class=classes->0->>'class_id';",
  ` primary_class=classes->0->>'class_id';
 if exists(select 1 from jsonb_array_elements(classes) c where (c->>'class_id'='cleric' and c->>'subclass_id' in('war','tempest')) or (c->>'class_id'='bard' and c->>'subclass_id'='valor' and (c->>'level')::integer>=3) or (c->>'class_id'='artificer' and c->>'subclass_id'='battle-smith' and (c->>'level')::integer>=3)) then return true;end if;`,
);
parts.push(proficiency);
parts.push(`create or replace function private.dnd_expanded_spell(s jsonb,entry jsonb)
returns boolean language plpgsql stable set search_path='' as $$
declare c jsonb;permitted jsonb;
begin
 if coalesce(nullif(entry->>'class_id',''),s->>'class_id')<>'warlock' then return false;end if;
 select x into c from jsonb_array_elements(private.dnd_levels(s)) x where x->>'class_id'='warlock';
 select data->'expanded_spells'->((c->>'subclass_id')||':'||(c->>'level')) into permitted from public.dnd_character_build_rules where class_id='warlock';
 return coalesce(permitted ? (entry->>'english_name'),false);
end $$;`);
parts.push('commit;');
const sql = parts.join('\n\n') + '\n';
if (Buffer.byteLength(sql) > 256 * 1024)
  throw new Error(
    `Migration 036 exceeds the 256 KiB SQL Editor size budget: ${Buffer.byteLength(sql)} bytes; catalog ${Buffer.byteLength(JSON.stringify(catalogs))}.`,
  );
writeFileSync('supabase/migrations/202610220036_character_creation_and_book_options.sql', sql);
console.log('Migration 036 generated:', Buffer.byteLength(sql), 'bytes');

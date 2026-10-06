import { readFileSync, writeFileSync } from 'node:fs';
import {
  CLASS_FEATURES,
  CLASS_PATHS,
  CLASS_TRAINING,
  MULTICLASS_REQUIREMENTS,
  SUBCLASS_LEVELS,
  featureChoices,
} from '../src/systems/dnd5e/progression-catalog';
import { BACKGROUNDS } from '../src/systems/dnd5e/creation';
import { pathSpells, PATH_SPELL_TERRAINS } from '../src/systems/dnd5e/path-spells';
import type { DndSheet } from '../src/systems/dnd5e/types';
let sql = readFileSync('supabase/templates/dnd-multiclass.sql', 'utf8');
const quoted = (x: unknown) => `$catalog$${JSON.stringify(x)}$catalog$::jsonb`;
let seed = '';
for (const [id, features] of Object.entries(CLASS_FEATURES)) {
  const choices: Record<string, unknown> = {};
  const paths = CLASS_PATHS.filter((p) => p.class_id === id);
  for (const sub of ['', ...paths.map((p) => p.id)])
    for (let l = 1; l <= 20; l++)
      for (const initial of [true, false])
        choices[`${sub}:${l}:${initial ? 'initial' : 'multi'}`] = Object.fromEntries(
          featureChoices(id, l, sub, initial).map((c) => [
            c.id,
            {
              count: c.count,
              options: c.options.map((o) => ({
                id: o.id,
                ...(o.level ? { level: o.level } : {}),
                ...(o.pact ? { pact: o.pact } : {}),
              })),
              skills: c.skills,
              expertise: c.expertise,
            },
          ]),
        );
  const data = {
    features,
    paths,
    training: CLASS_TRAINING[id],
    requirements: MULTICLASS_REQUIREMENTS[id],
    subclass_level: SUBCLASS_LEVELS[id],
    asi_levels: features.filter((f) => f.name === 'Melhoria de atributos').map((f) => f.level),
    choices,
    path_spells: Object.fromEntries(
      paths.flatMap((path) =>
        Array.from({ length: 20 }, (_, i) => i + 1).flatMap((level) =>
          ['', ...PATH_SPELL_TERRAINS].flatMap((terrain) => {
            const names = pathSpells(
              {
                class_levels: [
                  { class_id: id, level, subclass_id: path.id, choices: { land: [terrain] } },
                ],
              } as DndSheet,
              id,
            );
            return names.length ? [[`${path.id}:${level}:${terrain}`, names]] : [];
          }),
        ),
      ),
    ),
  };
  seed += `insert into public.dnd_character_build_rules values('${id}',${quoted(data)});\n`;
}
for (const bg of BACKGROUNDS)
  seed += `insert into public.dnd_backgrounds values('${bg.id}','${bg.name.replaceAll("'", "''")}',${quoted(bg)});\n`;
sql = sql.replace('-- CATALOG_SEED', () => seed);
function definition(file: string, name: string) {
  const source = readFileSync(file, 'utf8');
  const rx = new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\(`, 'i');
  const start = source.search(rx);
  if (start < 0) throw new Error(name);
  const end = source.indexOf('end $$;', start);
  if (end < 0) throw new Error(name);
  return source.slice(start, end + 7).replace(/^create function/, 'create or replace function');
}
let save = definition(
  'supabase/migrations/202610010004_transactional_services.sql',
  'public.save_character',
);
save = save.replace(
  "  if system_slug='dnd5e' then",
  () => "  if system_slug='dnd5e' then\n    perform private.dnd_validate_build(s,s->'abilities');",
);
let request = definition(
  'supabase/migrations/202610050011_player_rolls_and_scenery.sql',
  'public.request_battle_action',
);
request = request.replace(
  "   select spell_ability into ability from public.dnd_classes where id=sheet->>'class_id';\n   if sheet->>'subclass_id' in('eldritch-knight','arcane-trickster') then ability='int'; end if;",
  () => '   ability=private.dnd_spell_ability(sheet,entry);',
);
request = request.replace(
  "sheet->>'class_id'='rogue' and (sheet->>'level')::integer>=2",
  () => "private.dnd_class_level(sheet,'rogue')>=2",
);
request = request.replace(
  "   e=e||jsonb_build_object('dice',dice,",
  () =>
    "   if coalesce(e->>'dice','')<>'' and private.dnd_spell_bonus(sheet,entry,e,rlevel)<>0 then dice=dice||case when private.dnd_spell_bonus(sheet,entry,e,rlevel)>=0 then '+' else '' end||private.dnd_spell_bonus(sheet,entry,e,rlevel);end if;\n   e=e||jsonb_build_object('dice',dice,",
);
let resolve = definition(
  'supabase/migrations/202610040009_battle_actions.sql',
  'public.resolve_battle_action',
);
resolve = resolve.replace(
  'public.resolve_battle_action(',
  () => 'public.resolve_battle_action_v9(',
);
resolve = resolve.replace(
  /attacks=case when sheet->>'class_id'='fighter'[\s\S]*?else 1 end;/,
  () => 'attacks=private.dnd_attack_count(sheet);',
);
// The original spell-reference trigger owns canonical PDF descriptions. Patch
// its arcanum check and add per-origin learning validation for new builds.
let reference = definition(
  'supabase/templates/dnd-catalog-validation.sql',
  'public.validate_dnd_spell_reference',
);
reference = reference.replace(
  'choices smallint[];',
  () => 'choices smallint[];origin jsonb; prog public.dnd_spell_progression;sub text;pool jsonb;',
);
reference = reference.replace(
  "  select arcanum_levels into choices from public.dnd_spell_progression where class_id=sheet->>'class_id' and subclass_id=coalesce(sheet->>'subclass_id','') and level=(sheet->>'level')::integer;\n  if sheet->>'class_id' is distinct from 'warlock' or not coalesce(lvl::smallint=any(choices),false)",
  () =>
    "  pool=private.dnd_spell_pools(sheet);\n  if not(sheet ? 'class_levels') and not pool->'arcanum_levels' @> jsonb_build_array(lvl)",
);
reference = reference.replace(
  ' return new;',
  () => ` if tg_table_name='character_spells' then
  select system_data into sheet from public.characters where id=new.character_id;
  if sheet ? 'class_levels' and coalesce(new.data->>'casting_mode','class')<>'bonus' then
   select c into origin from jsonb_array_elements(private.dnd_levels(sheet)) c where c->>'class_id'=coalesce(nullif(new.data->>'class_id',''),sheet->>'class_id');
   sub=case when origin->>'subclass_id' in('eldritch-knight','arcane-trickster') then origin->>'subclass_id' else '' end;
   select * into prog from public.dnd_spell_progression where class_id=origin->>'class_id' and subclass_id=sub and level=(origin->>'level')::integer;
   if origin is not null and reference.id is not null and not exists(select 1 from public.dnd_spell_classes where spell_id=reference.id and class_id=case when sub<>'' then 'wizard' else origin->>'class_id' end) then raise exception 'A magia não pertence à lista da classe de origem; registre concessões especiais como extras.';end if;
  end if;
  if private.dnd_spell_inactive(sheet,new.data) then new.data=new.data||'{\"inactive\":true}'::jsonb;else new.data=new.data-'inactive';end if;
 end if;
 return new;`,
);
let speed = definition(
  'supabase/migrations/202610040009_battle_actions.sql',
  'private.battle_character_speed',
);
let defaults = definition(
  'supabase/migrations/202610040009_battle_actions.sql',
  'private.battle_token_defaults',
);
for (const pair of [
  ['speed', speed],
  ['defaults', defaults],
] as const) {
  let d = pair[1].replace(
    /s->>'class_id'='barbarian' and \(s->>'level'\)::integer>=5/g,
    () => "private.dnd_class_level(s,'barbarian')>=5",
  );
  d = d.replace(
    /s->>'class_id'='monk' and \(s->>'level'\)::integer>=2/g,
    () => "private.dnd_class_level(s,'monk')>=2",
  );
  d = d.replace(
    /\(s->>'level'\)::integer>=(18|14|10|6)/g,
    (_, n) => "private.dnd_class_level(s,'monk')>=" + n,
  );
  if (pair[0] === 'speed') speed = d;
  else defaults = d;
}
let campaignRules = definition(
  'supabase/migrations/202610060016_campaign_sessions_and_rules.sql',
  'public.save_campaign_rules',
);
campaignRules = campaignRules.replace(
  '   maximum=private.battle_hp_max',
  () => `   attrs=private.dnd_adjust_abilities(c.system_data,sheet,attrs);
   update public.character_attributes a set score=(attrs->>a.ability)::integer where a.character_id=c.id;
   maximum=private.battle_hp_max`,
);
sql = sql.replace('-- RPC_OVERRIDES', () =>
  [save, request, resolve, reference, speed, defaults, campaignRules].join('\n\n'),
);
sql +=
  '\nrevoke all on function private.dnd_adjust_abilities(jsonb,jsonb,jsonb),private.dnd_feature_caps(jsonb,jsonb),private.dnd_spell_bonus(jsonb,jsonb,jsonb,integer) from public,anon,authenticated;\n';
writeFileSync('supabase/migrations/202610060017_multiclass_and_character_builds.sql', sql);
console.log('Migration 017 generated:', Buffer.byteLength(sql), 'bytes');

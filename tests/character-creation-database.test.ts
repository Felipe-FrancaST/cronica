import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';
import { defaultSheet } from '../src/systems/dnd5e';
import {
  CLASS_PATHS,
  CLASS_FEATURES,
  SUBCLASS_LEVELS,
  featureChoices,
} from '../src/systems/dnd5e/progression-catalog';
import { BACKGROUNDS } from '../src/systems/dnd5e/backgrounds';
import { withClassLevels, featureResources, extraAttacks } from '../src/systems/dnd5e/progression';
import { selectBackground } from '../src/systems/dnd5e/creation';
import {
  applyBookStartingEquipment,
  CLASS_STARTING_EQUIPMENT,
} from '../src/systems/dnd5e/starting-equipment';
import { ITEM_CATALOG } from '../src/systems/dnd5e/items';
import { weaponProficient } from '../src/systems/dnd5e/combat-features';
import { pathSpells, expandedSpells, PATH_SPELL_TERRAINS } from '../src/systems/dnd5e/path-spells';
import type { DndSheet, InventoryItem } from '../src/systems/dnd5e/types';

test('PostgreSQL accepts the full book catalog, equipment grants and matching class mechanics after migration 036', async (t) => {
  const db = await billingDatabase();
  try {
    await db.exec('update public.site_billing_settings set billing_enabled=false where id=1');
    const gm = randomUUID(),
      player = randomUUID(),
      campaign = randomUUID(),
      system = '00000000-0000-4000-8000-000000000001';
    await db.query(
      "insert into auth.users(id,email) values($1,'gm@creation.test'),($2,'player@creation.test')",
      [gm, player],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Criação')",
      [campaign, gm, system],
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      campaign,
      player,
    ]);
    await db.query(
      'insert into public.campaign_rules(campaign_id,players_can_create_custom_items) values($1,false) on conflict(campaign_id) do update set players_can_create_custom_items=false',
      [campaign],
    );
    const make = (id: string, level = 1, sub = '') =>
      withClassLevels(
        { ...defaultSheet(), abilities: { str: 16, dex: 16, con: 16, int: 16, wis: 16, cha: 16 } },
        [
          {
            class_id: id,
            level,
            subclass_id: sub,
            ...(sub === 'four-elements' ? { choices: { disciplines: ['attunement'] } } : {}),
          },
        ],
      );
    const asPlayer = async <T>(fn: () => Promise<T>) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [player]);
      try {
        return await fn();
      } finally {
        await db.exec('reset role');
      }
    };
    const save = (sheet: DndSheet, id = randomUUID()) =>
      asPlayer(() =>
        db.query('select public.save_character($1::jsonb)', [
          JSON.stringify({
            id,
            campaign_id: campaign,
            rpg_system_id: system,
            owner_id: player,
            name: 'Personagem de teste',
            sheet,
          }),
        ]),
      );
    await t.test(
      'compact SQL restores every catalog key without dropping a level, terrain or option',
      async () => {
        const rows = (
          await db.query<{ class_id: string; data: Record<string, unknown> }>(
            'select class_id,data from public.dnd_character_build_rules order by class_id',
          )
        ).rows;
        assert.equal(rows.length, Object.keys(CLASS_FEATURES).length);
        for (const row of rows) {
          const paths = CLASS_PATHS.filter((p) => p.class_id === row.class_id);
          assert.deepEqual(row.data.features, CLASS_FEATURES[row.class_id]);
          assert.deepEqual(row.data.paths, JSON.parse(JSON.stringify(paths)));
          const choices: Record<string, unknown> = {},
            spells: Record<string, string[]> = {},
            expanded: Record<string, string[]> = {};
          for (const sub of ['', ...paths.map((p) => p.id)])
            for (let level = 1; level <= 20; level++) {
              for (const initial of [true, false])
                choices[`${sub}:${level}:${initial ? 'initial' : 'multi'}`] = Object.fromEntries(
                  featureChoices(row.class_id, level, sub, initial).map((c) => [
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
                const s: DndSheet = {
                  ...defaultSheet(),
                  class_id: row.class_id,
                  level,
                  subclass_id: sub,
                  class_levels: [
                    {
                      class_id: row.class_id,
                      level,
                      subclass_id: sub,
                      choices: { land: [terrain] },
                    },
                  ],
                };
                const names = pathSpells(s, row.class_id),
                  extra = expandedSpells(s, row.class_id);
                if (names.length) spells[`${sub}:${level}:${terrain}`] = names;
                if (extra.length) expanded[`${sub}:${level}`] = extra;
              }
            }
          assert.deepEqual(row.data.choices, JSON.parse(JSON.stringify(choices)), row.class_id);
          assert.deepEqual(row.data.path_spells, spells, row.class_id);
          assert.deepEqual(row.data.expanded_spells, expanded, row.class_id);
        }
      },
    );
    await t.test(
      'all specializations pass server validation at entry and at level twenty with identical resource caps',
      async () => {
        for (const p of CLASS_PATHS)
          for (const level of [SUBCLASS_LEVELS[p.class_id], 20]) {
            const s = make(p.class_id, level, p.id),
              data = JSON.stringify(s);
            const caps = (
              await db.query<{ caps: Record<string, number>; attacks: number }>(
                "select private.dnd_feature_caps($1::jsonb,$1::jsonb->'abilities') caps,private.dnd_attack_count($1::jsonb) attacks",
                [data],
              )
            ).rows[0];
            for (const r of featureResources(s))
              assert.equal(caps.caps[r.id], r.max, `${p.id}/${level}/${r.id}`);
            assert.equal(caps.attacks, extraAttacks(s), p.id);
            await db.query("select private.dnd_validate_build($1::jsonb,$1::jsonb->'abilities')", [
              data,
            ]);
            const resources = {
              ...s,
              feature_uses: Object.fromEntries(featureResources(s).map((r) => [r.id, r.max])),
            };
            await db.query("select private.dnd_validate_build($1::jsonb,$1::jsonb->'abilities')", [
              JSON.stringify(resources),
            ]);
          }
        await assert.rejects(
          db.query("select private.dnd_validate_build($1::jsonb,$1::jsonb->'abilities')", [
            JSON.stringify({
              ...make('monk', 3, 'four-elements'),
              class_levels: [
                {
                  class_id: 'monk',
                  level: 3,
                  subclass_id: 'four-elements',
                  choices: { disciplines: ['fangs', 'water'] },
                },
              ],
            }),
          ]),
          /obrigatórias/,
        );
      },
    );
    await t.test(
      'book alternatives, expanded packs and all backgrounds save while custom inventory is disabled',
      async () => {
        const cases = [
          ...Object.keys(CLASS_STARTING_EQUIPMENT).map((id) => [id, 'guild-artisan']),
          ...BACKGROUNDS.map((bg) => ['wizard', bg.id]),
        ];
        for (const [id, bg] of cases) {
          let s = selectBackground(make(id), bg);
          if (id === 'fighter')
            s.creation!.equipment_choices = {
              weapon: ['two-martial'],
              'weapon:two-martial:two-martial': ['Rapieira', 'Rapieira'],
            };
          s = applyBookStartingEquipment(s, randomUUID);
          const character = randomUUID();
          await save(s, character);
          const stored = (
            await db.query<{ system_data: DndSheet }>(
              'select system_data from public.characters where id=$1',
              [character],
            )
          ).rows[0].system_data;
          assert.equal(stored.creation?.background_id, bg);
          assert.equal(stored.creation?.equipment_applied, true);
          const inventory = (
            await db.query<{ count: number }>(
              'select count(*)::integer count from public.character_inventory where character_id=$1',
              [character],
            )
          ).rows[0];
          assert.equal(inventory.count, s.inventory.length, `${id}/${bg}`);
          if (id === 'fighter') {
            await assert.rejects(
              save({ ...s, creation: { ...s.creation!, equipment_applied: false } }, character),
              /não pode ser reiniciado/,
            );
            await assert.rejects(
              save(
                {
                  ...s,
                  inventory: [
                    ...s.inventory,
                    {
                      id: randomUUID(),
                      name: 'Presente inventado',
                      category: 'gear',
                      quantity: 1,
                      weight: 0,
                      equipped: false,
                      notes: '',
                    },
                  ],
                },
                character,
              ),
              /itens personalizados/,
            );
          }
        }
      },
    );
    await t.test(
      'domain, oath and artificer grants unlock at the correct levels on the server',
      async () => {
        for (const p of CLASS_PATHS.filter((p) =>
          ['cleric', 'paladin', 'artificer'].includes(p.class_id),
        )) {
          for (const level of [1, 3, 4, 5, 8, 9, 12, 13, 16, 17]) {
            if (level < SUBCLASS_LEVELS[p.class_id]) continue;
            const s = make(p.class_id, level, p.id),
              expected = pathSpells(s, p.class_id);
            const actual =
              (
                await db.query<{ names: string[] | null }>(
                  "select data->'path_spells'->$2 names from public.dnd_character_build_rules where class_id=$1",
                  [p.class_id, `${p.id}:${level}:`],
                )
              ).rows[0].names ?? [];
            assert.deepEqual(actual, expected, `${p.id}/${level}`);
            for (const name of expected) {
              const inactive = (
                await db.query<{ inactive: boolean }>(
                  'select private.dnd_spell_inactive($1::jsonb,$2::jsonb) inactive',
                  [
                    JSON.stringify(s),
                    JSON.stringify({
                      class_id: p.class_id,
                      english_name: name,
                      granted_path: p.id,
                      casting_mode: 'bonus',
                    }),
                  ],
                )
              ).rows[0].inactive;
              assert.equal(inactive, false, `${p.id}/${level}/${name}`);
            }
          }
        }
      },
    );
    await t.test(
      'patron expanded lists and new martial proficiencies agree with the client',
      async () => {
        const weapon = {
          ...ITEM_CATALOG.find((i) => i.catalog_id === 'longsword')!,
          id: randomUUID(),
        } as InventoryItem;
        for (const [id, sub, level] of [
          ['bard', 'valor', 3],
          ['cleric', 'tempest', 1],
          ['cleric', 'war', 1],
          ['artificer', 'battle-smith', 3],
          ['wizard', 'abjuration', 2],
        ] as const) {
          const s = make(id, level, sub),
            actual = (
              await db.query<{ proficient: boolean }>(
                'select private.dnd_weapon_proficient($1::jsonb,$2::jsonb) proficient',
                [JSON.stringify(weapon), JSON.stringify(s)],
              )
            ).rows[0].proficient;
          assert.equal(actual, weaponProficient(weapon, s));
        }
        for (const [sub, name] of [
          ['fiend', 'Burning Hands'],
          ['archfey', 'Faerie Fire'],
          ['great-old-one', 'Dissonant Whispers'],
        ]) {
          const actual = (
            await asPlayer(() =>
              db.query<{ ok: boolean }>(
                'select private.dnd_expanded_spell($1::jsonb,$2::jsonb) ok',
                [
                  JSON.stringify(make('warlock', 1, sub)),
                  JSON.stringify({ class_id: 'warlock', english_name: name }),
                ],
              ),
            )
          ).rows[0].ok;
          assert.equal(actual, true, sub);
        }
      },
    );
    await t.test(
      'migration can run again without rewriting characters or changing the save RPC identity',
      async () => {
        const before = (
          await db.query<{ fingerprint: string; oid: number }>(
            "select md5(string_agg(system_data::text,'' order by id)) fingerprint,'public.save_character(jsonb,timestamptz)'::regprocedure::oid::integer oid from public.characters",
          )
        ).rows[0];
        await db.exec(readMigration('202610220036_character_creation_and_book_options.sql'));
        const after = (
          await db.query<{ fingerprint: string; oid: number }>(
            "select md5(string_agg(system_data::text,'' order by id)) fingerprint,'public.save_character(jsonb,timestamptz)'::regprocedure::oid::integer oid from public.characters",
          )
        ).rows[0];
        assert.deepEqual(after, before);
      },
    );
  } finally {
    await db.close();
  }
});

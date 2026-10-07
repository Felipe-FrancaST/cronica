import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { defaultSheet, calculate } from '../src/systems/dnd5e';
import {
  withClassLevels,
  withCharacterLevel,
  featureResources,
} from '../src/systems/dnd5e/progression';
import { spellPools } from '../src/systems/dnd5e/spellcasting';
import { newCreation, withCreation, selectBackground } from '../src/systems/dnd5e/creation';
import { SPELL_CATALOG, spellFromCatalog } from '../src/systems/dnd5e/spell-catalog';
import type { DndSheet, ClassLevel, Spell } from '../src/types';
import { characterSpellEffect, spellEffect } from '../src/features/vtt/effects';
import { spellIsInactive } from '../src/systems/dnd5e/spellcasting';

test('PostgreSQL validates multiclass builds and matches the client after all migrations', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated nologin nosuperuser nobypassrls;create role anon nologin nosuperuser nobypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
    for (const file of migrationNames()
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(readMigration(file));
    const gm = randomUUID(),
      player = randomUUID(),
      campaign = randomUUID(),
      system = '00000000-0000-4000-8000-000000000001';
    await db.query(
      "insert into auth.users(id,email) values($1,'gm@build.test'),($2,'player@build.test')",
      [gm, player],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Builds')",
      [campaign, gm, system],
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      campaign,
      player,
    ]);
    const as = async <T>(user: string, fn: () => Promise<T>) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      try {
        return await fn();
      } finally {
        await db.exec('reset role');
      }
    };
    const make = (levels: ClassLevel[]) =>
      withClassLevels(
        { ...defaultSheet(), abilities: { str: 13, dex: 14, con: 14, int: 16, wis: 16, cha: 18 } },
        levels,
      );
    const save = (s: DndSheet, id = randomUUID()) =>
      as(player, () =>
        db.query('select public.save_character($1::jsonb)', [
          JSON.stringify({
            id,
            campaign_id: campaign,
            rpg_system_id: system,
            owner_id: player,
            name: 'Multiclasse',
            sheet: s,
          }),
        ]),
      );
    const scalar = async <T>(sql: string, s: DndSheet) =>
      (await db.query<{ v: T }>(`select ${sql} v`, [JSON.stringify(s)])).rows[0].v;
    await t.test(
      'full, half, third and pact progressions, HP and resource limits agree',
      async () => {
        for (const levels of [
          [
            { class_id: 'ranger', level: 4 },
            { class_id: 'wizard', level: 3 },
          ],
          [
            { class_id: 'paladin', level: 3 },
            { class_id: 'fighter', level: 2 },
          ],
          [
            { class_id: 'paladin', level: 3 },
            { class_id: 'wizard', level: 1 },
          ],
          [
            { class_id: 'fighter', level: 4, subclass_id: 'eldritch-knight' },
            { class_id: 'wizard', level: 2 },
          ],
          [
            { class_id: 'warlock', level: 3, subclass_id: 'fiend' },
            { class_id: 'cleric', level: 3, subclass_id: 'life' },
          ],
          [
            { class_id: 'artificer', level: 3 },
            { class_id: 'wizard', level: 1 },
          ],
        ]) {
          const s = make(levels),
            expected = spellPools(s),
            actual = await scalar<Record<string, unknown>>('private.dnd_spell_pools($1::jsonb)', s);
          assert.deepEqual(actual.slots, expected.slots);
          assert.equal(actual.pact_slots, expected.pactSlots);
          assert.deepEqual(actual.arcanum_levels, expected.arcanumLevels);
          assert.equal(
            await scalar<number>('private.battle_hp_max($1::jsonb)', s),
            calculate(s).hpMax,
          );
          const savedId = randomUUID();
          await save(s, savedId);
          const casting = (
            await as(player, () =>
              db.query<{
                spell_slots: number[];
                pact_slots: number;
                total_level: number;
                level: number;
              }>('select * from public.dnd_character_casting where character_id=$1', [savedId]),
            )
          ).rows[0];
          assert.deepEqual(casting.spell_slots, expected.slots);
          assert.equal(casting.pact_slots, expected.pactSlots);
          assert.equal(casting.total_level, s.level);
          assert.equal(casting.level, levels[0].level);
        }
        const s = make([
          { class_id: 'cleric', level: 6 },
          { class_id: 'paladin', level: 3 },
        ]);
        const caps = await scalar<Record<string, number>>(
          "private.dnd_feature_caps($1::jsonb,$1::jsonb->'abilities')",
          s,
        );
        for (const r of featureResources(s)) assert.equal(caps[r.id], r.max, r.id);
      },
    );
    await t.test(
      'invalid totals, prerequisites, early paths and unavailable choices roll back atomically',
      async () => {
        const s = make([
          { class_id: 'fighter', level: 3 },
          { class_id: 'wizard', level: 2 },
        ]);
        await assert.rejects(save({ ...s, level: 6 }), /soma/i);
        await assert.rejects(save({ ...s, abilities: { ...s.abilities, int: 12 } }), /mínimos/i);
        await assert.rejects(
          save(make([{ class_id: 'fighter', level: 2, subclass_id: 'champion' }])),
          /Caminho/i,
        );
        await assert.rejects(
          save(
            make([
              { class_id: 'warlock', level: 3, choices: { invocations: ['thirsting-blade'] } },
            ]),
          ),
          /requisitos/i,
        );
        await assert.rejects(
          save({ ...s, feature_uses: { 'wizard:arcane-recovery': 2 } }),
          /Usos de habilidades/i,
        );
      },
    );
    await t.test(
      '4d6/array/point-buy provenance and final ASIs are validated, including direct score writes',
      async () => {
        const s = selectBackground(
          withCreation(
            make([{ class_id: 'fighter', level: 4, subclass_id: 'champion' }]),
            newCreation(),
          ),
          'soldier',
        );
        const id = randomUUID();
        await save(s, id);
        await assert.rejects(
          save({ ...s, creation: { ...s.creation!, base: { ...s.creation!.base, str: 16 } } }),
          /padrão|finais/i,
        );
        await assert.rejects(
          as(player, () =>
            db.query(
              "update public.character_attributes set score=20 where character_id=$1 and ability='str'",
              [id],
            ),
          ),
          /finais/i,
        );
        const p = withCreation(s, {
          ...s.creation!,
          method: 'point-buy',
          base: { str: 15, dex: 15, con: 15, int: 15, wis: 8, cha: 8 },
        });
        await assert.rejects(save(p), /27 pontos/i);
        const r = withCreation(s, {
          ...s.creation!,
          method: 'rolled',
          rolls: Array.from({ length: 6 }, () => [6, 6, 6, 6]),
          base: { str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 18 },
        });
        await save(r);
        await assert.rejects(
          save({ ...r, creation: { ...r.creation!, rolls: [[7, 6, 6, 6]] } }),
          /rolagens|Rolagem/i,
        );
      },
    );
    await t.test(
      'spell origin limits learning, uses its own ability and can spend both pools',
      async () => {
        let s = make([
          { class_id: 'warlock', level: 3, subclass_id: 'fiend' },
          { class_id: 'cleric', level: 3, subclass_id: 'life' },
        ]);
        const cure = spellFromCatalog(
          SPELL_CATALOG.find((e) => e.english_name === 'Cure Wounds')!,
          randomUUID(),
          'cleric',
        );
        cure.prepared = true;
        s = { ...s, spells: [cure] };
        const id = randomUUID();
        await save(s, id);
        const ability = (
          await db.query<{ v: string }>('select private.dnd_spell_ability($1::jsonb,$2::jsonb) v', [
            JSON.stringify(s),
            JSON.stringify(cure),
          ])
        ).rows[0].v;
        assert.equal(ability, 'wis');
        const fire = spellFromCatalog(
          SPELL_CATALOG.find((e) => e.english_name === 'Fireball')!,
          randomUUID(),
          'cleric',
        );
        await assert.rejects(save({ ...s, spells: [fire] }), /círculo|lista/i);
        await assert.rejects(save({ ...s, slots_used: { '3': 1 } }), /excedem/i);
        await assert.rejects(save({ ...s, pact_slots_used: 3 }), /pacto/i);
        await save({ ...s, slots_used: { '2': 1 }, pact_slots_used: 1 }, id);
      },
    );
    await t.test(
      'PostgreSQL and combat previews agree on Life, Evocation and Draconic bonuses',
      async () => {
        const cure = spellFromCatalog(
          SPELL_CATALOG.find((e) => e.english_name === 'Cure Wounds')!,
          randomUUID(),
          'cleric',
        );
        const fire = spellFromCatalog(
          SPELL_CATALOG.find((e) => e.english_name === 'Fireball')!,
          randomUUID(),
          'wizard',
        );
        const cases: [DndSheet, Spell, number, number][] = [
          [make([{ class_id: 'cleric', level: 3, subclass_id: 'life' }]), cure, 2, 4],
          [make([{ class_id: 'wizard', level: 10, subclass_id: 'evocation' }]), fire, 3, 3],
          [
            make([
              {
                class_id: 'sorcerer',
                level: 6,
                subclass_id: 'draconic',
                choices: { dragon: ['Vermelho · fogo'] },
              },
            ]),
            { ...fire, class_id: 'sorcerer' },
            3,
            4,
          ],
        ];
        for (const [s, sp, slot, expected] of cases) {
          const bonus = (
            await db.query<{ v: number }>(
              'select private.dnd_spell_bonus($1::jsonb,$2::jsonb,$3::jsonb,$4) v',
              [JSON.stringify(s), JSON.stringify(sp), JSON.stringify(spellEffect(sp)), slot],
            )
          ).rows[0].v;
          assert.equal(bonus, expected);
          assert.ok(characterSpellEffect(s, sp, slot).dice.endsWith(`+${bonus}`));
          await save(s);
        }
      },
    );
    await t.test(
      'level and path changes retain unavailable magic and PostgreSQL recomputes availability',
      async () => {
        const fire = spellFromCatalog(
          SPELL_CATALOG.find((e) => e.english_name === 'Fireball')!,
          randomUUID(),
          'wizard',
        );
        const id = randomUUID();
        let s = {
          ...make([
            { class_id: 'wizard', level: 5 },
            { class_id: 'cleric', level: 2 },
          ]),
          spells: [fire],
        };
        await save(s, id);
        s = {
          ...make([
            { class_id: 'wizard', level: 3 },
            { class_id: 'cleric', level: 4 },
          ]),
          spells: [fire],
        };
        await save(s, id);
        assert.equal(
          (
            await db.query<{ data: { inactive: boolean } }>(
              'select data from public.character_spells where character_id=$1',
              [id],
            )
          ).rows[0].data.inactive,
          true,
        );
        const grant = {
          ...spellFromCatalog(
            SPELL_CATALOG.find((e) => e.english_name === 'Cure Wounds')!,
            randomUUID(),
            'cleric',
          ),
          casting_mode: 'bonus' as const,
          granted_path: 'life',
          always_prepared: true,
        };
        for (const current of [
          make([{ class_id: 'cleric', level: 3, subclass_id: 'life' }]),
          make([{ class_id: 'cleric', level: 3 }]),
          make([{ class_id: 'fighter', level: 3 }]),
        ]) {
          assert.equal(
            (
              await db.query<{ v: boolean }>(
                'select private.dnd_spell_inactive($1::jsonb,$2::jsonb) v',
                [JSON.stringify(current), JSON.stringify(grant)],
              )
            ).rows[0].v,
            spellIsInactive(current, grant),
          );
          await save({ ...current, spells: [{ ...grant, id: randomUUID() }] });
        }
        await save({ ...make([{ class_id: 'fighter', level: 7 }]), spells: [fire] }, id);
      },
    );
    await t.test(
      'master level lock preserves the build and removes lost ASIs without breaking generated attributes',
      async () => {
        let s = withCreation(
          make([
            { class_id: 'fighter', level: 4 },
            { class_id: 'wizard', level: 3 },
          ]),
          { ...newCreation(), base: { str: 15, dex: 10, con: 12, int: 14, wis: 8, cha: 13 } },
        );
        s = withClassLevels(s, [
          { class_id: 'fighter', level: 4, improvements: { '4': { str: 2 } } },
          { class_id: 'wizard', level: 3 },
        ]);
        const id = randomUUID();
        await save(s, id);
        await as(gm, () =>
          db.query('select public.save_campaign_rules($1,$2::jsonb)', [
            campaign,
            JSON.stringify({ party_level: 6, lock_player_level: true }),
          ]),
        );
        const saved = (
          await db.query<{ system_data: DndSheet }>(
            'select system_data from public.characters where id=$1',
            [id],
          )
        ).rows[0].system_data;
        assert.equal(saved.level, 6);
        assert.equal(saved.class_levels![0].level, 3);
        assert.deepEqual(saved.class_levels![0].improvements, {});
        const attrs = (
          await db.query<{ v: Record<string, number> }>(
            'select jsonb_object_agg(ability,score) v from public.character_attributes where character_id=$1',
            [id],
          )
        ).rows[0].v;
        assert.equal(attrs.str, 15);
        assert.deepEqual(attrs, withCharacterLevel(s, 6).abilities);
        await assert.rejects(save({ ...s, level: 7 }, id), /mestre|nível/i);
      },
    );
  } finally {
    await db.close();
  }
});

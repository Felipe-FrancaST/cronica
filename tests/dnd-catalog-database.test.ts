import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { defaultSheet } from '../src/systems/dnd5e';
import { castingProfile } from '../src/systems/dnd5e/spellcasting';
import { SPELL_CATALOG, spellFromCatalog } from '../src/systems/dnd5e/spell-catalog';
const owner = '91000000-0000-4000-8000-000000000001',
  player = '91000000-0000-4000-8000-000000000002',
  campaign = '92000000-0000-4000-8000-000000000001',
  legacy = '93000000-0000-4000-8000-000000000001',
  character = '93000000-0000-4000-8000-000000000002',
  spellId = '94000000-0000-4000-8000-000000000001';
const system = '00000000-0000-4000-8000-000000000001';
test('catalog migration upgrades legacy data and enforces resources, catalog integrity and RLS in PostgreSQL', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated nologin nosuperuser nobypassrls;create role anon nologin nosuperuser nobypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
   alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
    const files = migrationNames()
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const f of files.filter((f) => f < '202610040008_dnd_catalog.sql'))
      await db.exec(readMigration(f));
    await db.query(
      `insert into auth.users(id,email) values($1,'owner@example.test'),($2,'player@example.test')`,
      [owner, player],
    );
    await db.query(
      `insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Catalog test')`,
      [campaign, owner, system],
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      campaign,
      player,
    ]);
    const asUser = async <T>(id: string, fn: () => Promise<T>) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      try {
        return await fn();
      } finally {
        await db.exec('reset role');
      }
    };
    const payload = (id: string, user = owner) => ({
      id,
      owner_id: user,
      campaign_id: campaign,
      rpg_system_id: system,
      name: 'Catalog hero',
      portrait_path: null,
      appearance: '',
      biography: '',
      sheet: defaultSheet(),
    });
    const old = payload(legacy);
    old.sheet = {
      ...old.sheet,
      class_id: 'warlock',
      race: 'Elfo',
      level: 5,
      slots_used: { '3': 1 },
      spells: [
        {
          id: spellId,
          name: 'Truque legado',
          level: 0,
          prepared: true,
          range: 'Toque',
          duration: '1 hora',
          components: 'V',
          description: 'Referência personalizada antiga.',
        },
      ],
    };
    delete old.sheet.pact_slots_used;
    await asUser(owner, () =>
      db.query('select public.save_character($1::jsonb)', [JSON.stringify(old)]),
    );
    const dirty = payload('93000000-0000-4000-8000-000000000003');
    dirty.sheet = {
      ...dirty.sheet,
      class_id: 'wizard',
      level: 5,
      slots_used: { '1': -2, '3': 99, '9': 7 },
    };
    await asUser(owner, () =>
      db.query('select public.save_character($1::jsonb)', [JSON.stringify(dirty)]),
    );
    for (const f of files.filter((f) => f.includes('dnd_catalog'))) await db.exec(readMigration(f));
    await t.test(
      'legacy IDs and spell records survive; pact usage and race reference are backfilled',
      async () => {
        const { rows } = await asUser(owner, () =>
          db.query<{ system_data: typeof old.sheet }>(
            'select system_data from public.characters where id=$1',
            [legacy],
          ),
        );
        assert.equal(rows[0].system_data.pact_slots_used, 1);
        assert.deepEqual(rows[0].system_data.slots_used, {});
        assert.equal(rows[0].system_data.race_id, 'elfo');
        assert.equal(
          (
            await db.query<{ id: string }>(
              'select id from public.character_spells where character_id=$1',
              [legacy],
            )
          ).rows[0].id,
          spellId,
        );
      },
    );
    await t.test(
      'legacy invalid counters are bounded and the original values remain recoverable',
      async () => {
        const row = (
          await db.query<{
            system_data: {
              slots_used: Record<string, number>;
              resource_migration_backup: { slots_used: Record<string, number> };
            };
          }>('select system_data from public.characters where id=$1', [
            '93000000-0000-4000-8000-000000000003',
          ])
        ).rows[0];
        assert.deepEqual(row.system_data.slots_used, { '1': 0, '2': 0, '3': 2 });
        assert.deepEqual(row.system_data.resource_migration_backup.slots_used, {
          '1': -2,
          '3': 99,
          '9': 7,
        });
      },
    );
    await t.test(
      'catalog seeds have full coverage and all 300 progressions agree between server and client',
      async () => {
        assert.equal(
          (await asUser(player, () => db.query('select id from public.dnd_spells'))).rows.length,
          361,
        );
        assert.equal((await db.query('select id from public.dnd_classes')).rows.length, 13);
        assert.equal((await db.query('select id from public.dnd_races')).rows.length, 112);
        const rows = (
          await db.query<{
            class_id: string;
            subclass_id: string;
            level: number;
            slots: number[];
            pact_slots: number;
            arcanum_levels: number[];
          }>('select * from public.dnd_spell_progression')
        ).rows;
        assert.equal(rows.length, 300);
        for (const row of rows) {
          const p = castingProfile({ ...defaultSheet(), ...row });
          assert.deepEqual(row.slots, p.slots, `${row.class_id}:${row.subclass_id}:${row.level}`);
          assert.equal(row.pact_slots, p.pact ? p.slots.at(-1) : 0);
          assert.deepEqual(row.arcanum_levels, p.arcanumLevels);
        }
        await assert.rejects(
          () =>
            asUser(player, () =>
              db.query("update public.dnd_spells set name='forged' where id='bola-de-fogo'"),
            ),
          /permission denied/,
        );
      },
    );
    const wiz = payload(character, player);
    wiz.sheet = {
      ...wiz.sheet,
      class_id: 'wizard',
      level: 5,
      slots_used: { '3': 1 },
      spells: [
        {
          ...spellFromCatalog(
            SPELL_CATALOG.find((sp) => sp.id === 'bola-de-fogo')!,
            spellId,
            'wizard',
          ),
          prepared: true,
        },
      ],
    };
    // Character-owned spell IDs are globally unique, so give the new sheet its own spell UUID.
    wiz.sheet.spells[0].id = '94000000-0000-4000-8000-000000000002';
    await asUser(player, () =>
      db.query('select public.save_character($1::jsonb)', [JSON.stringify(wiz)]),
    );
    await t.test(
      'canonical spell fields and per-character preparation persist with relational references',
      async () => {
        const sp = (
          await asUser(player, () =>
            db.query<{
              catalog_id: string;
              class_id: string;
              data: { description: string; prepared: boolean };
            }>('select * from public.character_spells where character_id=$1', [character]),
          )
        ).rows[0];
        assert.equal(sp.catalog_id, 'bola-de-fogo');
        assert.equal(sp.class_id, 'wizard');
        assert.equal(sp.data.prepared, true);
        assert.ok(sp.data.description.length > 500);
        const rows = (
          await asUser(player, () =>
            db.query<{ character_id: string }>('select * from public.dnd_character_casting'),
          )
        ).rows;
        assert.deepEqual(
          rows.map((r) => r.character_id),
          [character],
        );
        await db.exec('set role anon');
        try {
          await assert.rejects(
            () => db.query('select * from public.dnd_spells'),
            /permission denied/,
          );
        } finally {
          await db.exec('reset role');
        }
      },
    );
    await t.test(
      'overspending, wrong catalog levels and duplicate catalog spells roll back the complete save',
      async () => {
        const save = (c: typeof wiz) =>
          asUser(player, () =>
            db.query('select public.save_character($1::jsonb)', [JSON.stringify(c)]),
          );
        await assert.rejects(
          () =>
            save({
              ...wiz,
              name: 'Must not persist',
              sheet: { ...wiz.sheet, slots_used: { '3': 3 } },
            }),
          /excedem/,
        );
        await assert.rejects(
          () =>
            save({
              ...wiz,
              sheet: { ...wiz.sheet, spells: [{ ...wiz.sheet.spells[0], level: 1 }] },
            }),
          /difere/,
        );
        await assert.rejects(
          () =>
            save({
              ...wiz,
              sheet: {
                ...wiz.sheet,
                spells: [
                  ...wiz.sheet.spells,
                  { ...wiz.sheet.spells[0], id: '94000000-0000-4000-8000-000000000003' },
                ],
              },
            }),
          /duplicate key/,
        );
        assert.equal(
          (
            await db.query<{ name: string }>('select name from public.characters where id=$1', [
              character,
            ])
          ).rows[0].name,
          'Catalog hero',
        );
        assert.equal(
          (
            await db.query('select id from public.character_spells where character_id=$1', [
              character,
            ])
          ).rows.length,
          1,
        );
      },
    );
    await t.test(
      'Mystic Arcana use separate counters and only unlock at the required Warlock level',
      async () => {
        const next = payload(legacy);
        const arc = spellFromCatalog(
          SPELL_CATALOG.find((sp) => sp.english_name === 'True Seeing')!,
          '94000000-0000-4000-8000-000000000004',
          'warlock',
          true,
        );
        next.sheet = {
          ...next.sheet,
          class_id: 'warlock',
          level: 11,
          pact_slots_used: 2,
          arcanum_used: { '6': 1 },
          spells: [arc],
        };
        await asUser(owner, () =>
          db.query('select public.save_character($1::jsonb)', [JSON.stringify(next)]),
        );
        await assert.rejects(
          () =>
            asUser(owner, () =>
              db.query('select public.save_character($1::jsonb)', [
                JSON.stringify({ ...next, sheet: { ...next.sheet, level: 10 } }),
              ]),
            ),
          /Arcano Místico/,
        );
        await assert.rejects(
          () =>
            asUser(owner, () =>
              db.query('select public.save_character($1::jsonb)', [
                JSON.stringify({ ...next, sheet: { ...next.sheet, pact_slots_used: 4 } }),
              ]),
            ),
          /pacto.*excedem/,
        );
        const view = (
          await db.query<{ pact_slots_used: number; arcanum_used: Record<string, number> }>(
            'select * from public.dnd_character_casting where character_id=$1',
            [legacy],
          )
        ).rows[0];
        assert.equal(view.pact_slots_used, 2);
        assert.equal(view.arcanum_used['6'], 1);
      },
    );
  } finally {
    await db.close();
  }
});

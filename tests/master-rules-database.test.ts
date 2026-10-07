import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';
import { defaultSheet, calculate } from '../src/systems/dnd5e';
import { withClassLevels, classLevels } from '../src/systems/dnd5e/progression';
import { defaultRules } from '../src/features/sessions/types';
import {
  applyStartingEquipment,
  newCreation,
  selectBackground,
  withCreation,
} from '../src/systems/dnd5e/creation';
import type { DndSheet, InventoryItem } from '../src/types';

test('migration 019 enforces master rules, persistent HP rolls and inventory permissions in PostgreSQL', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated nologin nosuperuser nobypassrls;create role anon nologin nosuperuser nobypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
      alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
    for (const file of migrationNames()) await db.exec(readMigration(file));
    // This migration can be run again without removing any campaign data.
    await db.exec(readMigration('202610070019_master_rules_and_scene_workshop.sql'));
    const gm = randomUUID(),
      player = randomUUID(),
      outsider = randomUUID(),
      campaign = randomUUID();
    const system = '00000000-0000-4000-8000-000000000001';
    await db.query(
      "insert into auth.users(id,email) values($1,'gm@rules.test'),($2,'player@rules.test'),($3,'outsider@rules.test')",
      [gm, player, outsider],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Regras')",
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
    const rules = async (patch: object) => {
      const current = (
        await db.query<{ data: object; stamp: string | null }>(
          'select to_jsonb(r) data,updated_at::text stamp from public.campaign_rules r where campaign_id=$1',
          [campaign],
        )
      ).rows[0];
      await as(gm, () =>
        db.query('select public.save_campaign_rules_v19($1,$2::jsonb,$3::timestamptz)', [
          campaign,
          JSON.stringify({ ...defaultRules(campaign), ...current?.data, ...patch }),
          current?.stamp ?? null,
        ]),
      );
    };
    const make = () =>
      withClassLevels(
        {
          ...defaultSheet(),
          hp_current: 4,
          abilities: { str: 14, dex: 14, con: 14, int: 14, wis: 14, cha: 14 },
        },
        [
          { class_id: 'fighter', level: 2 },
          { class_id: 'wizard', level: 2 },
        ],
      );
    const save = (sheet: DndSheet, id = randomUUID(), user = player, owner = player) =>
      as(user, () =>
        db.query('select public.save_character($1::jsonb)', [
          JSON.stringify({
            id,
            campaign_id: campaign,
            rpg_system_id: system,
            owner_id: owner,
            name: 'Aventureiro',
            sheet,
          }),
        ]),
      );
    const roll = async (id: string, sheet: DndSheet, user = player, owner = player) =>
      (
        await as(user, () =>
          db.query<{ value: Record<string, number[]> }>(
            'select public.roll_character_hit_points($1,$2,$3::jsonb,$4) value',
            [campaign, id, JSON.stringify(classLevels(sheet)), owner],
          ),
        )
      ).rows[0].value;
    const stored = async (id: string) => {
      const data = (
        await db.query<{ value: DndSheet }>(
          'select system_data value from public.characters where id=$1',
          [id],
        )
      ).rows[0].value;
      const attributes = (
        await db.query<{ ability: string; score: number }>(
          'select ability,score from public.character_attributes where character_id=$1',
          [id],
        )
      ).rows;
      const inventory = (
        await db.query<{ value: InventoryItem }>(
          "select data||jsonb_build_object('id',id) value from public.character_inventory where character_id=$1",
          [id],
        )
      ).rows.map((r) => r.value);
      return {
        ...data,
        abilities: {
          ...defaultSheet().abilities,
          ...Object.fromEntries(attributes.map((a) => [a.ability, a.score])),
        },
        skills: {},
        inventory,
        spells: [],
      } as DndSheet;
    };
    const hero = randomUUID();
    await save(make(), hero);
    await t.test(
      'only the campaign owner can change rules and maximum HP recalculates without healing',
      async () => {
        await assert.rejects(
          as(player, () =>
            db.query('select public.save_campaign_rules_v19($1,$2::jsonb,null)', [
              campaign,
              JSON.stringify(defaultRules(campaign)),
            ]),
          ),
          /Somente o mestre/,
        );
        await rules({ hit_point_method: 'maximum' });
        const s = await stored(hero);
        assert.equal(s.hit_point_method, 'maximum');
        assert.equal(s.hp_current, 4);
        assert.equal(calculate(s).hpMax, 40);
        assert.equal(
          (
            await db.query<{ hp: number }>('select private.battle_hp_max($1::jsonb) hp', [
              JSON.stringify(s),
            ])
          ).rows[0].hp,
          40,
        );
        await assert.rejects(save({ ...s, hp_max_override: 200 }, hero), /Somente o mestre/);
      },
    );
    await t.test(
      'multiclass restrictions preserve existing combinations while rejecting new ones through RPC and direct writes',
      async () => {
        await rules({ allow_multiclass: false });
        await save(await stored(hero), hero);
        await assert.rejects(save({ ...make(), hit_point_method: 'maximum' }), /multiclasse/);
        await assert.rejects(
          as(player, () =>
            db.query(
              "update public.characters set system_data=jsonb_set(system_data,'{class_levels}', $1::jsonb) where id=$2",
              [
                JSON.stringify([
                  { class_id: 'fighter', level: 1 },
                  { class_id: 'cleric', level: 3 },
                ]),
                hero,
              ],
            ),
          ),
          /multiclasse/,
        );
        await rules({ allow_multiclass: true });
      },
    );
    await t.test(
      'existing levels roll once, repeated requests and temporary level decreases keep the complete ledger',
      async () => {
        await rules({ hit_point_method: 'rolled' });
        const s = await stored(hero),
          first = s.hit_point_rolls!;
        assert.equal(first.fighter[0], 10);
        assert.equal(first.fighter.length, 2);
        assert.equal(first.wizard.length, 2);
        assert.deepEqual(await roll(hero, s), first);
        const lower = withClassLevels(s, [{ class_id: 'fighter', level: 1 }]);
        await save(lower, hero);
        assert.deepEqual(await roll(hero, lower), first);
        await save(s, hero);
        assert.deepEqual(await roll(hero, s), first);
        assert.equal(
          (
            await db.query<{ hp: number }>('select private.battle_hp_max($1::jsonb) hp', [
              JSON.stringify(s),
            ])
          ).rows[0].hp,
          calculate(s).hpMax,
        );
      },
    );
    await t.test(
      'forged or missing results roll back, and unauthorized users cannot read or roll the ledger',
      async () => {
        const s = await stored(hero),
          rolls = structuredClone(s.hit_point_rolls!);
        rolls.fighter[1] = rolls.fighter[1] === 10 ? 1 : 10;
        await assert.rejects(
          save({ ...s, hit_point_rolls: rolls }, hero),
          /resultados registrados/,
        );
        await assert.rejects(save({ ...s, hit_point_rolls: {} }, hero), /Role os dados/);
        await assert.rejects(roll(hero, s, outsider), /acesso/);
        assert.equal(
          (await as(outsider, () => db.query('select * from public.character_hit_point_rolls')))
            .rows.length,
          0,
        );
        await assert.rejects(
          as(player, () =>
            db.query('update public.character_hit_point_rolls set result=1 where character_id=$1', [
              hero,
            ]),
          ),
          /permission denied/,
        );
      },
    );
    await t.test(
      'a draft records results before saving and the master can roll a draft for another campaign member',
      async () => {
        const id = randomUUID(),
          s = { ...make(), hit_point_method: 'rolled' as const };
        await assert.rejects(save(s, id), /Role os dados/);
        s.hit_point_rolls = await roll(id, s);
        await save(s, id);
        assert.deepEqual((await stored(id)).hit_point_rolls, s.hit_point_rolls);
        const other = randomUUID();
        s.hit_point_rolls = await roll(other, s, gm, player);
        await save(s, other, gm, player);
        await assert.rejects(roll(randomUUID(), s, player, gm), /própria conta/);
      },
    );
    await t.test(
      'attribute method restrictions apply to new builds while old distributions remain valid',
      async () => {
        await rules({ hit_point_method: 'average', attribute_method: 'standard' });
        const old = await stored(hero);
        await save(old, hero);
        await assert.rejects(save(defaultSheet()), /método de atributos/);
        const initial = withCreation(defaultSheet(), newCreation());
        await save(initial);
      },
    );
    await t.test(
      'players can spend resources but cannot restore them when rests are controlled by the master',
      async () => {
        const id = randomUUID(),
          s = {
            ...withCreation(defaultSheet(), newCreation()),
            feature_uses: { 'fighter:second-wind': 1 },
            hit_dice_used: 1,
          };
        await save(s, id);
        await rules({ players_can_rest: false });
        await assert.rejects(save({ ...s, feature_uses: {}, hit_dice_used: 0 }, id), /descanso/);
        await save({ ...s, feature_uses: {}, hit_dice_used: 0 }, id, gm, player);
        await rules({ players_can_rest: true });
      },
    );
    await t.test(
      'custom items are grandfathered, catalog and starter supplies work, and arbitrary inserts are blocked',
      async () => {
        const id = randomUUID();
        const relic: InventoryItem = {
          id: randomUUID(),
          name: 'Relíquia antiga',
          category: 'item',
          quantity: 1,
          weight: 0,
          equipped: false,
          notes: '',
        };
        const s = { ...withCreation(defaultSheet(), newCreation()), inventory: [relic] };
        await save(s, id);
        await rules({ players_can_create_custom_items: false });
        await save(s, id);
        await assert.rejects(
          save(
            {
              ...s,
              inventory: [...s.inventory, { ...relic, id: randomUUID(), name: 'Novo item' }],
            },
            id,
          ),
          /personalizados/,
        );
        await assert.rejects(
          as(player, () =>
            db.query(
              'insert into public.character_inventory(id,character_id,data) values($1,$2,$3::jsonb)',
              [randomUUID(), id, JSON.stringify({ ...relic, name: 'Item por fora' })],
            ),
          ),
          /personalizados/,
        );
        const fresh = selectBackground(withCreation(defaultSheet(), newCreation()), 'noble');
        const equipped = applyStartingEquipment(fresh, 0, randomUUID),
          freshId = randomUUID();
        await save(equipped, freshId);
        await save(await stored(freshId), freshId);
        assert.equal((await stored(freshId)).inventory.length, equipped.inventory.length);
        await assert.rejects(
          save(
            { ...equipped, creation: { ...equipped.creation!, equipment_applied: false } },
            freshId,
          ),
          /reiniciado/,
        );
      },
    );
  } finally {
    await db.close();
  }
});

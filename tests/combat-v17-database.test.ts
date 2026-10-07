import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { defaultSheet } from '../src/systems/dnd5e';
import { withClassLevels } from '../src/systems/dnd5e/progression';
import { spellFromCatalog, SPELL_CATALOG } from '../src/systems/dnd5e/spell-catalog';
import { ITEM_CATALOG } from '../src/systems/dnd5e/items';
import { spellIsInactive } from '../src/systems/dnd5e/spellcasting';
import { characterSpellEffect, weaponEffect } from '../src/features/vtt/effects';
import type { ClassLevel, DndSheet, InventoryItem, Spell } from '../src/types';
import type { BattleActionRequest, BattleMap, BattleToken } from '../src/features/vtt/types';

test('migration 018: authorized combat, class eligibility, item use and atomic resources in PostgreSQL', async (t) => {
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
    for (const f of files.filter((f) => f < '202610070018')) await db.exec(readMigration(f));
    const gm = randomUUID(),
      player = randomUUID(),
      stranger = randomUUID(),
      campaign = randomUUID(),
      hero = randomUUID(),
      defender = randomUUID(),
      npc = randomUUID();
    const system = '00000000-0000-4000-8000-000000000001';
    await db.query(
      "insert into auth.users(id,email) values($1,'gm@v17.test'),($2,'player@v17.test'),($3,'outsider@v17.test')",
      [gm, player, stranger],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'V17')",
      [campaign, gm, system],
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      campaign,
      player,
    ]);
    const as = async <T>(id: string, fn: () => Promise<T>) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      try {
        return await fn();
      } finally {
        await db.exec('reset role');
      }
    };
    const make = (levels: ClassLevel[]) =>
      withClassLevels(
        {
          ...defaultSheet(),
          hp_current: 40,
          hp_max_override: 100,
          abilities: { str: 16, dex: 14, con: 14, int: 16, wis: 16, cha: 16 },
        },
        levels,
      );
    const item = (id: string, updates: Partial<InventoryItem> = {}): InventoryItem => {
      const { use: _use, ...data } = ITEM_CATALOG.find((i) => i.catalog_id === id)!;
      return { ...data, id: randomUUID(), ...updates };
    };
    const spell = (name: string, origin: string): Spell => ({
      ...spellFromCatalog(
        SPELL_CATALOG.find((e) => e.english_name === name)!,
        randomUUID(),
        origin,
      ),
      prepared: true,
    });
    const save = (s: DndSheet, id = hero, owner = player) =>
      as(owner, () =>
        db.query('select public.save_character($1::jsonb)', [
          JSON.stringify({
            id,
            campaign_id: campaign,
            rpg_system_id: system,
            owner_id: owner,
            name: id === hero ? 'Hero' : 'Defender',
            sheet: s,
          }),
        ]),
      );
    const legacy = { ...spell('Fire Bolt', 'fighter'), casting_mode: 'bonus' as const };
    await save({
      ...make([{ class_id: 'fighter', level: 1 }]),
      spells: [legacy],
      inventory: [
        { ...item('potion-healing'), catalog_id: undefined, category: 'item', quantity: 3 },
      ],
    });
    const migration = readMigration(files.at(-1)!);
    await db.exec(migration);
    await db.exec(migration); // Safe repeat after the v16 recovery, no table removal.
    await save(make([{ class_id: 'barbarian', level: 5 }]), defender, gm);
    await db.query(
      "insert into public.npcs(id,campaign_id,rpg_system_id,name,relationship,visible_to_players) values($1,$2,$3,'Enemy','Hostil',true)",
      [npc, campaign, system],
    );
    await db.query('insert into public.npc_stats(npc_id,hp_current,hp_max) values($1,100,100)', [
      npc,
    ]);
    const npcAttack = randomUUID();
    await db.query('insert into public.npc_attacks(id,npc_id,data) values($1,$2,$3)', [
      npcAttack,
      npc,
      JSON.stringify({ name: 'Garra', damage: '1d8 cortante', range: '1.5 m', description: '' }),
    ]);
    await as(gm, () =>
      db.query(
        "select public.start_campaign_session((public.save_campaign_session($1,'Revisão',1)).id)",
        [campaign],
      ),
    );
    const map = (
      await as(gm, () =>
        db.query<{ m: BattleMap }>('select to_jsonb(public.create_battle_map($1,$2)) m', [
          campaign,
          JSON.stringify({ name: 'Arena', width: 20, height: 20, scale_per_cell: 1.5 }),
        ]),
      )
    ).rows[0].m;
    const add = (id: string, x: number) =>
      as(gm, () =>
        db.query<{ t: BattleToken }>(
          'select to_jsonb(public.add_character_to_battle_map($1,$2,$3,2)) t',
          [map.id, id, x],
        ),
      );
    const actor = (await add(hero, 2)).rows[0].t,
      target = (await add(defender, 4)).rows[0].t;
    const enemy = (
      await as(gm, () =>
        db.query<{ t: BattleToken }>(
          "select to_jsonb(public.add_npc_to_battle_map($1,$2,9,'m',3,2)) t",
          [map.id, npc],
        ),
      )
    ).rows[0].t;
    const start = (order = [actor.id, enemy.id]) =>
      as(gm, () =>
        db.query('select public.start_battle_combat($1,$2)', [
          map.battle_session_id,
          JSON.stringify(order.map((token_id, i) => ({ token_id, initiative: 20 - i }))),
        ]),
      );
    const token = async (id = actor.id) =>
      (await db.query<BattleToken>('select * from public.battle_map_tokens where id=$1', [id]))
        .rows[0];
    const data = async (id = hero) =>
      (
        await db.query<{ s: DndSheet }>('select system_data s from public.characters where id=$1', [
          id,
        ])
      ).rows[0].s;
    const request = async (
      payload: Record<string, unknown>,
      id = actor.id,
      user = player,
      client = randomUUID(),
    ) =>
      (
        await as(user, () =>
          db.query<{ r: BattleActionRequest }>(
            'select to_jsonb(public.request_battle_action($1,$2,$3)) r',
            [id, JSON.stringify(payload), client],
          ),
        )
      ).rows[0].r;
    const approve = async (id: string, success = true, opts = {}) =>
      (
        await as(gm, () =>
          db.query<{ r: BattleActionRequest }>(
            'select to_jsonb(public.approve_battle_action($1,$2,$3)) r',
            [id, success, JSON.stringify(opts)],
          ),
        )
      ).rows[0].r;
    const roll = async (id: string, user = player, client = randomUUID()) =>
      (
        await as(user, () =>
          db.query<{ r: BattleActionRequest }>(
            'select to_jsonb(public.roll_approved_battle_action($1,$2)) r',
            [id, client],
          ),
        )
      ).rows[0].r;
    const prepare = async (s: DndSheet) => {
      await as(gm, () => db.query('select public.end_battle_combat($1)', [map.battle_session_id]));
      await save(s);
      await db.query('update public.npc_stats set hp_current=100,hp_temp=0 where npc_id=$1', [npc]);
      await db.query(
        'update public.battle_map_tokens set raging=false,x=case when id=$1 then 2 when id=$2 then 3 else 4 end,y=2 where map_id=$3',
        [actor.id, enemy.id, map.id],
      );
      await start();
    };
    const attack = (source: string, weapon_options = {}, victim = enemy) => ({
      kind: 'weapon',
      source_id: source,
      weapon_options,
      target: { x: victim.x, y: victim.y },
      target_ids: [victim.id],
    });
    const cast = (sp: Spell, level: number, victim = enemy) => ({
      kind: 'spell',
      source_id: sp.id,
      resource_kind: level ? 'slot' : 'cantrip',
      resource_level: level,
      target: { x: victim.x, y: victim.y },
      target_ids: [victim.id],
    });
    const inactive = async (s: DndSheet, sp: Spell) =>
      (
        await db.query<{ v: boolean }>('select private.dnd_spell_inactive($1::jsonb,$2::jsonb) v', [
          JSON.stringify(s),
          JSON.stringify(sp),
        ])
      ).rows[0].v;

    await t.test(
      'upgrade preserves legacy data, blocks the bonus loophole and matches class/path eligibility',
      async () => {
        const old = (
          await db.query<{ data: InventoryItem }>(
            'select data from public.character_inventory where character_id=$1',
            [hero],
          )
        ).rows[0].data;
        assert.equal(old.category, 'potion');
        assert.equal(old.quantity, 3);
        await start();
        await assert.rejects(request(cast(legacy, 0)), /indisponível/);
        for (const c of [
          'barbarian',
          'bard',
          'cleric',
          'druid',
          'fighter',
          'monk',
          'paladin',
          'ranger',
          'rogue',
          'sorcerer',
          'warlock',
          'wizard',
          'artificer',
        ])
          for (const level of [1, 2, 3, 5])
            for (const name of ['Fire Bolt', 'Cure Wounds', 'Fireball']) {
              const s = make([{ class_id: c, level }]),
                sp = { ...spell(name, c), casting_mode: 'bonus' as const };
              assert.equal(await inactive(s, sp), spellIsInactive(s, sp), `${c} ${level} ${name}`);
            }
        for (const [c, path, level] of [
          ['fighter', 'eldritch-knight', 3],
          ['rogue', 'arcane-trickster', 3],
          ['fighter', 'champion', 3],
          ['warlock', 'fiend', 5],
          ['warlock', 'fiend', 3],
        ] as const) {
          const s = make([{ class_id: c, level, subclass_id: path }]),
            sp = spell(c === 'warlock' ? 'Fireball' : 'Magic Missile', c);
          assert.equal(await inactive(s, sp), spellIsInactive(s, sp));
        }
        const multi = make([
          { class_id: 'wizard', level: 5 },
          { class_id: 'fighter', level: 3, subclass_id: 'champion' },
        ]);
        assert.equal(
          await inactive(multi, { ...spell('Fireball', 'fighter'), casting_mode: 'bonus' }),
          true,
        );
        const s = make([{ class_id: 'bard', level: 6, subclass_id: 'lore' }]);
        const grants = ['Fireball', 'Spirit Guardians', 'Lightning Bolt'].map((name) => ({
          ...spell(name, 'bard'),
          granted_feature: 'magical-secrets' as const,
          casting_mode: 'bonus' as const,
        }));
        await save({ ...s, spells: grants.slice(0, 2) });
        await assert.rejects(save({ ...s, spells: grants }), /concessão|escolhas/i);
        await assert.rejects(
          save({ ...multi, spells: [{ ...grants[0], class_id: 'fighter' }] }),
          /concessão/i,
        );
        const fiend = {
          ...make([{ class_id: 'warlock', level: 5, subclass_id: 'fiend' }]),
          spells: [spell('Fireball', 'warlock')],
        };
        await save(fiend);
        assert.equal(await inactive(fiend, fiend.spells[0]), false);
      },
    );
    await t.test(
      'known spells and cantrips enforce their own class limit without treating special grants as ordinary choices',
      async () => {
        const sorcerer = make([{ class_id: 'sorcerer', level: 1 }]);
        await assert.rejects(
          save({
            ...sorcerer,
            spells: ['Magic Missile', 'Shield', 'Burning Hands'].map((n) => spell(n, 'sorcerer')),
          }),
          /limite de magias conhecidas/i,
        );
        const knight = make([{ class_id: 'fighter', level: 3, subclass_id: 'eldritch-knight' }]);
        await assert.rejects(
          save({
            ...knight,
            spells: ['Fire Bolt', 'Ray of Frost', 'Shocking Grasp'].map((n) => spell(n, 'fighter')),
          }),
          /limite de truques/i,
        );
        const tome = make([{ class_id: 'warlock', level: 3, choices: { pact: ['tome'] } }]);
        await save({
          ...tome,
          spells: [
            spell('Eldritch Blast', 'warlock'),
            spell('Mage Hand', 'warlock'),
            ...['Sacred Flame', 'Guidance', 'Ray of Frost'].map((n) => ({
              ...spell(n, 'warlock'),
              granted_feature: 'pact-tome' as const,
              casting_mode: 'bonus' as const,
            })),
          ],
        });
        const regular = SPELL_CATALOG.filter((s) => s.classes.includes('bard') && s.level === 1)
          .slice(0, 9)
          .map((s) => spell(s.english_name, 'bard'));
        const secrets = ['Fireball', 'Spirit Guardians'].map((n) => ({
          ...spell(n, 'bard'),
          granted_feature: 'magical-secrets' as const,
          casting_mode: 'bonus' as const,
        }));
        await save({
          ...make([{ class_id: 'bard', level: 6, subclass_id: 'lore' }]),
          spells: [...regular, ...secrets],
        });
        const more = SPELL_CATALOG.filter(
          (s) => s.classes.includes('bard') && s.level > 0 && s.level <= 3,
        )
          .slice(0, 14)
          .map((s) => spell(s.english_name, 'bard'));
        await assert.rejects(
          save({
            ...make([{ class_id: 'bard', level: 10, subclass_id: 'lore' }]),
            spells: [
              ...more,
              ...secrets,
              ...['Lightning Bolt', 'Counterspell'].map((n) => ({
                ...spell(n, 'bard'),
                granted_feature: 'magical-secrets' as const,
                casting_mode: 'bonus' as const,
              })),
            ],
          }),
          /limite de magias conhecidas/i,
        );
      },
    );
    await t.test(
      'all catalog weapons keep client and server modifiers in agreement, including versatile and monk dice',
      async () => {
        for (const build of [
          [
            {
              class_id: 'fighter',
              level: 12,
              subclass_id: 'champion',
              choices: { style: ['dueling'], 'second-style': ['archery'] },
            },
          ],
          [{ class_id: 'monk', level: 11 }],
        ] as ClassLevel[][]) {
          const s = make(build);
          for (const entry of ITEM_CATALOG.filter((i) => i.category === 'weapon')) {
            const weapon = item(entry.catalog_id!);
            const actual = (
              await db.query<{ e: ReturnType<typeof weaponEffect> }>(
                'select private.dnd_weapon_effect($1,$2,$3,false) e',
                [
                  JSON.stringify(weapon),
                  JSON.stringify(s),
                  JSON.stringify({ two_handed: !!weapon.versatile_damage }),
                ],
              )
            ).rows[0].e;
            const expected = weaponEffect(weapon, s, { two_handed: !!weapon.versatile_damage });
            assert.equal(actual.dice, expected.dice, entry.name + ' ' + s.class_id);
            assert.equal(actual.attackBonus, expected.attackBonus, entry.name + ' ' + s.class_id);
            assert.equal(actual.kind, expected.kind, entry.name + ' ' + s.class_id);
            assert.equal(actual.review, expected.review, entry.name + ' ' + s.class_id);
          }
        }
      },
    );
    await t.test(
      'weapon proficiency respects the starting class, multiclass grants and explicit training adjustments',
      async () => {
        const cases: [ClassLevel[], string, Partial<InventoryItem>, number][] = [
          [[{ class_id: 'wizard', level: 1 }], 'longsword', {}, 3],
          [[{ class_id: 'wizard', level: 1 }], 'dagger', {}, 5],
          [
            [
              { class_id: 'wizard', level: 2 },
              { class_id: 'warlock', level: 1 },
            ],
            'mace',
            {},
            5,
          ],
          [
            [
              { class_id: 'wizard', level: 2 },
              { class_id: 'warlock', level: 1 },
            ],
            'longsword',
            {},
            3,
          ],
          [
            [
              { class_id: 'wizard', level: 2 },
              { class_id: 'rogue', level: 1 },
            ],
            'rapier',
            {},
            3,
          ],
          [
            [
              { class_id: 'rogue', level: 2 },
              { class_id: 'wizard', level: 1 },
            ],
            'rapier',
            {},
            5,
          ],
          [
            [
              { class_id: 'wizard', level: 2 },
              { class_id: 'fighter', level: 1 },
            ],
            'longsword',
            {},
            5,
          ],
          [
            [{ class_id: 'wizard', level: 5 }],
            'longsword',
            { weapon_proficiency: 'proficient', weapon_attack_bonus: 2 },
            8,
          ],
          [
            [{ class_id: 'fighter', level: 5 }],
            'longsword',
            { weapon_proficiency: 'untrained' },
            3,
          ],
        ];
        for (const [levels, id, options, expected] of cases) {
          const s = make(levels),
            weapon = item(id, options);
          const actual = (
            await db.query<{ e: ReturnType<typeof weaponEffect> }>(
              'select private.dnd_weapon_effect($1,$2,$3,false) e',
              [JSON.stringify(weapon), JSON.stringify(s), '{}'],
            )
          ).rows[0].e;
          assert.equal(actual.attackBonus, expected, JSON.stringify(levels) + ' ' + id);
          assert.equal(weaponEffect(weapon, s).attackBonus, expected);
        }
      },
    );
    await t.test(
      'a net requires a target, uses the whole Attack action and never deals phantom damage',
      async () => {
        const net = item('net'),
          sword = item('longsword');
        const s = { ...make([{ class_id: 'fighter', level: 5 }]), inventory: [net, sword] };
        await prepare(s);
        await assert.rejects(
          request({ ...attack(net.id), target_ids: [] }),
          /Selecione uma criatura/i,
        );
        const r = await request(attack(net.id));
        assert.equal(r.definition.kind, 'utility');
        assert.equal(r.definition.dice, '');
        assert.deepEqual(r.definition.damageParts, []);
        assert.equal(r.definition.attackBonus, 5); // DEX + proficiency, not STR for the thrown net.
        const done = await approve(r.id);
        assert.equal(done.status, 'success');
        assert.equal((await token()).attacks_remaining, 0);
        assert.equal((await token()).action_used, true);
        assert.equal(
          (
            await db.query<{ hp_current: number }>(
              'select hp_current from public.npc_stats where npc_id=$1',
              [npc],
            )
          ).rows[0].hp_current,
          100,
        );
        await assert.rejects(request(attack(sword.id)), /ação já|ação.*utilizada/i);
        await prepare(s);
        const normal = await request(attack(sword.id));
        await approve(normal.id);
        await roll(normal.id);
        assert.equal((await token()).attacks_remaining, 1);
        await assert.rejects(request(attack(net.id)), /ação inteira/i);
      },
    );
    await t.test(
      'a second light weapon uses the bonus action only after an eligible attack',
      async () => {
        const main = item('dagger', { equipped: true }),
          offhand = item('shortsword', { equipped: true });
        const s = { ...make([{ class_id: 'fighter', level: 1 }]), inventory: [main, offhand] };
        await prepare(s);
        await assert.rejects(request(attack(offhand.id, { offhand: true })), /duas armas leves/i);
        const first = await request(attack(main.id));
        await approve(first.id);
        await roll(first.id);
        assert.equal((await token()).attacks_remaining, 0);
        assert.equal((await token()).weapon_attacked, true);
        const second = await request(attack(offhand.id, { offhand: true }));
        assert.equal(second.cost, 'bonus');
        assert.equal(second.definition.dice, weaponEffect(offhand, s, { offhand: true }).dice);
        await approve(second.id);
        await roll(second.id);
        assert.equal((await token()).bonus_used, true);
        await assert.rejects(request(attack(offhand.id, { offhand: true })), /duas armas leves/i);
      },
    );
    await t.test(
      'the same spell keeps separate origins, and exhausted items remain editable without resetting quantities',
      async () => {
        const s = make([
          { class_id: 'wizard', level: 2 },
          { class_id: 'cleric', level: 2 },
        ]);
        await save({
          ...s,
          spells: [spell('Detect Magic', 'wizard'), spell('Detect Magic', 'cleric')],
          inventory: [
            item('potion-healing', { quantity: 0 }),
            item('plate', { quantity: 0, equipped: true }),
          ],
        });
        assert.equal(
          (
            await db.query<{ n: number }>(
              'select count(*)::integer n from public.character_spells where character_id=$1',
              [hero],
            )
          ).rows[0].n,
          2,
        );
        assert.equal(
          (
            await db.query<{ data: InventoryItem }>(
              "select data from public.character_inventory where character_id=$1 and data->>'catalog_id'='potion-healing'",
              [hero],
            )
          ).rows[0].data.quantity,
          0,
        );
        assert.equal(
          (
            await db.query<{ data: InventoryItem }>(
              "select data from public.character_inventory where character_id=$1 and data->>'catalog_id'='plate'",
              [hero],
            )
          ).rows[0].data.equipped,
          false,
        );
        await assert.rejects(
          save({
            ...s,
            spells: [spell('Detect Magic', 'wizard'), spell('Detect Magic', 'wizard')],
          }),
          /já está|duplicate key/i,
        );
      },
    );
    await t.test(
      'feature approval, player healing and retries consume exactly one use',
      async () => {
        await prepare({ ...make([{ class_id: 'fighter', level: 5 }]), hp_current: 1 });
        const client = randomUUID(),
          r = await request(
            { kind: 'feature', feature_id: 'fighter:second-wind' },
            actor.id,
            player,
            client,
          );
        assert.equal(
          (
            await request(
              { kind: 'feature', feature_id: 'fighter:second-wind' },
              actor.id,
              player,
              client,
            )
          ).id,
          r.id,
        );
        assert.equal(r.definition.dice, '1d10+5');
        assert.equal((await data()).feature_uses?.['fighter:second-wind'] ?? 0, 0);
        await assert.rejects(
          as(player, () => db.query('select public.approve_battle_action($1,true)', [r.id])),
          /mestre/i,
        );
        const q = await approve(r.id);
        assert.equal(q.status, 'approved');
        assert.equal((await data()).hp_current, 1);
        assert.equal((await data()).feature_uses?.['fighter:second-wind'], 1);
        await assert.rejects(roll(r.id, stranger), /não pode/i);
        const done = await roll(r.id);
        assert.equal((await data()).hp_current, 1 + done.resolution.roll!);
        await roll(r.id);
        await approve(r.id);
        assert.equal((await data()).feature_uses?.['fighter:second-wind'], 1);
        await start();
        await assert.rejects(
          request({ kind: 'feature', feature_id: 'fighter:second-wind' }),
          /usos/i,
        );
      },
    );
    await t.test(
      'Action Surge adds an action without discarding Extra Attack or creating a bonus action',
      async () => {
        const sword = item('longsword');
        await prepare({ ...make([{ class_id: 'fighter', level: 5 }]), inventory: [sword] });
        const hit = await request(attack(sword.id));
        await approve(hit.id);
        await roll(hit.id);
        assert.equal((await token()).attacks_remaining, 1);
        const surge = await request({ kind: 'feature', feature_id: 'fighter:action-surge' });
        await approve(surge.id);
        assert.equal((await token()).extra_actions, 1);
        assert.equal((await token()).attacks_remaining, 1);
        assert.equal((await token()).bonus_used, false);
        const dodge = await request({ kind: 'dodge' });
        await approve(dodge.id);
        assert.equal((await token()).extra_actions, 0);
        assert.equal((await token()).attacks_remaining, 1);
        const second = await request(attack(sword.id));
        await approve(second.id);
        await roll(second.id);
        assert.equal((await token()).attacks_remaining, 0);
        await assert.rejects(
          request({ kind: 'feature', feature_id: 'fighter:action-surge' }),
          /turno|usos/i,
        );
      },
    );
    await t.test(
      'Rage modifies melee damage, blocks casting, resists physical damage and preserves movement',
      async () => {
        const sword = item('longsword'),
          magic = spell('Magic Missile', 'wizard');
        const s = {
          ...make([
            { class_id: 'barbarian', level: 5 },
            { class_id: 'wizard', level: 3 },
          ]),
          inventory: [sword],
          spells: [magic],
        };
        await prepare(s);
        const rage = await request({ kind: 'feature', feature_id: 'barbarian:rage' });
        await approve(rage.id);
        assert.equal((await token()).raging, true);
        assert.equal((await token()).movement_remaining, (await token()).movement_speed);
        await assert.rejects(request(cast(magic, 1)), /Fúria/i);
        const hit = await request(attack(sword.id));
        assert.equal(hit.definition.dice, weaponEffect(sword, s, {}, true).dice);
        await approve(hit.id);
        await roll(hit.id);
        await as(gm, () =>
          db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
        );
        assert.equal((await token()).raging, true);
        const before = (await data()).hp_current;
        const incoming = await request(attack(npcAttack, {}, await token()), enemy.id, gm);
        await approve(incoming.id);
        const done = await roll(incoming.id, gm);
        assert.equal((await data()).hp_current, before - Math.floor(done.resolution.roll! / 2));
        await as(gm, () =>
          db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
        );
        const end = await request({ kind: 'feature', feature_id: 'barbarian:end-rage' });
        await approve(end.id);
        assert.equal((await token()).raging, false);
        const casted = await request(cast(magic, 1));
        await approve(casted.id);
        await roll(casted.id);
        await prepare({
          ...make([{ class_id: 'barbarian', level: 1 }]),
          inventory: [item('plate', { equipped: true })],
        });
        await assert.rejects(
          request({ kind: 'feature', feature_id: 'barbarian:rage' }),
          /armadura pesada/i,
        );
      },
    );
    await t.test(
      'Sneak Attack is conditional, uses rogue levels and criticals double dice without doubling attributes',
      async () => {
        const dagger = item('dagger');
        const s = {
          ...make([
            { class_id: 'rogue', level: 5 },
            { class_id: 'fighter', level: 5 },
          ]),
          inventory: [dagger],
        };
        await prepare(s);
        const hit = await request(attack(dagger.id, { sneak: true }));
        assert.equal(hit.definition.dice, '1d4+3+3d6');
        const q = await approve(hit.id, true, { critical: true });
        assert.equal(q.resolution.required_dice, '2d4+3+6d6');
        await roll(hit.id);
        assert.equal((await token()).sneak_used, true);
        assert.equal((await token()).attacks_remaining, 1);
        await assert.rejects(request(attack(dagger.id, { sneak: true })), /Furtivo/i);
        const other = await request(attack(dagger.id));
        await approve(other.id);
        await roll(other.id);
      },
    );
    await t.test(
      'Divine Smite consumes the chosen pool and damage types keep radiant damage outside Rage resistance',
      async () => {
        const sword = item('longsword');
        const s = {
          ...make([
            { class_id: 'paladin', level: 2 },
            { class_id: 'warlock', level: 5 },
          ]),
          inventory: [sword],
        };
        await prepare(s);
        await db.query(
          "update public.battle_map_tokens set faction='enemy',raging=true,rage_started_round=1,rage_checked_at=now(),x=3 where id=$1",
          [target.id],
        );
        await db.query('update public.battle_map_tokens set x=5 where id=$1', [enemy.id]);
        await db.query(
          'update public.characters set system_data=system_data||\'{"hp_current":100,"hp_temp":0}\' where id=$1',
          [defender],
        );
        const victim = await token(target.id),
          hit = await request(attack(sword.id, { smite_level: 3, smite_kind: 'pact' }, victim));
        assert.equal(hit.definition.dice, '1d8+3+4d8');
        await approve(hit.id);
        assert.equal((await data()).pact_slots_used, 1);
        const done = await roll(hit.id),
          terms = done.resolution.dice_roll!.terms;
        assert.equal(
          (await data(defender)).hp_current,
          100 - Math.floor((terms[0].subtotal + terms[1].subtotal) / 2) - terms[2].subtotal,
        );
        await roll(hit.id);
        assert.equal((await data()).pact_slots_used, 1);
      },
    );
    await t.test(
      'potions use their own dice, apply HP once and do not consume on a rejected attempt',
      async () => {
        const potion = item('potion-healing', { quantity: 2 });
        await prepare({
          ...make([{ class_id: 'fighter', level: 1 }]),
          hp_current: 5,
          inventory: [potion],
        });
        await db.query(
          'update public.battle_sessions set failed_actions_consume=false where id=$1',
          [map.battle_session_id],
        );
        const payload = {
          kind: 'item',
          source_id: potion.id,
          target: { x: 2, y: 2 },
          target_ids: [actor.id],
        };
        const rejected = await request(payload);
        await approve(rejected.id, false);
        const inventory = async () =>
          (
            await db.query<{ data: InventoryItem }>(
              'select data from public.character_inventory where id=$1',
              [potion.id],
            )
          ).rows[0].data;
        assert.equal((await inventory()).quantity, 2);
        const hit = await request(payload);
        assert.equal(hit.definition.dice, '2d4+2');
        await approve(hit.id);
        assert.equal((await data()).hp_current, 5);
        assert.equal((await inventory()).quantity, 1);
        const done = await roll(hit.id);
        assert.equal((await data()).hp_current, 5 + done.resolution.roll!);
        await roll(hit.id);
        assert.equal((await inventory()).quantity, 1);
        await start();
        const second = await request(payload);
        await approve(second.id);
        await roll(second.id);
        assert.equal((await inventory()).quantity, 0);
        await start();
        await assert.rejects(request(payload), /esgotado/i);
      },
    );
    await t.test(
      'ammunition, charged kits and monk ki spend the right unit and never spend ordinary movement as an action',
      async () => {
        const bow = item('shortbow'),
          arrows = item('arrow', { quantity: 1 });
        await prepare({
          ...make([{ class_id: 'fighter', level: 5, choices: { style: ['archery'] } }]),
          inventory: [bow, arrows],
        });
        const hit = await request(attack(bow.id));
        assert.equal(hit.definition.attackBonus, 7);
        await approve(hit.id);
        await roll(hit.id);
        assert.equal(
          (
            await db.query<{ data: InventoryItem }>(
              'select data from public.character_inventory where id=$1',
              [arrows.id],
            )
          ).rows[0].data.quantity,
          0,
        );
        await assert.rejects(request(attack(bow.id)), /munição/i);
        const kit = item('healers-kit', { quantity: 2, charges_used: 9 });
        await prepare({ ...make([{ class_id: 'fighter', level: 1 }]), inventory: [kit] });
        await db.query('update public.battle_map_tokens set x=3 where id=$1', [target.id]);
        await db.query('update public.battle_map_tokens set x=5 where id=$1', [enemy.id]);
        await db.query(
          'update public.characters set system_data=system_data||\'{"hp_current":0,"death_failures":2}\' where id=$1',
          [defender],
        );
        const stabilize = await request({
          kind: 'item',
          source_id: kit.id,
          target: { x: 3, y: 2 },
          target_ids: [target.id],
        });
        await approve(stabilize.id);
        assert.equal((await data(defender)).hp_current, 0);
        assert.equal((await data(defender)).death_failures, 0);
        assert.ok((await data(defender)).conditions.includes('Estável'));
        const stored = (
          await db.query<{ data: InventoryItem }>(
            'select data from public.character_inventory where id=$1',
            [kit.id],
          )
        ).rows[0].data;
        assert.equal(stored.quantity, 1);
        assert.equal(stored.charges_used, 0);
        const monk = make([
          { class_id: 'fighter', level: 10 },
          { class_id: 'monk', level: 2 },
        ]);
        await prepare(monk);
        for (let i = 0; i < 2; i++) {
          if (i) await start();
          const dash = await request({ kind: 'feature', feature_id: 'monk:dash' });
          await approve(dash.id);
          const a = await token();
          assert.equal(a.action_used, false);
          assert.equal(a.bonus_used, true);
          assert.equal(Number(a.movement_remaining), Number(a.movement_speed) * 2);
        }
        assert.equal((await data()).feature_uses?.['monk:ki'], 2);
        await start();
        await assert.rejects(request({ kind: 'feature', feature_id: 'monk:dodge' }), /usos/i);
      },
    );
    await t.test(
      'Life healing bonuses, Blessed Healer and Supreme Healing apply to actual HP and keep class origin',
      async () => {
        const cure = spell('Cure Wounds', 'cleric');
        let s = {
          ...make([
            { class_id: 'cleric', level: 6, subclass_id: 'life' },
            { class_id: 'wizard', level: 2 },
          ]),
          hp_current: 5,
          spells: [cure],
        };
        await prepare(s);
        await db.query('update public.battle_map_tokens set x=3 where id=$1', [target.id]);
        await db.query('update public.battle_map_tokens set x=5 where id=$1', [enemy.id]);
        await db.query(
          'update public.characters set system_data=system_data||\'{"hp_current":1}\' where id=$1',
          [defender],
        );
        const hit = await request(cast(cure, 2, await token(target.id)));
        assert.equal(hit.definition.dice, characterSpellEffect(s, cure, 2).dice);
        await approve(hit.id);
        const done = await roll(hit.id);
        assert.equal((await data()).hp_current, 9);
        assert.equal((await data(defender)).hp_current, 1 + done.resolution.roll!);
        s = {
          ...make([{ class_id: 'cleric', level: 17, subclass_id: 'life' }]),
          hp_current: 5,
          spells: [cure],
        };
        await prepare(s);
        await db.query('update public.battle_map_tokens set x=3 where id=$1', [target.id]);
        await db.query('update public.battle_map_tokens set x=5 where id=$1', [enemy.id]);
        await db.query(
          'update public.characters set system_data=system_data||\'{"hp_current":1}\' where id=$1',
          [defender],
        );
        const max = await request(cast(cure, 2, await token(target.id)));
        assert.equal(max.definition.dice, '8+8+3+4');
        const applied = await approve(max.id);
        assert.equal(applied.status, 'success');
        assert.equal((await data(defender)).hp_current, 24);
      },
    );
  } finally {
    await db.close();
  }
});

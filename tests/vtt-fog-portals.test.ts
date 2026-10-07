import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { SPELL_CATALOG, spellFromCatalog } from '../src/systems/dnd5e/spell-catalog';
import { defaultSheet } from '../src/systems/dnd5e';
import {
  SCENERY,
  makeScenery,
  normalizePortalCode,
  portalForToken,
  sceneryMovementCells,
  sceneryAppearance,
  sceneryLabel,
  SCENERY_VARIANTS,
} from '../src/features/vtt/scenery';
import { brushCells, terrainPreview } from '../src/features/vtt/terrain-brush';
import { areaHidden, fogCells } from '../src/features/vtt/fog';
import { calculateMovementCost } from '../src/features/vtt/movement';
import type { BattleMap, BattleMapObject, BattleToken } from '../src/features/vtt/types';

test('fog brushes clip to the board and test complete creature footprints', () => {
  assert.deepEqual(fogCells({ width: 4, height: 3 }, { x: 3, y: 2 }, 8), [{ x: 3, y: 2 }]);
  const fog = [{ id: 'fog', map_id: 'map', x: 2, y: 2 }];
  assert.equal(areaHidden(fog, { x: 1, y: 1, size: 2 }), true);
  assert.equal(areaHidden(fog, { x: 0, y: 0, size: 1 }), false);
  assert.equal(normalizePortalCode(' forest-01 '), 'FOREST-01');
});
test('every new scenery kind has a footprint; water remains traversable with one shared cost', () => {
  for (const kind of ['tent', 'road', 'cart', 'ice', 'pit', 'portal', 'rock'])
    assert.ok(SCENERY.some((s) => s.id === kind));
  const object = {
    ...makeScenery(
      'map',
      { x: 0, y: 0 },
      { kind: 'water', width: 5, height: 3, rotation: 0, blocks: false, cost: 2 },
    ),
    id: 'lake',
    created_at: '',
    updated_at: '',
  } as BattleMapObject;
  const cells = sceneryMovementCells([], [object, { ...object, id: 'lake2' }]);
  const token = { id: 'hero', x: 0, y: 1, size: 1, z: 0 } as BattleToken;
  const result = calculateMovementCost({
    from: token,
    to: { x: 4, y: 1 },
    width: 5,
    height: 3,
    cells,
    tokens: [token],
    movingTokenId: token.id,
    rules: { diagonalRule: 'one' },
    maxCost: 8,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.cost, 8);
  assert.equal(result.path.at(-1)?.x, 4);
  const gate = {
    ...object,
    object_type: 'portal',
    geometry: { x: 0, y: 0, width: 2, height: 2, rotation: 0 },
  };
  assert.equal(portalForToken([gate], { x: 0, y: 0, size: 2 })?.id, gate.id);
  assert.equal(portalForToken([gate], { x: 1, y: 1, size: 2 }), null);
});

test('terrain brush previews clip rectangles and appearance preserves portal mechanics', () => {
  assert.equal(brushCells({ width: 20, height: 20 }, { x: 18, y: 19 }, 16, 16).length, 2);
  assert.equal(
    terrainPreview({ width: 20, height: 20 }, { x: 0, y: 0 }, 'blocked', 4, 3)?.cells.length,
    12,
  );
  assert.equal(terrainPreview({ width: 20, height: 20 }, { x: 0, y: 0 }, 'move'), null);
  assert.deepEqual(brushCells({ width: 20, height: 20 }, { x: -1, y: 0 }, 4, 4), []);
  const appearance = sceneryAppearance(
    { kind: 'portal', variant: 'door', color: '#FF7788' },
    { portal_code: 'A', movement_cost: 1 },
  );
  assert.equal(appearance.color, '#ff7788');
  assert.equal(appearance.portal_code, 'A');
  assert.equal(
    sceneryAppearance({ kind: 'ice', variant: 'ship', color: 'red' }).variant,
    'default',
  );
  assert.ok(
    !('color' in sceneryAppearance({ kind: 'ice', variant: 'snow' }, { color: '#ff7788' })),
  );
  assert.equal(sceneryLabel({ object_type: 'ice', metadata: { variant: 'snow' } }), 'Neve');
});

test('PostgreSQL enforces fog privacy, editing locks, portal pairs and persistent combat budgets', async (t) => {
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
      outsider = randomUUID(),
      campaign = randomUUID(),
      hero = randomUUID(),
      npc = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'gm@v12.test'),($2,'player@v12.test'),($3,'outsider@v12.test')",
      [gm, player, outsider],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,'00000000-0000-4000-8000-000000000001','V12')",
      [campaign, gm],
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
    const fireballId = randomUUID();
    await as(player, () =>
      db.query('select public.save_character($1::jsonb)', [
        JSON.stringify({
          id: hero,
          campaign_id: campaign,
          owner_id: player,
          rpg_system_id: '00000000-0000-4000-8000-000000000001',
          name: 'Explorador',
          sheet: {
            ...defaultSheet(),
            class_id: 'wizard',
            level: 5,
            spells: [
              {
                ...spellFromCatalog(
                  SPELL_CATALOG.find((s) => s.id === 'bola-de-fogo')!,
                  fireballId,
                  'wizard',
                ),
                prepared: true,
              },
            ],
            hp_current: 60,
            hp_max_override: 60,
          },
        }),
      ]),
    );
    await as(gm, () =>
      db.query(
        "select public.start_campaign_session((public.save_campaign_session($1,'Teste',1)).id)",
        [campaign],
      ),
    );
    const create = (name: string) =>
      as(gm, () =>
        db.query<{ m: BattleMap }>('select to_jsonb(public.create_battle_map($1,$2)) m', [
          campaign,
          JSON.stringify({ name, width: 20, height: 20, scale_per_cell: 1.5 }),
        ]),
      ).then((r) => r.rows[0].m);
    const map = await create('Floresta'),
      map2 = await create('Caverna');
    let actor = (
      await as(gm, () =>
        db.query<{ t: BattleToken }>(
          'select to_jsonb(public.add_character_to_battle_map($1,$2,2,2)) t',
          [map.id, hero],
        ),
      )
    ).rows[0].t;
    await db.query(
      "insert into public.npcs(id,campaign_id,rpg_system_id,name,relationship,visible_to_players) values($1,$2,'00000000-0000-4000-8000-000000000001','Guardião oculto','Neutro',true)",
      [npc, campaign],
    );
    await db.query('insert into public.npc_stats(npc_id,hp_current,hp_max) values($1,80,80)', [
      npc,
    ]);
    const enemy = (
      await as(gm, () =>
        db.query<{ t: BattleToken }>(
          "select to_jsonb(public.add_npc_to_battle_map($1,$2,9,'m',6,4)) t",
          [map.id, npc],
        ),
      )
    ).rows[0].t;
    const token = async () => {
      actor = (
        await db.query<BattleToken>('select * from public.battle_map_tokens where id=$1', [
          actor.id,
        ])
      ).rows[0];
      return actor;
    };
    const add = (kind: string, x: number, y: number, w = 1, h = 1, code = 'A', mapId = map.id) =>
      as(gm, () =>
        db.query<{ o: BattleMapObject }>(
          'insert into public.battle_map_objects(map_id,object_type,geometry,metadata,blocks_movement) values($1,$2,$3,$4,$5) returning to_jsonb(battle_map_objects) o',
          [
            mapId,
            kind,
            JSON.stringify({ x, y, width: w, height: h, rotation: 0 }),
            JSON.stringify({ movement_cost: kind === 'water' ? 2 : 1, portal_code: code }),
            !['road', 'ice', 'portal', 'water', 'fire'].includes(kind),
          ],
        ),
      ).then((r) => r.rows[0].o);
    const fog = (hidden: boolean, x = 5, y = 3, size = 3, user = gm) =>
      as(user, () =>
        db.query('select public.set_battle_fog($1,$2,$3,$4,$4,$5)', [map.id, x, y, size, hidden]),
      );
    const start = () =>
      as(gm, () =>
        db.query('select public.start_battle_combat($1,$2)', [
          map.battle_session_id,
          JSON.stringify([
            { token_id: actor.id, initiative: 20 },
            { token_id: enemy.id, initiative: 10 },
          ]),
        ]),
      );
    const end = () =>
      as(gm, () => db.query('select public.end_battle_combat($1)', [map.battle_session_id]));
    await t.test(
      'the complete workshop catalog agrees with PostgreSQL and material styles reject invalid values',
      async () => {
        for (const kind of SCENERY) {
          assert.equal(
            (
              await db.query<{ valid: boolean }>(
                'select private.battle_is_scenery_kind($1) valid',
                [kind.id],
              )
            ).rows[0].valid,
            true,
          );
          for (const variant of SCENERY_VARIANTS[kind.id] ?? [])
            assert.equal(
              (
                await db.query<{ valid: boolean }>(
                  'select private.battle_valid_scenery_variant($1,$2) valid',
                  [kind.id, variant.id],
                )
              ).rows[0].valid,
              true,
            );
        }
        const floor = (
          await as(gm, () =>
            db.query<{ id: string }>(
              'insert into public.battle_map_objects(map_id,object_type,geometry,metadata) values($1,\'floor\',\'{"x":1,"y":1,"width":1,"height":1,"rotation":0}\',\'{"variant":"tile","style":"village","movement_cost":1}\') returning id',
              [map.id],
            ),
          )
        ).rows[0];
        await assert.rejects(
          as(gm, () =>
            db.query(
              'update public.battle_map_objects set metadata=metadata||\'{"style":"invalid"}\'::jsonb where id=$1',
              [floor.id],
            ),
          ),
          /estilo válido/,
        );
        await as(gm, () =>
          db.query('delete from public.battle_map_objects where id=$1', [floor.id]),
        );
      },
    );
    const transit = (user = player, key: string = randomUUID(), portal: string) =>
      as(user, () =>
        db.query<{ t: BattleToken }>('select to_jsonb(public.use_battle_portal($1,$2,$3,$4)) t', [
          actor.id,
          portal,
          actor.version,
          key,
        ]),
      ).then((r) => r.rows[0].t);
    await t.test(
      'black fog conceals tokens, objects and terrain at the database boundary',
      async () => {
        await add('tent', 5, 4);
        await db.query(
          "insert into public.battle_map_cells(map_id,x,y,terrain_type,movement_cost) values($1,7,4,'secret',2)",
          [map.id],
        );
        await fog(true);
        await assert.rejects(() => fog(false, 5, 3, 3, player));
        await assert.rejects(() => fog(false, 5, 3, 3, outsider));
        assert.equal(
          (
            await as(player, () =>
              db.query('select * from public.battle_map_tokens where id=$1', [enemy.id]),
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await as(gm, () =>
              db.query('select * from public.battle_map_tokens where id=$1', [enemy.id]),
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (await as(player, () => db.query('select * from public.battle_map_objects'))).rows.length,
          0,
        );
        assert.equal(
          (await as(player, () => db.query('select * from public.battle_map_cells'))).rows.length,
          0,
        );
        assert.equal(
          (await as(player, () => db.query('select * from public.battle_map_fog'))).rows.length,
          9,
        );
        assert.equal(
          (await as(outsider, () => db.query('select * from public.battle_map_fog'))).rows.length,
          0,
        );
      },
    );
    await t.test(
      'active combat blocks every scene edit while GM reveal stays available',
      async () => {
        await start();
        await assert.rejects(() => add('road', 9, 9), /Encerre o combate/);
        await assert.rejects(() => fog(true, 10, 10), /Encerre o combate/);
        await assert.rejects(
          () =>
            as(gm, () =>
              db.query('insert into public.battle_map_cells(map_id,x,y) values($1,10,10)', [
                map.id,
              ]),
            ),
          /Encerre o combate/,
        );
        await assert.rejects(
          () =>
            as(gm, () =>
              db.query('update public.battle_maps set background_scale=2 where id=$1', [map.id]),
            ),
          /Encerre o combate/,
        );
        await assert.rejects(
          () =>
            as(gm, () =>
              db.query('delete from public.battle_map_objects where map_id=$1', [map.id]),
            ),
          /Encerre o combate/,
        );
        await fog(false);
        assert.equal(
          (
            await as(player, () =>
              db.query('select * from public.battle_map_tokens where id=$1', [enemy.id]),
            )
          ).rows.length,
          1,
        );
        await end();
      },
    );
    await t.test(
      'independent and orphan active sessions do not lock a preparing or ended map',
      async () => {
        const separate = await create('Combate independente');
        const separateActor = (
          await as(gm, () =>
            db.query<{ t: BattleToken }>(
              "select to_jsonb(public.add_npc_to_battle_map($1,$2,9,'m',4,4)) t",
              [separate.id, npc],
            ),
          )
        ).rows[0].t;
        await add('portal', 3, 3, 1, 1, 'LIVE', separate.id);
        await as(gm, () =>
          db.query('insert into public.battle_sessions(campaign_id,name,status) values($1,$2,$3)', [
            campaign,
            'Sessão antiga sem mapa',
            'active',
          ]),
        );
        await as(gm, () =>
          db.query('select public.start_battle_combat($1,$2)', [
            separate.battle_session_id,
            JSON.stringify([{ token_id: separateActor.id, initiative: 12 }]),
          ]),
        );
        for (const status of ['preparing', 'ended']) {
          await db.query('update public.battle_sessions set status=$1 where id=$2', [
            status,
            map.battle_session_id,
          ]);
          await add('road', status === 'preparing' ? 14 : 15, 14);
          await fog(true, 16, 16, 1);
          await fog(false, 16, 16, 1);
          await as(gm, () =>
            db.query('update public.battle_maps set background_scale=$1 where id=$2', [
              status === 'preparing' ? 1.1 : 1,
              map.id,
            ]),
          );
        }
        await assert.rejects(
          () => add('road', 12, 12, 1, 1, 'X', separate.id),
          /Encerre o combate/,
        );
        await assert.rejects(() => add('portal', 17, 17, 1, 1, 'LIVE'), /nos dois mapas/);
        assert.equal(
          (await db.query<BattleMap>('select * from public.battle_maps where id=$1', [map.id]))
            .rows[0].battle_session_id,
          map.battle_session_id,
        );
        assert.equal(
          (
            await db.query(
              'select * from public.battle_map_objects where object_type=$1 and metadata->>$2=$3',
              ['portal', 'portal_code', 'LIVE'],
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query<{ status: string }>(
              'select status from public.battle_sessions where id=$1',
              [separate.battle_session_id],
            )
          ).rows[0].status,
          'active',
        );
        await as(gm, () =>
          db.query('select public.end_battle_combat($1)', [separate.battle_session_id]),
        );
      },
    );
    await t.test(
      'area damage affects concealed NPCs without leaking identities or target counts',
      async () => {
        await fog(true);
        await start();
        await token();
        await assert.rejects(
          () =>
            as(player, () =>
              db.query('select public.request_battle_action($1,$2,$3)', [
                actor.id,
                JSON.stringify({
                  kind: 'spell',
                  source_id: fireballId,
                  resource_kind: 'slot',
                  resource_level: 3,
                  target: { x: 6, y: 4 },
                  target_ids: [enemy.id],
                }),
                randomUUID(),
              ]),
            ),
          /visível/,
        );
        const r = (
          await as(player, () =>
            db.query<{ r: { id: string } }>(
              'select to_jsonb(public.request_battle_action($1,$2,$3)) r',
              [
                actor.id,
                JSON.stringify({
                  kind: 'spell',
                  source_id: fireballId,
                  resource_kind: 'slot',
                  resource_level: 3,
                  target: { x: 6, y: 4 },
                  target_ids: [],
                }),
                randomUUID(),
              ],
            ),
          )
        ).rows[0].r;
        await as(gm, () => db.query("select public.approve_battle_action($1,true,'{}')", [r.id]));
        const resolved = (
          await as(player, () =>
            db.query<{ r: { resolution: { count: number; affected: unknown[] } } }>(
              'select to_jsonb(public.roll_approved_battle_action($1,$2)) r',
              [r.id, randomUUID()],
            ),
          )
        ).rows[0].r;
        assert.equal(resolved.resolution.count, 0);
        assert.deepEqual(resolved.resolution.affected, []);
        assert.ok(!JSON.stringify(resolved.resolution).includes(enemy.id));
        const hp = (
          await db.query<{ hp: number }>(
            'select hp_current hp from public.npc_stats where npc_id=$1',
            [npc],
          )
        ).rows[0].hp;
        assert.ok(Number(hp) < 80);
        await fog(false);
        await end();
      },
    );
    let a: BattleMapObject, b: BattleMapObject;
    await t.test(
      'new elements, variants and colors enforce collision, privacy and valid metadata',
      async () => {
        const created: BattleMapObject[] = [];
        for (const [x, kind] of [
          'barrel',
          'campfire',
          'boat',
          'bush',
          'flowers',
          'statue',
          'chest',
        ].entries()) {
          const o = await add(kind, x, 15);
          created.push(o);
          const variant =
            SCENERY_VARIANTS[kind as keyof typeof SCENERY_VARIANTS]?.[0]?.id ?? 'default';
          await as(gm, () =>
            db.query(
              'update public.battle_map_objects set metadata=metadata || $1::jsonb where id=$2',
              [JSON.stringify({ variant, color: '#AB7755' }), o.id],
            ),
          );
          const saved = (
            await db.query<BattleMapObject>('select * from public.battle_map_objects where id=$1', [
              o.id,
            ])
          ).rows[0];
          assert.equal(saved.metadata.color, '#ab7755');
          assert.equal(saved.metadata.variant, variant);
        }
        await assert.rejects(
          () =>
            as(gm, () =>
              db.query(
                'update public.battle_map_objects set metadata=metadata || $1::jsonb where id=$2',
                [JSON.stringify({ variant: 'snow' }), created[0].id],
              ),
            ),
          /Variante inválida/,
        );
        await assert.rejects(
          () =>
            as(gm, () =>
              db.query(
                'update public.battle_map_objects set metadata=metadata || $1::jsonb where id=$2',
                [JSON.stringify({ color: 'url(unsafe)' }), created[0].id],
              ),
            ),
          /Cor inválida/,
        );
        await assert.rejects(
          () => db.query('update public.battle_map_tokens set x=0,y=15 where id=$1', [actor.id]),
          /bloqueada por um objeto/,
        );
        await as(gm, () => db.query('select public.set_battle_fog($1,0,15,8,1,true)', [map.id]));
        assert.equal(
          (
            await as(player, () =>
              db.query('select * from public.battle_map_objects where id=any($1::uuid[])', [
                created.map((o) => o.id),
              ]),
            )
          ).rows.length,
          0,
        );
        await as(gm, () => db.query('select public.set_battle_fog($1,0,15,8,1,false)', [map.id]));
      },
    );
    await t.test(
      'terrain rectangles and scene erasing are atomic, clipped and GM-only',
      async () => {
        const paint = (
          x: number,
          y: number,
          w: number,
          h: number,
          type = 'difficult',
          cost = 2,
          blocked = false,
          user = gm,
        ) =>
          as(user, () =>
            db.query<{ n: number }>(
              'select public.paint_battle_terrain($1,$2,$3,$4,$5,$6,$7,$8) n',
              [map.id, x, y, w, h, type, cost, blocked],
            ),
          );
        const erase = (user = gm) =>
          as(user, () =>
            db.query<{ n: number }>('select public.erase_battle_scenery($1,0,15,2,1) n', [map.id]),
          );
        assert.equal((await paint(10, 17, 5, 5)).rows[0].n, 15);
        assert.equal((await paint(10, 18, 5, 5, 'normal', 1)).rows[0].n, 10);
        assert.equal((await paint(15, 16, 2, 2, 'lama', 3.5)).rows[0].n, 4);
        assert.equal((await paint(12, 12, 2, 2, 'blocked', 1, true)).rows[0].n, 4);
        await assert.rejects(() => paint(1, 1, 8, 8, 'blocked', 1, true), /bloqueia um personagem/);
        assert.equal(
          (
            await db.query(
              'select * from public.battle_map_cells where map_id=$1 and x=1 and y=1',
              [map.id],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          () => paint(10, 17, 5, 5, 'difficult', 2, false, player),
          /Somente o mestre/,
        );
        await assert.rejects(() => erase(outsider), /Somente o mestre/);
        await assert.rejects(() => paint(10, 17, 17, 1), /Pincel inválido/);
        await paint(0, 15, 2, 1, 'lama', 3);
        assert.equal((await erase()).rows[0].n, 2);
        assert.equal(
          (
            await db.query(
              'select * from public.battle_map_cells where map_id=$1 and x=0 and y=15',
              [map.id],
            )
          ).rows.length,
          1,
        );
        await as(gm, () =>
          db.query('delete from public.battle_map_objects where map_id=$1 and object_type=$2', [
            map.id,
            'boat',
          ]),
        );
        await start();
        await assert.rejects(() => paint(10, 17, 2, 2), /Encerre o combate/);
        await assert.rejects(() => erase(), /Encerre o combate/);
        await assert.rejects(
          () =>
            as(gm, () =>
              db.query('delete from public.battle_map_objects where map_id=$1 and object_type=$2', [
                map.id,
                'chest',
              ]),
            ),
          /Encerre o combate/,
        );
        await end();
      },
    );
    await t.test(
      'new objects persist, water covers traversable cells and portal codes stop at two endpoints',
      async () => {
        for (const [i, k] of ['road', 'ice', 'cart', 'pit', 'rock', 'fire'].entries())
          await add(k, 10 + i, 10);
        await add('water', 1, 1, 4, 2);
        a = await add('portal', 2, 2, 1, 1, ' path_a ');
        b = await add('portal', 3, 3, 2, 2, 'PATH_A', map2.id);
        assert.equal(a.metadata.portal_code, 'PATH_A');
        assert.equal(a.blocks_movement, false);
        await assert.rejects(() => add('portal', 9, 12, 1, 1, 'PATH_A'), /já liga dois portais/);
        await assert.rejects(() => add('portal', 9, 12, 1, 1, 'invalid code!'), /Código do portal/);
        const linked = (
          await db.query<BattleMap>('select * from public.battle_maps where id=$1', [map.id])
        ).rows[0];
        // The existing endpoint belongs to map1, so the second map joins its encounter.
        assert.equal(linked.battle_session_id, map.battle_session_id);
        assert.equal(
          (await db.query<BattleMap>('select * from public.battle_maps where id=$1', [map2.id]))
            .rows[0].battle_session_id,
          map.battle_session_id,
        );
        await as(gm, () =>
          db.query(
            'update public.battle_map_objects set metadata=metadata || $1::jsonb where id=$2',
            [JSON.stringify({ variant: 'door', color: '#a27544' }), a.id],
          ),
        );
        await as(gm, () =>
          db.query(
            'update public.battle_map_objects set metadata=metadata || $1::jsonb where id=$2',
            [JSON.stringify({ variant: 'cave' }), b.id],
          ),
        );
      },
    );
    await t.test(
      'cross-map teleport is authorized, retry-safe and preserves turn, action and remaining movement',
      async () => {
        await start();
        await assert.rejects(() => add('road', 12, 12, 1, 1, 'X', map2.id), /Encerre o combate/);
        await assert.rejects(
          () =>
            as(gm, () => db.query('select public.set_battle_fog($1,10,10,1,1,true)', [map2.id])),
          /Encerre o combate/,
        );
        await assert.rejects(
          () =>
            as(gm, () =>
              db.query('update public.battle_maps set background_scale=2 where id=$1', [map2.id]),
            ),
          /Encerre o combate/,
        );
        await db.query(
          'update public.battle_map_tokens set movement_remaining=4.5,action_used=true where id=$1',
          [actor.id],
        );
        await token();
        await assert.rejects(() => transit(outsider, randomUUID(), a.id));
        const key = randomUUID(),
          before = { ...actor };
        const result = await transit(player, key, a.id);
        await token();
        assert.equal(result.map_id, map2.id);
        assert.equal(Number(result.movement_remaining), Number(before.movement_remaining));
        assert.equal(result.action_used, true);
        assert.equal(Number(result.version), Number(before.version) + 1);
        assert.equal(
          (
            await db.query<{ id: string }>(
              'select active_token_id id from public.battle_sessions where id=$1',
              [map.battle_session_id],
            )
          ).rows[0].id,
          actor.id,
        );
        const replay = await transit(player, key, a.id);
        assert.deepEqual(replay, result);
        assert.equal(Number((await token()).version), Number(result.version));
        const back = await transit(player, randomUUID(), b.id);
        assert.equal(back.map_id, map.id);
        await token();
        await end();
      },
    );
    await t.test(
      'concealed, occupied, too-small and distant portals cannot bypass travel checks',
      async () => {
        await as(gm, () => db.query('select public.set_battle_fog($1,3,3,2,2,true)', [map2.id]));
        await token();
        await assert.rejects(() => transit(player, randomUUID(), a.id), /revelar a saída/);
        await as(gm, () => db.query('select public.set_battle_fog($1,3,3,2,2,false)', [map2.id]));
        await db.query('update public.battle_map_tokens set map_id=$1,x=3,y=3,size=2 where id=$2', [
          map2.id,
          enemy.id,
        ]);
        await assert.rejects(() => transit(player, randomUUID(), a.id), /bloqueada, ocupada/);
        await db.query('update public.battle_map_tokens set map_id=$1,x=6,y=4,size=1 where id=$2', [
          map.id,
          enemy.id,
        ]);
        await as(gm, () =>
          db.query(
            `update public.battle_map_objects set geometry=geometry||'{"width":2,"height":2}' where id=$1`,
            [a.id],
          ),
        );
        await as(gm, () =>
          db.query(
            `update public.battle_map_objects set geometry=geometry||'{"width":1,"height":1}' where id=$1`,
            [b.id],
          ),
        );
        await db.query('update public.battle_map_tokens set size=2 where id=$1', [actor.id]);
        await token();
        await assert.rejects(() => transit(player, randomUUID(), a.id), /pequena demais/);
        await db.query('update public.battle_map_tokens set size=1 where id=$1', [actor.id]);
        await as(gm, () =>
          db.query(
            `update public.battle_map_objects set geometry=geometry||'{"width":1,"height":1}' where id=$1`,
            [a.id],
          ),
        );
        await as(gm, () =>
          db.query(
            `update public.battle_map_objects set geometry=geometry||'{"width":2,"height":2}' where id=$1`,
            [b.id],
          ),
        );
        await db.query('update public.battle_map_tokens set x=0,y=0 where id=$1', [actor.id]);
        await token();
        await assert.rejects(() => transit(player, randomUUID(), a.id), /dentro do portal/);
        await db.query('update public.battle_map_tokens set x=2,y=2 where id=$1', [actor.id]);
        await token();
        await start();
        await db.query('update public.battle_sessions set active_token_id=$1 where id=$2', [
          enemy.id,
          map.battle_session_id,
        ]);
        await token();
        await assert.rejects(() => transit(player, randomUUID(), a.id), /Aguarde o turno/);
        await end();
        const oldTrip = (
          await db.query<{ client_id: string }>(
            'select client_id from private.battle_portal_trips where token_id=$1 limit 1',
            [actor.id],
          )
        ).rows[0];
        await db.query('delete from public.campaign_members where campaign_id=$1 and user_id=$2', [
          campaign,
          player,
        ]);
        await assert.rejects(() => transit(player, randomUUID(), a.id), /não controla/);
        await assert.rejects(() => transit(player, oldTrip.client_id, a.id), /não controla/);
      },
    );
  } finally {
    await db.close();
  }
});

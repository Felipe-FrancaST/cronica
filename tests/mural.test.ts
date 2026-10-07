import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { muralPayload, sortMuralItems, type MuralItem } from '../src/features/mural/types';
import {
  SCENERY,
  SCENERY_VARIANTS,
  sceneryMatches,
  makeScenery,
  sceneryMovementCells,
} from '../src/features/vtt/scenery';
import type { BattleMapObject } from '../src/features/vtt/types';

const card = (overrides: Partial<MuralItem> = {}): MuralItem => ({
  id: randomUUID(),
  campaign_id: randomUUID(),
  kind: 'note',
  title: 'Uma pista',
  description: 'Uma história para os aventureiros.',
  image_path: null,
  source_location_id: null,
  source_npc_id: null,
  visible_to_players: false,
  pinned: false,
  sort_order: 0,
  created_at: '',
  updated_at: '',
  ...overrides,
});

test('mural payload contains only the presentation and rejects unsafe images or mismatched links', () => {
  const item = Object.assign(card({ title: '  Uma pista  ' }), {
    npc_stats: { hp_current: 100 },
    secrets: 'Não publicar',
    biography: 'Um segredo',
  });
  const payload = muralPayload(item);
  assert.equal(payload.title, 'Uma pista');
  for (const field of ['npc_stats', 'secrets', 'biography', 'created_at', 'updated_at'])
    assert.equal(field in payload, false);
  assert.throws(() => muralPayload(card({ title: ' ' })), /título/);
  assert.throws(() => muralPayload(card({ kind: 'image' })), /imagem/);
  assert.throws(() => muralPayload(card({ source_npc_id: randomUUID() })), /Vínculo/);
  assert.throws(
    () => muralPayload(card({ image_path: 'https://example.test/portrait.png' })),
    /imagem/,
  );
  assert.throws(() => muralPayload(card({ image_path: '/images/../secret.png' })), /imagem/);
  assert.throws(
    () => muralPayload(card({ image_path: 'data:image/svg+xml;base64,abc' }), true),
    /imagem/,
  );
  const data = card({ kind: 'image', image_path: 'data:image/png;base64,aGVsbG8=' });
  assert.throws(() => muralPayload(data), /imagem/);
  assert.equal(muralPayload(data, true).image_path, data.image_path);
});

test('mural ordering puts pinned cards first and never mutates the loaded list', () => {
  const first = card({ pinned: true, sort_order: 2 }),
    next = card({ sort_order: 0 });
  const input = [next, first];
  assert.deepEqual(
    sortMuralItems(input).map((i) => i.id),
    [first.id, next.id],
  );
  assert.equal(input[0], next);
});

test('expanded scenery supports accent-insensitive variant search and correct movement footprints', () => {
  assert.equal(SCENERY.length, 36);
  assert.equal(new Set(SCENERY.map((s) => s.id)).size, 36);
  assert.equal(Object.values(SCENERY_VARIANTS).flat().length, 71);
  assert.equal(sceneryMatches('mountain', 'NEVADA'), true);
  assert.equal(sceneryMatches('house', 'chale'), true);
  assert.equal(sceneryMatches('bush', 'deserto'), true);
  assert.equal(sceneryMatches('crops', 'aboboras'), true);
  assert.equal(sceneryMatches('cross', 'runica'), true);
  assert.equal(sceneryMatches('cart', 'montanha'), false);
  const object = (kind: 'house' | 'grass' | 'crops') => {
    const s = SCENERY.find((s) => s.id === kind)!;
    return {
      ...makeScenery(
        'map',
        { x: 0, y: 0 },
        {
          kind,
          width: 3,
          height: 2,
          rotation: 0,
          blocks: s.blocks,
          cost: s.cost,
        },
      ),
      id: kind,
      created_at: '',
      updated_at: '',
    } as BattleMapObject;
  };
  const house = sceneryMovementCells([], [object('house')]);
  assert.equal(house.length, 6);
  assert.ok(house.every((c) => c.blocked));
  assert.equal(sceneryMovementCells([], [object('grass')]).length, 0);
  const crops = sceneryMovementCells([], [object('crops')]);
  assert.equal(crops.length, 6);
  assert.ok(crops.every((c) => !c.blocked && c.movement_cost === 2));
});

test('PostgreSQL validates mural privacy, image permissions, conflicts and expanded scenery', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated nologin nosuperuser nobypassrls;
      create role anon nologin nosuperuser nobypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
      alter table storage.objects enable row level security;grant usage on schema storage to authenticated;
      grant select,insert,delete on storage.objects to authenticated;`);
    for (const file of migrationNames()
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(readMigration(file));
    const gm = randomUUID(),
      player = randomUUID(),
      outsider = randomUUID(),
      gm2 = randomUUID();
    const campaign = randomUUID(),
      foreign = randomUUID(),
      npc = randomUUID(),
      foreignNpc = randomUUID();
    const location = randomUUID(),
      foreignLocation = randomUUID(),
      system = '00000000-0000-4000-8000-000000000001';
    await db.query(
      "insert into auth.users(id,email) values($1,'gm@mural.test'),($2,'player@mural.test'),($3,'outside@mural.test'),($4,'gm2@mural.test')",
      [gm, player, outsider, gm2],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Mural'),($4,$5,$3,'Outra mesa')",
      [campaign, gm, system, foreign, gm2],
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      campaign,
      player,
    ]);
    await db.query(
      "insert into public.npcs(id,campaign_id,rpg_system_id,name,appearance,biography,visible_to_players) values($1,$2,$3,'Arauto','Um viajante de manto azul.','Identidade secreta',false),($4,$5,$3,'Outro NPC','','',false)",
      [npc, campaign, system, foreignNpc, foreign],
    );
    await db.query('insert into public.npc_stats(npc_id,hp_current,hp_max) values($1,90,90)', [
      npc,
    ]);
    await db.query(
      "insert into public.world_locations(id,campaign_id,name,description,visible_to_players) values($1,$2,'Taverna','Uma pousada na estrada.',false),($3,$4,'Outro local','',false)",
      [location, campaign, foreignLocation, foreign],
    );
    await db.query(
      "insert into public.world_locations_private(entry_id,secrets) values($1,'Passagem secreta')",
      [location],
    );
    const image = `npcs/${npc}/portrait.webp`,
      siblingImage = `npcs/${npc}/secret.webp`;
    await db.query(
      "insert into storage.objects(bucket_id,name) values('campaign-media',$1),('campaign-media',$2)",
      [image, siblingImage],
    );
    const asUser = async <T>(id: string, fn: () => Promise<T>) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      try {
        return await fn();
      } finally {
        await db.exec('reset role');
      }
    };
    await asUser(gm, () =>
      db.query(
        "select public.start_campaign_session((public.save_campaign_session($1,'Teste',1)).id)",
        [campaign],
      ),
    );
    const save = (item: MuralItem, expected: string | null = null, user = gm) =>
      asUser(user, () =>
        db.query<{ item: MuralItem }>(
          'select to_jsonb(public.save_campaign_mural_item($1::jsonb,$2::timestamptz)) item',
          [JSON.stringify(muralPayload(item)), expected],
        ),
      ).then((r) => r.rows[0].item);
    const load = (user: string) =>
      asUser(user, () =>
        db.query<MuralItem>('select * from public.campaign_mural_items order by sort_order'),
      );
    let portrait = await save(
      card({
        campaign_id: campaign,
        kind: 'npc',
        source_npc_id: npc,
        image_path: image,
        title: 'Um viajante',
        description: 'Um viajante de manto azul.',
      }),
    );
    let place = await save(
      card({
        campaign_id: campaign,
        kind: 'location',
        source_location_id: location,
        title: 'Taverna da estrada',
        visible_to_players: true,
      }),
    );
    await t.test(
      'drafts stay private; published presentation never grants the NPC sheet or local secrets',
      async () => {
        assert.equal((await load(gm)).rows.length, 2);
        assert.deepEqual(
          (await load(player)).rows.map((i) => i.id),
          [place.id],
        );
        assert.equal((await load(outsider)).rows.length, 0);
        await asUser(player, async () => {
          assert.equal(
            (await db.query('select * from public.npcs where id=$1', [npc])).rows.length,
            0,
          );
          assert.equal(
            (await db.query('select * from public.npc_stats where npc_id=$1', [npc])).rows.length,
            0,
          );
          assert.equal(
            (await db.query('select * from public.world_locations_private')).rows.length,
            0,
          );
          assert.equal(
            (await db.query('select * from storage.objects where name=$1', [image])).rows.length,
            0,
          );
        });
        await db.exec('set role anon');
        try {
          await assert.rejects(
            () => db.query('select * from public.campaign_mural_items'),
            /permission denied/,
          );
        } finally {
          await db.exec('reset role');
        }
      },
    );
    await t.test(
      'publishing grants exactly the portrait and the session journal retains its historical image',
      async () => {
        portrait = await save({ ...portrait, visible_to_players: true }, portrait.updated_at);
        await asUser(player, async () => {
          assert.deepEqual((await db.query('select name from storage.objects')).rows, [
            { name: image },
          ]);
          assert.equal(
            (await db.query('select * from public.npcs where id=$1', [npc])).rows.length,
            0,
          );
          assert.equal(
            (await db.query('select * from public.npc_stats where npc_id=$1', [npc])).rows.length,
            0,
          );
        });
        assert.equal((await load(player)).rows.length, 2);
        portrait = await save({ ...portrait, visible_to_players: false }, portrait.updated_at);
        assert.equal(
          (await asUser(player, () => db.query('select name from storage.objects'))).rows.length,
          1,
        );
        portrait = await save({ ...portrait, visible_to_players: true }, portrait.updated_at);
      },
    );
    await t.test(
      'players and other masters cannot write cards, reorder the board, or change its revision',
      async () => {
        await assert.rejects(
          () => save({ ...place, title: 'Invadido' }, place.updated_at, player),
          /Somente o mestre/,
        );
        await assert.rejects(
          () => save({ ...place, title: 'Invadido' }, place.updated_at, gm2),
          /Somente o mestre/,
        );
        await asUser(player, async () => {
          assert.equal(
            (
              await db.query(
                "update public.campaign_mural_items set title='Invadido' where id=$1 returning id",
                [place.id],
              )
            ).rows.length,
            0,
          );
          assert.equal(
            (
              await db.query('delete from public.campaign_mural_items where id=$1 returning id', [
                place.id,
              ])
            ).rows.length,
            0,
          );
          await assert.rejects(
            () =>
              db.query('select public.reorder_campaign_mural($1,$2::uuid[])', [
                campaign,
                [place.id, portrait.id],
              ]),
            /Somente o mestre/,
          );
          await assert.rejects(
            () => db.query('update public.campaign_mural_states set revision=0'),
            /permission denied/,
          );
        });
        assert.equal(
          (await asUser(outsider, () => db.query('select * from public.campaign_mural_states')))
            .rows.length,
          0,
        );
      },
    );
    await t.test(
      'links and images cannot cross campaigns, and direct writes keep immutable identity',
      async () => {
        for (const item of [
          card({ campaign_id: campaign, kind: 'npc', source_npc_id: foreignNpc }),
          card({ campaign_id: campaign, kind: 'location', source_location_id: foreignLocation }),
          card({ campaign_id: campaign, image_path: `npcs/${foreignNpc}/portrait.webp` }),
          card({ campaign_id: campaign, image_path: `campaign_mural/${foreign}/portrait.webp` }),
        ])
          await assert.rejects(() => save(item), /não pertence|desta campanha/);
        await asUser(gm, async () => {
          await assert.rejects(
            () =>
              db.query('update public.campaign_mural_items set id=$1 where id=$2', [
                randomUUID(),
                place.id,
              ]),
            /vínculo/,
          );
          await assert.rejects(
            () =>
              db.query('update public.campaign_mural_items set campaign_id=$1 where id=$2', [
                foreign,
                place.id,
              ]),
            /vínculo/,
          );
          await assert.rejects(
            () =>
              db.query(
                "update public.campaign_mural_items set image_path='https://example.test/portrait.png' where id=$1",
                [place.id],
              ),
            /imagem/,
          );
        });
      },
    );
    await t.test(
      'optimistic saves, deletes and full-list ordering reject stale requests atomically',
      async () => {
        const old = place.updated_at;
        place = await save({ ...place, description: 'Atualizada' }, old);
        await assert.rejects(
          () => save({ ...place, description: 'Sobrescrita' }, old),
          /outra janela/,
        );
        await asUser(gm, async () => {
          await assert.rejects(
            () => db.query('select public.delete_campaign_mural_item($1,$2)', [place.id, old]),
            /outra janela/,
          );
          for (const ids of [[place.id], [place.id, place.id], [place.id, randomUUID()]])
            await assert.rejects(
              () =>
                db.query('select public.reorder_campaign_mural($1,$2::uuid[])', [campaign, ids]),
              /mural mudou/,
            );
          await db.query('select public.reorder_campaign_mural($1,$2::uuid[])', [
            campaign,
            [place.id, portrait.id],
          ]);
        });
        const ordered = (await load(gm)).rows;
        assert.deepEqual(
          ordered.map((i) => i.id),
          [place.id, portrait.id],
        );
        place = (
          await db.query<{ item: MuralItem }>(
            'select to_jsonb(i) item from public.campaign_mural_items i where id=$1',
            [place.id],
          )
        ).rows[0].item;
        portrait = (
          await db.query<{ item: MuralItem }>(
            'select to_jsonb(i) item from public.campaign_mural_items i where id=$1',
            [portrait.id],
          )
        ).rows[0].item;
        assert.equal(place.description, 'Atualizada');
        assert.ok(
          (
            await asUser(player, () =>
              db.query<{ revision: number }>(
                'select revision from public.campaign_mural_states where campaign_id=$1',
                [campaign],
              ),
            )
          ).rows[0].revision > 0,
        );
      },
    );
    await t.test(
      'mural uploads are private and writable only by the owner of that campaign',
      async () => {
        const path = `campaign_mural/${campaign}/scene.png`;
        await asUser(gm, () =>
          db.query("insert into storage.objects(bucket_id,name) values('campaign-media',$1)", [
            path,
          ]),
        );
        assert.equal(
          (
            await asUser(player, () =>
              db.query('select name from storage.objects where name=$1', [path]),
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          () =>
            asUser(player, () =>
              db.query("insert into storage.objects(bucket_id,name) values('campaign-media',$1)", [
                `campaign_mural/${campaign}/bad.png`,
              ]),
            ),
          /row-level security/,
        );
        await assert.rejects(
          () =>
            asUser(gm2, () =>
              db.query("insert into storage.objects(bucket_id,name) values('campaign-media',$1)", [
                `campaign_mural/${campaign}/bad.png`,
              ]),
            ),
          /row-level security/,
        );
        const scene = await save(
          card({
            campaign_id: campaign,
            kind: 'image',
            image_path: path,
            visible_to_players: true,
          }),
        );
        assert.equal(
          (
            await asUser(player, () =>
              db.query('select name from storage.objects where name=$1', [path]),
            )
          ).rows.length,
          1,
        );
        await asUser(gm, () =>
          db.query('select public.delete_campaign_mural_item($1,$2)', [scene.id, scene.updated_at]),
        );
        assert.equal(
          (
            await asUser(player, () =>
              db.query('select name from storage.objects where name=$1', [path]),
            )
          ).rows.length,
          1,
        );
      },
    );
    await t.test(
      'source deletion preserves narrative snapshots and their explicitly published portrait',
      async () => {
        await asUser(gm, () => db.query('delete from public.npcs where id=$1', [npc]));
        const item = (await load(player)).rows.find((i) => i.id === portrait.id)!;
        assert.equal(item.source_npc_id, null);
        assert.equal(item.title, 'Um viajante');
        assert.equal(item.image_path, image);
        assert.equal(
          (
            await asUser(player, () =>
              db.query('select name from storage.objects where name=$1', [image]),
            )
          ).rows.length,
          1,
        );
        await asUser(gm, () =>
          db.query('delete from public.world_locations where id=$1', [location]),
        );
        assert.equal(
          (await load(player)).rows.find((i) => i.id === place.id)?.source_location_id,
          null,
        );
      },
    );
    await t.test(
      'SQL accepts every catalogue variant and rejects variants belonging to another kind',
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
          for (const variant of ['default', ...(SCENERY_VARIANTS[kind.id] ?? []).map((v) => v.id)])
            assert.equal(
              (
                await db.query<{ valid: boolean }>(
                  'select private.battle_valid_scenery_variant($1,$2) valid',
                  [kind.id, variant],
                )
              ).rows[0].valid,
              true,
              `${kind.id}/${variant}`,
            );
        }
        assert.equal(
          (
            await db.query<{ valid: boolean }>(
              "select private.battle_valid_scenery_variant('house','volcano') valid",
            )
          ).rows[0].valid,
          false,
        );
        const map = (
          await asUser(gm, () =>
            db.query<{ m: { id: string; battle_session_id: string } }>(
              'select to_jsonb(public.create_battle_map($1,$2::jsonb)) m',
              [campaign, JSON.stringify({ name: 'Aldeia', width: 20, height: 20 })],
            ),
          )
        ).rows[0].m;
        const object = makeScenery(
          map.id,
          { x: 2, y: 2 },
          {
            kind: 'house',
            variant: 'inn',
            width: 3,
            height: 2,
            rotation: 0,
            blocks: true,
            cost: 1,
          },
        );
        await asUser(gm, () =>
          db.query(
            'insert into public.battle_map_objects(map_id,object_type,geometry,blocks_movement,metadata) values($1,$2,$3::jsonb,$4,$5::jsonb)',
            [
              map.id,
              object.object_type,
              JSON.stringify(object.geometry),
              object.blocks_movement,
              JSON.stringify(object.metadata),
            ],
          ),
        );
        await db.query("update public.battle_sessions set status='active' where id=$1", [
          map.battle_session_id,
        ]);
        await assert.rejects(
          () =>
            asUser(gm, () =>
              db.query(
                'update public.battle_map_objects set metadata=metadata||\'{"variant":"tower"}\' where map_id=$1',
                [map.id],
              ),
            ),
          /combate/,
        );
      },
    );
    await t.test(
      'a full board still permits editing existing cards and rejects the 301st card',
      async () => {
        await asUser(gm, () =>
          db.query(
            `insert into public.campaign_mural_items(campaign_id,kind,title)
        select $1,'note','Rascunho '||n from generate_series(1,300-(select count(*)::integer from public.campaign_mural_items where campaign_id=$1)) n`,
            [campaign],
          ),
        );
        assert.equal((await load(gm)).rows.length, 300);
        const current = (
          await db.query<{ item: MuralItem }>(
            'select to_jsonb(i) item from public.campaign_mural_items i where id=$1',
            [place.id],
          )
        ).rows[0].item;
        place = await save({ ...current, title: 'Taverna atualizada' }, current.updated_at);
        assert.equal(place.title, 'Taverna atualizada');
        assert.equal((await load(gm)).rows.length, 300);
        await assert.rejects(() => save(card({ campaign_id: campaign })), /300 cartões/);
        assert.equal((await load(gm)).rows.length, 300);
      },
    );
    await t.test(
      'membership removal and campaign deletion revoke visibility and clean up mural records',
      async () => {
        await db.query('delete from public.campaign_members where campaign_id=$1 and user_id=$2', [
          campaign,
          player,
        ]);
        assert.equal((await load(player)).rows.length, 0);
        assert.equal(
          (await asUser(player, () => db.query('select name from storage.objects'))).rows.length,
          0,
        );
        await db.query('delete from public.campaigns where id=$1', [campaign]);
        assert.equal(
          (
            await db.query('select id from public.campaign_mural_items where campaign_id=$1', [
              campaign,
            ])
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query('select * from public.campaign_mural_states where campaign_id=$1', [
              campaign,
            ])
          ).rows.length,
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});

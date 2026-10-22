import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';
import { generateAtlas } from '../src/features/atlas/generator';
import { featureBase } from '../src/features/atlas/model';
import { TEMPLATES, type AtlasMap } from '../src/features/atlas/types';
test('atlas SQL protects private maps, validates documents and creates resumable Mesa scenes', async (t) => {
  const db = await billingDatabase(),
    owner = randomUUID(),
    player = randomUUID(),
    other = randomUUID(),
    cid = randomUUID(),
    foreignCid = randomUUID(),
    chapter = randomUUID(),
    foreignChapter = randomUUID(),
    id = randomUUID();
  const as = async <T>(uid: string, fn: () => Promise<T>) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    try {
      return await fn();
    } finally {
      await db.exec('reset role');
    }
  };
  const value = async <T>(sql: string, args: unknown[] = []) =>
    (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
  const save = (doc: unknown, revision: number | null = null, mapId = id, campaignId = cid) =>
    value<AtlasMap>('select to_jsonb(public.save_campaign_atlas($1,$2,$3::jsonb,$4,null)) v', [
      mapId,
      campaignId,
      JSON.stringify(doc),
      revision,
    ]);
  let d = generateAtlas('island', 640, 480, 'test', 'Terras secretas'),
    current: AtlasMap;
  try {
    await db.exec('update public.site_billing_settings set billing_enabled=false');
    for (const [i, uid] of [owner, player, other].entries())
      await db.query('insert into auth.users(id,email) values($1,$2)', [
        uid,
        `atlas${i}@test.local`,
      ]);
    for (const [campaign, uid] of [
      [cid, owner],
      [foreignCid, other],
    ])
      await db.query(
        "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,'00000000-0000-4000-8000-000000000001','Atlas')",
        [campaign, uid],
      );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      cid,
      player,
    ]);
    for (const [ch, campaign, uid] of [
      [chapter, cid, owner],
      [foreignChapter, foreignCid, other],
    ])
      await db.query(
        "insert into public.campaign_sessions(id,campaign_id,name,number,created_by) values($1,$2,'Capítulo',1,$3)",
        [ch, campaign, uid],
      );
    await t.test('valid templates save; lost responses retry idempotently', async () => {
      current = await as(owner, () => save(d));
      assert.equal(current.revision, 1);
      assert.equal((await as(owner, () => save(d))).revision, 1);
      for (const template of TEMPLATES) {
        await as(owner, () =>
          save(generateAtlas(template.id, 640, 480, 'test', template.name), null, randomUUID()),
        );
      }
    });
    await t.test('players and other masters cannot read or mutate private documents', async () => {
      for (const uid of [player, other]) {
        assert.equal(
          await as(uid, () =>
            value<number>('select count(*)::integer v from public.campaign_atlas_maps'),
          ),
          0,
        );
        await assert.rejects(
          as(uid, () => save(d, 1)),
          /mestre/,
        );
        await assert.rejects(
          as(uid, () => value('select public.delete_campaign_atlas($1,1) v', [id])),
          /mestre/,
        );
      }
      await assert.rejects(
        as(owner, () =>
          db.query("update public.campaign_atlas_maps set name='Bypass' where id=$1", [id]),
        ),
        /permission denied/,
      );
      await assert.rejects(
        as(owner, () => save(d, 1, id, foreignCid)),
        /mestre|vínculo/,
      );
    });
    await t.test('stale saves and deletes cannot overwrite another window', async () => {
      d = { ...d, notes: 'Segredo que jogadores não recebem' };
      current = await as(owner, () => save(d, 1));
      assert.equal(current.revision, 2);
      await assert.rejects(
        as(owner, () => save({ ...d, title: 'Obsoleta' }, 1)),
        /outra janela/,
      );
      assert.equal((await as(owner, () => save(d, 1))).revision, 2);
      await assert.rejects(
        as(owner, () => value('select public.delete_campaign_atlas($1,1) v', [id])),
        /outra janela/,
      );
    });
    await t.test(
      'malformed JSON, duplicate IDs, out of bounds and unsafe colors are rejected atomically',
      async () => {
        const symbol = {
          ...featureBase({ x: 100, y: 100 }, 'Pico'),
          kind: 'symbol',
          symbol: 'mountain',
          size: 60,
          color: '#66543c',
        };
        for (const invalid of [
          null,
          [],
          { ...d, terrain: [] },
          { ...d, gridOpacity: '1' },
          { ...d, notes: null },
          { ...d, objects: [symbol, symbol] },
          { ...d, objects: [{ ...symbol, x: 9000 }] },
          { ...d, palette: ['url(x)', ...d.palette.slice(1)] },
          { ...d, extra: true },
          { ...d, layers: [...d.layers.slice(1), d.layers[1]] },
        ])
          await assert.rejects(as(owner, () => save(invalid, 2)));
        assert.equal(
          (
            await as(owner, () =>
              value<AtlasMap>(
                'select to_jsonb(m) v from public.campaign_atlas_maps m where id=$1',
                [id],
              ),
            )
          ).revision,
          2,
        );
      },
    );
    let scene: {
      map: { id: string; background_image: string | null; description: string };
      image_path: string;
    };
    const prepare = (revision = 2, target = chapter) =>
      value<typeof scene>('select public.prepare_atlas_scene($1,$2,$3,32,24,1.5) v', [
        id,
        revision,
        target,
      ]);
    await t.test(
      'sending creates one reusable scene per version and calibration, without private notes',
      async () => {
        scene = await as(owner, () => prepare());
        const retry = await as(owner, () => prepare());
        assert.equal(retry.map.id, scene.map.id);
        assert.match(scene.image_path, new RegExp(`^battle_maps/${scene.map.id}/atlas-`));
        assert.ok(!JSON.stringify(scene.map).includes(d.notes));
        await assert.rejects(
          as(player, () => prepare()),
          /mestre/,
        );
        await assert.rejects(
          as(owner, () => prepare(1)),
          /mudou/,
        );
        await assert.rejects(
          as(owner, () => prepare(2, foreignChapter)),
          /capítulo|campanha|destino/i,
        );
      },
    );
    await t.test(
      'only the owner can attach the exact uploaded image; attachment is retryable',
      async () => {
        const attach = () =>
          value<{ background_image: string }>(
            'select to_jsonb(public.attach_atlas_scene_image($1)) v',
            [scene.map.id],
          );
        await assert.rejects(as(owner, attach), /imagem ainda não/);
        await assert.rejects(as(player, attach), /mestre/);
        await as(owner, () =>
          db.query("insert into storage.objects(bucket_id,name) values('campaign-media',$1)", [
            scene.image_path,
          ]),
        );
        const result = await as(owner, attach);
        assert.equal(result.background_image, scene.image_path);
        assert.equal((await as(owner, attach)).background_image, scene.image_path);
      },
    );
    await t.test('ended chapters reject new scenes and paid access remains enforced', async () => {
      await db.query(
        "update public.campaign_sessions set status='ended',started_at=now(),ended_at=now() where id=$1",
        [chapter],
      );
      await assert.rejects(
        as(owner, () => prepare()),
        /encerrad|finalizad/i,
      );
      await db.exec('update public.site_billing_settings set billing_enabled=true');
      await assert.rejects(
        as(owner, () => save(d, 2)),
        /mestre/,
      );
      assert.equal(
        await as(owner, () =>
          value<number>('select count(*)::integer v from public.campaign_atlas_maps'),
        ),
        0,
      );
      await db.exec('update public.site_billing_settings set billing_enabled=false');
    });
    await t.test(
      'migration can be reapplied and campaign deletion cascades through workshop documents and receipts',
      async () => {
        await db.exec(readMigration('202610220034_campaign_map_workshop.sql'));
        await db.query('delete from public.campaigns where id=$1', [cid]);
        assert.equal(
          await value<number>('select count(*)::integer v from public.campaign_atlas_maps'),
          0,
        );
        assert.equal(
          await value<number>('select count(*)::integer v from private.atlas_scene_exports'),
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});

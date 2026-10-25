import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';
import type {
  AnnotationDelta,
  AnnotationPayload,
  MuralAnnotation,
} from '../src/features/mural/annotation-model';
test('046: shared annotation permission, deltas, privacy, archives and account cleanup', async (t) => {
  const db = await billingDatabase();
  const gm = randomUUID(),
    player = randomUUID(),
    peer = randomUUID(),
    outsider = randomUUID(),
    cid = randomUUID(),
    item = randomUUID();
  let image = `campaign_mural/${cid}/${randomUUID()}.webp`,
    session = '';
  const as = async <T>(id: string, fn: () => Promise<T>) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    try {
      return await fn();
    } finally {
      await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
    }
  };
  const snapshot = async (id: string, after = 0) =>
    (
      await as(id, () =>
        db.query<{ a: AnnotationDelta }>('select public.get_mural_annotations($1,$2) a', [
          item,
          after,
        ]),
      )
    ).rows[0].a;
  const payload: AnnotationPayload = {
    kind: 'stroke',
    color: '#112233',
    width: 4,
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.7 },
    ],
  };
  const add = async (id: string, value: unknown = payload, aid = randomUUID(), path = image) =>
    (
      await as(id, () =>
        db.query<{ a: MuralAnnotation }>(
          'select to_jsonb(public.add_mural_annotation($1,$2,$3,$4::jsonb)) a',
          [item, aid, path, JSON.stringify(value)],
        ),
      )
    ).rows[0].a;
  const rule = async (enabled: boolean, user = gm) =>
    as(user, () =>
      db.query(
        "select public.save_campaign_rules_v19($1,jsonb_build_object('players_can_annotate_mural',$2::boolean),(select updated_at from public.campaign_rules where campaign_id=$1))",
        [cid, enabled],
      ),
    );
  try {
    await db.exec('update public.site_billing_settings set billing_enabled=false');
    for (const [n, id] of [gm, player, peer, outsider].entries())
      await db.query('insert into auth.users(id,email) values($1,$2)', [
        id,
        `annotation${n}@test.local`,
      ]);
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,'00000000-0000-4000-8000-000000000001','Annotations')",
      [cid, gm],
    );
    for (const id of [player, peer])
      await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
        cid,
        id,
      ]);
    session = (
      await as(gm, () =>
        db.query<{ id: string }>(
          "select (public.start_campaign_session((public.save_campaign_session($1,'Capítulo',1)).id)).id",
          [cid],
        ),
      )
    ).rows[0].id;
    await db.query("insert into storage.objects(bucket_id,name) values('campaign-media',$1)", [
      image,
    ]);
    await as(gm, () =>
      db.query('select public.save_campaign_mural_item($1::jsonb)', [
        JSON.stringify({
          id: item,
          campaign_id: cid,
          adventure_session_id: session,
          kind: 'image',
          title: 'Mapa',
          image_path: image,
          visible_to_players: true,
        }),
      ]),
    );
    let first: MuralAnnotation;
    await t.test(
      'permission starts disabled, only the GM changes it, and GM drawings remain available',
      async () => {
        assert.equal((await snapshot(player)).can_write, false);
        await assert.rejects(add(player), /não permite/);
        await assert.rejects(rule(true, player), /mestre/);
        first = await add(gm);
        assert.equal((await snapshot(player)).annotations[0].id, first.id);
        await rule(true);
        assert.equal((await snapshot(player)).can_write, true);
      },
    );
    await t.test(
      'players save text and points immediately; repeated requests never duplicate a stroke',
      async () => {
        const id = randomUUID(),
          a = await add(player, payload, id),
          b = await add(player, payload, id);
        assert.equal(a.version, b.version);
        await add(peer, { kind: 'text', color: '#ff0000', x: 0.5, y: 0.4, text: 'Entrada' });
        await add(player, { kind: 'marker', color: '#00ff00', x: 0.6, y: 0.7, text: '' });
        const delta = await snapshot(peer, first.version);
        assert.equal(delta.snapshot, false);
        assert.equal(delta.annotations.length, 3);
        const unchanged = await snapshot(player, delta.revision);
        assert.equal(unchanged.annotations.length, 0);
        await assert.rejects(add(peer, payload, id), /outro envio|outra marcação/);
        await assert.rejects(
          as(player, () =>
            db.query('select public.erase_mural_annotation($1,$2)', [item, first.id]),
          ),
          /próprias/,
        );
        await as(player, () => db.query('select public.erase_mural_annotation($1,$2)', [item, id]));
        const removed = await snapshot(peer, delta.revision);
        assert.equal(removed.annotations[0].deleted, true);
      },
    );
    await t.test('direct writes, invalid payloads and stale images are rejected', async () => {
      await assert.rejects(
        as(player, () => db.query("update public.campaign_mural_annotations set payload='{}'")),
        /permission denied/,
      );
      for (const bad of [
        {
          ...payload,
          points: [
            { x: 1.5, y: 0.1 },
            { x: 0.2, y: 0.5 },
          ],
        },
        { ...payload, unknown: 'x' },
        { kind: 'text', color: '#123456', x: 0.1, y: 0.1, text: 'x'.repeat(241) },
      ])
        await assert.rejects(add(player, bad), /inválid/);
      await assert.rejects(add(player, payload, randomUUID(), image + 'old'), /imagem mudou/);
    });
    await t.test('outsiders and hidden cards expose neither rows nor revisions', async () => {
      await assert.rejects(snapshot(outsider), /disponível/);
      assert.equal(
        (await as(outsider, () => db.query('select * from public.campaign_mural_annotations'))).rows
          .length,
        0,
      );
      await as(gm, () =>
        db.query('update public.campaign_mural_items set visible_to_players=false where id=$1', [
          item,
        ]),
      );
      await assert.rejects(snapshot(player), /disponível/);
      assert.equal(
        (await as(player, () => db.query('select * from public.campaign_mural_annotation_states')))
          .rows.length,
        0,
      );
      await as(gm, () =>
        db.query('update public.campaign_mural_items set visible_to_players=true where id=$1', [
          item,
        ]),
      );
    });
    await t.test(
      'revoking permission preserves the drawings but blocks player writes and erasures',
      async () => {
        const before = await snapshot(player);
        await rule(false);
        const after = await snapshot(player);
        assert.equal(after.can_write, false);
        assert.equal(after.annotations.length, before.annotations.length);
        await assert.rejects(add(player), /não permite/);
        await assert.rejects(
          as(player, () =>
            db.query('select public.erase_mural_annotation($1,$2)', [item, first.id]),
          ),
          /não permite/,
        );
        await as(gm, () => db.query('select public.clear_mural_annotations($1)', [item]));
        assert.equal((await snapshot(player)).annotations.length, 0);
      },
    );
    await t.test(
      'replacing an image resets coordinates and does not alter the source image',
      async () => {
        await add(gm);
        const before = await snapshot(gm);
        image = `campaign_mural/${cid}/${randomUUID()}.webp`;
        await db.query("insert into storage.objects(bucket_id,name) values('campaign-media',$1)", [
          image,
        ]);
        await as(gm, () =>
          db.query('update public.campaign_mural_items set image_path=$1 where id=$2', [
            image,
            item,
          ]),
        );
        const after = await snapshot(gm, before.revision);
        assert.equal(after.snapshot, true);
        assert.equal(after.annotations.length, 0);
        assert.equal(after.image_path, image);
      },
    );
    await t.test(
      'identity deletion removes its annotations and resets readers; session archives stay read-only',
      async () => {
        await rule(true);
        await add(peer);
        const before = await snapshot(gm);
        await db.query('delete from auth.users where id=$1', [peer]);
        const after = await snapshot(gm, before.revision);
        assert.equal(after.snapshot, true);
        assert.equal(after.annotations.length, 0);
        await as(gm, () => db.query('select public.end_campaign_session($1)', [session]));
        assert.equal((await snapshot(player)).can_write, false);
        await assert.rejects(add(gm), /não permite/);
      },
    );
    await t.test('046 can be reapplied and leaves privileged helpers private', async () => {
      await db.exec(readMigration('202610250046_mural_map_annotations.sql'));
      assert.equal(
        (
          await db.query<{ ok: boolean }>(
            "select has_function_privilege('authenticated','private.save_campaign_rules_v45(uuid,jsonb,timestamptz)','execute') ok",
          )
        ).rows[0].ok,
        false,
      );
      assert.equal(
        (
          await db.query<{ ok: boolean }>(
            "select has_function_privilege('anon','public.add_mural_annotation(uuid,uuid,text,jsonb)','execute') ok",
          )
        ).rows[0].ok,
        false,
      );
    });
  } finally {
    await db.close();
  }
});

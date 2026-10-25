import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { generateAtlas } from '../src/features/atlas/generator';
import { featureBase } from '../src/features/atlas/model';
import type { MapAsset } from '../src/features/map-assets/types';
import { readMigration } from '../scripts/migration-sources.mjs';

test('045: catalogs, private artwork, storage, document references and deletion isolation', async (t) => {
  const db = await billingDatabase();
  const admin = randomUUID(),
    gm = randomUUID(),
    other = randomUUID(),
    player = randomUUID(),
    campaign = randomUUID();
  const as = async <T>(id: string, fn: () => Promise<T>) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    try {
      return await fn();
    } finally {
      await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
    }
  };
  const reserve = async (id: string, scope: string, kind = 'symbol') =>
    (
      await as(id, () =>
        db.query<{ a: MapAsset }>('select to_jsonb(public.reserve_map_asset($1,$2,$3,$4)) a', [
          randomUUID(),
          kind,
          scope,
          'Árvore encantada',
        ]),
      )
    ).rows[0].a;
  const upload = async (id: string, a: MapAsset) => {
    for (const path of [a.image_path, a.thumbnail_path]) {
      const insert = () =>
        db.query("insert into storage.objects(bucket_id,name) values('map-assets',$1)", [path]);
      if (a.scope === 'system') await insert();
      else await as(id, insert);
    }
  };
  const confirm = async (id: string, a: MapAsset) =>
    (
      await as(id, () =>
        db.query<{ a: MapAsset }>('select to_jsonb(public.confirm_map_asset($1)) a', [a.id]),
      )
    ).rows[0].a;
  try {
    for (const [i, id] of [admin, gm, other, player].entries())
      await db.query('insert into auth.users(id,email) values($1,$2)', [
        id,
        `asset${i}@test.local`,
      ]);
    await db.query('insert into public.site_administrators(user_id) values($1)', [admin]);
    for (const id of [gm, other])
      await db.query(
        "insert into public.billing_access_grants(user_id,scopes,valid_until) values($1,array['master'],now()+interval '2 days')",
        [id],
      );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,'00000000-0000-4000-8000-000000000001','Assets')",
      [campaign, gm],
    );
    let global: MapAsset, personal: MapAsset;
    await t.test(
      'only the administrator publishes system images; confirmation requires both uploaded files',
      async () => {
        await assert.rejects(reserve(gm, 'system'), /administrador/);
        await assert.rejects(reserve(player, 'personal'), /mestre/);
        global = await reserve(admin, 'system');
        await assert.rejects(confirm(admin, global), /envio/);
        await assert.rejects(
          as(admin, () =>
            db.query("insert into storage.objects(bucket_id,name) values('map-assets',$1)", [
              global.image_path,
            ]),
          ),
          /row-level|policy/i,
        );
        await upload(admin, global);
        global = await confirm(admin, global);
        assert.equal(global.ready, true);
        assert.equal(global.owner_id, null);
        assert.equal((await confirm(admin, global)).id, global.id);
        for (const id of [gm, other, player, '']) {
          await assert.rejects(confirm(id, global), /indisponível/);
          await assert.rejects(
            as(id, () =>
              db.query('select public.update_map_asset($1,$2,$3,false)', [
                global.id,
                'Alteração proibida',
                [],
              ]),
            ),
            /responsável/,
          );
        }
      },
    );
    await t.test(
      'private images and signed files are invisible to another master, players and administrators',
      async () => {
        personal = await reserve(gm, 'personal');
        await upload(gm, personal);
        personal = await confirm(gm, personal);
        for (const id of [other, player, admin]) {
          const rows = await as(id, () =>
            db.query('select * from public.map_assets where id=$1', [personal.id]),
          );
          assert.equal(rows.rows.length, 0);
          const files = await as(id, () =>
            db.query("select name from storage.objects where bucket_id='map-assets' and name=$1", [
              personal.image_path,
            ]),
          );
          assert.equal(files.rows.length, 0);
          await assert.rejects(
            as(id, () =>
              db.query('select public.update_map_asset($1,$2,$3,false)', [
                personal.id,
                'Roubo',
                [],
              ]),
            ),
            /responsável/,
          );
        }
        assert.equal(
          (
            await as(gm, () =>
              db.query('select * from public.map_assets where id=$1', [personal.id]),
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await as(other, () =>
              db.query('select * from public.map_assets where id=$1', [global.id]),
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await as(player, () =>
              db.query('select * from public.map_assets where id=$1', [global.id]),
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          as(other, () =>
            db.query("insert into storage.objects(bucket_id,name) values('map-assets',$1)", [
              personal.image_path + 'hack',
            ]),
          ),
          /row-level|policy/i,
        );
      },
    );
    await t.test(
      'custom artwork persists in a map and archives do not break previous references',
      async () => {
        const doc = generateAtlas('blank', 640, 480, 'assets', 'Mapa com imagens');
        doc.objects = [
          {
            ...featureBase({ x: 100, y: 100 }, 'Símbolo'),
            kind: 'symbol',
            symbol: 'tree',
            asset_id: personal.id,
            size: 70,
            color: '#66543c',
          },
        ];
        const save = async (document: unknown) =>
          as(gm, () =>
            db.query('select public.save_campaign_atlas($1,$2,$3::jsonb,null,null)', [
              randomUUID(),
              campaign,
              JSON.stringify(document),
            ]),
          );
        await save(doc);
        await as(gm, () =>
          db.query('select public.update_map_asset($1,$2,$3,false)', [
            personal.id,
            'Meu recurso',
            [],
          ]),
        );
        await save(doc);
        const foreign = await reserve(other, 'personal');
        await upload(other, foreign);
        await confirm(other, foreign);
        await assert.rejects(
          save({ ...doc, objects: doc.objects.map((o) => ({ ...o, asset_id: foreign.id })) }),
          /não pertence/,
        );
        await assert.rejects(
          save({
            ...doc,
            objects: doc.objects.map((o) => ({ ...o, asset_id: 'https://evil.example/a.png' })),
          }),
          /inválida/,
        );
        const token = await reserve(admin, 'system', 'token');
        await upload(admin, token);
        await confirm(admin, token);
        await assert.rejects(
          save({ ...doc, objects: doc.objects.map((o) => ({ ...o, asset_id: token.id })) }),
          /não pertence/,
        );
        assert.equal(
          (
            await db.query<{ n: string }>(
              'select search_name n from public.map_assets where id=$1',
              [global.id],
            )
          ).rows[0].n,
          'arvore encantada',
        );
      },
    );
    await t.test(
      'account purge queues both personal files without removing the published catalog',
      async () => {
        const token = randomUUID();
        await db.query('select public.account_begin_deletion($1,$2,$3,true)', [
          gm,
          token,
          'a'.repeat(64),
        ]);
        await db.query('select public.account_prepare_purge($1,$2)', [gm, token]);
        const files = (
          await db.query<{ name: string }>(
            'select name from private.account_deletion_files where user_id=$1',
            [gm],
          )
        ).rows.map((r) => r.name);
        assert.ok(files.includes(personal.image_path));
        assert.ok(files.includes(personal.thumbnail_path));
        assert.ok(!files.includes(global.image_path));
        // A resumed deletion must recheck files that reappeared after the last
        // storage pass, including objects whose Storage owner metadata is absent.
        await db.query("update private.account_deletions set phase='auth_ready' where user_id=$1", [
          gm,
        ]);
        await db.query('update private.account_deletion_files set removed=true where user_id=$1', [
          gm,
        ]);
        const resumed = await db.query<{ phase: string }>(
          'select public.account_prepare_purge($1,$2) phase',
          [gm, token],
        );
        assert.equal(resumed.rows[0].phase, 'purging');
        assert.equal(
          (
            await db.query(
              'select name from private.account_deletion_files where user_id=$1 and not removed',
              [gm],
            )
          ).rows.length,
          2,
        );
      },
    );
    await t.test(
      'deleting an administrator preserves published art and removes unfinished uploads',
      async () => {
        const replacement = randomUUID(),
          token = randomUUID();
        await db.query('insert into auth.users(id,email) values($1,$2)', [
          replacement,
          'next-admin@test.local',
        ]);
        await db.query('insert into public.site_administrators(user_id) values($1)', [replacement]);
        const pending = await reserve(admin, 'system', 'background');
        await db.query("insert into storage.objects(bucket_id,name) values('map-assets',$1)", [
          pending.image_path,
        ]);
        await db.query('select public.account_begin_deletion($1,$2,$3,true)', [
          admin,
          token,
          'b'.repeat(64),
        ]);
        await db.query('select public.account_prepare_purge($1,$2)', [admin, token]);
        const files = (
          await db.query<{ name: string; bucket_id: string }>(
            'select name,bucket_id from private.account_deletion_files where user_id=$1',
            [admin],
          )
        ).rows;
        assert.ok(files.some((f) => f.name === pending.image_path));
        assert.ok(
          !files.some((f) => f.name === global.image_path || f.name === global.thumbnail_path),
        );
        for (const file of files)
          await db.query('delete from storage.objects where bucket_id=$1 and name=$2', [
            file.bucket_id,
            file.name,
          ]);
        await db.query('select public.account_confirm_removed_files($1,$2,$3::jsonb)', [
          admin,
          token,
          JSON.stringify(files),
        ]);
        await db.query('select public.account_purge_data($1,$2)', [admin, token]);
        await db.query('delete from auth.users where id=$1', [admin]);
        const published = (
          await db.query<{ created_by: string | null }>(
            'select created_by from public.map_assets where id=$1',
            [global.id],
          )
        ).rows;
        assert.equal(published[0].created_by, null);
        assert.equal(
          (await db.query('select name from storage.objects where name=$1', [global.image_path]))
            .rows.length,
          1,
        );
        assert.equal(
          (await db.query('select id from public.map_assets where id=$1', [pending.id])).rows
            .length,
          0,
        );
      },
    );
    await t.test(
      'migration reapplication preserves the original validator and private grants',
      async () => {
        await db.exec(readMigration('202610250045_map_asset_libraries.sql'));
        assert.equal(
          (
            await db.query<{ ok: boolean }>(
              "select has_function_privilege('service_role','public.account_prepare_purge(uuid,uuid)','execute') ok",
            )
          ).rows[0].ok,
          true,
        );
        assert.equal(
          (
            await db.query<{ ok: boolean }>(
              "select has_function_privilege('anon','public.reserve_map_asset(uuid,text,text,text,text[])','execute') ok",
            )
          ).rows[0].ok,
          false,
        );
      },
    );
  } finally {
    await db.close();
  }
});

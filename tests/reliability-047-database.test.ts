import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';

test('047: checked writes, deleted records, media leases, RLS summaries and repeatable upgrade', async (t) => {
  const db = await billingDatabase();
  const gm = randomUUID(),
    player = randomUUID(),
    other = randomUUID(),
    cid = randomUUID(),
    wid = randomUUID();
  const as = async <T>(id: string, fn: () => Promise<T>) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    try {
      return await fn();
    } finally {
      await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
    }
  };
  const payload = {
    id: cid,
    owner_id: gm,
    rpg_system_id: '00000000-0000-4000-8000-000000000001',
    name: 'Campanha',
    description: 'Original',
    theme: '',
    status: 'active',
  };
  const world = {
    id: wid,
    campaign_id: cid,
    kind: 'region',
    name: 'Região',
    description: 'Original',
    secrets: 'Original',
    visible_to_players: true,
  };
  const campaign = (p = payload, version: string | null = null, user = gm) =>
    as(
      user,
      async () =>
        (
          await db.query<{ a: { updated_at: string } }>(
            'select to_jsonb(public.save_campaign_checked($1::jsonb,$2::timestamptz)) a',
            [JSON.stringify(p), version],
          )
        ).rows[0].a,
    );
  const saveWorld = (p: object, version: string | null = null, user = gm) =>
    as(
      user,
      async () =>
        (
          await db.query<{ a: { updated_at: string } }>(
            'select public.save_world_entry_checked($1::jsonb,$2::timestamptz) a',
            [JSON.stringify(p), version],
          )
        ).rows[0].a,
    );
  try {
    await db.exec('update public.site_billing_settings set billing_enabled=false');
    for (const id of [gm, player, other])
      await db.query('insert into auth.users(id,email) values($1,$2)', [id, id + '@test.local']);
    let c = await campaign();
    assert.deepEqual(
      await campaign(),
      c,
      'a lost creation response is recovered without a second write',
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      cid,
      player,
    ]);
    await t.test(
      'a stale campaign editor cannot replace a newer description or create a foreign campaign',
      async () => {
        const saved = await campaign({ ...payload, description: 'Nova' }, c.updated_at);
        await assert.rejects(campaign(payload, c.updated_at), /mudou|removida/);
        await assert.rejects(campaign(payload, saved.updated_at, other), /mestre/);
        c = saved;
      },
    );
    await t.test(
      'stale world edits preserve both the public description and GM secrets',
      async () => {
        const initial = await saveWorld(world);
        assert.deepEqual(await saveWorld(world), initial);
        const saved = await saveWorld(
          { ...world, description: 'Nova', secrets: 'Novo segredo' },
          initial.updated_at,
        );
        await assert.rejects(
          saveWorld({ ...world, name: 'Outra aba' }, initial.updated_at),
          /mudou|removido/,
        );
        assert.deepEqual(
          (await db.query('select description from public.world_regions where id=$1', [wid]))
            .rows[0],
          { description: 'Nova' },
        );
        assert.deepEqual(
          (
            await db.query('select secrets from public.world_regions_private where entry_id=$1', [
              wid,
            ])
          ).rows[0],
          { secrets: 'Novo segredo' },
        );
        await assert.rejects(saveWorld(world, saved.updated_at, player), /mestre/);
        await as(gm, () => db.query('delete from public.world_regions where id=$1', [wid]));
        await assert.rejects(saveWorld(world, saved.updated_at), /mudou|removido/);
        assert.equal(
          (await db.query('select * from public.world_regions where id=$1', [wid])).rows.length,
          0,
        );
      },
    );
    await t.test(
      'summary counts retain RLS and reveal no hidden NPC or private notes',
      async () => {
        await saveWorld(world);
        await db.query(
          "insert into public.npcs(id,campaign_id,rpg_system_id,name,visible_to_players) values($1,$2,$3,'Segredo',false)",
          [randomUUID(), cid, payload.rpg_system_id],
        );
        const gmCounts = await as(gm, () =>
          db.query<{ a: Record<string, { npcs: number; world: number }> }>(
            'select public.get_workspace_summaries() a',
          ),
        );
        const pcCounts = await as(player, () =>
          db.query<{ a: Record<string, { npcs: number; world: number }> }>(
            'select public.get_workspace_summaries() a',
          ),
        );
        assert.equal(gmCounts.rows[0].a[cid].npcs, 1);
        assert.equal(pcCounts.rows[0].a[cid].npcs, 0);
        assert.equal(pcCounts.rows[0].a[cid].world, 1);
        assert.deepEqual(
          (await as(other, () => db.query('select public.get_workspace_summaries() a'))).rows[0],
          { a: {} },
        );
      },
    );
    await t.test(
      'cleanup retains referenced images and leases only orphaned media; API removal is confirmed',
      async () => {
        const path = `world_regions/${wid}/${randomUUID()}.webp`;
        await db.query("insert into storage.objects(bucket_id,name) values('campaign-media',$1)", [
          path,
        ]);
        const old = (
          await db.query<{ a: string }>(
            'select updated_at::text a from public.world_regions where id=$1',
            [wid],
          )
        ).rows[0].a;
        await saveWorld({ ...world, image_path: path }, old);
        const version = (
          await db.query<{ a: string }>(
            'select updated_at::text a from public.world_regions where id=$1',
            [wid],
          )
        ).rows[0].a;
        await saveWorld(world, version);
        assert.equal(
          (await db.query('select * from private.media_cleanup_jobs where name=$1', [path])).rows
            .length,
          1,
        );
        await db.exec("update private.media_cleanup_jobs set not_before=now()-interval '1 day'");
        const lease = (
          await db.query<{ id: string; name: string }>(
            'select * from public.lease_media_cleanup(20)',
          )
        ).rows.find((j) => j.name === path)!;
        assert.ok(lease);
        const current = (
          await db.query<{ a: string }>(
            'select updated_at::text a from public.world_regions where id=$1',
            [wid],
          )
        ).rows[0].a;
        await assert.rejects(
          saveWorld({ ...world, image_path: path }, current),
          /imagem.*atualizada/i,
        );
        await db.query('select public.finish_media_cleanup($1)', [lease.id]);
        assert.equal(
          (
            await db.query('select attempts from private.media_cleanup_jobs where id=$1', [
              lease.id,
            ])
          ).rows.length,
          1,
        );
        await db.query("delete from storage.objects where bucket_id='campaign-media' and name=$1", [
          path,
        ]);
        await db.query('select public.finish_media_cleanup($1)', [lease.id]);
        assert.equal(
          (await db.query('select * from private.media_cleanup_jobs where id=$1', [lease.id])).rows
            .length,
          0,
        );
        await assert.rejects(
          as(player, () => db.query('select * from public.lease_media_cleanup(10)')),
          /permission denied/,
        );
        await assert.rejects(
          as(player, () => db.query('select public.site_maintenance_health()')),
          /administra/,
        );
      },
    );
    await t.test(
      '047 can be reapplied with existing records and keeps helpers private',
      async () => {
        await db.exec(readMigration('202611040047_integrity_and_maintenance.sql'));
        const exposed = (
          await db.query(
            "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like '%47' and has_function_privilege('authenticated',p.oid,'execute')",
          )
        ).rows;
        assert.deepEqual(exposed, []);
        assert.equal(
          (await db.query('select * from public.campaigns where id=$1', [cid])).rows.length,
          1,
        );
      },
    );
    await t.test(
      'history references retain the original image, while expired empty reservations are reclaimed',
      async () => {
        const path = `world_regions/${wid}/${randomUUID()}.webp`;
        await db.query("insert into storage.objects(bucket_id,name) values('campaign-media',$1)", [
          path,
        ]);
        const sid = (
          await as(gm, () =>
            db.query<{ id: string }>("select (public.save_campaign_session($1,'Arquivo',1)).id", [
              cid,
            ]),
          )
        ).rows[0].id;
        await db.query(
          "insert into public.campaign_session_events(campaign_id,adventure_session_id,kind,title,image_path) values($1,$2,'note','História',$3)",
          [cid, sid, path],
        );
        await db.query(
          "insert into private.media_cleanup_jobs(bucket_id,name,not_before) values('campaign-media',$1,now()-interval '1 day')",
          [path],
        );
        assert.ok(
          !(
            await db.query<{ name: string }>('select * from public.lease_media_cleanup(20)')
          ).rows.some((r) => r.name === path),
        );
        assert.equal(
          (await db.query('select * from storage.objects where name=$1', [path])).rows.length,
          1,
        );
        const asset = (
          await as(gm, () =>
            db.query<{ id: string }>(
              "select (public.reserve_map_asset($1,'symbol','personal','Interrompido')).id",
              [randomUUID()],
            ),
          )
        ).rows[0].id;
        await db.query(
          "update public.map_assets set created_at=now()-interval '3 days' where id=$1",
          [asset],
        );
        await db.query('select * from public.lease_media_cleanup(20)');
        assert.equal(
          (await db.query('select * from public.map_assets where id=$1', [asset])).rows.length,
          0,
        );
      },
    );
    await t.test(
      'upload quotas block new files above the limit but still allow their removal',
      async () => {
        await db.exec(
          'alter table storage.objects add column if not exists owner_id text;alter table storage.objects add column if not exists metadata jsonb',
        );
        const path = `profiles/${gm}/${randomUUID()}.webp`;
        await db.query(
          "insert into storage.objects(bucket_id,name,owner_id,metadata) values('campaign-media',$1,$2,'{\"size\":536870912}')",
          [path, gm],
        );
        await assert.rejects(
          as(gm, () =>
            db.query("insert into storage.objects(bucket_id,name) values('campaign-media',$1)", [
              `profiles/${gm}/${randomUUID()}.webp`,
            ]),
          ),
          /row-level|policy/i,
        );
        assert.equal(
          (
            await as(gm, () =>
              db.query('delete from storage.objects where name=$1 returning id', [path]),
            )
          ).rows.length,
          1,
        );
      },
    );
    await t.test(
      'an expired upload cannot become a published asset while its files are leased for cleanup',
      async () => {
        const asset = (
          await as(gm, () =>
            db.query<{ a: { id: string; image_path: string; thumbnail_path: string } }>(
              "select to_jsonb(public.reserve_map_asset($1,'symbol','personal','Envio antigo')) a",
              [randomUUID()],
            ),
          )
        ).rows[0].a;
        await db.query(
          "update public.map_assets set created_at=now()-interval '3 days' where id=$1",
          [asset.id],
        );
        for (const path of [asset.image_path, asset.thumbnail_path])
          await db.query("insert into storage.objects(bucket_id,name) values('map-assets',$1)", [
            path,
          ]);
        const leased = (
          await db.query<{ name: string }>('select * from public.lease_media_cleanup(20)')
        ).rows;
        assert.ok(leased.some((r) => r.name === asset.image_path));
        await assert.rejects(
          as(gm, () => db.query('select public.confirm_map_asset($1)', [asset.id])),
          /envio antigo.*limpo/i,
        );
        assert.equal(
          (
            await db.query<{ ready: boolean }>('select ready from public.map_assets where id=$1', [
              asset.id,
            ])
          ).rows[0].ready,
          false,
        );
      },
    );
  } finally {
    await db.close();
  }
});

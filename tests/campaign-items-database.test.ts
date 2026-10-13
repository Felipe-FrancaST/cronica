import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';
import { ITEM_STARTERS, definitionFromCatalog } from '../src/features/items/model';
import { ITEM_CATALOG } from '../src/systems/dnd5e/items';
import { defaultSheet } from '../src/systems/dnd5e';
import type { CampaignItem, ItemDelivery } from '../src/features/items/types';

test('campaign items are private, versioned, granted once and usable through the existing combat pipeline', async (t) => {
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
    await db.exec(readMigration('202610130025_campaign_items.sql'));
    for (const entry of ITEM_CATALOG)
      await db.query('select private.validate_campaign_item($1::jsonb)', [
        JSON.stringify(definitionFromCatalog(entry)),
      ]);
    const gm = randomUUID(),
      player = randomUUID(),
      outsider = randomUUID(),
      cid = randomUUID(),
      otherCid = randomUUID(),
      hero = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'gm@items.test'),($2,'player@items.test'),($3,'other@items.test')",
      [gm, player, outsider],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$3,'00000000-0000-4000-8000-000000000001','Relíquias'),($2,$3,'00000000-0000-4000-8000-000000000001','Outra mesa')",
      [cid, otherCid, gm],
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      cid,
      player,
    ]);
    const as = async <T>(user: string, run: () => Promise<T>) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      try {
        return await run();
      } finally {
        await db.exec('reset role');
      }
    };
    const sheet = defaultSheet();
    sheet.hp_max_override = 30;
    sheet.hp_current = 10;
    await as(gm, () =>
      db.query('select public.save_character($1::jsonb,null)', [
        JSON.stringify({
          id: hero,
          campaign_id: cid,
          owner_id: player,
          rpg_system_id: '00000000-0000-4000-8000-000000000001',
          name: 'Herói',
          portrait_path: null,
          appearance: '',
          biography: '',
          sheet,
        }),
      ]),
    );
    const data = ITEM_STARTERS.find((s) => s.id === 'healing')!.create();
    data.name = 'Poção do mestre';
    data.functions[0].dice = '2d4+2';
    const save = (user: string, item: Partial<CampaignItem>) =>
      as(user, () =>
        db.query<{ value: CampaignItem }>(
          'select to_jsonb(public.save_campaign_item($1::jsonb,$2)) value',
          [JSON.stringify(item), item.version || null],
        ),
      );
    let item: CampaignItem = (
      await save(gm, {
        id: randomUUID(),
        campaign_id: cid,
        data,
        visible_to_players: false,
        archived: false,
        version: 0,
        private_notes: 'Maldição secreta',
      })
    ).rows[0].value;
    const grant = (user: string, id = randomUUID(), quantity = 2) =>
      as(user, () =>
        db.query<{ value: ItemDelivery }>(
          'select to_jsonb(public.give_campaign_item($1,$2,$3,$4,$5)) value',
          [item.id, hero, quantity, id, item.version],
        ),
      );
    let delivery: ItemDelivery;
    let map: { id: string; adventure_session_id: string; battle_session_id: string };
    let token: { id: string };
    await t.test(
      'unpublished items and secrets stay private; other users cannot edit or grant',
      async () => {
        for (const user of [player, outsider]) {
          assert.equal(
            (await as(user, () => db.query('select * from public.campaign_items'))).rows.length,
            0,
          );
          assert.equal(
            (await as(user, () => db.query('select * from public.campaign_item_private'))).rows
              .length,
            0,
          );
          await assert.rejects(save(user, { ...item, data }), /mestre/);
          await assert.rejects(grant(user), /mestre/);
        }
        item = (
          await save(gm, {
            ...item,
            data,
            private_notes: 'Maldição secreta',
            visible_to_players: true,
          })
        ).rows[0].value;
        assert.equal(
          (await as(player, () => db.query('select * from public.campaign_items'))).rows.length,
          1,
        );
        assert.equal(
          (await as(player, () => db.query('select * from public.campaign_item_private'))).rows
            .length,
          0,
        );
        await assert.rejects(save(gm, { ...item, version: item.version - 1, data }), /mudou/);
      },
    );
    await t.test(
      'delivery retries are idempotent and immutable definitions do not copy secrets',
      async () => {
        const request = randomUUID();
        delivery = (await grant(gm, request)).rows[0].value;
        assert.equal((await grant(gm, request)).rows[0].value.inventory_id, delivery.inventory_id);
        assert.equal(
          (
            await db.query('select * from public.character_inventory where id=$1', [
              delivery.inventory_id,
            ])
          ).rows.length,
          1,
        );
        const inventory = (
          await db.query<{ data: Record<string, unknown> }>(
            'select data from public.character_inventory where id=$1',
            [delivery.inventory_id],
          )
        ).rows[0].data;
        assert.equal(inventory.private_notes, undefined);
        assert.equal(inventory.quantity, 2);
        data.functions[0].dice = '8d4';
        item = (await save(gm, { ...item, data, private_notes: 'Novo segredo' })).rows[0].value;
        assert.equal((inventory.functions as { dice: string }[])[0].dice, '2d4+2');
        await assert.rejects(
          as(player, () =>
            db.query(
              "update public.character_inventory set data=jsonb_set(data,'{quantity}','99') where id=$1",
              [delivery.inventory_id],
            ),
          ),
          /mestre/,
        );
        await assert.rejects(
          as(player, () =>
            db.query(
              'insert into public.character_inventory(id,character_id,data) select $1,character_id,data from public.character_inventory where id=$2',
              [randomUUID(), delivery.inventory_id],
            ),
          ),
          /mestre/,
        );
        await as(player, () =>
          db.query(
            "update public.character_inventory set data=jsonb_set(data,'{functions,0,dice}','\"99d20\"') where id=$1",
            [delivery.inventory_id],
          ),
        );
        assert.equal(
          (
            await db.query<{ dice: string }>(
              "select data->'functions'->0->>'dice' dice from public.character_inventory where id=$1",
              [delivery.inventory_id],
            )
          ).rows[0].dice,
          '2d4+2',
        );
      },
    );
    await t.test(
      'custom healing resolves once, applies HP and consumes the delivered quantity',
      async () => {
        map = (
          await as(gm, () =>
            db.query<{
              m: { id: string; adventure_session_id: string; battle_session_id: string };
            }>('select to_jsonb(public.create_battle_map($1,$2::jsonb)) m', [
              cid,
              JSON.stringify({ name: 'Mesa', width: 12, height: 12 }),
            ]),
          )
        ).rows[0].m;
        await as(gm, () =>
          db.query('select public.start_campaign_session($1)', [map.adventure_session_id]),
        );
        token = (
          await as(gm, () =>
            db.query<{ t: { id: string } }>(
              'select to_jsonb(public.add_character_to_battle_map($1,$2,$3,$4)) t',
              [map.id, hero, 2, 2],
            ),
          )
        ).rows[0].t;
        await as(gm, () =>
          db.query('select public.start_battle_combat($1,$2::jsonb)', [
            map.battle_session_id,
            JSON.stringify([{ token_id: token.id, initiative: 20 }]),
          ]),
        );
        const payload = {
          kind: 'item',
          source_id: delivery.inventory_id,
          item_function_id: data.functions[0].id,
          target: { x: 2, y: 2 },
          target_ids: [token.id],
        };
        const request = (
          await as(player, () =>
            db.query<{ r: { id: string; definition: { dice: string } } }>(
              'select to_jsonb(public.request_battle_action($1,$2::jsonb,$3)) r',
              [token.id, JSON.stringify(payload), randomUUID()],
            ),
          )
        ).rows[0].r;
        assert.equal(request.definition.dice, '2d4+2');
        await as(gm, () =>
          db.query('select public.resolve_battle_action($1,true,$2::jsonb)', [
            request.id,
            JSON.stringify({ apply_now: true, targets: { [token.id]: { amount: 6 } } }),
          ]),
        );
        await as(gm, () =>
          db.query('select public.resolve_battle_action($1,true,$2::jsonb)', [
            request.id,
            JSON.stringify({ apply_now: true, targets: { [token.id]: { amount: 6 } } }),
          ]),
        );
        assert.equal(
          (
            await db.query<{ quantity: number }>(
              "select (data->>'quantity')::integer quantity from public.character_inventory where id=$1",
              [delivery.inventory_id],
            )
          ).rows[0].quantity,
          1,
        );
        assert.equal(
          (
            await db.query<{ hp: number }>(
              "select (system_data->>'hp_current')::integer hp from public.characters where id=$1",
              [hero],
            )
          ).rows[0].hp,
          16,
        );
      },
    );
    await t.test(
      'each function spends its own charges and action; attunement, passive movement and master recharge are enforced',
      async () => {
        const charm = ITEM_STARTERS.find((s) => s.id === 'charm')!.create();
        charm.functions[0].requires_equipped = true;
        charm.bonuses.speed = 3;
        charm.functions.push({
          ...charm.functions[0],
          id: randomUUID(),
          name: 'Abrir passagem',
          kind: 'utility',
          dice: '',
          cost: 'free',
          charge_cost: 2,
        });
        const model = (await save(gm, { id: randomUUID(), campaign_id: cid, data: charm })).rows[0]
          .value;
        const giveCharm = (quantity: number) =>
          as(gm, () =>
            db.query<{ value: ItemDelivery }>(
              'select to_jsonb(public.give_campaign_item($1,$2,$3,$4,$5)) value',
              [model.id, hero, quantity, randomUUID(), model.version],
            ),
          );
        await assert.rejects(giveCharm(2), /separadamente/);
        const given = (await giveCharm(1)).rows[0].value;
        const requestFunction = (id: string) =>
          as(player, () =>
            db.query<{ r: { id: string; cost: string; definition: { kind: string } } }>(
              'select to_jsonb(public.request_battle_action($1,$2::jsonb,$3)) r',
              [
                token.id,
                JSON.stringify({
                  kind: 'item',
                  source_id: given.inventory_id,
                  item_function_id: id,
                  target: { x: 2, y: 2 },
                  target_ids: [token.id],
                }),
                randomUUID(),
              ],
            ),
          );
        const before = (
          await db.query<{ speed: number }>(
            'select private.battle_character_speed($1)::float8 speed',
            [hero],
          )
        ).rows[0].speed;
        await assert.rejects(requestFunction(charm.functions[0].id), /indisponível/);
        await as(player, () =>
          db.query(
            'update public.character_inventory set data=data||\'{"equipped":true,"attuned":true}\'::jsonb where id=$1',
            [given.inventory_id],
          ),
        );
        assert.equal(
          (
            await db.query<{ speed: number }>(
              'select private.battle_character_speed($1)::float8 speed',
              [hero],
            )
          ).rows[0].speed,
          Number(before) + 3,
        );
        await assert.rejects(requestFunction(randomUUID()), /indisponível/);
        const first = (await requestFunction(charm.functions[0].id)).rows[0].r;
        assert.equal(first.cost, 'bonus');
        assert.equal(first.definition.kind, 'temporary');
        await as(gm, () =>
          db.query('select public.resolve_battle_action($1,true,$2::jsonb)', [
            first.id,
            JSON.stringify({ apply_now: true, targets: { [token.id]: { amount: 7 } } }),
          ]),
        );
        const second = (await requestFunction(charm.functions[1].id)).rows[0].r;
        assert.equal(second.cost, 'free');
        const timestamp = async () =>
          (
            await db.query<{ time: string }>(
              'select updated_at::text time from public.characters where id=$1',
              [hero],
            )
          ).rows[0].time;
        const recharge = async (user: string, time?: string) => {
          const expected = time ?? (await timestamp());
          return as(user, () =>
            db.query('select public.recharge_campaign_item($1,$2::timestamptz)', [
              given.inventory_id,
              expected,
            ]),
          );
        };
        await assert.rejects(recharge(player), /mestre/);
        await assert.rejects(recharge(gm), /pendente/);
        await as(gm, () => db.query('select public.resolve_battle_action($1,true)', [second.id]));
        const remaining = (
          await db.query<{ data: { quantity: number; charges_used: number } }>(
            'select data from public.character_inventory where id=$1',
            [given.inventory_id],
          )
        ).rows[0].data;
        assert.equal(remaining.charges_used, 3);
        assert.equal(remaining.quantity, 1);
        assert.equal(
          (
            await db.query<{ hp: number }>(
              "select (system_data->>'hp_temp')::integer hp from public.characters where id=$1",
              [hero],
            )
          ).rows[0].hp,
          7,
        );
        await as(gm, () =>
          db.query('select public.advance_battle_turn($1)', [map.battle_session_id]),
        );
        await assert.rejects(requestFunction(charm.functions[0].id), /indisponível/);
        await assert.rejects(recharge(gm, '2000-01-01T00:00:00Z'), /mudou/);
        await recharge(gm);
        assert.equal(
          (
            await db.query<{ used: number }>(
              "select (data->>'charges_used')::integer used from public.character_inventory where id=$1",
              [given.inventory_id],
            )
          ).rows[0].used,
          0,
        );
      },
    );
    await t.test('bad costs and cross-campaign grants are rejected', async () => {
      const wand = ITEM_STARTERS.find((s) => s.id === 'wand')!.create();
      wand.functions[0].charge_cost = 8;
      await assert.rejects(
        save(gm, { id: randomUUID(), campaign_id: cid, data: wand }),
        /capacidade/,
      );
      await assert.rejects(
        as(gm, () =>
          db.query('select public.give_campaign_item($1,$2,1,$3,$4)', [
            item.id,
            randomUUID(),
            randomUUID(),
            item.version,
          ]),
        ),
        /personagem/,
      );
    });
  } finally {
    await db.close();
  }
});

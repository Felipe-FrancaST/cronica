import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';
import { defaultArkanisSheet, ARKANIS_SYSTEM_ID } from '../src/systems/arkanis/rules';
import { INGREDIENTS, ingredientItem } from '../src/systems/arkanis/ingredients';
import { newItemDefinition } from '../src/features/items/model';

test('048: real Arkanis saves, ownership, conflicts, inventory permissions and repeatable migration', async (t) => {
  const db = await billingDatabase();
  const gm = randomUUID(),
    player = randomUUID(),
    outsider = randomUUID(),
    campaign = randomUUID();
  const as = async <T>(user: string, fn: () => Promise<T>) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    try {
      return await fn();
    } finally {
      await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
    }
  };
  const sheet = defaultArkanisSheet();
  sheet.hp_max = 24;
  sheet.hp_current = 20;
  sheet.arkano = { body: 8, mind: 8, spirit: 8, bonus: 0, modifier_override: null };
  sheet.aptitudes.magico = 3;
  sheet.inventory = [ingredientItem(INGREDIENTS[0], randomUUID(), 3)];
  const payload = {
    id: randomUUID(),
    campaign_id: campaign,
    owner_id: player,
    rpg_system_id: ARKANIS_SYSTEM_ID,
    name: 'Ayla',
    portrait_path: null,
    appearance: '',
    biography: '',
    sheet,
  };
  const save = (p: object = payload, version: string | null = null, user = player) =>
    as(
      user,
      async () =>
        (
          await db.query<{ v: { id: string; updated_at: string } }>(
            'select public.save_arkanis_character($1::jsonb,$2::timestamptz) v',
            [JSON.stringify(p), version],
          )
        ).rows[0].v,
    );
  let version: string;
  try {
    await db.exec('update public.site_billing_settings set billing_enabled=false');
    for (const id of [gm, player, outsider])
      await db.query('insert into auth.users(id,email) values($1,$2)', [id, id + '@arkanis.test']);
    await as(gm, () =>
      db.query(
        "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Arkanis')",
        [campaign, gm, ARKANIS_SYSTEM_ID],
      ),
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      campaign,
      player,
    ]);
    await db.query(
      'insert into public.campaign_rules(campaign_id) values($1) on conflict do nothing',
      [campaign],
    );
    await t.test('catalogue is readable but never writable by a player', async () => {
      assert.equal(
        (
          await as(player, () =>
            db.query<{ n: number }>('select count(*)::integer n from public.arkanis_ingredients'),
          )
        ).rows[0].n,
        180,
      );
      await assert.rejects(
        as(player, () => db.query("delete from public.arkanis_ingredients where id='arkanis-001'")),
        /permission/,
      );
    });
    await t.test(
      'classless sheet persists own attributes, rank three and independent inventory',
      async () => {
        const result = await save();
        version = result.updated_at;
        const stored = (
          await db.query<{ system_data: typeof sheet }>(
            'select system_data from public.characters where id=$1',
            [payload.id],
          )
        ).rows[0].system_data;
        assert.equal(stored.system, 'arkanis');
        assert.equal(stored.aptitudes.magico, 3);
        assert.equal(stored.attributes.sen, 14);
        assert.equal('class_id' in stored, false);
        assert.equal('inspiration_count' in stored, false);
        assert.equal(
          (
            await db.query('select * from public.character_attributes where character_id=$1', [
              payload.id,
            ])
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query<{ data: { ingredient_id: string } }>(
              'select data from public.character_inventory where character_id=$1',
              [payload.id],
            )
          ).rows[0].data.ingredient_id,
          'arkanis-001',
        );
      },
    );
    await t.test(
      'stale editors, foreign readers and foreign saves cannot alter the sheet',
      async () => {
        const next = await save({ ...payload, biography: 'Confirmado' }, version);
        await assert.rejects(save({ ...payload, name: 'Antigo' }, version), /atualizada|removida/);
        version = next.updated_at;
        assert.equal(
          (
            await as(outsider, () =>
              db.query('select * from public.characters where id=$1', [payload.id]),
            )
          ).rows.length,
          0,
        );
        await assert.rejects(save(payload, version, outsider), /acessível|permission|policy/);
      },
    );
    await t.test(
      'zero quantity is retained and forged ingredient references roll back atomically',
      async () => {
        sheet.inventory[0].quantity = 0;
        const next = await save(payload, version);
        version = next.updated_at;
        assert.equal(
          (
            await db.query<{ q: number }>(
              "select (data->>'quantity')::integer q from public.character_inventory where character_id=$1",
              [payload.id],
            )
          ).rows[0].q,
          0,
        );
        const invalid = structuredClone(payload);
        invalid.sheet.inventory[0].ingredient_id = 'missing';
        await assert.rejects(save(invalid, version), /Ingrediente/);
        assert.equal(
          (
            await db.query<{ stamp: string }>(
              'select updated_at::text stamp from public.characters where id=$1',
              [payload.id],
            )
          ).rows.length,
          1,
        );
      },
    );
    await t.test(
      'closed custom inventory permits catalogue ingredients and blocks invented items',
      async () => {
        await db.query(
          'update public.campaign_rules set players_can_create_custom_items=false where campaign_id=$1',
          [campaign],
        );
        sheet.inventory.push(ingredientItem(INGREDIENTS[1], randomUUID(), 2));
        let next = await save(payload, version);
        version = next.updated_at;
        const invalid = structuredClone(payload);
        invalid.sheet.inventory.push({
          ...ingredientItem(INGREDIENTS[0], randomUUID()),
          name: 'Objeto inventado',
          ingredient_id: undefined,
        });
        await assert.rejects(save(invalid, version), /personalizados/);
        await db.query(
          'update public.campaign_rules set players_can_edit_sheets=false where campaign_id=$1',
          [campaign],
        );
        await assert.rejects(save(payload, version), /policy|permission|edição|mestre|atualizada/);
        await db.query(
          'update public.campaign_rules set players_can_edit_sheets=true where campaign_id=$1',
          [campaign],
        );
      },
    );
    await t.test(
      'bad schema, fractional attributes and broken resources cannot bypass the UI',
      async () => {
        for (const change of [
          { ...sheet, hp_current: 999 },
          { ...sheet, attributes: { ...sheet.attributes, agi: 19.5 } },
          { ...sheet, aptitudes: { magico: 4 } },
          { ...sheet, system: 'dnd5e' },
        ])
          await assert.rejects(save({ ...payload, sheet: change }, version));
        await assert.rejects(
          as(player, () =>
            db.query(
              "update public.characters set system_data=jsonb_set(system_data,'{hp_current}','999') where id=$1",
              [payload.id],
            ),
          ),
          /HP|Mana|Sanidade/,
        );
      },
    );
    await t.test(
      'the GM can deliver a catalogue ingredient with its identity, tags and icon intact',
      async () => {
        const itemId = randomUUID(),
          ref = INGREDIENTS[2];
        const {
          id: _id,
          quantity: _quantity,
          equipped: _equipped,
          ...entry
        } = ingredientItem(ref, randomUUID());
        const item = {
          id: itemId,
          campaign_id: campaign,
          name: ref.name,
          data: { ...newItemDefinition(), ...entry },
          visible_to_players: true,
          private_notes: '',
        };
        const saved = await as(gm, () =>
          db.query<{ v: { version: number } }>(
            'select to_jsonb(public.save_campaign_item($1::jsonb,null)) v',
            [JSON.stringify(item)],
          ),
        );
        await as(gm, () =>
          db.query('select public.give_campaign_item($1,$2,2,$3,$4)', [
            itemId,
            payload.id,
            randomUUID(),
            saved.rows[0].v.version,
          ]),
        );
        const inventory = (
          await db.query<{
            data: { ingredient_id: string; tags: string[]; image_path: string; quantity: number };
          }>(
            "select data from public.character_inventory where character_id=$1 and data->>'campaign_item_id'=$2",
            [payload.id, itemId],
          )
        ).rows[0].data;
        assert.equal(inventory.ingredient_id, ref.id);
        assert.ok(inventory.tags.includes('ingredientes'));
        assert.equal(inventory.image_path, ref.icon);
        assert.equal(inventory.quantity, 2);
        await db.query('insert into public.site_administrators(user_id) values($1)', [gm]);
        assert.equal(
          (
            await as(gm, () =>
              db.query<{ v: { database_version: number } }>(
                'select public.site_maintenance_health() v',
              ),
            )
          ).rows[0].v.database_version,
          48,
        );
        await db.query('delete from public.site_administrators where user_id=$1', [gm]);
      },
    );
    await t.test(
      'cleanup retains a catalogue image including an archived item definition',
      async () => {
        const path = `campaigns/${campaign}/preserved.webp`,
          itemId = randomUUID();
        const item = {
          id: itemId,
          campaign_id: campaign,
          name: 'Objeto com retrato',
          data: { ...newItemDefinition(), name: 'Objeto com retrato', image_path: path },
          visible_to_players: true,
        };
        await db.query("insert into storage.objects(bucket_id,name) values('campaign-media',$1)", [
          path,
        ]);
        const saved = await as(gm, () =>
          db.query<{ v: { version: number } }>(
            'select to_jsonb(public.save_campaign_item($1::jsonb,null)) v',
            [JSON.stringify(item)],
          ),
        );
        await as(gm, () =>
          db.query('select public.save_campaign_item($1::jsonb,$2)', [
            JSON.stringify({ ...item, data: { ...item.data, image_path: null } }),
            saved.rows[0].v.version,
          ]),
        );
        assert.equal(
          (
            await db.query<{ used: boolean }>(
              "select private.media_is_referenced47('campaign-media',$1) used",
              [path],
            )
          ).rows[0].used,
          true,
        );
        await db.query(
          "update private.media_cleanup_jobs set not_before=now()-interval '1 day' where name=$1",
          [path],
        );
        const leased = await db.query<{ name: string }>(
          'select name from public.lease_media_cleanup(100)',
        );
        assert.ok(!leased.rows.some((r) => r.name === path));
        assert.equal(
          (await db.query('select * from storage.objects where name=$1', [path])).rows.length,
          1,
        );
      },
    );
    await t.test(
      'migration reapplies without altering an existing sheet or duplicating ingredients',
      async () => {
        const before = JSON.stringify(
          (await db.query('select system_data from public.characters where id=$1', [payload.id]))
            .rows,
        );
        await db.exec(readMigration('202611040048_arkanis_sheets_and_ingredients.sql'));
        assert.equal(
          JSON.stringify(
            (await db.query('select system_data from public.characters where id=$1', [payload.id]))
              .rows,
          ),
          before,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              'select count(*)::integer n from public.arkanis_ingredients',
            )
          ).rows[0].n,
          180,
        );
      },
    );
    await t.test('a deleted sheet cannot be resurrected by a stale editor', async () => {
      await as(gm, () => db.query('delete from public.characters where id=$1', [payload.id]));
      await assert.rejects(save(payload, version), /atualizada|removida/);
      assert.equal(
        (await db.query('select * from public.characters where id=$1', [payload.id])).rows.length,
        0,
      );
    });
  } finally {
    await db.close();
  }
});

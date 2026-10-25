import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { defaultSheet } from '../src/systems/dnd5e';
import type { BattleMap } from '../src/features/vtt/types';

test('044: GM lighting settings are atomic, persistent and protected; zero range grants no sight', async (t) => {
  const db = await billingDatabase();
  try {
    const gm = randomUUID(),
      player = randomUUID(),
      stranger = randomUUID(),
      campaign = randomUUID(),
      hero = randomUUID();
    await db.exec('update public.site_billing_settings set billing_enabled=false');
    await db.query(
      "insert into auth.users(id,email) values($1,'night-gm@test.local'),($2,'night-player@test.local'),($3,'night-stranger@test.local')",
      [gm, player, stranger],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,'00000000-0000-4000-8000-000000000001','Noite')",
      [campaign, gm],
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      campaign,
      player,
    ]);
    async function as<T>(id: string, fn: () => Promise<T>) {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      try {
        return await fn();
      } finally {
        await db.exec('reset role');
      }
    }
    const chapter = (
      await as(gm, () =>
        db.query<{ id: string }>("select (public.save_campaign_session($1,'Noite',1)).id", [
          campaign,
        ]),
      )
    ).rows[0].id;
    await as(gm, () => db.query('select public.start_campaign_session($1)', [chapter]));
    const map = (
      await as(gm, () =>
        db.query<{ map: BattleMap }>('select to_jsonb(public.create_battle_map($1,$2)) map', [
          campaign,
          JSON.stringify({
            name: 'Escuridão',
            width: 20,
            height: 15,
            adventure_session_id: chapter,
          }),
        ]),
      )
    ).rows[0].map;
    const configure = async (enabled: boolean | null, period: string, level: string, user = gm) =>
      (
        await as(user, () =>
          db.query<{ map: BattleMap }>(
            'select to_jsonb(public.configure_battle_map_vision($1,$2,$3,$4)) map',
            [map.id, enabled, period, level],
          ),
        )
      ).rows[0].map;
    await t.test(
      'one save applies the night preset and preserves separate daytime settings',
      async () => {
        const night = await configure(true, 'night', 'dark');
        assert.equal(night.vision_enabled, true);
        assert.equal(night.lighting, 'night');
        assert.equal(night.darkness_level, 'dark');
        const day = await configure(true, 'day', 'dim');
        assert.equal(day.day_darkness_level, 'dim');
        assert.equal(day.darkness_level, 'dark');
        const dim = await configure(true, 'night', 'dim');
        assert.equal(dim.day_darkness_level, 'dim');
        assert.equal(dim.darkness_level, 'dim');
        assert.equal((await configure(false, 'night', 'dark')).vision_enabled, false);
      },
    );
    await t.test(
      'players, outsiders, invalid input and anonymous callers cannot change settings',
      async () => {
        for (const user of [player, stranger])
          await assert.rejects(configure(true, 'night', 'dark', user), /mestre/);
        await assert.rejects(configure(null, 'night', 'dark'), /válidos/);
        await assert.rejects(configure(true, 'bad', 'dark'), /válidos/);
        await assert.rejects(configure(true, 'night', 'bad'), /válidos/);
        const privileges = (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege('anon','public.configure_battle_map_vision(uuid,boolean,text,text)','execute') allowed",
          )
        ).rows[0];
        assert.equal(privileges.allowed, false);
      },
    );
    await t.test(
      'human sight is absent even at zero distance in darkness, and present with light or racial vision',
      async () => {
        await as(player, () =>
          db.query('select public.save_character($1::jsonb)', [
            JSON.stringify({
              id: hero,
              campaign_id: campaign,
              rpg_system_id: '00000000-0000-4000-8000-000000000001',
              owner_id: player,
              name: 'Humano',
              sheet: defaultSheet(),
            }),
          ]),
        );
        const actor = (
          await as(gm, () =>
            db.query<{ id: string }>('select (public.add_character_to_battle_map($1,$2,2,2)).id', [
              map.id,
              hero,
            ]),
          )
        ).rows[0].id;
        const sight = async () =>
          (
            await db.query<{ sees: boolean }>(
              'select private.battle43_can_see(a,a,m) sees from public.battle_map_tokens a join public.battle_maps m on m.id=a.map_id where a.id=$1',
              [actor],
            )
          ).rows[0].sees;
        await as(gm, () =>
          db.query('select public.start_battle_combat($1,$2)', [
            map.battle_session_id,
            JSON.stringify([{ token_id: actor, initiative: 15 }]),
          ]),
        );
        await configure(true, 'night', 'dark');
        assert.equal(await sight(), false);
        await configure(true, 'night', 'dim');
        assert.equal(await sight(), true);
        await db.query(
          'update public.characters set system_data=system_data||\'{"race":"Anão","race_id":"anao"}\'::jsonb where id=$1',
          [hero],
        );
        await configure(true, 'night', 'dark');
        assert.equal(await sight(), true);
        await as(gm, () =>
          db.query('select public.end_battle_combat($1)', [map.battle_session_id]),
        );
      },
    );
    await t.test('archived chapters reject further lighting changes', async () => {
      await as(gm, () => db.query("select public.end_campaign_session($1,'Fim')", [chapter]));
      await assert.rejects(configure(true, 'day', 'none'), /encerrado/);
    });
  } finally {
    await db.close();
  }
});

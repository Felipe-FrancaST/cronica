import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { defaultSheet } from '../src/systems/dnd5e';
import {
  defaultSession,
  type CampaignSession,
  type CampaignRules,
  type SessionEvent,
} from '../src/features/sessions/types';

test('session selection follows the active chapter and excludes preparation for players', () => {
  const rows = [
    { id: 'future', status: 'planned' },
    { id: 'old', status: 'ended' },
  ] as CampaignSession[];
  assert.equal(defaultSession(rows, true)?.id, 'future');
  assert.equal(defaultSession(rows, false)?.id, 'old');
  assert.equal(
    defaultSession([{ id: 'active', status: 'active' } as CampaignSession, ...rows], true)?.id,
    'active',
  );
  assert.equal(defaultSession([], true), undefined);
});
test('PostgreSQL preserves old scenery, archives sessions, journals events and enforces group rules', async (t) => {
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
    for (const f of files.filter((f) => f < '202610060016')) await db.exec(readMigration(f));
    const gm = randomUUID(),
      player = randomUUID(),
      outsider = randomUUID(),
      cid = randomUUID(),
      foreign = randomUUID(),
      hero = randomUUID(),
      npc = randomUUID(),
      hidden = randomUUID(),
      system = '00000000-0000-4000-8000-000000000001';
    await db.query(
      "insert into auth.users(id,email) values($1,'gm@sessions.test'),($2,'player@sessions.test'),($3,'other@sessions.test')",
      [gm, player, outsider],
    );
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Sessões'),($4,$5,$3,'Outra')",
      [cid, gm, system, foreign, outsider],
    );
    await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
      cid,
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
    const call = async <T>(name: string, args: unknown[], user = gm) => {
      const q = await as(user, () =>
        db.query<{ value: T }>(
          `select to_jsonb(public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})) value`,
          args,
        ),
      );
      return q.rows[0].value;
    };
    const sheet = {
      ...defaultSheet(),
      class_id: 'wizard',
      level: 5,
      hp_current: 30,
      slots_used: { '3': 2 },
      hit_dice_used: 4,
    };
    const character = {
      id: hero,
      campaign_id: cid,
      owner_id: player,
      rpg_system_id: system,
      name: 'Aventureira',
      portrait_path: null,
      appearance: '',
      biography: '',
      sheet,
    };
    await call('save_character', [JSON.stringify(character)], player);
    await db.query(
      "insert into public.npcs(id,campaign_id,rpg_system_id,name,visible_to_players,status) values($1,$2,$3,'Aliado',true,'Vivo'),($4,$2,$3,'Identidade secreta',false,'Vivo')",
      [npc, cid, system, hidden],
    );
    await db.query(
      'insert into public.npc_stats(npc_id,hp_current,hp_max) values($1,10,10),($2,10,10)',
      [npc, hidden],
    );
    const oldMap = await call<{ id: string; campaign_id: string; adventure_session_id: string }>(
      'create_battle_map',
      [cid, JSON.stringify({ name: 'Taverna', width: 12, height: 12 })],
    );
    await as(gm, () =>
      db.query(
        "insert into public.battle_map_cells(map_id,x,y,terrain_type,movement_cost) values($1,8,8,'water',2)",
        [oldMap.id],
      ),
    );
    await as(gm, () =>
      db.query(
        'insert into public.battle_map_objects(map_id,object_type,geometry,metadata) values($1,\'portal\',\'{"x":1,"y":1,"width":1,"height":1}\',\'{"portal_code":"ENTRADA"}\'),($1,\'portal\',\'{"x":4,"y":4,"width":1,"height":1}\',\'{"portal_code":"ENTRADA"}\')',
        [oldMap.id],
      ),
    );
    const image = `campaign_mural/${cid}/${randomUUID()}.webp`;
    await db.query("insert into storage.objects(bucket_id,name) values('campaign-media',$1)", [
      image,
    ]);
    let card = await call<{ id: string; updated_at: string }>('save_campaign_mural_item', [
      JSON.stringify({
        campaign_id: cid,
        kind: 'image',
        title: 'A taverna',
        description: 'Uma noite de aventura',
        image_path: image,
        visible_to_players: true,
      }),
    ]);
    const token = await call<{ id: string }>('add_character_to_battle_map', [
      oldMap.id,
      hero,
      2,
      2,
    ]);
    await db.exec(readMigration(files.find((f) => f.includes('0016_campaign'))));
    card = (
      await db.query<{ value: typeof card }>(
        'select to_jsonb(i) value from public.campaign_mural_items i where id=$1',
        [card.id],
      )
    ).rows[0].value;
    let legacy: CampaignSession, next: CampaignSession;
    await t.test('016 backfills without erasing grids, cards or character pieces', async () => {
      legacy = (
        await as(gm, () =>
          db.query<CampaignSession>('select * from public.campaign_sessions where campaign_id=$1', [
            cid,
          ]),
        )
      ).rows[0];
      assert.equal(legacy.number, 1);
      assert.equal(legacy.status, 'planned');
      assert.equal(
        (
          await db.query<{ adventure_session_id: string }>(
            'select adventure_session_id from public.battle_maps where id=$1',
            [oldMap.id],
          )
        ).rows[0].adventure_session_id,
        legacy.id,
      );
      assert.equal(
        (await db.query('select * from public.battle_map_tokens where id=$1', [token.id])).rows
          .length,
        1,
      );
      assert.equal(
        (await db.query('select * from public.battle_map_objects where map_id=$1', [oldMap.id]))
          .rows.length,
        2,
      );
      assert.equal(
        (await db.query('select * from public.campaign_mural_items where id=$1', [card.id])).rows
          .length,
        1,
      );
    });
    await t.test(
      'preparation and other campaigns stay private; only GM creates numbered chapters',
      async () => {
        assert.equal(
          (await as(player, () => db.query('select * from public.campaign_sessions'))).rows.length,
          0,
        );
        assert.equal(
          (await as(player, () => db.query('select * from public.battle_maps'))).rows.length,
          0,
        );
        await assert.rejects(
          () => call('save_campaign_session', [cid, 'Tentativa', 2], player),
          /mestre/,
        );
        await assert.rejects(
          () => call('save_campaign_session', [foreign, 'Tentativa', 2]),
          /mestre/,
        );
        next = await call<CampaignSession>('save_campaign_session', [cid, 'A estrada', 2]);
        assert.ok(next.created_at);
        assert.equal(next.started_at, null);
        await assert.rejects(
          () => call('save_campaign_session', [cid, 'Duplicada', 2]),
          /duplicate|únic|unique/i,
        );
      },
    );
    await t.test(
      'start exposes the chapter and snapshots prepared images; only one may be active',
      async () => {
        legacy = await call<CampaignSession>('start_campaign_session', [legacy.id]);
        assert.equal(legacy.status, 'active');
        assert.ok(legacy.started_at);
        await assert.rejects(() => call('start_campaign_session', [next.id]), /Encerre/);
        const visible = (
          await as(player, () =>
            db.query<SessionEvent>('select * from public.campaign_session_events'),
          )
        ).rows;
        assert.ok(visible.some((e) => e.title === 'A taverna' && e.image_path === image));
        assert.equal(
          (await as(player, () => db.query('select * from public.campaign_mural_items'))).rows
            .length,
          1,
        );
        assert.equal(
          (await as(outsider, () => db.query('select * from public.campaign_session_events'))).rows
            .length,
          0,
        );
      },
    );
    await t.test(
      'notes and Mural edits preserve public snapshots without publishing private notes',
      async () => {
        await call('add_campaign_session_note', [
          legacy.id,
          'Segredo do mestre',
          'Não divulgar',
          null,
          false,
        ]);
        await call('add_campaign_session_note', [
          legacy.id,
          'Ponte descoberta',
          'O grupo atravessou o rio',
          image,
          true,
        ]);
        await call('save_campaign_mural_item', [
          JSON.stringify({
            id: card.id,
            campaign_id: cid,
            adventure_session_id: legacy.id,
            kind: 'image',
            title: 'Depois da noite',
            description: 'Nova descrição',
            image_path: image,
            visible_to_players: true,
          }),
          card.updated_at,
        ]);
        const rows = (
          await as(player, () =>
            db.query<SessionEvent>('select * from public.campaign_session_events'),
          )
        ).rows;
        assert.ok(
          rows.some((e) => e.title === 'A taverna' && e.description === 'Uma noite de aventura'),
        );
        assert.ok(rows.some((e) => e.title === 'Depois da noite'));
        assert.ok(rows.some((e) => e.title === 'Ponte descoberta'));
        assert.equal(
          rows.some((e) => e.title === 'Segredo do mestre'),
          false,
        );
        await assert.rejects(
          () => call('add_campaign_session_note', [legacy.id, 'Intrusão', '', null, true], player),
          /mestre/,
        );
      },
    );
    await t.test(
      '0 PV does not kill players; confirmed deaths deduplicate and hidden NPCs stay private',
      async () => {
        await db.query(
          "update public.characters set system_data=jsonb_set(system_data,'{hp_current}','0') where id=$1",
          [hero],
        );
        let rows = (
          await db.query<SessionEvent>(
            "select * from public.campaign_session_events where kind='character_death'",
          )
        ).rows;
        assert.equal(rows.length, 0);
        assert.equal(
          (
            await db.query(
              "select * from public.campaign_session_events where kind='character_down'",
            )
          ).rows.length,
          1,
        );
        await call('confirm_campaign_session_death', [legacy.id, hero, 'character']);
        await call('confirm_campaign_session_death', [legacy.id, hero, 'character']);
        rows = (
          await db.query<SessionEvent>(
            "select * from public.campaign_session_events where kind='character_death'",
          )
        ).rows;
        assert.equal(rows.length, 1);
        await db.query('update public.npc_stats set hp_current=0 where npc_id in($1,$2)', [
          npc,
          hidden,
        ]);
        await db.query("update public.npcs set status='Morto' where id=$1", [npc]);
        assert.equal(
          (await db.query("select * from public.campaign_session_events where kind='npc_death'"))
            .rows.length,
          2,
        );
        const publicDeaths = (
          await as(player, () =>
            db.query<SessionEvent>(
              "select * from public.campaign_session_events where kind='npc_death'",
            ),
          )
        ).rows;
        assert.equal(publicDeaths.length, 1);
        assert.match(publicDeaths[0].title, /Aliado/);
        assert.equal(JSON.stringify(publicDeaths).includes('Identidade secreta'), false);
      },
    );
    let rules: CampaignRules;
    await t.test(
      'group level updates all PCs, clamps spent slots on level-down and rejects direct bypass',
      async () => {
        rules = (
          await as(gm, () =>
            db.query<CampaignRules>('select * from public.campaign_rules where campaign_id=$1', [
              cid,
            ]),
          )
        ).rows[0];
        rules = await call<CampaignRules>('save_campaign_rules', [
          cid,
          JSON.stringify({ ...rules, party_level: 2, lock_player_level: true }),
          rules.updated_at,
        ]);
        const state = (
          await db.query<{ system_data: Record<string, unknown> }>(
            'select system_data from public.characters where id=$1',
            [hero],
          )
        ).rows[0].system_data;
        assert.equal(state.level, 2);
        assert.deepEqual(state.slots_used, {});
        assert.equal(state.hit_dice_used, 2);
        await assert.rejects(
          () =>
            as(player, () =>
              db.query(
                "update public.characters set system_data=jsonb_set(system_data,'{level}','20') where id=$1",
                [hero],
              ),
            ),
          /nível/,
        );
        await assert.rejects(
          () =>
            call(
              'save_campaign_rules',
              [cid, JSON.stringify({ ...rules, party_level: 20 }), rules.updated_at],
              player,
            ),
          /mestre/,
        );
        await assert.rejects(
          () => call('save_campaign_rules', [cid, JSON.stringify(rules), '2000-01-01T00:00:00Z']),
          /mudaram/,
        );
        assert.equal(
          (
            await db.query<{ level: number }>(
              "select (system_data->>'level')::int level from public.characters where id=$1",
              [hero],
            )
          ).rows[0].level,
          2,
        );
      },
    );
    await t.test(
      'disabling new characters still permits authorized edits of existing sheets',
      async () => {
        rules = await call<CampaignRules>('save_campaign_rules', [
          cid,
          JSON.stringify({ ...rules, players_can_create_characters: false }),
          rules.updated_at,
        ]);
        const prior = (
          await db.query<{ value: { updated_at: string } }>(
            'select to_jsonb(c) value from public.characters c where id=$1',
            [hero],
          )
        ).rows[0].value;
        const editable = {
          ...character,
          biography: 'História atualizada',
          sheet: {
            ...defaultSheet(),
            class_id: 'wizard',
            level: 2,
            hp_current: 0,
            death_failures: 3,
          },
        };
        await call('save_character', [JSON.stringify(editable), prior.updated_at], player);
        assert.equal(
          (
            await db.query<{ biography: string }>(
              'select biography from public.characters where id=$1',
              [hero],
            )
          ).rows[0].biography,
          'História atualizada',
        );
        await assert.rejects(
          () => call('save_character', [JSON.stringify({ ...editable, id: randomUUID() })], player),
          /policy|permiss/i,
        );
      },
    );
    await t.test(
      'sheet locks retain player reading and block new sheets and child-row writes',
      async () => {
        rules = await call<CampaignRules>('save_campaign_rules', [
          cid,
          JSON.stringify({
            ...rules,
            players_can_create_characters: false,
            players_can_edit_sheets: false,
            players_can_end_turn: false,
            default_restrict_movement: false,
            default_failed_actions_consume: false,
          }),
          rules.updated_at,
        ]);
        assert.equal(
          (
            await as(player, () =>
              db.query('select * from public.character_attributes where character_id=$1', [hero]),
            )
          ).rows.length,
          6,
        );
        await assert.rejects(
          () =>
            as(player, () =>
              db.query(
                'insert into public.character_inventory(character_id,data) values($1,\'{"name":"Bypass"}\')',
                [hero],
              ),
            ),
          /policy|permiss/i,
        );
        await assert.rejects(
          () =>
            call(
              'save_character',
              [
                JSON.stringify({
                  ...character,
                  id: randomUUID(),
                  sheet: { ...sheet, level: 2, slots_used: {} },
                }),
              ],
              player,
            ),
          /policy|permiss/i,
        );
        const before = (
          await db.query<{ name: string }>('select name from public.characters where id=$1', [hero])
        ).rows[0].name;
        assert.equal(
          (
            await as(player, () =>
              db.query("update public.characters set name='Bypass' where id=$1 returning id", [
                hero,
              ]),
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query<{ name: string }>('select name from public.characters where id=$1', [
              hero,
            ])
          ).rows[0].name,
          before,
        );
      },
    );
    await t.test('dice and action history survive removal of pieces at session close', async () => {
      const roll = await call<{ total: number }>('roll_battle_dice', [
        oldMap.id,
        '2d6+3',
        randomUUID(),
        'Dano',
        'public',
        'normal',
      ]);
      assert.ok(roll.total >= 5 && roll.total <= 15);
      assert.equal(
        (
          await db.query(
            "select * from public.campaign_session_events where kind='battle_dice_rolls_insert'",
          )
        ).rows.length,
        1,
      );
      await call('start_battle_combat', [
        (
          await db.query<{ battle_session_id: string }>(
            'select battle_session_id from public.battle_maps where id=$1',
            [oldMap.id],
          )
        ).rows[0].battle_session_id,
        JSON.stringify([{ token_id: token.id, initiative: 20 }]),
      ]);
      const activeBattle = (
        await db.query<{ battle_session_id: string }>(
          'select battle_session_id from public.battle_maps where id=$1',
          [oldMap.id],
        )
      ).rows[0].battle_session_id;
      await assert.rejects(() => call('advance_battle_turn', [activeBattle], player), /mestre/);
      legacy = await call<CampaignSession>('end_campaign_session', [
        legacy.id,
        'A noite terminou na taverna.',
      ]);
      assert.equal(legacy.status, 'ended');
      assert.ok(legacy.ended_at);
      assert.equal((await db.query('select * from public.battle_map_tokens')).rows.length, 0);
      assert.equal(
        (await db.query('select * from public.characters where id=$1', [hero])).rows.length,
        1,
      );
      assert.equal((await db.query('select * from public.npcs where id=$1', [npc])).rows.length, 1);
      const history = (
        await as(player, () =>
          db.query<SessionEvent>('select * from public.campaign_session_events'),
        )
      ).rows;
      assert.ok(history.some((e) => e.kind === 'battle_dice_rolls_insert'));
      assert.ok(history.some((e) => e.kind === 'character_death'));
      assert.ok(history.some((e) => e.kind === 'session_ended'));
    });
    await t.test(
      'archived grids and Mural cannot be changed; historical images cannot be deleted',
      async () => {
        await assert.rejects(
          () =>
            as(gm, () =>
              db.query("update public.battle_maps set name='Alterado' where id=$1", [oldMap.id]),
            ),
          /encerrada/,
        );
        await assert.rejects(
          () =>
            as(gm, () =>
              db.query('delete from public.battle_map_objects where map_id=$1', [oldMap.id]),
            ),
          /encerrada/,
        );
        await assert.rejects(
          () => call('set_battle_fog', [oldMap.id, 1, 1, 1, 1, true]),
          /encerrada/,
        );
        const item = (
          await db.query<{ updated_at: string }>(
            'select updated_at from public.campaign_mural_items where id=$1',
            [card.id],
          )
        ).rows[0];
        await assert.rejects(
          () => call('delete_campaign_mural_item', [card.id, item.updated_at]),
          /encerrada/,
        );
        await assert.rejects(
          () => call('add_campaign_session_note', [legacy.id, 'Tarde demais', '']),
          /Inicie/,
        );
        assert.equal(
          (
            await as(gm, () =>
              db.query('delete from storage.objects where name=$1 returning id', [image]),
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (await as(player, () => db.query('select * from storage.objects where name=$1', [image])))
            .rows.length,
          1,
        );
      },
    );
    await t.test(
      'reuse copies scenery and portal pairs without mixing sessions or copying characters',
      async () => {
        const copied = await call<{
          id: string;
          adventure_session_id: string;
          battle_session_id: string;
        }>('copy_battle_map_to_session', [oldMap.id, next.id, 'Nova taverna']);
        assert.equal(copied.adventure_session_id, next.id);
        assert.notEqual(copied.id, oldMap.id);
        assert.equal(
          (await db.query('select * from public.battle_map_objects where map_id=$1', [copied.id]))
            .rows.length,
          2,
        );
        assert.equal(
          (await db.query('select * from public.battle_map_cells where map_id=$1', [copied.id]))
            .rows.length,
          1,
        );
        assert.equal(
          (await db.query('select * from public.battle_map_tokens where map_id=$1', [copied.id]))
            .rows.length,
          0,
        );
        assert.notEqual(
          copied.battle_session_id,
          (
            await db.query<{ battle_session_id: string }>(
              'select battle_session_id from public.battle_maps where id=$1',
              [oldMap.id],
            )
          ).rows[0].battle_session_id,
        );
        assert.equal(await call<number>('copy_campaign_mural_to_session', [legacy.id, next.id]), 1);
        const battle = (
          await db.query<{ restrict_movement_to_turn: boolean; failed_actions_consume: boolean }>(
            'select * from public.battle_sessions where id=$1',
            [copied.battle_session_id],
          )
        ).rows[0];
        assert.equal(battle.restrict_movement_to_turn, false);
        assert.equal(battle.failed_actions_consume, false);
        await assert.rejects(
          () => call('copy_battle_map_to_session', [oldMap.id, legacy.id, 'Não']),
          /encerrada/,
        );
        await assert.rejects(
          () => call('copy_battle_map_to_session', [oldMap.id, next.id, 'Não'], player),
          /mestre/,
        );
        next = await call<CampaignSession>('start_campaign_session', [next.id]);
        assert.equal(next.status, 'active');
        await call('end_campaign_session', [next.id, '']);
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from public.campaign_sessions where status='ended'",
            )
          ).rows[0].n,
          2,
        );
      },
    );
    await t.test('campaign deletion still cascades its archives', async () => {
      await as(gm, () => db.query('delete from public.campaigns where id=$1', [cid]));
      assert.equal(
        (await db.query('select * from public.campaign_session_events where campaign_id=$1', [cid]))
          .rows.length,
        0,
      );
    });
  } finally {
    await db.close();
  }
});

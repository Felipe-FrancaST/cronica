import { migrationNames, readMigration } from '../scripts/migration-sources.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { PGlite } from '@electric-sql/pglite';
import { defaultSheet } from '../src/systems/dnd5e';
import { createDemoWorkspace } from '../src/lib/demo-data';
const master = '10000000-0000-4000-8000-000000000001',
  player = '10000000-0000-4000-8000-000000000002',
  other = '10000000-0000-4000-8000-000000000003',
  outsider = '10000000-0000-4000-8000-000000000004',
  master2 = '10000000-0000-4000-8000-000000000005';
const campaign = '20000000-0000-4000-8000-000000000001',
  foreignCampaign = '20000000-0000-4000-8000-000000000002',
  character = '30000000-0000-4000-8000-000000000001',
  otherCharacter = '30000000-0000-4000-8000-000000000002';
const system = '00000000-0000-4000-8000-000000000001',
  npcPrivate = '40000000-0000-4000-8000-000000000001',
  npcPublic = '40000000-0000-4000-8000-000000000002',
  region = '50000000-0000-4000-8000-000000000001',
  regionHidden = '50000000-0000-4000-8000-000000000002';
test('all migrations and adversarial RLS scenarios on real PostgreSQL via PGlite', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated nologin nosuperuser nobypassrls; create role anon nologin nosuperuser nobypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
      alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;`);
    for (const file of migrationNames()
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(readMigration(file));
    await db.query(
      `insert into auth.users(id,email,raw_user_meta_data) values ($1,'master@example.test','{"name":"Mestre"}'),($2,'player@example.test','{"name":"Jogador"}'),($3,'other@example.test','{"name":"Outro"}'),($4,'outsider@example.test','{"name":"Fora"}'),($5,'master2@example.test','{"name":"Mestre 2"}')`,
      [master, player, other, outsider, master2],
    );
    await db.query(
      `insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Mesa 1'),($4,$5,$3,'Mesa 2')`,
      [campaign, master, system, foreignCampaign, master2],
    );
    await db.query(
      `insert into public.campaign_members(campaign_id,user_id) values($1,$2),($1,$3)`,
      [campaign, player, other],
    );
    const payload = (id: string, owner: string) => ({
      id,
      campaign_id: campaign,
      rpg_system_id: system,
      owner_id: owner,
      name: 'Herói',
      portrait_path: null,
      appearance: '',
      biography: '',
      sheet: defaultSheet(),
    });
    const asUser = async <T>(id: string, fn: () => Promise<T>) => {
      await db.exec('set role authenticated');
      await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id]);
      try {
        return await fn();
      } finally {
        await db.exec('reset role');
      }
    };
    await asUser(master, () =>
      db.query(
        "select public.start_campaign_session((public.save_campaign_session($1,'Teste',1)).id)",
        [campaign],
      ),
    );
    await asUser(player, () =>
      db.query('select public.save_character($1::jsonb)', [
        JSON.stringify(payload(character, player)),
      ]),
    );
    await asUser(other, () =>
      db.query('select public.save_character($1::jsonb)', [
        JSON.stringify(payload(otherCharacter, other)),
      ]),
    );
    await db.query(
      `insert into public.npcs(id,campaign_id,rpg_system_id,name,visible_to_players) values($1,$2,$3,'Segredo',false),($4,$2,$3,'Aliado',true)`,
      [npcPrivate, campaign, system, npcPublic],
    );
    await db.query(`insert into public.npc_stats(npc_id) values($1),($2)`, [npcPrivate, npcPublic]);
    await db.query(
      `insert into public.world_regions(id,campaign_id,name,visible_to_players) values($1,$2,'Público',true),($3,$2,'Segredo',false)`,
      [region, campaign, regionHidden],
    );
    await db.query(
      `insert into public.world_regions_private(entry_id,secrets) values($1,'Segredo do mestre')`,
      [region],
    );
    await db.query(
      `insert into storage.objects(bucket_id,name) values('campaign-media',$1),('campaign-media',$2),('campaign-media',$3),('campaign-media',$4)`,
      [
        `npcs/${npcPrivate}/image.webp`,
        `npcs/${npcPublic}/image.webp`,
        `world_regions/${regionHidden}/image.webp`,
        `characters/${otherCharacter}/image.webp`,
      ],
    );
    await t.test('player can only read their linked campaign and own sheet', async () => {
      await asUser(player, async () => {
        assert.equal((await db.query('select * from public.campaigns')).rows.length, 1);
        assert.deepEqual((await db.query('select id from public.characters')).rows, [
          { id: character },
        ]);
        assert.equal((await db.query('select * from public.character_attributes')).rows.length, 6);
      });
    });
    await t.test(
      'known private NPC IDs, child stats and hidden world rows stay inaccessible',
      async () => {
        await asUser(player, async () => {
          assert.equal(
            (await db.query('select * from public.npcs where id=$1', [npcPrivate])).rows.length,
            0,
          );
          assert.equal(
            (await db.query('select * from public.npc_stats where npc_id=$1', [npcPrivate])).rows
              .length,
            0,
          );
          assert.equal(
            (await db.query('select * from public.world_regions where id=$1', [regionHidden])).rows
              .length,
            0,
          );
          assert.equal(
            (await db.query('select * from public.world_regions_private')).rows.length,
            0,
          );
          assert.equal(
            (await db.query('select * from public.npcs where id=$1', [npcPublic])).rows.length,
            1,
          );
        });
      },
    );
    await t.test('a player cannot edit another sheet, public NPC or GM secrets', async () => {
      await asUser(player, async () => {
        assert.equal(
          (
            await db.query(
              `update public.characters set name='Invadido' where id=$1 returning id`,
              [otherCharacter],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(() =>
          db.query('select public.save_character($1::jsonb)', [
            JSON.stringify(payload(otherCharacter, other)),
          ]),
        );
        assert.equal(
          (
            await db.query(`update public.npcs set name='Invadido' where id=$1 returning id`, [
              npcPublic,
            ])
          ).rows.length,
          0,
        );
        await assert.rejects(() =>
          db.query(
            `insert into public.world_regions_private(entry_id,secrets) values($1,'Invadido')`,
            [region],
          ),
        );
      });
    });
    await t.test(
      'a player cannot forge membership, profile email or campaign ownership',
      async () => {
        await asUser(player, async () => {
          await assert.rejects(() =>
            db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
              foreignCampaign,
              player,
            ]),
          );
          await assert.rejects(() =>
            db.query(`update public.profiles set email='steal@example.test' where id=$1`, [player]),
          );
          await assert.rejects(() =>
            db.query('select public.add_campaign_member_by_email($1,$2)', [
              foreignCampaign,
              'outsider@example.test',
            ]),
          );
          assert.equal(
            (
              await db.query(`update public.campaigns set owner_id=$1 where id=$2 returning id`, [
                player,
                campaign,
              ])
            ).rows.length,
            0,
          );
        });
      },
    );
    await t.test(
      'unknown users are rejected and registered users are linked atomically',
      async () => {
        await asUser(master, async () => {
          await assert.rejects(
            () =>
              db.query('select public.add_campaign_member_by_email($1,$2)', [
                campaign,
                'unknown@example.test',
              ]),
            /ainda não possui/,
          );
          await db.query('select public.add_campaign_member_by_email($1,$2)', [
            campaign,
            ' OUTSIDER@example.test ',
          ]);
          assert.equal(
            (
              await db.query(
                'select * from public.campaign_members where campaign_id=$1 and user_id=$2',
                [campaign, outsider],
              )
            ).rows.length,
            1,
          );
          await assert.rejects(
            () =>
              db.query('select public.add_campaign_member_by_email($1,$2)', [
                campaign,
                'outsider@example.test',
              ]),
            /já está/,
          );
        });
      },
    );
    await t.test('masters cannot edit campaigns owned by other masters', async () => {
      await asUser(master, async () => {
        assert.equal(
          (await db.query('select * from public.campaigns where id=$1', [foreignCampaign])).rows
            .length,
          0,
        );
        assert.equal(
          (
            await db.query(`update public.campaigns set name='Invadido' where id=$1 returning id`, [
              foreignCampaign,
            ])
          ).rows.length,
          0,
        );
        await assert.rejects(
          () =>
            db.query('update public.characters set campaign_id=$1 where id=$2', [
              foreignCampaign,
              character,
            ]),
          /vínculo/,
        );
        assert.equal((await db.query('select * from public.world_regions_private')).rows.length, 1);
      });
    });
    await t.test(
      'private Storage inherits entity permissions instead of broad campaign access',
      async () => {
        await asUser(player, async () => {
          const r = await db.query<{ name: string }>('select name from storage.objects');
          assert.deepEqual(
            r.rows.map((x) => x.name),
            [`npcs/${npcPublic}/image.webp`],
          );
          await assert.rejects(() =>
            db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
              'campaign-media',
              `npcs/${npcPublic}/forged.webp`,
            ]),
          );
          await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
            'campaign-media',
            `characters/${character}/portrait.webp`,
          ]);
          assert.equal(
            (
              await db.query<{ allowed: boolean }>(
                `select private.can_access_media('npcs/not-a-uuid/image.webp',false) as allowed`,
              )
            ).rows[0].allowed,
            false,
          );
        });
      },
    );
    await t.test('invalid inventory rolls back the entire character save', async () => {
      await asUser(player, async () => {
        const bad = payload(character, player);
        bad.name = 'Must not be saved';
        bad.sheet.inventory = [
          {
            id: '80000000-0000-4000-8000-000000000001',
            name: 'Invalid',
            quantity: -1,
            weight: 0,
            category: 'item',
            equipped: false,
            notes: '',
          },
        ];
        await assert.rejects(() =>
          db.query('select public.save_character($1::jsonb)', [JSON.stringify(bad)]),
        );
        assert.equal(
          (
            await db.query<{ name: string }>('select name from public.characters where id=$1', [
              character,
            ])
          ).rows[0].name,
          'Herói',
        );
      });
    });
    await t.test(
      'world RPCs save public content separately from secrets and enforce regional links',
      async () => {
        const place = {
          id: '80000000-0000-4000-8000-000000000010',
          campaign_id: campaign,
          kind: 'city',
          name: 'Cidade RPC',
          region_id: region,
          population: 1200,
          government: 'Conselho',
          visible_to_players: true,
          secrets: 'Segredo RPC',
          private_notes: 'Nota RPC',
        };
        await asUser(master, async () => {
          await db.query('select public.save_world_entry($1::jsonb)', [JSON.stringify(place)]);
          assert.equal(
            (
              await db.query<{ secrets: string }>(
                'select secrets from public.world_cities_private where entry_id=$1',
                [place.id],
              )
            ).rows[0].secrets,
            'Segredo RPC',
          );
        });
        await asUser(player, async () => {
          assert.equal(
            (await db.query('select * from public.world_cities where id=$1', [place.id])).rows
              .length,
            1,
          );
          assert.equal(
            (await db.query('select * from public.world_cities_private')).rows.length,
            0,
          );
          await assert.rejects(() =>
            db.query('select public.save_world_entry($1::jsonb)', [JSON.stringify(place)]),
          );
        });
        await asUser(master, async () => {
          await db.query('delete from public.world_regions where id=$1', [region]);
          assert.equal(
            (
              await db.query<{ region_id: string | null }>(
                'select region_id from public.world_cities where id=$1',
                [place.id],
              )
            ).rows[0].region_id,
            null,
          );
        });
      },
    );
    await t.test('NPC RPC saves statistics, attacks and spells as one transaction', async () => {
      const npc = {
        ...createDemoWorkspace().npcs[0],
        id: '80000000-0000-4000-8000-000000000020',
        campaign_id: campaign,
        name: 'NPC RPC',
        spells: [
          {
            id: '80000000-0000-4000-8000-000000000021',
            name: 'Luz',
            level: 0,
            prepared: true,
            description: 'Um brilho.',
            range: 'Toque',
            duration: '1 hora',
            components: 'V, M',
          },
        ],
      };
      await asUser(master, async () => {
        await db.query('select public.save_npc($1::jsonb)', [JSON.stringify(npc)]);
        assert.equal(
          (await db.query('select * from public.npc_attacks where npc_id=$1', [npc.id])).rows
            .length,
          1,
        );
        assert.equal(
          (await db.query('select * from public.npc_spells where npc_id=$1', [npc.id])).rows.length,
          1,
        );
      });
      await asUser(player, async () => {
        assert.equal(
          (await db.query('select * from public.npc_stats where npc_id=$1', [npc.id])).rows.length,
          1,
        );
        await assert.rejects(() =>
          db.query('select public.save_npc($1::jsonb)', [JSON.stringify(npc)]),
        );
      });
    });
    await t.test(
      'tactical VTT enforces token authority, turn order and optimistic locking',
      async () => {
        let mapId = '',
          sessionId = '',
          playerToken = '',
          otherToken = '';
        await asUser(master, async () => {
          const created = await db.query<{ id: string; battle_session_id: string }>(
            `select * from public.create_battle_map($1,$2::jsonb)`,
            [
              campaign,
              JSON.stringify({
                name: 'Arena',
                width: 8,
                height: 8,
                scale_per_cell: 1.5,
                scale_unit: 'm',
              }),
            ],
          );
          mapId = created.rows[0].id;
          sessionId = created.rows[0].battle_session_id;
          const first = await db.query<{ id: string }>(
            `select * from public.add_character_to_battle_map($1,$2,0,0)`,
            [mapId, character],
          );
          const second = await db.query<{ id: string }>(
            `select * from public.add_character_to_battle_map($1,$2,3,0)`,
            [mapId, otherCharacter],
          );
          playerToken = first.rows[0].id;
          otherToken = second.rows[0].id;
        });
        await asUser(player, async () => {
          assert.equal(
            (await db.query('select * from public.battle_maps where id=$1', [mapId])).rows.length,
            1,
          );
          assert.equal((await db.query('select * from public.battle_map_tokens')).rows.length, 2);
          assert.equal(
            (
              await db.query(`update public.battle_map_tokens set x=7 where id=$1 returning id`, [
                playerToken,
              ])
            ).rows.length,
            0,
          );
          await assert.rejects(() =>
            db.query(`select public.move_battle_token($1,2,0,$2::jsonb,0,false)`, [
              otherToken,
              JSON.stringify([{ x: 2, y: 0 }]),
            ]),
          );
          const moved = await db.query<{ x: number; version: bigint }>(
            `select * from public.move_battle_token($1,1,0,$2::jsonb,0,false)`,
            [playerToken, JSON.stringify([{ x: 1, y: 0 }])],
          );
          assert.equal(moved.rows[0].x, 1);
          await assert.rejects(
            () =>
              db.query(`select public.move_battle_token($1,2,0,$2::jsonb,0,false)`, [
                playerToken,
                JSON.stringify([{ x: 2, y: 0 }]),
              ]),
            /outra pessoa/,
          );
          await assert.rejects(
            () =>
              db.query(`select public.move_battle_token($1,2,0,$2::jsonb,$3::bigint,false)`, [
                playerToken,
                JSON.stringify([{ x: 2, y: 0 }]),
                null,
              ]),
            /outra pessoa/,
          );
        });
        await asUser(master, async () => {
          await db.query(`select public.start_battle_combat($1,$2::jsonb)`, [
            sessionId,
            JSON.stringify([
              { token_id: otherToken, initiative: 20 },
              { token_id: playerToken, initiative: 10 },
            ]),
          ]);
        });
        await asUser(player, async () => {
          const version = (
            await db.query<{ version: bigint }>(
              'select version from public.battle_map_tokens where id=$1',
              [playerToken],
            )
          ).rows[0].version;
          await assert.rejects(
            () =>
              db.query(`select public.move_battle_token($1,2,0,$2::jsonb,$3,false)`, [
                playerToken,
                JSON.stringify([{ x: 2, y: 0 }]),
                version,
              ]),
            /Aguarde o turno/,
          );
          await assert.rejects(
            () =>
              db.query(`select public.move_battle_token($1,2,0,$2::jsonb,$3,$4::boolean)`, [
                playerToken,
                JSON.stringify([{ x: 2, y: 0 }]),
                version,
                null,
              ]),
            /Aguarde o turno/,
          );
        });
        await asUser(master, () => db.query(`select public.advance_battle_turn($1)`, [sessionId]));
        await asUser(player, async () => {
          const version = (
            await db.query<{ version: bigint }>(
              'select version from public.battle_map_tokens where id=$1',
              [playerToken],
            )
          ).rows[0].version;
          const moved = await db.query<{ x: number; movement_remaining: string }>(
            `select * from public.move_battle_token($1,2,0,$2::jsonb,$3,false)`,
            [playerToken, JSON.stringify([{ x: 2, y: 0 }]), version],
          );
          assert.equal(moved.rows[0].x, 2);
          assert.equal(Number(moved.rows[0].movement_remaining), 7.5);
          assert.equal(
            (
              await db.query('select * from public.battle_movements where token_id=$1', [
                playerToken,
              ])
            ).rows.length,
            2,
          );
          const ended = await db.query<{ active_token_id: string; round: number }>(
            `select * from public.advance_battle_turn($1)`,
            [sessionId],
          );
          assert.equal(ended.rows[0].active_token_id, otherToken);
          assert.equal(ended.rows[0].round, 2);
        });
      },
    );
    await t.test('stale character versions cannot overwrite newer changes', async () => {
      await asUser(player, async () => {
        await assert.rejects(
          () =>
            db.query('select public.save_character($1::jsonb,$2::timestamptz)', [
              JSON.stringify(payload(character, player)),
              '2000-01-01T00:00:00Z',
            ]),
          /atualizada em outra sessão/,
        );
      });
    });
    await t.test(
      'removal revokes campaign, character and media access while preserving GM records',
      async () => {
        await db.query('delete from public.campaign_members where campaign_id=$1 and user_id=$2', [
          campaign,
          player,
        ]);
        await asUser(player, async () => {
          assert.equal((await db.query('select * from public.campaigns')).rows.length, 0);
          assert.equal((await db.query('select * from public.characters')).rows.length, 0);
          assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
        });
        await asUser(master, async () =>
          assert.equal(
            (await db.query('select * from public.characters where id=$1', [character])).rows
              .length,
            1,
          ),
        );
      },
    );
    await t.test('anonymous users have no table or RPC access', async () => {
      await db.exec('set role anon');
      try {
        await assert.rejects(() => db.query('select * from public.campaigns'));
        await assert.rejects(() =>
          db.query('select public.add_campaign_member_by_email($1,$2)', [
            campaign,
            'player@example.test',
          ]),
        );
      } finally {
        await db.exec('reset role');
      }
    });
  } finally {
    await db.close();
  }
});

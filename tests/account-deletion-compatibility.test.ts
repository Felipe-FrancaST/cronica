import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';
import { AccountDeletion, type DeletionServices } from '../src/features/account/deletion';
import { defaultSheet } from '../src/systems/dnd5e';

const repair = '202610180031_account_deletion_legacy_attribution.sql';
const previous = readMigration('202610180030_account_deletion_and_billing_reliability.sql');
const oldPurge = previous.slice(
  previous.indexOf('create or replace function public.account_purge_data('),
  previous.indexOf('create or replace function public.account_release_deletion'),
);

test('031 resumes a deletion interrupted by an absent requested_by column without erasing unrelated history', async (t) => {
  for (const table of [
    'public.battle_action_requests',
    'private.battle_portal_trips',
    'private.battle_scene_requests',
  ]) {
    await t.test(table, async () => {
      const db = await billingDatabase();
      const user = randomUUID(),
        other = randomUUID(),
        campaign = randomUUID(),
        character = randomUUID(),
        npc = randomUUID();
      const token = randomUUID(),
        fingerprint = 'c'.repeat(64),
        system = '00000000-0000-4000-8000-000000000001';
      const value = async <T>(sql: string, args: unknown[] = []) =>
        (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
      const rpc: DeletionServices['rpc'] = async <T>(
        name: string,
        args: Record<string, unknown>,
      ) => {
        const keys = Object.keys(args);
        return value<T>(
          `select to_jsonb(public.${name}(${keys.map((key, i) => `${key}=>$${i + 1}`).join(',')})) v`,
          keys.map((key) =>
            typeof args[key] === 'object' && args[key] !== null
              ? JSON.stringify(args[key])
              : args[key],
          ),
        );
      };
      const as = async <T>(id: string, run: () => Promise<T>) => {
        await db.exec('set role authenticated');
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
        try {
          return await run();
        } finally {
          await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
        }
      };
      const count = (name: string) => value<number>(`select count(*)::int v from ${name}`);
      try {
        await db.exec('update public.site_billing_settings set billing_enabled=false');
        await db.query(
          "insert into auth.users(id,email) values($1,'legacy-user@test.local'),($2,'legacy-other@test.local')",
          [user, other],
        );
        await db.query(
          "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Campanha preservada')",
          [campaign, other, system],
        );
        await db.query('insert into public.campaign_members(campaign_id,user_id) values($1,$2)', [
          campaign,
          user,
        ]);
        await as(user, () =>
          db.query('select public.save_character($1::jsonb)', [
            JSON.stringify({
              id: character,
              owner_id: user,
              campaign_id: campaign,
              rpg_system_id: system,
              name: 'Personagem a remover',
              appearance: '',
              biography: '',
              portrait_path: null,
              sheet: defaultSheet(),
            }),
          ]),
        );
        const map = await as(other, () =>
          value<{ id: string; battle_session_id: string }>(
            'select to_jsonb(public.create_battle_map($1,\'{"name":"Mapa preservado","width":12,"height":12}\')) v',
            [campaign],
          ),
        );
        await db.query(
          "insert into public.npcs(id,campaign_id,rpg_system_id,name) values($1,$2,$3,'NPC preservado')",
          [npc, campaign, system],
        );
        await db.query('insert into public.npc_stats(npc_id,hp_current,hp_max) values($1,10,10)', [
          npc,
        ]);
        const miniature = await as(other, () =>
          value<{ id: string }>(
            "select to_jsonb(public.add_npc_to_battle_map($1,$2,9,'m',1,1)) v",
            [map.id, npc],
          ),
        );
        // Seed valid historic rows without invoking today's action-creation workflow.
        await db.exec('alter table public.battle_action_requests disable trigger user');
        try {
          for (const actor of [user, other]) {
            await db.query(
              "insert into public.battle_action_requests(campaign_id,session_id,map_id,token_id,requested_by,client_id,kind,name,cost,target,definition,round,turn_index,status) values($1,$2,$3,$4,$5,$6,'dodge','Esquiva','action','{}','{}',1,0,'cancelled')",
              [campaign, map.battle_session_id, map.id, miniature.id, actor, randomUUID()],
            );
            await db.query(
              "insert into private.battle_portal_trips(token_id,client_id,requested_by,source_map,destination_map,result) values($1,$2,$3,$4,$4,'{}')",
              [miniature.id, randomUUID(), actor, map.id],
            );
            await db.query(
              'insert into private.battle_scene_requests(request_id,campaign_id,map_id,requested_by) values($1,$2,$3,$4)',
              [randomUUID(), campaign, map.id, actor],
            );
          }
        } finally {
          await db.exec('alter table public.battle_action_requests enable trigger user');
        }
        // Simulate an existing database whose actor field has another name.
        await db.exec(`alter table ${table} rename column requested_by to legacy_actor_id`);
        await db.exec(oldPurge);
        await rpc('account_begin_deletion', {
          p_user_id: user,
          p_token: token,
          p_fingerprint: fingerprint,
          p_verified: true,
        });
        await rpc('account_prepare_purge', { p_user_id: user, p_token: token });
        await assert.rejects(
          rpc('account_purge_data', { p_user_id: user, p_token: token }),
          (error: unknown) => {
            const sql = error as { code?: string; message?: string };
            return sql.code === '42703' && Boolean(sql.message?.includes('requested_by'));
          },
        );
        assert.equal(await count('auth.users'), 2);
        assert.equal(await count('public.characters'), 1);
        assert.equal(
          await value('select phase v from private.account_deletions where user_id=$1', [user]),
          'purging',
        );
        assert.equal(await value('select private.billing_account_allowed($1) v', [user]), false);
        await assert.rejects(
          rpc('billing_begin_checkout', {
            p_user_id: user,
            p_plan_id: 'b1000000-0000-4000-8000-000000000001',
            p_scope: 'master',
            p_request_id: randomUUID(),
            p_plan_version: 1,
            p_payer_email: 'legacy-user@test.local',
            p_consent: true,
          }),
          (error: unknown) => (error as { code?: string }).code === '42501',
        );
        await rpc('account_release_deletion', {
          p_user_id: user,
          p_token: token,
          p_abandon: false,
        });

        await db.exec(readMigration(repair));
        await db.exec(readMigration(repair));
        assert.equal(
          await count('public.characters'),
          1,
          'applying the repair must not run deletion',
        );
        await assert.rejects(
          as(other, () => db.query('select public.account_purge_data($1,$2)', [user, token])),
          /permission denied/,
        );
        const result = await new AccountDeletion({
          rpc,
          async cancel() {
            throw new Error('No renewal should be cancelled in this fixture');
          },
          async removeFiles() {
            throw new Error('No files should be removed in this fixture');
          },
          async deleteIdentity(id) {
            assert.equal(await count('public.battle_action_requests'), 1);
            assert.equal(await count('private.battle_portal_trips'), 1);
            assert.equal(await count('private.battle_scene_requests'), 1);
            await db.query('delete from auth.users where id=$1', [id]);
          },
        }).run(user, fingerprint, false);
        assert.deepEqual(result, { deleted: true, pending: false });
        assert.equal(await count('auth.users'), 1);
        assert.equal(await count('public.characters'), 0);
        assert.equal(await count('public.campaigns'), 1);
        assert.equal(await count('public.battle_map_tokens'), 1);
        assert.equal(await count('private.account_deletions'), 0);
        assert.equal(await value('select id::text v from auth.users'), other);
      } finally {
        await db.close();
      }
    });
  }
});

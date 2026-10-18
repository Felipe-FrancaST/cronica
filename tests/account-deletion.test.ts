import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import {
  AccountDeletion,
  type DeletionServices,
  type AccountDeletionPreview,
} from '../src/features/account/deletion';
import { defaultSheet } from '../src/systems/dnd5e';

test('account deletion fences writes, cancels first, removes every file, resumes and hard-deletes only the intended account', async (t) => {
  const db = await billingDatabase();
  const owner = randomUUID(),
    player = randomUUID(),
    other = randomUUID(),
    admin = randomUUID();
  const owned = randomUUID(),
    shared = randomUUID(),
    hero = randomUUID(),
    participant = randomUUID(),
    survivor = randomUUID();
  const contract = randomUUID(),
    plan = 'b1000000-0000-4000-8000-000000000001';
  const system = '00000000-0000-4000-8000-000000000001';
  const fingerprint = 'a'.repeat(64),
    calls: string[] = [];
  const value = async <T>(sql: string, args: unknown[] = []) =>
    (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
  const rpc: DeletionServices['rpc'] = async <T>(name: string, args: Record<string, unknown>) => {
    assert.match(name, /^(account_\w+|billing_\w+)$/);
    const keys = Object.keys(args);
    return value<T>(
      `select to_jsonb(public.${name}(${keys.map((k, i) => `${k}=>$${i + 1}`).join(',')})) v`,
      keys.map((k) =>
        typeof args[k] === 'object' && args[k] !== null ? JSON.stringify(args[k]) : args[k],
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
  const count = (table: string, clause = '', args: unknown[] = []) =>
    value<number>(`select count(*)::int v from ${table}${clause ? ' where ' + clause : ''}`, args);
  let storageFail = false,
    identityFail = false,
    providerFail = false;
  const services: DeletionServices = {
    rpc,
    async cancel(contracts) {
      calls.push('cancel');
      if (providerFail) throw new Error('provider unavailable');
      for (const c of contracts)
        await db.query(
          "select public.billing_update_contract($1,'delete-sub','cancelled',null,clock_timestamp(),null)",
          [c.id],
        );
    },
    async removeFiles(files) {
      calls.push('storage');
      if (storageFail) throw new Error('storage unavailable');
      for (const f of files)
        await db.query('delete from storage.objects where bucket_id=$1 and name=$2', [
          f.bucket_id,
          f.name,
        ]);
    },
    async deleteIdentity(id) {
      calls.push('identity');
      assert.equal(await count('storage.objects', 'owner_id=$1', [id]), 0);
      if (identityFail) throw new Error('identity unavailable');
      await db.query('delete from auth.users where id=$1', [id]);
    },
  };
  try {
    await db.exec(
      'alter table storage.objects add column owner_id text; update public.site_billing_settings set billing_enabled=false',
    );
    for (const [i, id] of [owner, player, other, admin].entries())
      await db.query('insert into auth.users(id,email) values($1,$2)', [
        id,
        `delete${i}@test.local`,
      ]);
    await db.query('insert into public.site_administrators(user_id) values($1)', [admin]);
    await db.query(
      "insert into public.campaigns(id,owner_id,rpg_system_id,name) values($1,$2,$3,'Excluir inteira'),($4,$5,$3,'Preservar')",
      [owned, owner, system, shared, other],
    );
    await db.query(
      'insert into public.campaign_members(campaign_id,user_id) values($1,$2),($3,$4)',
      [owned, player, shared, owner],
    );
    for (const [id, user, campaign, name] of [
      [hero, owner, shared, 'Meu herói'],
      [participant, player, owned, 'Participante'],
      [survivor, other, shared, 'Sobrevivente'],
    ])
      await as(user, () =>
        db.query('select public.save_character($1::jsonb)', [
          JSON.stringify({
            id,
            owner_id: user,
            campaign_id: campaign,
            rpg_system_id: system,
            name,
            appearance: '',
            biography: '',
            portrait_path: null,
            sheet: defaultSheet(),
          }),
        ]),
      );
    await db.query('update public.profiles set avatar_path=$2 where id=$1', [
      owner,
      `profiles/${owner}/current.webp`,
    ]);
    await db.query(
      "insert into public.billing_contracts(id,user_id,plan_id,plan_snapshot,scope,status,provider_id,payer_email,settings_version) select $1,$2,id,to_jsonb(p),'master','authorized','delete-sub','payer@test.local',1 from public.billing_plans p where id=$3",
      [contract, owner, plan],
    );
    await db.query(
      "insert into public.billing_payments(provider_payment_id,invoice_id,contract_id,user_id,status,amount_cents,provider_updated_at) values('delete-payment','delete-invoice',$1,$2,'pending',2000,now())",
      [contract, owner],
    );
    await db.query(
      "insert into private.billing_webhooks(fingerprint,topic,resource_id) values('delete-notification','payment','delete-payment')",
    );
    await db.query(
      "insert into public.site_audit_log(actor_id,action,target_id,details) values($1,'grant',$2,'{}')",
      [admin, owner],
    );
    for (const [name, user] of [
      [`profiles/${owner}/current.webp`, owner],
      [`profiles/${owner}/old.webp`, owner],
      [`campaigns/${owned}/cover.webp`, player],
      [`characters/${hero}/old.webp`, other],
      ['legacy-file.webp', owner],
      [`profiles/${other}/keep.webp`, other],
    ])
      await db.query(
        "insert into storage.objects(bucket_id,name,owner_id) values('campaign-media',$1,$2)",
        [name, user],
      );
    await db.query(
      "insert into storage.objects(bucket_id,name,owner_id) values('campaign-media',$1,$2),('campaign-media',$3,$4)",
      [
        `campaign_mural/${shared}/personal.webp`,
        owner,
        `campaign_mural/${owned}/legacy.webp`,
        player,
      ],
    );
    // More than one Storage batch; all historical uploads must be removed.
    for (let i = 0; i < 103; i++)
      await db.query(
        "insert into storage.objects(bucket_id,name,owner_id) values('campaign-media',$1,$2)",
        [`campaigns/${owned}/old-${i}.webp`, player],
      );
    const chapter = await as(other, () =>
      value<{ id: string }>('select to_jsonb(public.save_campaign_session($1,$2,1)) v', [
        shared,
        'Arquivo',
      ]),
    );
    const sessionId = chapter.id;
    await as(other, () => db.query('select public.start_campaign_session($1)', [sessionId]));
    await db.query(
      "insert into public.campaign_session_events(campaign_id,adventure_session_id,kind,title,data) values($1,$2,'character_change','Meu herói alterado',$3::jsonb),($1,$2,'note','Uma história preservada','{}')",
      [shared, sessionId, JSON.stringify({ character_id: hero })],
    );
    await db.query(
      "insert into private.campaign_session_life(session_id,entity_id,entity_kind,dead) values($1,$2,'character',false) on conflict do nothing",
      [sessionId, hero],
    );
    await db.query(
      "insert into public.campaign_mural_items(campaign_id,adventure_session_id,kind,title,image_path) values($1,$2,'image','Imagem vinculada',$3)",
      [shared, sessionId, `campaign_mural/${shared}/personal.webp`],
    );
    await as(other, () => db.query('select public.end_campaign_session($1)', [sessionId]));
    await assert.rejects(
      as(other, () =>
        db.query('delete from public.campaign_session_events where adventure_session_id=$1', [
          sessionId,
        ]),
      ),
      /permission|histórico|sessão|imutável|row-level/i,
    );
    await t.test(
      'RPCs and purge permits are private; last active administrator is protected',
      async () => {
        await assert.rejects(
          as(owner, () =>
            db.query('select public.account_begin_deletion($1,$2,$3,true)', [
              owner,
              randomUUID(),
              fingerprint,
            ]),
          ),
          /permission denied/,
        );
        await assert.rejects(
          as(owner, () =>
            db.query('insert into private.account_purge_permits values(1,$1)', [owner]),
          ),
          /permission denied/,
        );
        const preview = await as(admin, () =>
          value<AccountDeletionPreview>('select public.account_deletion_preview() v'),
        );
        assert.equal(preview.can_delete, false);
        await assert.rejects(
          rpc('account_begin_deletion', {
            p_user_id: admin,
            p_token: randomUUID(),
            p_fingerprint: fingerprint,
            p_verified: true,
          }),
          /último administrador/,
        );
        await assert.rejects(
          rpc('account_begin_deletion', {
            p_user_id: owner,
            p_token: randomUUID(),
            p_fingerprint: fingerprint,
            p_verified: false,
          }),
          /senha/,
        );
      },
    );
    await t.test(
      'leases serialize deletion and reconciliation; failed provider cancellation preserves the account',
      async () => {
        const token = randomUUID();
        await rpc('account_begin_deletion', {
          p_user_id: owner,
          p_token: token,
          p_fingerprint: fingerprint,
          p_verified: true,
        });
        assert.equal(await rpc('billing_claim_sync', { p_user_id: owner, p_force: true }), false);
        await assert.rejects(
          rpc('account_begin_deletion', {
            p_user_id: owner,
            p_token: randomUUID(),
            p_fingerprint: fingerprint,
            p_verified: true,
          }),
          /processada/,
        );
        await assert.rejects(
          rpc('account_prepare_purge', { p_user_id: owner, p_token: randomUUID() }),
          /retomada/,
        );
        await rpc('account_release_deletion', {
          p_user_id: owner,
          p_token: token,
          p_abandon: true,
        });
        providerFail = true;
        await assert.rejects(
          new AccountDeletion(services).run(owner, fingerprint, true),
          /provider unavailable/,
        );
        providerFail = false;
        assert.equal(await count('private.account_deletions'), 0);
        assert.equal(await count('public.campaigns', 'id=$1', [owned]), 1);
        assert.equal(await count('storage.objects'), 111);
      },
    );
    await t.test(
      'storage failure freezes related writes and preserves identity for a safe retry',
      async () => {
        storageFail = true;
        await assert.rejects(
          new AccountDeletion(services).run(owner, fingerprint, true),
          /storage unavailable/,
        );
        storageFail = false;
        assert.equal(
          await value('select phase v from private.account_deletions where user_id=$1', [owner]),
          'purging',
        );
        assert.equal(await count('auth.users', 'id=$1', [owner]), 1);
        assert.equal(
          await value('select status v from public.billing_contracts where id=$1', [contract]),
          'cancelled',
        );
        await assert.rejects(
          as(owner, () =>
            db.query("update public.profiles set name='escape' where id=$1", [owner]),
          ),
          /exclusão/,
        );
        await assert.rejects(
          db.query(
            "insert into public.campaign_sessions(campaign_id,name,number,created_by) values($1,'Late',99,$2)",
            [shared, owner],
          ),
          /exclusão/,
        );
        assert.equal(
          await as(player, () => value('select private.can_read_campaign($1) v', [owned])),
          false,
        );
        assert.equal(
          await as(other, () => value('select private.can_read_campaign($1) v', [shared])),
          true,
        );
        await db.exec("select set_config('cronica.account_purge','on',false)");
        assert.equal(await as(owner, () => value('select private.account_is_purge() v')), false);
        await assert.rejects(
          db.query('delete from public.characters where id=$1', [hero]),
          /exclusão/,
        );
        await db.exec("select set_config('cronica.account_purge','off',false)");
      },
    );
    await t.test(
      'retry erases shared references and owned campaigns before deleting Auth; another campaign survives',
      async () => {
        identityFail = true;
        await assert.rejects(
          new AccountDeletion(services).run(owner, fingerprint, false),
          /identity unavailable/,
        );
        assert.equal(
          await value('select phase v from private.account_deletions where user_id=$1', [owner]),
          'auth_ready',
        );
        assert.equal(await count('public.campaigns', 'id=$1', [owned]), 0);
        assert.equal(await count('public.campaigns', 'id=$1', [shared]), 1);
        assert.equal(
          await count('public.characters', 'id=any($1::uuid[])', [[hero, participant]]),
          0,
        );
        assert.equal(await count('public.characters', 'id=$1', [survivor]), 1);
        assert.equal(await count('private.campaign_session_life', 'entity_id=$1', [hero]), 0);
        assert.equal(
          await count('public.campaign_session_events', "title='Uma história preservada'"),
          sessionId ? 1 : 0,
        );
        assert.equal(
          await count('public.campaign_session_events', "title='Meu herói alterado'"),
          0,
        );
        assert.equal(await count('private.billing_webhooks'), 0);
        assert.equal(await count('public.billing_contracts', 'user_id=$1', [owner]), 0);
        assert.equal(await count('public.site_audit_log', 'target_id=$1', [owner]), 0);
        assert.equal(await count('storage.objects'), 1);
        assert.equal(await count('public.campaign_mural_items', "title='Imagem vinculada'"), 0);
        assert.ok(calls.indexOf('cancel') < calls.indexOf('storage'));
        assert.ok(calls.indexOf('storage') < calls.indexOf('identity'));
      },
    );
    await t.test(
      'late uploaded files are recovered from persisted folder IDs; old tokens cannot restore access',
      async () => {
        await db.query(
          "insert into storage.objects(bucket_id,name,owner_id) values('campaign-media',$1,$2)",
          [`campaigns/${owned}/late.webp`, player],
        );
        identityFail = false;
        assert.deepEqual(await new AccountDeletion(services).run(owner, fingerprint, false), {
          deleted: true,
          pending: false,
        });
        assert.equal(await count('auth.users', 'id=$1', [owner]), 0);
        assert.equal(await count('public.profiles', 'id=$1', [owner]), 0);
        assert.equal(await count('private.account_deletions'), 0);
        assert.equal(await count('private.account_deletion_files'), 0);
        assert.equal(await count('storage.objects'), 1);
        assert.equal(
          await as(owner, () => value("select private.billing_can_access($1,'player') v", [owner])),
          false,
        );
        assert.equal(
          await as(owner, () =>
            value("select private.account_media_available('profiles/anything/a.webp') v"),
          ),
          false,
        );
        assert.equal(await count('auth.users'), 3);
      },
    );
  } finally {
    await db.close();
  }
});

test('long deletions yield resumable progress without deleting identity prematurely', async () => {
  const calls: string[] = [];
  let time = 0;
  const engine = new AccountDeletion(
    {
      async rpc<T>(name: string) {
        calls.push(name);
        return (
          name === 'account_begin_deletion'
            ? { phase: 'preparing' }
            : name === 'account_deletion_contracts'
              ? []
              : name === 'account_prepare_purge'
                ? 'purging'
                : null
        ) as T;
      },
      async cancel() {
        throw new Error('no contracts');
      },
      async removeFiles() {
        throw new Error('deadline');
      },
      async deleteIdentity() {
        throw new Error('premature identity deletion');
      },
    },
    () => (time++ === 0 ? 0 : 40_001),
  );
  assert.deepEqual(await engine.run(randomUUID(), 'a'.repeat(64), true), {
    deleted: false,
    pending: true,
  });
  assert.ok(calls.includes('account_release_deletion'));
  assert.ok(!calls.includes('account_purge_data'));
});

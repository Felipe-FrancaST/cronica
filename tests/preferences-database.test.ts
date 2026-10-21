import test from 'node:test';
import assert from 'node:assert/strict';
import { billingDatabase } from './helpers/billing-database';
import { readMigration } from '../scripts/migration-sources.mjs';

test('account preferences merge atomically, validate input and remain isolated by authenticated identity', async (t) => {
  const db = await billingDatabase();
  const owner = '10000000-0000-4000-8000-000000000001';
  const other = '10000000-0000-4000-8000-000000000002';
  const asUser = async (id: string, fn: () => Promise<unknown>) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    try {
      return await fn();
    } finally {
      await db.exec('reset role');
    }
  };
  const save = (patch: unknown) =>
    db.query<{ value: Record<string, unknown> }>(
      'select public.update_profile_preferences($1::jsonb) value',
      [JSON.stringify(patch)],
    );
  try {
    await db.query(
      "insert into auth.users(id,email) values($1,'owner@example.test'),($2,'other@example.test')",
      [owner, other],
    );
    await db.query('update public.profiles set preferences=$2::jsonb where id=$1', [
      owner,
      JSON.stringify({ legacy_option: 'keep' }),
    ]);
    await t.test(
      'partial patches from different tabs preserve unrelated settings and profile details',
      async () => {
        await asUser(owner, async () => {
          await save({ text_size: 'large', compact_cards: true });
          const result = await save({
            vtt_view: '2d',
            dice_animation: false,
            motion: 'reduced',
            vtt_quality: 'low',
          });
          assert.deepEqual(result.rows[0].value, {
            legacy_option: 'keep',
            text_size: 'large',
            compact_cards: true,
            vtt_view: '2d',
            dice_animation: false,
            motion: 'reduced',
            vtt_quality: 'low',
          });
          await db.query("update public.profiles set name='Novo nome' where id=$1", [owner]);
          assert.equal(
            (
              await db.query<{ preferences: Record<string, unknown> }>(
                'select preferences from public.profiles where id=$1',
                [owner],
              )
            ).rows[0].preferences.text_size,
            'large',
          );
        });
      },
    );
    await t.test(
      'the function accepts no target user and cannot overwrite another profile',
      async () => {
        await asUser(other, () => save({ compact_cards: false }));
        assert.equal(
          (
            await db.query<{ preferences: Record<string, unknown> }>(
              'select preferences from public.profiles where id=$1',
              [owner],
            )
          ).rows[0].preferences.compact_cards,
          true,
        );
      },
    );
    await t.test('invalid types, unknown keys and null values reject the whole patch', async () => {
      await asUser(owner, async () => {
        for (const patch of [
          null,
          [],
          'bad',
          { unknown: true },
          { compact_cards: 'false' },
          { dice_animation: null },
          { motion: 'full' },
          { text_size: false },
          { vtt_quality: 'ultra' },
          { vtt_view: '2d', compact_cards: null },
        ])
          await assert.rejects(() => save(patch), /inválid|desconhecida/);
      });
    });
    await t.test('anonymous callers cannot invoke preference writes', async () => {
      await db.exec('set role anon');
      try {
        await assert.rejects(() => save({ compact_cards: true }), /permission denied/);
      } finally {
        await db.exec('reset role');
      }
    });
    await t.test(
      'authenticated calls without a user and deleted profiles fail explicitly',
      async () => {
        await asUser('', () =>
          assert.rejects(() => save({ compact_cards: true }), /Entre na sua conta/),
        );
        await asUser('10000000-0000-4000-8000-000000000099', () =>
          assert.rejects(() => save({ compact_cards: true }), /Perfil não encontrado/),
        );
      },
    );
    await t.test('033 is repeatable without resetting stored preferences', async () => {
      await db.exec(readMigration('202610210033_profile_preferences.sql'));
      assert.equal(
        (
          await db.query<{ preferences: Record<string, unknown> }>(
            'select preferences from public.profiles where id=$1',
            [owner],
          )
        ).rows[0].preferences.text_size,
        'large',
      );
    });
  } finally {
    await db.close();
  }
});

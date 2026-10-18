import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { AccountDeletion, type AccountDeletionPreview } from '@/features/account/deletion';
import { BillingError } from '@/features/billing/gateway';
import { apiError, authenticated, billingEngine, json, readJson } from '@/features/billing/server';
import { serviceSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    const { client } = await authenticated();
    const { data, error } = await client.rpc('account_deletion_preview');
    if (error || !data || typeof data.can_delete !== 'boolean')
      throw new BillingError(
        'Não foi possível conferir os dados da conta. Tente novamente ou consulte o suporte.',
        503,
        'account_preview_unavailable',
      );
    return json(data as AccountDeletionPreview);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, client } = await authenticated(request);
    const input = z
      .object({
        confirmation: z.literal('EXCLUIR MINHA CONTA'),
        password: z.string().min(1, 'Confirme sua senha.').max(256),
      })
      .strict()
      .parse(await readJson(request));
    const service = serviceSupabase();
    const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
      const { data, error } = await service.rpc(name, args);
      if (error)
        throw new BillingError(
          error.message,
          error.code === '42501' ? 403 : error.code === '40001' ? 409 : 503,
          error.code ?? 'account_deletion_failed',
        );
      return data as T;
    };
    const { data: session } = await client.auth.getSession();
    if (!user.email || !session.session?.access_token)
      throw new BillingError('Entre novamente para confirmar a exclusão.', 401);
    const fingerprint = createHash('sha256').update(session.session.access_token).digest('hex');
    const cached = await rpc<{ reauthenticated: boolean }>('account_deletion_state', {
      p_user_id: user.id,
      p_fingerprint: fingerprint,
    });
    let verified = false;
    if (!cached.reauthenticated) {
      // Isolated proof: never replace the browser's session or expose the service key.
      const proof = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (url, init) =>
              fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(12_000) }),
          },
        },
      );
      const result = await proof.auth.signInWithPassword({
        email: user.email,
        password: input.password,
      });
      if (result.error || result.data.user?.id !== user.id)
        throw new BillingError(
          result.error?.status === 429
            ? 'Aguarde alguns instantes antes de confirmar a senha novamente.'
            : 'Senha incorreta. Confira sua senha para excluir a conta.',
          403,
          'reauthentication_failed',
        );
      verified = true;
      await proof.auth.signOut({ scope: 'local' });
    }
    const outcome = await new AccountDeletion({
      rpc,
      async cancel(contracts) {
        const engine = billingEngine();
        for (const contract of contracts) await engine.cancelContractRenewal(contract);
      },
      async removeFiles(files) {
        const buckets = new Map<string, string[]>();
        for (const file of files)
          buckets.set(file.bucket_id, [...(buckets.get(file.bucket_id) ?? []), file.name]);
        for (const [bucket, names] of buckets) {
          const { error } = await service.storage.from(bucket).remove(names);
          if (error)
            throw new BillingError(
              'Não foi possível remover todos os arquivos. Continue a exclusão em alguns instantes.',
              503,
              'storage_unavailable',
            );
        }
      },
      async deleteIdentity(id) {
        const { error } = await service.auth.admin.deleteUser(id, false);
        if (error && error.status !== 404)
          throw new BillingError(
            'Os dados foram removidos. Continue a exclusão para finalizar o acesso da conta.',
            503,
            'identity_deletion_pending',
          );
      },
    }).run(user.id, fingerprint, verified);
    if (outcome.deleted) {
      const store = await cookies();
      for (const cookie of store.getAll())
        if (/^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name))
          store.set(cookie.name, '', { path: '/', maxAge: 0 });
    }
    return json(outcome, outcome.deleted ? 200 : 202);
  } catch (error) {
    return apiError(error);
  }
}

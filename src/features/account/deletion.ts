import { randomUUID } from 'node:crypto';
import { BillingError } from '../billing/gateway';
import type { BillingContract } from '../billing/types';

export interface DeletionFile {
  bucket_id: string;
  name: string;
}
export interface AccountDeletionPreview {
  campaigns: number;
  characters: number;
  memberships: number;
  has_renewal: boolean;
  phase: 'preparing' | 'purging' | 'auth_ready' | null;
  can_delete: boolean;
  reason: string | null;
}
export interface DeletionServices {
  rpc<T>(name: string, args: Record<string, unknown>): Promise<T>;
  cancel(contracts: BillingContract[]): Promise<void>;
  removeFiles(files: DeletionFile[]): Promise<void>;
  deleteIdentity(userId: string): Promise<void>;
}

export class AccountDeletion {
  constructor(
    private services: DeletionServices,
    private now = Date.now,
  ) {}
  async run(userId: string, fingerprint: string, reauthenticated: boolean) {
    const token = randomUUID();
    const args = { p_user_id: userId, p_token: token };
    const deadline = this.now() + 40_000;
    let phase: AccountDeletionPreview['phase'] = null;
    let failed = false;
    try {
      const job = await this.services.rpc<{ phase: AccountDeletionPreview['phase'] }>(
        'account_begin_deletion',
        {
          ...args,
          p_fingerprint: fingerprint,
          p_verified: reauthenticated,
        },
      );
      phase = job.phase;
      if (phase === 'preparing') {
        const contracts = await this.services.rpc<BillingContract[]>(
          'account_deletion_contracts',
          args,
        );
        if (contracts.some((c) => c.user_id !== userId))
          throw new BillingError('Não foi possível verificar a titularidade da assinatura.', 503);
        if (contracts.length) await this.services.cancel(contracts);
      }
      phase = await this.services.rpc<AccountDeletionPreview['phase']>(
        'account_prepare_purge',
        args,
      );
      if (phase !== 'purging' && phase !== 'auth_ready')
        throw new BillingError('A exclusão precisa ser retomada.', 503, 'invalid_deletion_state');
      if (phase === 'purging') {
        for (;;) {
          if (this.now() >= deadline) return { deleted: false, pending: true };
          const files = await this.services.rpc<DeletionFile[]>(
            'account_deletion_file_batch',
            args,
          );
          if (!files.length) break;
          await this.services.removeFiles(files);
          const confirmed = await this.services.rpc<number>('account_confirm_removed_files', {
            ...args,
            p_files: files,
          });
          if (confirmed !== files.length)
            throw new BillingError(
              'Alguns arquivos ainda estão sendo removidos. Continue a exclusão em alguns instantes.',
              503,
              'file_deletion_pending',
            );
        }
        await this.services.rpc('account_purge_data', args);
        phase = 'auth_ready';
      }
      await this.services.deleteIdentity(userId);
      return { deleted: true, pending: false };
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      try {
        await this.services.rpc('account_release_deletion', {
          ...args,
          p_abandon: failed && phase === 'preparing',
        });
      } catch {
        /* A lease expires automatically; never hide the original result. */
      }
    }
  }
}

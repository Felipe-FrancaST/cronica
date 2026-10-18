import type { BillingContract, BillingWebhook } from './types';
import { cents } from './model';
import {
  BillingError,
  MercadoPagoGateway,
  ProviderError,
  resourceId,
  verifiedPayment,
  verifiedSubscription,
} from './gateway';

type Json = Record<string, unknown>;
export interface BillingDatabase {
  rpc<T = unknown>(name: string, args?: Json): Promise<T>;
  contracts(userId: string): Promise<BillingContract[]>;
  contract(id: string): Promise<BillingContract | null>;
  byProvider(id: string): Promise<BillingContract | null>;
  paymentIds(contractId: string): Promise<string[]>;
}
export class BillingEngine {
  constructor(
    readonly db: BillingDatabase,
    readonly gateway: MercadoPagoGateway,
    readonly siteUrl: string,
  ) {}
  async update(contract: BillingContract, remote: Json, cancellation = false) {
    let verified;
    try {
      verified = verifiedSubscription(remote, contract, this.gateway.config, cancellation);
    } catch (error) {
      // A changed remote price must never hide a refund of an already verified payment.
      if (
        contract.provider_id &&
        error instanceof BillingError &&
        [
          'subscription_amount_mismatch',
          'subscription_currency_mismatch',
          'subscription_interval_mismatch',
          'subscription_schedule_mismatch',
        ].includes(error.code)
      ) {
        verifiedSubscription(remote, contract, this.gateway.config, true);
        await this.reconcileRevocations(contract);
      }
      throw error;
    }
    return this.db.rpc<BillingContract>('billing_update_contract', {
      p_id: contract.id,
      p_provider_id: verified.id,
      p_status: verified.status,
      p_checkout_url: verified.checkout_url,
      p_provider_updated_at: verified.updated_at,
      p_next_payment_at: verified.next_payment_at,
    });
  }
  private async reconcileRevocations(contract: BillingContract) {
    let failure: unknown;
    for (const id of await this.db.paymentIds(contract.id)) {
      try {
        const invoice = await this.gateway.invoiceForPayment(id);
        if (!invoice) continue;
        const payment = await this.gateway.payment(id);
        if (
          payment.status !== 'approved' ||
          cents(payment.transaction_amount_refunded ?? 0) >= contract.plan_snapshot.amount_cents
        )
          await this.storeInvoice(contract, invoice, payment);
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure) throw failure;
  }
  async checkout(
    userId: string,
    data: {
      planId: string;
      scope: string;
      requestId: string;
      planVersion: number;
      payerEmail: string;
      consent: boolean;
    },
  ) {
    const begin = await this.db.rpc<{ contract: BillingContract; create: boolean }>(
      'billing_begin_checkout',
      {
        p_user_id: userId,
        p_plan_id: data.planId,
        p_scope: data.scope,
        p_request_id: data.requestId,
        p_plan_version: data.planVersion,
        p_payer_email: data.payerEmail,
        p_consent: data.consent,
      },
    );
    let contract = begin.contract;
    if (contract.status === 'failed')
      throw new BillingError(
        'Esta tentativa não foi concluída. Confira os dados e tente novamente.',
        409,
        'checkout_failed',
      );
    if (begin.create) {
      try {
        const created = await this.gateway.create(
          contract,
          `${this.siteUrl}/assinatura?retorno=1&modo=${contract.scope}`,
        );
        contract = await this.update(
          contract,
          await this.gateway.subscription(resourceId(created.id)),
        );
      } catch (error) {
        const definitive =
          error instanceof ProviderError && [400, 401, 403, 422].includes(error.providerStatus);
        await this.db.rpc('billing_update_contract', {
          p_id: contract.id,
          p_provider_id: null,
          p_status: definitive ? 'failed' : 'uncertain',
          p_checkout_url: null,
          p_provider_updated_at: null,
          p_next_payment_at: null,
          p_error_code: error instanceof BillingError ? error.code : 'provider_unavailable',
        });
        if (error instanceof BillingError && error.code.startsWith('subscription_')) throw error;
        throw new BillingError(
          definitive
            ? 'Não foi possível preparar a assinatura. Confira o e-mail do Mercado Pago ou entre em contato com o suporte.'
            : 'A criação da assinatura está sendo conferida. Use “Conferir pagamento” antes de tentar contratar novamente.',
          502,
          definitive ? 'checkout_failed' : 'checkout_uncertain',
        );
      }
    }
    return { contract, checkout_url: contract.status === 'pending' ? contract.checkout_url : null };
  }
  async syncContract(contract: BillingContract) {
    const remote = contract.provider_id
      ? await this.gateway.subscription(contract.provider_id)
      : await this.gateway.searchSubscription(contract.id, contract.payer_email);
    if (!remote) return;
    contract = await this.update(contract, remote);
    const invoices = await this.gateway.invoices(contract.provider_id!);
    const checked = new Set<string>();
    for (const invoice of invoices) {
      const id = (invoice.payment as Json | undefined)?.id;
      if (!id) continue;
      const paymentId = resourceId(id);
      checked.add(paymentId);
      await this.storeInvoice(contract, invoice, await this.gateway.payment(paymentId));
    }
    // Search results may omit older invoices. Re-check stored payments for refunds and disputes.
    for (const paymentId of await this.db.paymentIds(contract.id)) {
      if (checked.has(paymentId)) continue;
      const invoice = await this.gateway.invoiceForPayment(paymentId);
      if (invoice)
        await this.storeInvoice(contract, invoice, await this.gateway.payment(paymentId));
    }
  }
  async storeInvoice(contract: BillingContract, invoice: Json, payment: Json) {
    const normalized = verifiedPayment(invoice, payment, contract, this.gateway.config);
    await this.db.rpc('billing_store_payment', {
      p_contract_id: contract.id,
      p_payment: normalized,
    });
  }
  async syncUser(userId: string, force = false) {
    const acquired = await this.db.rpc<boolean>('billing_claim_sync', {
      p_user_id: userId,
      p_force: force,
    });
    if (!acquired) return { busy: true };
    let success = false;
    try {
      let failure: unknown;
      const contracts = (await this.db.contracts(userId)).sort(
        (a, b) => Number(a.status === 'cancelled') - Number(b.status === 'cancelled'),
      );
      for (const contract of contracts) {
        if (contract.status === 'failed') continue;
        try {
          await this.syncContract(contract);
        } catch (error) {
          failure ??= error;
          await this.db.rpc('billing_note_error', {
            p_id: contract.id,
            p_code: error instanceof BillingError ? error.code : 'reconciliation_failed',
          });
        }
      }
      if (failure) throw failure;
      success = true;
      return { busy: false };
    } finally {
      await this.db.rpc('billing_release_sync', { p_user_id: userId, p_success: success });
    }
  }
  async cancel(userId: string, contractId: string) {
    const contract = await this.db.contract(contractId);
    if (!contract || contract.user_id !== userId)
      throw new BillingError('Assinatura não encontrada.', 404);
    if (contract.status === 'cancelled' || contract.status === 'failed') return contract;
    if (!(await this.db.rpc<boolean>('billing_claim_sync', { p_user_id: userId, p_force: true })))
      throw new BillingError(
        'A assinatura está sendo conferida. Tente novamente em alguns instantes.',
        409,
      );
    try {
      return await this.cancelContractRenewal(contract);
    } finally {
      await this.db.rpc('billing_release_sync', { p_user_id: userId, p_success: false });
    }
  }
  async cancelContractRenewal(contract: BillingContract) {
    if (['cancelled', 'failed'].includes(contract.status)) return contract;
    let remote = contract.provider_id
      ? await this.gateway.subscription(contract.provider_id)
      : await this.gateway.searchSubscription(contract.id, contract.payer_email);
    if (!remote)
      throw new BillingError(
        'A contratação ainda está sendo confirmada pelo Mercado Pago. Confira novamente antes de cancelar.',
        409,
        'checkout_uncertain',
      );
    const identity = verifiedSubscription(remote, contract, this.gateway.config, true);
    if (identity.status !== 'cancelled') {
      await this.gateway.cancel(identity.id);
      remote = await this.gateway.subscription(identity.id);
    }
    if (remote.status !== 'cancelled')
      throw new BillingError('O Mercado Pago ainda não confirmou o cancelamento.', 502);
    return this.update(contract, remote, true);
  }
  async processWebhook(event: BillingWebhook) {
    let contract: BillingContract | null = null;
    if (event.topic === 'subscription_preapproval') {
      const remote = await this.gateway.subscription(event.resource_id);
      contract = await this.db.byProvider(event.resource_id);
      if (!contract && /^[0-9a-f-]{36}$/i.test(String(remote.external_reference)))
        contract = await this.db.contract(String(remote.external_reference));
      if (contract) await this.update(contract, remote);
    } else {
      const invoice =
        event.topic === 'subscription_authorized_payment'
          ? await this.gateway.invoice(event.resource_id)
          : await this.gateway.invoiceForPayment(event.resource_id);
      if (!invoice) return;
      contract = await this.db.byProvider(resourceId(invoice.preapproval_id));
      if (!contract && /^[0-9a-f-]{36}$/i.test(String(invoice.external_reference)))
        contract = await this.db.contract(String(invoice.external_reference));
      if (contract) {
        contract = await this.update(
          contract,
          await this.gateway.subscription(resourceId(invoice.preapproval_id)),
        );
        const id = (invoice.payment as Json | undefined)?.id;
        if (id)
          await this.storeInvoice(contract, invoice, await this.gateway.payment(resourceId(id)));
      }
    }
    if (contract) {
      const result = await this.syncUser(contract.user_id, true);
      if (result.busy) throw new BillingError('Conciliação em andamento.', 409, 'sync_busy');
    }
  }
  async processQueue(limit = 10) {
    const events = await this.db.rpc<BillingWebhook[]>('billing_lease_webhooks', {
      p_limit: limit,
    });
    let processed = 0,
      failed = 0;
    for (const event of events) {
      try {
        await this.processWebhook(event);
        await this.db.rpc('billing_finish_webhook', { p_id: event.id });
        processed++;
      } catch (error) {
        await this.db.rpc('billing_finish_webhook', {
          p_id: event.id,
          p_error: error instanceof BillingError ? error.code : 'reconciliation_failed',
        });
        failed++;
      }
    }
    return { processed, failed };
  }
  async reconcile(limit = 20) {
    const queue = await this.processQueue(5);
    const users = await this.db.rpc<string[]>('billing_due_users', { p_limit: limit });
    let synced = 0,
      failed = queue.failed;
    for (let i = 0; i < users.length; i += 3)
      await Promise.all(
        users.slice(i, i + 3).map(async (id) => {
          try {
            const result = await this.syncUser(id, true);
            if (!result.busy) synced++;
          } catch {
            failed++;
          }
        }),
      );
    return { ...queue, synced, failed };
  }
}

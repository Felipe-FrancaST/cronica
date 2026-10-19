import type { BillingDatabase } from './engine';
import type { BillingContract, BillingPix } from './types';
import {
  BillingError,
  MercadoPagoGateway,
  ProviderError,
  iso,
  resourceId,
  verifiedPixPayment,
} from './gateway';

type Json = Record<string, unknown>;
export interface PixCheckout {
  planId: string;
  scope: string;
  requestId: string;
  planVersion: number;
  payerEmail: string;
  cpf: string;
  consent: boolean;
}
export class PixBilling {
  constructor(
    readonly db: BillingDatabase,
    readonly gateway: MercadoPagoGateway,
    readonly siteUrl: string,
  ) {}
  async checkout(userId: string, input: PixCheckout): Promise<BillingPix> {
    const begin = await this.db.rpc<{ contract: BillingContract; create: boolean }>(
      'billing_begin_pix',
      {
        p_user_id: userId,
        p_plan_id: input.planId,
        p_scope: input.scope,
        p_request_id: input.requestId,
        p_plan_version: input.planVersion,
        p_payer_email: input.payerEmail,
        p_consent: input.consent,
      },
    );
    const contract = begin.contract;
    if (['failed', 'cancelled', 'expired'].includes(contract.status))
      throw new BillingError(
        'Este Pix foi encerrado. Confira o plano e gere um novo código.',
        409,
        'checkout_failed',
      );
    if (!begin.create) return this.details(contract);
    let created = false;
    try {
      const response = await this.gateway.createPix(
        contract,
        input.cpf,
        `${this.siteUrl}/api/billing/webhook`,
      );
      created = true;
      // Always read the canonical payment before exposing a code or granting access.
      const remote = await this.gateway.payment(resourceId(response.id));
      return this.view(await this.store(contract, remote), remote);
    } catch (error) {
      const definitive =
        !created &&
        error instanceof ProviderError &&
        [400, 401, 403, 422].includes(error.providerStatus);
      await this.db.rpc('billing_pix_error', {
        p_id: contract.id,
        p_code:
          error instanceof ProviderError
            ? error.diagnostic
            : error instanceof BillingError
              ? error.code
              : 'provider_unavailable',
        p_definitive: definitive,
      });
      throw new BillingError(
        definitive
          ? `Não foi possível gerar o Pix. Confira os dados do pagador e a configuração do Mercado Pago.${error instanceof ProviderError ? ` Referência: ${error.diagnostic}.` : ''}`
          : 'A geração do Pix está sendo conferida. Use “Conferir pagamento” para recuperar este pedido.',
        502,
        definitive ? 'checkout_failed' : 'checkout_uncertain',
      );
    }
  }
  async owned(userId: string, id: string) {
    const contract = await this.db.contract(id);
    if (!contract || contract.user_id !== userId || contract.payment_method !== 'pix')
      throw new BillingError('Pagamento Pix não encontrado.', 404);
    return contract;
  }
  private remote(contract: BillingContract) {
    return contract.provider_id
      ? this.gateway.payment(contract.provider_id)
      : this.gateway.searchPix(contract.id);
  }
  async details(contract: BillingContract): Promise<BillingPix> {
    if (!contract.provider_id && ['cancelled', 'expired', 'failed'].includes(contract.status))
      return this.view(contract, null);
    let remote = await this.remote(contract);
    if (!remote) return this.view(contract, null);
    verifiedPixPayment(remote, contract, this.gateway.config);
    const expires = iso(remote.date_of_expiration) ?? contract.payment_expires_at;
    if (
      ['pending', 'in_process', 'authorized'].includes(String(remote.status)) &&
      expires &&
      new Date(expires).getTime() <= Date.now()
    )
      remote = await this.closeRemote(contract, remote);
    return this.view(await this.store(contract, remote), remote);
  }
  async sync(contract: BillingContract) {
    await this.details(contract);
  }
  async store(contract: BillingContract, remote: Json): Promise<BillingContract> {
    const payment = verifiedPixPayment(remote, contract, this.gateway.config);
    const expires = iso(remote.date_of_expiration) ?? contract.payment_expires_at ?? null;
    const status = ['approved', 'refunded', 'charged_back', 'in_mediation'].includes(payment.status)
      ? 'completed'
      : payment.status === 'rejected'
        ? 'failed'
        : payment.status === 'cancelled'
          ? expires && new Date(expires).getTime() <= Date.now()
            ? 'expired'
            : 'cancelled'
          : 'pending';
    const updated = await this.db.rpc<BillingContract | null>('billing_store_pix', {
      p_contract_id: contract.id,
      p_payment: payment,
      p_status: status,
      p_expires_at: expires,
    });
    if (!updated) throw new BillingError('A conta deste pagamento não está mais disponível.', 409);
    return updated;
  }
  private async closeRemote(contract: BillingContract, remote: Json): Promise<Json> {
    verifiedPixPayment(remote, contract, this.gateway.config);
    try {
      await this.gateway.cancelPix(resourceId(remote.id));
    } catch (error) {
      // Payment approval may win a cancellation race. Read it before deciding.
      const latest = await this.gateway.payment(resourceId(remote.id));
      verifiedPixPayment(latest, contract, this.gateway.config);
      if (
        ['approved', 'refunded', 'charged_back', 'cancelled', 'rejected'].includes(
          String(latest.status),
        )
      )
        return latest;
      throw error;
    }
    const latest = await this.gateway.payment(resourceId(remote.id));
    verifiedPixPayment(latest, contract, this.gateway.config);
    if (
      !['approved', 'refunded', 'charged_back', 'cancelled', 'rejected'].includes(
        String(latest.status),
      )
    )
      throw new BillingError(
        'O cancelamento do Pix ainda está sendo confirmado. Confira novamente.',
        409,
        'pix_cancel_pending',
      );
    return latest;
  }
  async cancel(contract: BillingContract) {
    if (['completed', 'expired', 'failed', 'cancelled'].includes(contract.status)) return contract;
    let remote = await this.remote(contract);
    if (!remote)
      return this.db.rpc<BillingContract>('billing_cancel_uncreated_pix', { p_id: contract.id });
    verifiedPixPayment(remote, contract, this.gateway.config);
    if (['pending', 'in_process', 'authorized'].includes(String(remote.status)))
      remote = await this.closeRemote(contract, remote);
    return this.store(contract, remote);
  }
  private view(contract: BillingContract, remote: Json | null): BillingPix {
    const result: BillingPix = {
      contract_id: contract.id,
      status: contract.status,
      expires_at: contract.payment_expires_at ?? null,
      qr_code: null,
      qr_code_base64: null,
    };
    if (
      !remote ||
      contract.status !== 'pending' ||
      !result.expires_at ||
      new Date(result.expires_at).getTime() <= Date.now()
    )
      return result;
    const point = remote.point_of_interaction as Json | undefined;
    const transaction = point?.transaction_data as Json | undefined;
    const code = transaction?.qr_code;
    if (
      typeof code !== 'string' ||
      !code.startsWith('000201') ||
      code.length > 10000 ||
      /[\x00-\x1f]/.test(code)
    )
      throw new BillingError(
        'O Mercado Pago ainda não disponibilizou o código Pix. Confira o pagamento novamente.',
        502,
        'pix_code_unavailable',
      );
    result.qr_code = code;
    const base64 = transaction?.qr_code_base64;
    if (
      typeof base64 === 'string' &&
      base64.length <= 2_000_000 &&
      /^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(base64)
    )
      result.qr_code_base64 = base64;
    return result;
  }
}

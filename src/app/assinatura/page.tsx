'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CreditCard, ShieldCheck, ArrowRight, RefreshCw } from 'lucide-react';
import { Shell, PageHeading } from '@/components/shell';
import { Button, ErrorBox, SuccessBox, Field, Input, Loading, Confirm } from '@/components/ui';
import { useWorkspace } from '@/hooks/use-workspace';
import { BillingApiError, billingApi, useBilling } from '@/features/billing/provider';
import {
  billingDate,
  billingScopeLabel,
  contractStatusLabel,
  intervalLabel,
  money,
  safeContinue,
} from '@/features/billing/model';
import type { BillingScope } from '@/features/billing/types';
export default function SubscriptionPage() {
  const w = useWorkspace(),
    billing = useBilling(),
    router = useRouter();
  const [scope, setScope] = useState<BillingScope>('master'),
    [planId, setPlanId] = useState(''),
    [payerEmail, setPayerEmail] = useState(''),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [cancelId, setCancelId] = useState<string | null>(null);
  const operation = useRef(false);
  const eligiblePlans = billing.data?.plans.filter((p) => p.scopes.includes(scope));
  const consentPlan = eligiblePlans?.find((p) => p.id === planId) ?? eligiblePlans?.[0];
  useEffect(() => setConsent(false), [consentPlan?.id, consentPlan?.version]);
  const requestId = useRef(''),
    returned = useRef(false),
    initialized = useRef(false),
    continueTo = useRef('/');
  useEffect(() => {
    if (!w.ready || initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.search);
    const selected = params.get('modo');
    setScope(selected === 'player' || selected === 'master' ? selected : (w.mode ?? 'master'));
    continueTo.current = safeContinue(params.get('continuar'));
  }, [w.ready, w.mode]);
  useEffect(() => {
    if (w.user?.email) setPayerEmail(w.user.email);
  }, [w.user?.email]);
  useEffect(() => {
    requestId.current = crypto.randomUUID();
    setConsent(false);
  }, [planId, scope]);
  async function sync() {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await billingApi<{ busy: boolean }>('/api/billing/sync', {});
      setNotice(
        result.busy
          ? 'Uma conferência já está em andamento. Aguarde alguns instantes e atualize novamente.'
          : 'Conferência concluída. O acesso é liberado assim que o pagamento estiver aprovado.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await billing.refresh();
      await w.refresh().catch(() => {});
      operation.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      billing.data &&
      !w.demo &&
      !returned.current &&
      new URLSearchParams(window.location.search).has('retorno')
    ) {
      returned.current = true;
      void sync();
    }
  }, [billing.data, w.demo]);
  if (!billing.data)
    return (
      <Shell accountOnly>
        <Loading />
      </Shell>
    );
  const data = billing.data,
    access = data.access[scope],
    plans = data.plans.filter((p) => p.scopes.includes(scope)),
    plan = plans.find((p) => p.id === planId) ?? plans[0];
  const current = data.contracts.find((c) =>
    ['creating', 'uncertain', 'pending', 'authorized', 'paused'].includes(c.status),
  );
  const unavailable = data.blocked || data.settings.maintenance;
  async function checkout() {
    if (operation.current || !plan || !consent || unavailable) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await billingApi<{ checkout_url: string | null }>('/api/billing/checkout', {
        planId: plan!.id,
        scope,
        requestId: requestId.current || crypto.randomUUID(),
        planVersion: plan!.version,
        payerEmail,
        consent,
      });
      await billing.refresh();
      if (result.checkout_url) window.location.assign(result.checkout_url);
      else
        setNotice('A contratação está sendo conferida. Use “Conferir pagamento” para atualizar.');
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof BillingApiError && e.code === 'checkout_failed')
        requestId.current = crypto.randomUUID();
    } finally {
      await billing.refresh();
      await w.refresh().catch(() => {});
      operation.current = false;
      setBusy(false);
    }
  }
  async function cancel() {
    if (!cancelId || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    try {
      await billingApi('/api/billing/cancel', { contractId: cancelId });
      await billing.refresh();
      setCancelId(null);
      setNotice('Renovação cancelada. O período já pago continua disponível até a data indicada.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await billing.refresh();
      await w.refresh().catch(() => {});
      operation.current = false;
      setBusy(false);
    }
  }
  return (
    <Shell accountOnly>
      <div className="billing-page">
        <PageHeading
          eyebrow="SUA CONTA"
          title="Sua próxima aventura começa aqui"
          description="Escolha seu acesso e acompanhe sua assinatura em um só lugar."
          action={
            !w.demo ? (
              <Button variant="secondary" onClick={() => void sync()} disabled={busy}>
                <RefreshCw size={16} className={busy ? 'spin' : ''} />
                Conferir pagamento
              </Button>
            ) : undefined
          }
        />
        <ErrorBox message={error} />
        <SuccessBox message={notice} />
        {w.demo && (
          <div className="billing-notice">
            A demonstração é gratuita. Os pagamentos ficam disponíveis nas contas conectadas ao
            site.
          </div>
        )}
        {data.blocked && (
          <ErrorBox message="Sua conta está bloqueada. Entre em contato com o suporte para revisar o acesso. Você ainda pode cancelar a renovação abaixo." />
        )}
        {data.settings.maintenance && (
          <div className="billing-notice">{data.settings.maintenance_message}</div>
        )}
        <div className="billing-mode-picker" aria-label="Tipo de acesso">
          {(['master', 'player'] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              aria-pressed={scope === s}
              onClick={() => {
                if (operation.current) return;
                setScope(s);
                w.chooseMode(s);
                setPlanId('');
                setConsent(false);
              }}
            >
              {billingScopeLabel(s)}
            </button>
          ))}
        </div>
        <section className="billing-access-card" aria-label="Situação do acesso">
          <ShieldCheck size={30} />
          <div>
            <span className="eyebrow">ACESSO COMO {billingScopeLabel(scope).toUpperCase()}</span>
            <h2>
              {access.allowed
                ? 'Tudo pronto para a sua aventura'
                : unavailable
                  ? 'Acesso indisponível'
                  : 'Escolha sua assinatura'}
            </h2>
            <p>
              {access.reason === 'free'
                ? 'Este acesso está gratuito.'
                : access.allowed
                  ? `${access.reason === 'courtesy' ? 'Cortesia' : 'Período pago'} até ${billingDate(access.paid_until)}.`
                  : 'A liberação acontece após a aprovação do pagamento.'}
            </p>
          </div>
          {access.allowed && (
            <Button
              onClick={() => {
                w.chooseMode(scope);
                router.push(continueTo.current);
              }}
            >
              Entrar na aventura
              <ArrowRight size={16} />
            </Button>
          )}
        </section>
        {current && (
          <section className="billing-section">
            <div className="billing-row">
              <div>
                <span className="eyebrow">ASSINATURA ATUAL</span>
                <h2>{current.plan_snapshot.name}</h2>
                <p>
                  {money(current.plan_snapshot.amount_cents)} /{' '}
                  {intervalLabel(current.plan_snapshot.interval_months)} ·{' '}
                  {contractStatusLabel[current.status]}
                </p>
                {current.next_payment_at && current.status === 'authorized' && (
                  <small>Próxima cobrança prevista: {billingDate(current.next_payment_at)}</small>
                )}
              </div>
              <div className="billing-actions">
                {current.status === 'pending' && current.checkout_url && (
                  <a className="button button-gold" href={current.checkout_url}>
                    Continuar no Mercado Pago
                  </a>
                )}
                <Button variant="secondary" disabled={busy} onClick={() => setCancelId(current.id)}>
                  Cancelar renovação
                </Button>
              </div>
            </div>
            {['authorized', 'paused'].includes(current.status) && !access.allowed && (
              <p>
                O contrato foi autorizado, mas ainda precisamos confirmar um pagamento aprovado.
                Clique em Conferir pagamento para atualizar.
              </p>
            )}
            {['creating', 'uncertain'].includes(current.status) && (
              <p>
                A contratação está sendo conferida. Evite iniciar outro pedido enquanto esta
                confirmação estiver pendente.
              </p>
            )}
          </section>
        )}
        {!current && !w.demo && !unavailable && access.reason === 'required' && (
          <section aria-label="Planos disponíveis">
            <div className="billing-plans">
              {plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  className={`billing-plan ${plan?.id === p.id ? 'selected' : ''}`}
                  aria-pressed={plan?.id === p.id}
                  onClick={() => {
                    if (operation.current) return;
                    setPlanId(p.id);
                    setConsent(false);
                  }}
                >
                  <span className="eyebrow">{billingScopeLabel(scope)}</span>
                  <h2>{p.name}</h2>
                  <div className="billing-price">
                    {money(p.amount_cents)}
                    <small>/ {intervalLabel(p.interval_months)}</small>
                  </div>
                  <p>{p.description}</p>
                  <ul>
                    <li>
                      <Check size={15} />
                      {p.max_campaigns
                        ? `Até ${p.max_campaigns} campanhas ativas`
                        : 'Campanhas sem limite de quantidade'}
                    </li>
                    <li>
                      <Check size={15} />
                      {p.max_players_per_campaign
                        ? `Até ${p.max_players_per_campaign} jogadores por campanha`
                        : 'Jogadores sem limite por campanha'}
                    </li>
                    <li>
                      <Check size={15} />
                      Cancele a renovação quando quiser
                    </li>
                  </ul>
                  <span>{plan?.id === p.id ? 'Plano selecionado' : 'Selecionar plano'}</span>
                </button>
              ))}
            </div>
            {plan ? (
              <form
                className="billing-checkout"
                onSubmit={(e) => {
                  e.preventDefault();
                  void checkout();
                }}
              >
                <Field
                  label="E-mail da sua conta no Mercado Pago"
                  hint="Use a conta que vai autorizar o pagamento da assinatura."
                >
                  <Input
                    type="email"
                    required
                    maxLength={254}
                    disabled={busy}
                    value={payerEmail}
                    onChange={(e) => setPayerEmail(e.target.value)}
                  />
                </Field>
                <label className="billing-check">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    Autorizo uma assinatura recorrente de{' '}
                    <strong>
                      {money(plan.amount_cents)} a cada {intervalLabel(plan.interval_months)}
                    </strong>
                    , com renovação automática até o cancelamento.
                    {data.settings.terms_url && (
                      <>
                        {' '}
                        Li os{' '}
                        <a href={data.settings.terms_url} target="_blank" rel="noreferrer">
                          termos de assinatura
                        </a>
                        .
                      </>
                    )}
                  </span>
                </label>
                <Button type="submit" disabled={busy || !consent}>
                  <CreditCard size={18} />
                  {busy ? 'Preparando…' : `Assinar por ${money(plan.amount_cents)}`}
                </Button>
                <small>
                  Você será direcionado ao checkout do Mercado Pago para escolher uma forma de
                  pagamento disponível.
                </small>
              </form>
            ) : (
              <div className="billing-notice">
                Nenhum plano disponível para este acesso. Consulte o suporte.
              </div>
            )}
          </section>
        )}
        {!current && !unavailable && access.reason === 'paid' && (
          <div className="billing-notice">
            A renovação está cancelada. Seu acesso permanece até {billingDate(access.paid_until)}.
            Você poderá contratar novamente após essa data.
          </div>
        )}
        {data.payments.length > 0 && (
          <section className="billing-section">
            <h2>Seus pagamentos</h2>
            <div className="billing-table-wrap">
              <table className="billing-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Valor</th>
                    <th>Situação</th>
                    <th>Período até</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.provider_payment_id}>
                      <td>{billingDate(p.approved_at ?? p.created_at)}</td>
                      <td>{money(p.amount_cents)}</td>
                      <td>
                        {contractStatusLabel[p.status] ?? p.status}
                        {p.refunded_cents > 0 && (
                          <small>Reembolso: {money(p.refunded_cents)}</small>
                        )}
                      </td>
                      <td>
                        {p.status === 'approved' && p.refunded_cents < p.amount_cents
                          ? billingDate(p.period_end)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <footer className="billing-help">
          <span>
            <ShieldCheck size={18} />
            Pagamento e dados de cartão ficam no Mercado Pago.
          </span>
          {data.settings.support_email && (
            <a href={`mailto:${data.settings.support_email}`}>Falar com o suporte</a>
          )}
          {data.settings.privacy_url && (
            <a href={data.settings.privacy_url} target="_blank" rel="noreferrer">
              Privacidade
            </a>
          )}
          <Link href="/escolher-modo">Trocar tipo de acesso</Link>
        </footer>
        <Confirm
          open={!!cancelId}
          onCancel={() => !busy && setCancelId(null)}
          confirmLabel="Cancelar renovação"
          title="Cancelar renovação?"
          description="O Mercado Pago deixará de fazer novas cobranças. Seu acesso continua até o fim do período já pago. Esta ação não solicita reembolso."
          onConfirm={() => void cancel()}
          busy={busy}
        />
      </div>
    </Shell>
  );
}

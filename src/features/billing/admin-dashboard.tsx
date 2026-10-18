'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  Users,
  Wallet,
} from 'lucide-react';
import { Brand } from '@/components/brand';
import {
  Button,
  ErrorBox,
  SuccessBox,
  Field,
  Input,
  Select,
  Textarea,
  Modal,
  Tabs,
  Loading,
} from '@/components/ui';
import { useWorkspace } from '@/hooks/use-workspace';
import { billingApi, useBilling } from './provider';
import {
  billingDate,
  billingScopeLabel,
  cents,
  contractStatusLabel,
  intervalLabel,
  money,
} from './model';
import type {
  BillingContract,
  BillingEntitlement,
  BillingPayment,
  BillingPlan,
  BillingSettings,
  BillingScope,
} from './types';

type Tab = 'overview' | 'plans' | 'users' | 'finance' | 'settings' | 'audit';
interface Overview {
  users: number;
  campaigns: number;
  paid_users: number;
  pending: number;
  mrr_cents: number;
  webhooks_pending: number;
  webhooks_failed: number;
  plans: BillingPlan[];
  settings: BillingSettings;
  configuration: { missing: string[]; environment: string; site_url: string };
}
interface UserRow {
  id: string;
  name: string;
  email: string;
  created_at: string;
  blocked: boolean;
  is_admin: boolean;
  master_access: BillingEntitlement;
  player_access: BillingEntitlement;
  subscription_status: string | null;
}
interface UserDetail {
  profile: { id: string; name: string; email: string; created_at: string };
  is_admin: boolean;
  blocked: boolean;
  access: Record<BillingScope, BillingEntitlement>;
  contracts: BillingContract[];
  payments: BillingPayment[];
  grants: { id: string; scopes: BillingScope[]; valid_until: string; revoked_at: string | null }[];
}
interface Finance {
  total: number;
  gross_cents: number;
  refund_cents: number;
  fee_cents: number;
  net_cents: number;
  missing_net: number;
  rows: (BillingPayment & { email: string })[];
}
interface Audit {
  id: number;
  actor_name: string;
  action: string;
  target_id: string;
  details: { reason?: string };
  created_at: string;
}
const tabs = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'plans', label: 'Planos' },
  { id: 'users', label: 'Assinantes e contas' },
  { id: 'finance', label: 'Financeiro' },
  { id: 'settings', label: 'Configurações' },
  { id: 'audit', label: 'Histórico' },
];
const accessLabel = (a: BillingEntitlement) =>
  a.reason === 'paid'
    ? `Pago até ${billingDate(a.paid_until)}`
    : a.reason === 'courtesy'
      ? `Cortesia até ${billingDate(a.paid_until)}`
      : ({
          free: 'Gratuito',
          required: 'Sem acesso pago',
          blocked: 'Bloqueado',
          maintenance: 'Em manutenção',
          admin: 'Administração',
        }[a.reason] ?? '—');
const actionsLabel: Record<string, string> = {
  plan: 'Plano atualizado',
  settings: 'Configurações alteradas',
  block: 'Bloqueio alterado',
  grant: 'Cortesia concedida',
  revoke_grant: 'Cortesia revogada',
  administrator: 'Administração alterada',
  cancel_renewal: 'Cancelamento solicitado',
  reconcile: 'Conferência solicitada',
  retry_webhooks: 'Reprocessamento solicitado',
};
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function AdminDashboard() {
  const w = useWorkspace(),
    billing = useBilling(),
    router = useRouter();
  const [tab, setTab] = useState<Tab>('overview'),
    [overview, setOverview] = useState<Overview | null>(null),
    [users, setUsers] = useState<{ rows: UserRow[]; total: number }>({ rows: [], total: 0 }),
    [finance, setFinance] = useState<Finance | null>(null),
    [audit, setAudit] = useState<{ rows: Audit[]; total: number }>({ rows: [], total: 0 }),
    [offset, setOffset] = useState(0),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [from, setFrom] = useState(() => today().slice(0, 7) + '-01'),
    [to, setTo] = useState(today),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [plan, setPlan] = useState<BillingPlan | 'new' | null>(null),
    [detail, setDetail] = useState<UserDetail | null>(null),
    [operation, setOperation] = useState<{
      kind: string;
      userId?: string;
      contractId?: string;
      grantId?: string;
      label: string;
      flag?: boolean;
    } | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await billingApi<Overview>('/api/admin/billing?view=overview');
      setOverview(data);
      if (tab === 'users')
        setUsers(
          await billingApi(
            `/api/admin/billing?view=users&offset=${offset}&query=${encodeURIComponent(search)}`,
          ),
        );
      if (tab === 'finance')
        setFinance(
          await billingApi(
            `/api/admin/billing?view=finance&offset=${offset}&from=${from}&to=${to}`,
          ),
        );
      if (tab === 'audit')
        setAudit(await billingApi(`/api/admin/billing?view=audit&offset=${offset}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab, offset, search, from, to]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    setError(null);
  }, [plan, operation]);
  async function run(task: () => Promise<unknown>, message: string) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await task();
      await reload();
      await billing.refresh();
      setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function openUser(id: string) {
    setBusy(true);
    setError(null);
    try {
      setDetail(await billingApi(`/api/admin/billing?view=user&user_id=${id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectTab = (value: string) => {
    setTab(value as Tab);
    setOffset(0);
    setError(null);
    setNotice(null);
  };
  async function mutate(action: string, data: unknown, reason: string) {
    return billingApi('/api/admin/billing/mutate', { action, data, reason });
  }
  async function execute(reason: string, days: number, scopes: BillingScope[]) {
    if (!operation) return;
    const op = operation;
    const result = await run(async () => {
      if (['reconcile', 'cancel_renewal', 'retry_webhooks'].includes(op.kind))
        await billingApi('/api/admin/billing/action', {
          action: op.kind,
          userId: op.userId,
          contractId: op.contractId,
          reason,
        });
      else
        await mutate(
          op.kind,
          {
            user_id: op.userId,
            ...(op.kind === 'block'
              ? { blocked: op.flag }
              : op.kind === 'administrator'
                ? { enabled: op.flag }
                : op.kind === 'grant'
                  ? { days, scopes }
                  : { grant_id: op.grantId }),
          },
          reason,
        );
      if (op.userId && detail)
        setDetail(await billingApi(`/api/admin/billing?view=user&user_id=${op.userId}`));
    }, 'Operação concluída. Consulte os dados atualizados abaixo.');
    if (result) setOperation(null);
  }
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-main">
        Ir para o conteúdo
      </a>
      <header className="admin-header">
        <Brand name={overview?.settings.site_name} />
        <span className="admin-mark">
          <Shield size={16} />
          Administração
        </span>
        <div className="admin-header-actions">
          <span>{w.user?.name}</span>
          <Button
            variant="ghost"
            onClick={() =>
              void w
                .logout()
                .then(() => router.push('/entrar'))
                .catch((e) => setError((e as Error).message))
            }
          >
            <LogOut size={17} />
            Sair
          </Button>
        </div>
      </header>
      <main id="admin-main" className="admin-main">
        <div className="page-heading">
          <div>
            <div className="eyebrow">CONTROLE DO SITE</div>
            <h1>{overview?.settings.site_name ?? 'Crônica'}</h1>
            <p>Planos, assinantes e a saúde do seu negócio.</p>
          </div>
          <Button variant="secondary" disabled={busy || loading} onClick={() => void reload()}>
            <RefreshCw size={16} />
            Atualizar
          </Button>
        </div>
        <Tabs
          items={tabs}
          value={tab}
          onChange={selectTab}
          label="Administração"
          idPrefix="admin-tab"
          panelId="admin-panel"
        />
        <ErrorBox message={error} />
        <SuccessBox message={notice} />
        <section id="admin-panel" role="tabpanel" aria-labelledby={`admin-tab-${tab}`}>
          {!overview ? (
            loading ? (
              <Loading />
            ) : (
              <Button onClick={() => void reload()}>Tentar novamente</Button>
            )
          ) : (
            <>
              {tab === 'overview' && (
                <>
                  <div className="admin-metrics">
                    <Metric label="Contas cadastradas" value={overview.users} icon={<Users />} />
                    <Metric
                      label="Assinantes com período pago"
                      value={overview.paid_users}
                      icon={<CheckCircle2 />}
                    />
                    <Metric
                      label="Receita mensal estimada"
                      value={money(overview.mrr_cents)}
                      icon={<Wallet />}
                    />
                    <Metric
                      label="Contratações pendentes"
                      value={overview.pending}
                      icon={<CreditCard />}
                    />
                  </div>
                  <div className="admin-two-columns">
                    <section className="billing-section">
                      <span className="eyebrow">OPERAÇÃO</span>
                      <h2>O site em funcionamento</h2>
                      <dl className="admin-facts">
                        <div>
                          <dt>Campanhas cadastradas</dt>
                          <dd>{overview.campaigns}</dd>
                        </div>
                        <div>
                          <dt>Cobrança de mestres</dt>
                          <dd>
                            {overview.settings.billing_enabled && overview.settings.require_master
                              ? 'Ativa'
                              : 'Gratuita'}
                          </dd>
                        </div>
                        <div>
                          <dt>Cobrança de jogadores</dt>
                          <dd>
                            {overview.settings.billing_enabled && overview.settings.require_player
                              ? 'Ativa'
                              : 'Gratuita'}
                          </dd>
                        </div>
                        <div>
                          <dt>Modo de manutenção</dt>
                          <dd>{overview.settings.maintenance ? 'Ativo' : 'Desativado'}</dd>
                        </div>
                      </dl>
                      <Button variant="secondary" onClick={() => selectTab('settings')}>
                        <Settings2 size={16} />
                        Configurar site
                      </Button>
                    </section>
                    <section className="billing-section">
                      <span className="eyebrow">MERCADO PAGO</span>
                      <h2>
                        {overview.configuration.missing.length
                          ? 'Configuração pendente'
                          : overview.configuration.environment === 'production'
                            ? 'Ambiente de produção'
                            : 'Ambiente de testes'}
                      </h2>
                      {overview.configuration.missing.length > 0 ? (
                        <p>
                          Faltam variáveis no servidor:{' '}
                          <code>{overview.configuration.missing.join(', ')}</code>. Consulte o guia
                          de instalação do projeto.
                        </p>
                      ) : (
                        <p>
                          As credenciais estão preenchidas. Confira a conta recebedora e valide uma
                          contratação no ambiente escolhido antes de divulgar os planos.
                        </p>
                      )}
                      <p>
                        {overview.webhooks_pending} notificações na fila ·{' '}
                        {overview.webhooks_failed} com falha após tentativas.
                      </p>
                      <div className="billing-actions">
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            setOperation({
                              kind: 'reconcile',
                              label: 'Conferir assinaturas no Mercado Pago',
                            })
                          }
                        >
                          <RefreshCw size={16} />
                          Conciliar assinaturas
                        </Button>
                        {overview.webhooks_failed > 0 && (
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              setOperation({
                                kind: 'retry_webhooks',
                                label: 'Reprocessar notificações com falha',
                              })
                            }
                          >
                            Reprocessar falhas
                          </Button>
                        )}
                      </div>
                    </section>
                  </div>
                  <p className="billing-footnote">
                    Receita mensal estimada: valor dos contratos com renovação autorizada e período
                    pago, dividido pelo intervalo em meses. Os recebimentos efetivos aparecem em
                    Financeiro. A administração acessa somente informações de gestão do site.
                  </p>
                </>
              )}
              {tab === 'plans' && (
                <>
                  <div className="billing-row admin-section-heading">
                    <div>
                      <h2>Seus planos</h2>
                      <p>
                        Novos valores e limites valem para novas contratações. Assinaturas
                        existentes mantêm as condições contratadas.
                      </p>
                    </div>
                    <Button onClick={() => setPlan('new')}>
                      <Plus size={17} />
                      Criar plano
                    </Button>
                  </div>
                  <div className="billing-plans">
                    {overview.plans.map((p) => (
                      <article className="billing-plan admin-plan" key={p.id}>
                        <span className="eyebrow">{p.active ? 'DISPONÍVEL' : 'ARQUIVADO'}</span>
                        <h2>{p.name}</h2>
                        <div className="billing-price">
                          {money(p.amount_cents)}
                          <small>/ {intervalLabel(p.interval_months)}</small>
                        </div>
                        <p>{p.description}</p>
                        <ul>
                          <li>{p.scopes.map(billingScopeLabel).join(' e ')}</li>
                          <li>
                            {p.max_campaigns
                              ? `${p.max_campaigns} campanhas ativas`
                              : 'Campanhas sem limite'}
                          </li>
                          <li>
                            {p.max_players_per_campaign
                              ? `${p.max_players_per_campaign} jogadores por campanha`
                              : 'Jogadores sem limite'}
                          </li>
                        </ul>
                        <Button variant="secondary" onClick={() => setPlan(p)}>
                          Editar plano
                        </Button>
                      </article>
                    ))}
                  </div>
                </>
              )}
              {tab === 'users' && (
                <>
                  <div className="billing-row admin-section-heading">
                    <div>
                      <h2>Assinantes e contas</h2>
                      <p>{users.total} contas encontradas</p>
                    </div>
                    <form
                      className="admin-search"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setSearch(query);
                        setOffset(0);
                      }}
                    >
                      <Input
                        aria-label="Buscar por nome, e-mail ou ID"
                        placeholder="Nome, e-mail ou ID"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <Button type="submit" variant="secondary">
                        <Search size={16} />
                        Buscar
                      </Button>
                    </form>
                  </div>
                  <div className="billing-table-wrap">
                    <table className="billing-table">
                      <thead>
                        <tr>
                          <th>Conta</th>
                          <th>Mestre</th>
                          <th>Jogador</th>
                          <th>Renovação</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.rows.map((u) => (
                          <tr key={u.id}>
                            <td>
                              <strong>{u.name}</strong>
                              <small>{u.email}</small>
                              {u.is_admin && <span className="admin-pill">Administrador</span>}
                              {u.blocked && <span className="admin-pill danger">Bloqueado</span>}
                            </td>
                            <td>{accessLabel(u.master_access)}</td>
                            <td>{accessLabel(u.player_access)}</td>
                            <td>
                              {u.subscription_status
                                ? contractStatusLabel[u.subscription_status]
                                : 'Sem assinatura'}
                            </td>
                            <td>
                              <Button
                                variant="secondary"
                                disabled={busy}
                                onClick={() => void openUser(u.id)}
                              >
                                Gerenciar
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!users.rows.length && !loading && (
                      <p className="billing-empty">Nenhuma conta encontrada.</p>
                    )}
                  </div>
                  <Pagination
                    offset={offset}
                    total={users.total}
                    loading={loading}
                    onChange={setOffset}
                  />
                </>
              )}
              {tab === 'finance' && (
                <>
                  <div className="billing-row admin-section-heading">
                    <div>
                      <h2>Recebimentos</h2>
                      <p>Datas de aprovação no fuso de São Paulo. Valores em reais.</p>
                    </div>
                    <a
                      className="button button-secondary"
                      href={`/api/admin/billing/export?from=${from}&to=${to}`}
                    >
                      <ArrowDownToLine size={16} />
                      Exportar CSV
                    </a>
                  </div>
                  <div className="admin-date-filters">
                    <Field label="De">
                      <Input
                        type="date"
                        value={from}
                        onChange={(e) => {
                          setFrom(e.target.value);
                          setOffset(0);
                        }}
                      />
                    </Field>
                    <Field label="Até">
                      <Input
                        type="date"
                        value={to}
                        onChange={(e) => {
                          setTo(e.target.value);
                          setOffset(0);
                        }}
                      />
                    </Field>
                  </div>
                  {finance && (
                    <>
                      <div className="admin-metrics">
                        <Metric
                          label="Pagamentos aprovados · bruto"
                          value={money(finance.gross_cents)}
                          icon={<Wallet />}
                        />
                        <Metric
                          label="Reembolsos e contestações"
                          value={money(finance.refund_cents)}
                          icon={<Activity />}
                        />
                        <Metric
                          label="Taxas informadas"
                          value={money(finance.fee_cents)}
                          icon={<CreditCard />}
                        />
                        <Metric
                          label="Líquido informado pelo Mercado Pago"
                          value={money(finance.net_cents)}
                          icon={<CheckCircle2 />}
                        />
                      </div>
                      <p className="billing-footnote">
                        {finance.missing_net > 0
                          ? `${finance.missing_net} pagamentos ainda sem informação de líquido. `
                          : ''}
                        O líquido é o valor informado pelo provedor para cada pagamento; não
                        representa o saldo disponível para saque. Reembolsos atualizam o relatório
                        do período original da aprovação.
                      </p>
                      <div className="billing-table-wrap">
                        <table className="billing-table">
                          <thead>
                            <tr>
                              <th>Data / pagamento</th>
                              <th>Conta</th>
                              <th>Situação</th>
                              <th>Bruto</th>
                              <th>Reembolso</th>
                              <th>Taxas</th>
                              <th>Líquido</th>
                            </tr>
                          </thead>
                          <tbody>
                            {finance.rows.map((p) => (
                              <tr key={p.provider_payment_id}>
                                <td>
                                  {billingDate(p.approved_at ?? p.created_at)}
                                  <small>{p.provider_payment_id}</small>
                                </td>
                                <td>{p.email}</td>
                                <td>{contractStatusLabel[p.status] ?? p.status}</td>
                                <td>{money(p.amount_cents)}</td>
                                <td>
                                  {money(
                                    p.status === 'charged_back' ? p.amount_cents : p.refunded_cents,
                                  )}
                                </td>
                                <td>{p.fee_cents === null ? '—' : money(p.fee_cents)}</td>
                                <td>{p.net_cents === null ? '—' : money(p.net_cents)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!finance.rows.length && !loading && (
                          <p className="billing-empty">Nenhum pagamento no período selecionado.</p>
                        )}
                      </div>
                      <Pagination
                        offset={offset}
                        total={finance.total}
                        loading={loading}
                        onChange={setOffset}
                      />
                    </>
                  )}
                </>
              )}
              {tab === 'settings' && (
                <SettingsForm
                  key={overview.settings.version}
                  settings={overview.settings}
                  busy={busy}
                  onSave={async (data, reason) => {
                    await run(() => mutate('settings', data, reason), 'Configurações salvas.');
                  }}
                />
              )}
              {tab === 'audit' && (
                <>
                  <div className="admin-section-heading">
                    <h2>Histórico administrativo</h2>
                    <p>Alterações e solicitações de operação, com responsável e motivo.</p>
                  </div>
                  <div className="billing-table-wrap">
                    <table className="billing-table">
                      <thead>
                        <tr>
                          <th>Quando</th>
                          <th>Responsável</th>
                          <th>Operação</th>
                          <th>Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audit.rows.map((a) => (
                          <tr key={a.id}>
                            <td>
                              {billingDate(a.created_at)}
                              <small>
                                {new Date(a.created_at).toLocaleTimeString('pt-BR', {
                                  timeZone: 'America/Sao_Paulo',
                                })}
                              </small>
                            </td>
                            <td>{a.actor_name ?? 'Configuração inicial'}</td>
                            <td>
                              {actionsLabel[a.action] ?? a.action}
                              <small>{a.target_id}</small>
                            </td>
                            <td>{a.details.reason ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    offset={offset}
                    total={audit.total}
                    loading={loading}
                    onChange={setOffset}
                  />
                </>
              )}
            </>
          )}
        </section>
      </main>
      <footer className="admin-footer">Crônica · Administração do site</footer>
      <Modal
        open={!!plan}
        onClose={() => !busy && setPlan(null)}
        title={plan === 'new' ? 'Criar plano' : 'Editar plano'}
      >
        <ErrorBox message={error} />
        {plan && (
          <PlanForm
            plan={plan === 'new' ? null : plan}
            busy={busy}
            onSave={async (data, reason) => {
              if (
                await run(
                  () => mutate('plan', data, reason),
                  'Plano salvo. Novas contratações já usam estas condições.',
                )
              )
                setPlan(null);
            }}
          />
        )}
      </Modal>
      <Modal open={!!detail} onClose={() => !busy && setDetail(null)} title="Gerenciar conta">
        {detail && (
          <div className="admin-user-detail">
            <h3>{detail.profile.name}</h3>
            <p>{detail.profile.email}</p>
            <small>{detail.profile.id}</small>
            <div className="admin-facts">
              <p>Mestre: {accessLabel(detail.access.master)}</p>
              <p>Jogador: {accessLabel(detail.access.player)}</p>
            </div>
            <div className="billing-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  setOperation({
                    kind: 'grant',
                    userId: detail.profile.id,
                    label: 'Conceder acesso de cortesia',
                  })
                }
              >
                Conceder cortesia
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  setOperation({
                    kind: 'reconcile',
                    userId: detail.profile.id,
                    label: 'Conferir pagamentos desta conta',
                  })
                }
              >
                Conferir pagamentos
              </Button>
              {!detail.is_admin && (
                <Button
                  variant={detail.blocked ? 'secondary' : 'danger'}
                  disabled={busy}
                  onClick={() =>
                    setOperation({
                      kind: 'block',
                      userId: detail.profile.id,
                      flag: !detail.blocked,
                      label: detail.blocked ? 'Desbloquear conta' : 'Bloquear conta',
                    })
                  }
                >
                  {detail.blocked ? 'Desbloquear' : 'Bloquear'}
                </Button>
              )}
              {detail.profile.id !== w.user?.id && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    setOperation({
                      kind: 'administrator',
                      userId: detail.profile.id,
                      flag: !detail.is_admin,
                      label: detail.is_admin ? 'Remover administração' : 'Conceder administração',
                    })
                  }
                >
                  {detail.is_admin ? 'Remover administração' : 'Tornar administrador'}
                </Button>
              )}
            </div>
            <h3>Assinaturas</h3>
            {detail.contracts.length ? (
              detail.contracts.map((c) => (
                <article className="admin-contract" key={c.id}>
                  <strong>{c.plan_snapshot.name}</strong>
                  <p>
                    {money(c.plan_snapshot.amount_cents)} /{' '}
                    {intervalLabel(c.plan_snapshot.interval_months)} ·{' '}
                    {contractStatusLabel[c.status]}
                  </p>
                  <small>
                    Mercado Pago: {c.provider_id ?? 'Em preparação'} · Conferido em{' '}
                    {billingDate(c.last_synced_at)}
                  </small>
                  {!['cancelled', 'failed'].includes(c.status) && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        setOperation({
                          kind: 'cancel_renewal',
                          userId: detail.profile.id,
                          contractId: c.id,
                          label: 'Cancelar renovação desta assinatura',
                        })
                      }
                    >
                      Cancelar renovação
                    </Button>
                  )}
                </article>
              ))
            ) : (
              <p>Esta conta ainda não tem assinaturas.</p>
            )}
            <h3>Cortesias</h3>
            {detail.grants
              .filter((g) => !g.revoked_at && new Date(g.valid_until) > new Date())
              .map((g) => (
                <div className="admin-contract" key={g.id}>
                  <p>
                    {g.scopes.map(billingScopeLabel).join(' e ')} até {billingDate(g.valid_until)}
                  </p>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      setOperation({
                        kind: 'revoke_grant',
                        userId: detail.profile.id,
                        grantId: g.id,
                        label: 'Revogar cortesia',
                      })
                    }
                  >
                    Revogar cortesia
                  </Button>
                </div>
              ))}
            <h3>Pagamentos recentes</h3>
            {detail.payments.map((p) => (
              <div className="billing-row admin-contract" key={p.provider_payment_id}>
                <span>{billingDate(p.approved_at ?? p.created_at)}</span>
                <strong>{money(p.amount_cents)}</strong>
                <span>{contractStatusLabel[p.status] ?? p.status}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
      <Modal
        open={!!operation}
        onClose={() => !busy && setOperation(null)}
        title={operation?.label ?? 'Confirmar operação'}
      >
        <ErrorBox message={error} />
        {operation && (
          <OperationForm
            key={`${operation.kind}-${operation.userId}`}
            operation={operation.kind}
            busy={busy}
            onSubmit={execute}
          />
        )}
      </Modal>
    </div>
  );
}
function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <article className="admin-metric">
      <span className="admin-metric-icon">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}
function Pagination({
  offset,
  total,
  loading,
  onChange,
}: {
  offset: number;
  total: number;
  loading: boolean;
  onChange: (offset: number) => void;
}) {
  return (
    <div className="admin-pagination">
      <span>
        {total ? `${offset + 1}–${Math.min(offset + 25, total)} de ${total}` : '0 registros'}
      </span>
      <Button
        variant="ghost"
        disabled={!offset || loading}
        onClick={() => onChange(Math.max(0, offset - 25))}
      >
        <ArrowLeft size={16} />
        Anterior
      </Button>
      <Button
        variant="ghost"
        disabled={offset + 25 >= total || loading}
        onClick={() => onChange(offset + 25)}
      >
        Próxima
        <ArrowRight size={16} />
      </Button>
    </div>
  );
}
function Reason({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Motivo da alteração" hint="Este motivo fica no histórico administrativo.">
      <Textarea
        required
        minLength={3}
        maxLength={500}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
      />
    </Field>
  );
}
function ScopeChecks({
  value,
  onChange,
}: {
  value: BillingScope[];
  onChange: (value: BillingScope[]) => void;
}) {
  return (
    <fieldset className="billing-fieldset">
      <legend>Tipos de acesso</legend>
      {(['master', 'player'] as const).map((scope) => (
        <label className="billing-check" key={scope}>
          <input
            type="checkbox"
            checked={value.includes(scope)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, scope] : value.filter((s) => s !== scope))
            }
          />
          {billingScopeLabel(scope)}
        </label>
      ))}
    </fieldset>
  );
}
function PlanForm({
  plan,
  busy,
  onSave,
}: {
  plan: BillingPlan | null;
  busy: boolean;
  onSave: (data: unknown, reason: string) => Promise<void>;
}) {
  const [name, setName] = useState(plan?.name ?? ''),
    [description, setDescription] = useState(plan?.description ?? ''),
    [price, setPrice] = useState(plan ? (plan.amount_cents / 100).toFixed(2) : '20.00'),
    [months, setMonths] = useState(plan?.interval_months ?? 1),
    [scopes, setScopes] = useState<BillingScope[]>(plan?.scopes ?? ['master', 'player']),
    [campaigns, setCampaigns] = useState(plan?.max_campaigns?.toString() ?? ''),
    [players, setPlayers] = useState(plan?.max_players_per_campaign?.toString() ?? ''),
    [active, setActive] = useState(plan?.active ?? true),
    [reason, setReason] = useState(''),
    [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const amount = cents(price.replace(',', '.'));
      if (!scopes.length) throw new Error('Selecione pelo menos um tipo de acesso.');
      await onSave(
        {
          ...(plan ? { id: plan.id, version: plan.version } : {}),
          name,
          description,
          amount_cents: amount,
          interval_months: months,
          scopes,
          max_campaigns: campaigns ? Number(campaigns) : null,
          max_players_per_campaign: players ? Number(players) : null,
          active,
          sort_order: plan?.sort_order ?? 0,
        },
        reason,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form className="admin-form" onSubmit={(e) => void submit(e)}>
      <ErrorBox message={error} />
      <Field label="Nome do plano">
        <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Descrição">
        <Textarea
          maxLength={1200}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="admin-two-columns">
        <Field label="Valor por cobrança (R$)">
          <Input
            required
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Field label="Renovação">
          <Select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[1, 3, 6, 12].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'Mensal' : n === 12 ? 'Anual' : `A cada ${n} meses`}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <ScopeChecks value={scopes} onChange={setScopes} />
      <div className="admin-two-columns">
        <Field label="Limite de campanhas ativas" hint="Vazio para ilimitado.">
          <Input
            type="number"
            min={1}
            max={10000}
            value={campaigns}
            onChange={(e) => setCampaigns(e.target.value)}
          />
        </Field>
        <Field label="Jogadores por campanha" hint="Vazio para ilimitado.">
          <Input
            type="number"
            min={1}
            max={10000}
            value={players}
            onChange={(e) => setPlayers(e.target.value)}
          />
        </Field>
      </div>
      <label className="billing-check">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Disponível para novas contratações
      </label>
      <Reason value={reason} onChange={setReason} />
      <p className="billing-footnote">
        Alterações não modificam o valor nem os limites de assinaturas existentes. Arquivar impede
        apenas novas contratações.
      </p>
      <Button type="submit" disabled={busy}>
        Salvar plano
      </Button>
    </form>
  );
}
function SettingsForm({
  settings: s,
  busy,
  onSave,
}: {
  settings: BillingSettings;
  busy: boolean;
  onSave: (data: unknown, reason: string) => Promise<void>;
}) {
  const [settings, setSettings] = useState(s),
    [reason, setReason] = useState('');
  const change = <K extends keyof BillingSettings>(key: K, value: BillingSettings[K]) =>
    setSettings((old) => ({ ...old, [key]: value }));
  return (
    <form
      className="admin-settings admin-form"
      onSubmit={(e) => {
        e.preventDefault();
        const { id: _, updated_at: __, ...data } = settings;
        void onSave(data, reason);
      }}
    >
      <section className="billing-section">
        <h2>Assinaturas e acesso</h2>
        <label className="billing-check">
          <input
            type="checkbox"
            checked={settings.billing_enabled}
            onChange={(e) => change('billing_enabled', e.target.checked)}
          />
          Exigir assinatura para os acessos selecionados
        </label>
        <label className="billing-check">
          <input
            type="checkbox"
            checked={settings.require_master}
            onChange={(e) => change('require_master', e.target.checked)}
          />
          Mestres precisam de assinatura
        </label>
        <label className="billing-check">
          <input
            type="checkbox"
            checked={settings.require_player}
            onChange={(e) => change('require_player', e.target.checked)}
          />
          Jogadores precisam de assinatura
        </label>
        <p className="billing-footnote">
          Alterar estas regras não cancela cobranças já autorizadas no Mercado Pago. Cancele cada
          renovação na gestão da conta quando necessário.
        </p>
        <Field
          label="Tolerância para renovar (dias)"
          hint="De 0 a 14 dias após um período pago, apenas enquanto a renovação estiver autorizada."
        >
          <Input
            type="number"
            min={0}
            max={14}
            required
            value={settings.grace_days}
            onChange={(e) => change('grace_days', Number(e.target.value))}
          />
        </Field>
      </section>
      <section className="billing-section">
        <h2>Site e atendimento</h2>
        <Field label="Nome do site">
          <Input
            required
            maxLength={80}
            value={settings.site_name}
            onChange={(e) => change('site_name', e.target.value)}
          />
        </Field>
        <Field label="E-mail de suporte">
          <Input
            type="email"
            value={settings.support_email}
            onChange={(e) => change('support_email', e.target.value)}
          />
        </Field>
        <Field label="Link dos termos de assinatura">
          <Input
            type="url"
            placeholder="https://"
            value={settings.terms_url}
            onChange={(e) => change('terms_url', e.target.value)}
          />
        </Field>
        <Field label="Link da política de privacidade">
          <Input
            type="url"
            placeholder="https://"
            value={settings.privacy_url}
            onChange={(e) => change('privacy_url', e.target.value)}
          />
        </Field>
        <label className="billing-check">
          <input
            type="checkbox"
            checked={settings.maintenance}
            onChange={(e) => change('maintenance', e.target.checked)}
          />
          Ativar manutenção e suspender o acesso às aventuras
        </label>
        <Field label="Mensagem de manutenção">
          <Textarea
            required
            maxLength={500}
            value={settings.maintenance_message}
            onChange={(e) => change('maintenance_message', e.target.value)}
          />
        </Field>
        <p className="billing-footnote">
          Durante a manutenção, a administração e o cancelamento de assinaturas continuam
          disponíveis. A manutenção não pausa a cobrança recorrente.
        </p>
      </section>
      <Reason value={reason} onChange={setReason} />
      <Button type="submit" disabled={busy}>
        Salvar configurações
      </Button>
    </form>
  );
}
function OperationForm({
  operation,
  busy,
  onSubmit,
}: {
  operation: string;
  busy: boolean;
  onSubmit: (reason: string, days: number, scopes: BillingScope[]) => Promise<void>;
}) {
  const [reason, setReason] = useState(''),
    [days, setDays] = useState(30),
    [scopes, setScopes] = useState<BillingScope[]>(['master', 'player']);
  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(reason, days, scopes);
      }}
    >
      {operation === 'grant' && (
        <>
          <Field label="Duração em dias">
            <Input
              type="number"
              min={1}
              max={365}
              required
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </Field>
          <ScopeChecks value={scopes} onChange={setScopes} />
          <p>A cortesia libera o acesso durante o período informado e não registra um pagamento.</p>
        </>
      )}
      {operation === 'block' && (
        <p>
          O bloqueio suspende o acesso às aventuras. Ele não cancela a assinatura; gerencie a
          renovação separadamente.
        </p>
      )}
      {operation === 'cancel_renewal' && (
        <p>
          O Mercado Pago deixará de cobrar as próximas renovações. O período já pago será
          preservado. Nenhum reembolso será solicitado.
        </p>
      )}
      {operation === 'administrator' && (
        <p>
          A administração permite gerenciar contas, preços e cobranças. Esta conta passará a usar
          somente a área administrativa. Cancele qualquer renovação antes de conceder este acesso.
        </p>
      )}
      <Reason value={reason} onChange={setReason} />
      <Button type="submit" disabled={busy || (operation === 'grant' && !scopes.length)}>
        Confirmar operação
      </Button>
    </form>
  );
}

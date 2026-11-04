'use client';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { billingApi } from './provider';
export interface MaintenanceHealth {
  database_version: number;
  media_pending: number;
  media_failed: number;
  webhooks_overdue: number;
  last_run_at: string | null;
  last_result: { billing?: { error?: string }; media?: { error?: string } } | null;
}
export function MaintenanceHealthPanel({
  health,
  onRefresh,
}: {
  health?: MaintenanceHealth | null;
  onRefresh?(): void;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<string | null>(null);
  async function retry() {
    setBusy(true);
    try {
      await billingApi('/api/admin/media/retry', {
        reason: 'Reprocessamento de mídias solicitado na administração.',
      });
      setNotice('As limpezas serão retomadas na próxima manutenção.');
      onRefresh?.();
    } catch {
      setNotice('Não foi possível retomar as limpezas. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="billing-section">
      <span className="eyebrow">SAÚDE DO PROJETO</span>
      <h2>Atualizações e tarefas pendentes</h2>
      {!health || health.database_version < 47 ? (
        <p role="alert">
          O banco precisa da atualização 047. Siga o guia de atualização antes de usar esta versão.
        </p>
      ) : (
        <>
          <p>Banco compatível com a atualização 047.</p>
          <p>
            {health.media_pending} imagens aguardando limpeza · {health.media_failed} limpezas com
            falha.
          </p>
          <p>
            Última manutenção:{' '}
            {health.last_run_at
              ? new Date(health.last_run_at).toLocaleString('pt-BR')
              : 'ainda não registrada'}
            .
          </p>
          {health.webhooks_overdue > 0 ? (
            <p role="alert">
              {health.webhooks_overdue} notificações de pagamento aguardam há mais de 15 minutos.
              Confira o agendamento e reprocesse a fila.
            </p>
          ) : null}
          {health.media_failed > 0 ||
          health.last_result?.media?.error ||
          health.last_result?.billing?.error ? (
            <p role="alert">
              Uma tarefa de manutenção precisa de atenção. Confira as configurações e os registros
              do servidor.
            </p>
          ) : null}
          {!health.last_run_at ? (
            <p>
              Ative o agendamento descrito no guia 047 para processar pagamentos e limpar imagens
              sem uso.
            </p>
          ) : null}
          {health.media_failed > 0 ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void retry()}>
              Retomar limpezas
            </Button>
          ) : null}
        </>
      )}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}

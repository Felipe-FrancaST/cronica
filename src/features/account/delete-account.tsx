'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, LoaderCircle, Trash2 } from 'lucide-react';
import { Button, ErrorBox, Field, Input, Modal } from '@/components/ui';
import { billingApi } from '@/features/billing/provider';
import type { AccountDeletionPreview } from './deletion';

export function DeleteAccount() {
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(''),
    [phrase, setPhrase] = useState(''),
    [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(false);
  const load = useCallback(async () => {
    try {
      setPreview(await billingApi<AccountDeletionPreview>('/api/account/delete'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const pending = Boolean(preview?.phase && preview.phase !== 'preparing');
  const enabled =
    preview?.can_delete && password.length > 0 && phrase === 'EXCLUIR MINHA CONTA' && ack && !busy;
  function close() {
    if (operation.current) return;
    setOpen(false);
    setPassword('');
    setPhrase('');
    setAck(false);
    setError(null);
  }
  async function submit() {
    if (!enabled || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    try {
      for (;;) {
        const result = await billingApi<{ deleted: boolean; pending: boolean }>(
          '/api/account/delete',
          {
            password,
            confirmation: phrase,
          },
        );
        if (result.deleted) {
          for (const storage of [localStorage, sessionStorage])
            for (const key of Object.keys(storage))
              if (key.startsWith('cronica:') || /^sb-.+-auth-token/.test(key))
                storage.removeItem(key);
          window.location.replace('/entrar?conta=excluida');
          return;
        }
        if (!result.pending)
          throw new Error('Não foi possível finalizar a exclusão. Tente novamente.');
      }
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel account-danger-panel">
      <div className="panel-heading">
        <h2>Excluir conta</h2>
        <Trash2 size={19} />
      </div>
      <p>
        Remova permanentemente sua conta, arquivos e dados da Crônica. Renovações ativas e códigos
        Pix pendentes serão cancelados antes da exclusão.
      </p>
      {pending && (
        <div className="account-deletion-warning" role="status">
          Sua exclusão está pendente. Continue para finalizar a remoção dos arquivos e do acesso.
        </div>
      )}
      {!open && <ErrorBox message={error} />}
      {!open && error && !preview && (
        <Button variant="ghost" onClick={() => void load()}>
          Conferir dados novamente
        </Button>
      )}
      <div className="form-actions">
        <Button
          variant="danger"
          onClick={() => {
            setOpen(true);
            void load();
          }}
        >
          <Trash2 size={16} />
          {pending ? 'Continuar exclusão' : 'Excluir minha conta'}
        </Button>
      </div>
      <Modal
        open={open}
        onClose={close}
        title="Excluir sua conta?"
        description="Esta ação é permanente. Confira os dados que serão removidos antes de continuar."
      >
        <form
          className="form-stack account-deletion-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <ErrorBox message={error} />
          {preview ? (
            <>
              <div className="account-deletion-counts">
                <div>
                  <strong>{preview.campaigns}</strong>
                  <span>campanhas criadas</span>
                </div>
                <div>
                  <strong>{preview.characters}</strong>
                  <span>personagens seus</span>
                </div>
                <div>
                  <strong>{preview.memberships}</strong>
                  <span>participações em outras campanhas</span>
                </div>
              </div>
              <div className="account-deletion-warning">
                <AlertTriangle size={20} />
                <div>
                  <strong>Esta ação não pode ser desfeita.</strong>
                  <p>
                    As campanhas que você criou serão apagadas por completo, incluindo fichas e
                    dados de participantes nelas. Em campanhas de outros mestres, seus personagens e
                    registros vinculados serão removidos.
                  </p>
                  <p>Seu perfil, arquivos e histórico da conta também serão excluídos.</p>
                  {preview.has_renewal && (
                    <p>
                      Vamos confirmar o cancelamento dos pagamentos pendentes e das renovações no
                      Mercado Pago antes de remover seus dados. A exclusão não solicita reembolso.
                    </p>
                  )}
                </div>
              </div>
              {!preview.can_delete && <ErrorBox message={preview.reason} />}
            </>
          ) : (
            <p role="status">Conferindo os dados da conta…</p>
          )}
          <Field label="Senha atual" hint="Confirme sua identidade para excluir a conta.">
            <Input
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Digite EXCLUIR MINHA CONTA">
            <Input
              required
              autoComplete="off"
              value={phrase}
              disabled={busy}
              onChange={(e) => setPhrase(e.target.value)}
            />
          </Field>
          <label className="billing-check">
            <input
              type="checkbox"
              checked={ack}
              disabled={busy}
              onChange={(e) => setAck(e.target.checked)}
            />
            <span>
              Entendo que meus dados serão apagados permanentemente, incluindo as campanhas que
              criei.
            </span>
          </label>
          <div className="form-actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={close}>
              Voltar
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={!enabled}
              disabledReason={
                preview?.reason ??
                'Preencha sua senha, digite a confirmação e aceite a exclusão permanente.'
              }
            >
              {busy ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
              {busy ? 'Excluindo conta…' : 'Excluir definitivamente'}
            </Button>
          </div>
          {busy && (
            <small role="status">
              Aguarde enquanto encerramos os pagamentos pendentes e removemos seus dados. Isso pode
              levar alguns instantes.
            </small>
          )}
        </form>
      </Modal>
    </section>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { Copy, QrCode, RefreshCw } from 'lucide-react';
import { Button, ErrorBox, SuccessBox } from '@/components/ui';
import { billingApi } from './provider';
import type { BillingPix } from './types';

export function PixPayment({
  contractId,
  initial,
  onUpdate,
}: {
  contractId: string;
  initial: BillingPix | null;
  onUpdate: () => Promise<void>;
}) {
  const [pix, setPix] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const update = useRef(onUpdate);
  update.current = onUpdate;
  const inFlight = useRef(false),
    alive = useRef(true);
  async function refresh(force = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    if (alive.current) setBusy(true);
    try {
      const result = await billingApi<BillingPix>('/api/billing/pix/status', { contractId, force });
      if (!alive.current) return;
      setPix(result);
      setError(null);
      if (['completed', 'cancelled', 'expired', 'failed'].includes(result.status))
        await update.current();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    if (!initial) void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 20000);
    const focus = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, [contractId]);
  const expired = !!pix?.expires_at && new Date(pix.expires_at).getTime() <= Date.now();
  async function copy() {
    if (!pix?.qr_code || !pix.expires_at || new Date(pix.expires_at).getTime() <= Date.now()) {
      setNotice(null);
      setError('Este código expirou. Confira o pagamento para atualizar.');
      void refresh();
      return;
    }
    try {
      await navigator.clipboard.writeText(pix.qr_code);
      setNotice('Código Pix copiado. Cole no aplicativo do seu banco.');
    } catch {
      setNotice('Selecione o código abaixo e copie pelo menu do seu aparelho.');
    }
  }
  return (
    <div className="billing-pix" aria-label="Pagamento por Pix">
      <div className="billing-pix-heading">
        <QrCode size={22} />
        <div>
          <h3>Pague com Pix</h3>
          <p>Escaneie o QR Code ou use o código copia e cola no seu banco.</p>
        </div>
      </div>
      <ErrorBox message={error} />
      <SuccessBox message={notice} />
      {pix?.qr_code && !expired ? (
        <div className="billing-pix-content">
          {pix.qr_code_base64 && (
            <img
              className="billing-pix-qr"
              src={`data:image/png;base64,${pix.qr_code_base64}`}
              width={224}
              height={224}
              alt="QR Code do pagamento Pix"
            />
          )}
          <div className="billing-pix-details">
            <label htmlFor={`pix-code-${contractId}`}>Pix copia e cola</label>
            <textarea
              id={`pix-code-${contractId}`}
              readOnly
              value={pix.qr_code}
              rows={4}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="secondary" onClick={() => void copy()}>
              <Copy size={16} />
              Copiar código Pix
            </Button>
            <small>
              Válido até{' '}
              {new Date(pix.expires_at!).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
                timeZone: 'America/Sao_Paulo',
              })}{' '}
              (horário de Brasília).
            </small>
          </div>
        </div>
      ) : (
        <p>
          {expired
            ? 'A validade deste código terminou. Atualize a conferência para gerar um novo pagamento.'
            : 'Estamos recuperando seu Pix. Acompanhe a confirmação abaixo.'}
        </p>
      )}
      <div className="billing-pix-footer">
        <p>O acesso será liberado após a confirmação. Renovação manual ao fim do período pago.</p>
        <Button variant="secondary" onClick={() => void refresh(true)} disabled={busy}>
          <RefreshCw size={16} className={busy ? 'spin' : ''} />
          {busy ? 'Conferindo Pix…' : 'Já paguei, conferir Pix'}
        </Button>
      </div>
    </div>
  );
}

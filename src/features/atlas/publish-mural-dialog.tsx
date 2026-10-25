'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Send } from 'lucide-react';
import { Button, ErrorBox, Field, Input, Modal, Select } from '@/components/ui';
import { useCampaignSessions } from '@/features/sessions/use-sessions';
import { useWorkspace } from '@/hooks/use-workspace';
import { useActionNotice } from '@/components/action-notice';
import { errorMessage } from '@/lib/utils';
import { Check } from './panels';
import { publishAtlasToMural, type MuralPublication } from './publish-mural';
import type { AtlasMap } from './types';
export function PublishMuralDialog({
  map,
  portal,
  onClose,
  onSave,
}: {
  map: AtlasMap;
  portal?: HTMLElement | null;
  onClose(): void;
  onSave(): Promise<AtlasMap>;
}) {
  const w = useWorkspace(),
    announce = useActionNotice(),
    sessions = useCampaignSessions(map.campaign_id, true);
  const eligible = sessions.items.filter((s) => s.status !== 'ended');
  const [chapter, setChapter] = useState(''),
    [title, setTitle] = useState(map.name),
    [includeTokens, setIncludeTokens] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState<string | null>(null),
    [created, setCreated] = useState<string | null>(null);
  const lock = useRef(false),
    job = useRef<MuralPublication | null>(null);
  useEffect(() => {
    if (!chapter && eligible.length)
      setChapter((eligible.find((s) => s.status === 'active') ?? eligible[0]).id);
  }, [chapter, eligible]);
  return (
    <Modal
      open
      title="Enviar mapa ao mural"
      description="Compartilhe uma imagem do mapa com os jogadores em um capítulo da campanha."
      wide
      portalContainer={portal}
      onClose={() => {
        if (!lock.current) onClose();
      }}
    >
      {created ? (
        <div className="atlas-publish-success">
          <CheckCircle2 size={32} />
          <h3>Mapa enviado ao mural</h3>
          <p>
            {eligible.find((s) => s.id === chapter)?.status === 'planned'
              ? 'O mapa está preparado no mural. Os jogadores poderão vê-lo quando este capítulo começar.'
              : 'Os jogadores podem abrir e explorar a imagem. As marcações seguem a permissão definida nas regras da campanha.'}
          </p>
          <Link
            className="button button-primary"
            href={`/campanhas/${map.campaign_id}/mesa/mural?sessao=${chapter}`}
          >
            Abrir mural
          </Link>
          <Button type="button" variant="secondary" onClick={onClose}>
            Continuar editando
          </Button>
        </div>
      ) : (
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (lock.current || !chapter || !title.trim()) return;
            lock.current = true;
            setBusy(true);
            setError(null);
            try {
              setStatus('Salvando o mapa…');
              const saved = await onSave(),
                key = `${saved.id}:${saved.revision}:${chapter}:${title.trim()}:${includeTokens}`;
              if (job.current?.key !== key) job.current = { id: crypto.randomUUID(), key };
              const card = await publishAtlasToMural(
                job.current,
                saved,
                chapter,
                title,
                includeTokens,
                w.demo,
                setStatus,
              );
              setCreated(card.id);
              announce('Mapa enviado ao mural.');
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <ErrorBox message={error ?? sessions.error} />
          <Field label="Capítulo do mural">
            <Select
              value={chapter}
              disabled={busy || sessions.loading}
              onChange={(e) => setChapter(e.target.value)}
            >
              <option value="">
                {sessions.loading ? 'Carregando capítulos…' : 'Escolher capítulo'}
              </option>
              {eligible.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number} · {s.name}
                  {s.status === 'active' ? ' · em andamento' : ''}
                </option>
              ))}
            </Select>
          </Field>
          {eligible.find((s) => s.id === chapter)?.status === 'planned' && (
            <p className="atlas-hint">
              Este capítulo está em preparação. O mapa aparecerá para os jogadores quando a sessão
              começar.
            </p>
          )}
          {!sessions.loading && !eligible.length && (
            <Link href={`/campanhas/${map.campaign_id}/sessoes`}>
              Crie um capítulo para receber este mapa.
            </Link>
          )}
          <Field label="Título no mural">
            <Input
              required
              maxLength={180}
              disabled={busy}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Check
            label="Incluir tokens de planejamento na imagem"
            checked={includeTokens}
            disabled={busy}
            onChange={setIncludeTokens}
          />
          <p className="atlas-hint">
            O mural recebe a imagem das camadas visíveis. O mapa editável continua na sua oficina.
            Você pode continuar atualizando o mapa e enviar uma nova imagem quando quiser.
          </p>
          {busy && <p role="status">{status}</p>}
          <div className="form-actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || sessions.loading || !chapter || !title.trim()}>
              <Send size={16} />
              {busy ? 'Enviando…' : 'Publicar no mural'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

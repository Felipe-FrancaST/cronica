'use client';
import { memo, useId, useState } from 'react';
import { ChevronDown, LoaderCircle } from 'lucide-react';
import { Button, Badge, Field, Input } from '@/components/ui';
import { ToolPagination } from './master-tool-menu';
import { sceneryInteraction, sceneryLabel } from './scenery';
import { configurableScenery } from './scenery-gameplay';
import type { BattleMapObject } from './types';

export const SceneryMasterInteractions = memo(function SceneryMasterInteractions({
  objects,
  embedded = false,
  busy,
  pendingIds,
  onInteract,
  onConfigure,
}: {
  objects: BattleMapObject[];
  embedded?: boolean;
  busy: boolean;
  pendingIds: ReadonlySet<string>;
  onInteract(object: BattleMapObject, variant: string): Promise<void>;
  onConfigure(object: BattleMapObject): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const contentId = useId();
  const available = objects.filter((object) => sceneryInteraction(object));
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const filtered = available.filter((object) =>
    `${sceneryLabel(object)} ${object.object_type} ${String(object.geometry.x)},${String(object.geometry.y)}`
      .toLocaleLowerCase('pt-BR')
      .includes(query),
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 8) - 1));
  const open = embedded || expanded;
  if (!available.length && !embedded) return null;
  return (
    <section className="vtt-scenery-interactions" aria-label="Interações do cenário">
      {!embedded && (
        <button
          type="button"
          className="vtt-scenery-interactions-toggle"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((value) => !value)}
        >
          <strong>Interações do cenário</strong>
          <Badge tone="muted">{available.length}</Badge>
          <ChevronDown className="vtt-scenery-interactions-chevron" size={17} aria-hidden="true" />
        </button>
      )}
      <div id={contentId} className="vtt-scenery-interactions-content" hidden={!open}>
        {open && (
          <>
            <small>
              {available.length
                ? 'Use luzes e mecanismos sem sair do combate. Para uma peça específica, você também pode tocar nela no Grid.'
                : 'Ainda não há elementos interativos. Coloque uma luz, porta ou recipiente pela ferramenta Objetos.'}
            </small>
            {!!available.length && (
              <Field label="Buscar interação">
                <Input
                  value={search}
                  placeholder="Nome, tipo ou posição…"
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                />
              </Field>
            )}
            <ul className="vtt-scenery-interaction-list" role="list">
              {filtered.slice(currentPage * 8, (currentPage + 1) * 8).map((object) => (
                <SceneryInteractionRow
                  key={object.id}
                  object={object}
                  busy={busy}
                  pending={pendingIds.has(object.id)}
                  onInteract={onInteract}
                  onConfigure={onConfigure}
                />
              ))}
            </ul>
            {!!available.length && !filtered.length && <small>Nenhuma interação encontrada.</small>}
            <ToolPagination
              page={currentPage}
              total={filtered.length}
              size={8}
              onPage={setPage}
              label="interações"
            />
          </>
        )}
      </div>
    </section>
  );
});

const SceneryInteractionRow = memo(function SceneryInteractionRow({
  object,
  busy,
  pending,
  onInteract,
  onConfigure,
}: {
  object: BattleMapObject;
  busy: boolean;
  pending: boolean;
  onInteract(object: BattleMapObject, variant: string): Promise<void>;
  onConfigure(object: BattleMapObject): void;
}) {
  const interaction = sceneryInteraction(object)!;
  const position = `${String(object.geometry.x)},${String(object.geometry.y)}`;
  const lockAction = object.metadata.interaction_locked ? 'Destrancar pelo mestre' : 'Trancar';
  return (
    <li className="vtt-scenery-interaction-card" aria-busy={pending}>
      <div className="vtt-scenery-interaction-info">
        <strong>{sceneryLabel(object)}</strong>
        <small>
          {String(object.geometry.x)}, {String(object.geometry.y)}
          {!object.visible ? ' · oculto' : ''}
          {object.metadata.has_key === true
            ? object.metadata.interaction_locked
              ? ' · trancado'
              : ' · destrancado'
            : ''}
        </small>
      </div>
      <div className="vtt-scenery-interaction-actions">
        <Button
          variant="secondary"
          disabled={busy || pending}
          disabledReason={
            pending
              ? 'Salvando este elemento. Os outros controles continuam disponíveis.'
              : undefined
          }
          aria-label={`${interaction.label}: ${sceneryLabel(object)} em ${position}`}
          onClick={() => void onInteract(object, interaction.variant)}
        >
          {pending && <LoaderCircle size={13} className="spin" aria-label="Salvando elemento" />}
          {interaction.label}
        </Button>
        {configurableScenery(object.object_type) && (
          <Button
            variant="ghost"
            disabled={busy || pending}
            aria-label={`Configurar ${sceneryLabel(object)}`}
            onClick={() => onConfigure(object)}
          >
            Conteúdo e fechadura
          </Button>
        )}
        {object.metadata.has_key === true && (
          <Button
            variant="ghost"
            disabled={busy || pending}
            aria-label={`${lockAction}: ${sceneryLabel(object)} em ${position}`}
            onClick={() =>
              void onInteract(object, object.metadata.interaction_locked ? 'unlock' : 'lock')
            }
          >
            {lockAction}
          </Button>
        )}
      </div>
    </li>
  );
});

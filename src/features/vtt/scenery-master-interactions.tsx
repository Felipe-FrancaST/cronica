'use client';
import { memo, useId, useState } from 'react';
import { ChevronDown, LoaderCircle } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { sceneryInteraction, sceneryLabel } from './scenery';
import { configurableScenery } from './scenery-gameplay';
import type { BattleMapObject } from './types';

export const SceneryMasterInteractions = memo(function SceneryMasterInteractions({
  objects,
  busy,
  pendingIds,
  onInteract,
  onConfigure,
}: {
  objects: BattleMapObject[];
  busy: boolean;
  pendingIds: ReadonlySet<string>;
  onInteract(object: BattleMapObject, variant: string): Promise<void>;
  onConfigure(object: BattleMapObject): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const available = objects.filter((object) => sceneryInteraction(object));
  if (!available.length) return null;
  return (
    <section className="vtt-scenery-interactions" aria-label="Interações do cenário">
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
      <div id={contentId} className="vtt-scenery-interactions-content" hidden={!expanded}>
        {expanded && (
          <>
            <small>
              Controle luzes, passagens e mecanismos durante o combate. Configure fechaduras e
              recompensas nos recipientes.
            </small>
            <ul className="vtt-scenery-interaction-list" role="list">
              {available.map((object) => (
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

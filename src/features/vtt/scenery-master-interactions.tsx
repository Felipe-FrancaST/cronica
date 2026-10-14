'use client';
import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { sceneryInteraction, sceneryLabel } from './scenery';
import { configurableScenery } from './scenery-gameplay';
import type { BattleMapObject } from './types';

export function SceneryMasterInteractions({
  objects,
  busy,
  onInteract,
  onConfigure,
}: {
  objects: BattleMapObject[];
  busy: boolean;
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
        <small>
          Controle luzes, passagens e mecanismos durante o combate. Configure fechaduras e
          recompensas nos recipientes.
        </small>
        <ul className="vtt-scenery-interaction-list" role="list">
          {available.map((object) => {
            const interaction = sceneryInteraction(object)!;
            const position = `${String(object.geometry.x)},${String(object.geometry.y)}`;
            const lockAction = object.metadata.interaction_locked
              ? 'Destrancar pelo mestre'
              : 'Trancar';
            return (
              <li key={object.id} className="vtt-scenery-interaction-card">
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
                    disabled={busy}
                    aria-label={`${interaction.label}: ${sceneryLabel(object)} em ${position}`}
                    onClick={() => void onInteract(object, interaction.variant)}
                  >
                    {interaction.label}
                  </Button>
                  {configurableScenery(object.object_type) && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      aria-label={`Configurar ${sceneryLabel(object)}`}
                      onClick={() => onConfigure(object)}
                    >
                      Conteúdo e fechadura
                    </Button>
                  )}
                  {object.metadata.has_key === true && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      aria-label={`${lockAction}: ${sceneryLabel(object)} em ${position}`}
                      onClick={() =>
                        void onInteract(
                          object,
                          object.metadata.interaction_locked ? 'unlock' : 'lock',
                        )
                      }
                    >
                      {lockAction}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
